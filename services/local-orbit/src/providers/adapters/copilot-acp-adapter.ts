/**
 * GitHub Copilot ACP Adapter
 *
 * Provider adapter for GitHub Copilot's Agent Control Protocol (ACP).
 * Spawns the `copilot` CLI in ACP mode and implements JSON-RPC communication.
 *
 * Phase 1 scope (read-only):
 * - Process management and health checking
 * - List sessions (via JSON-RPC)
 * - Graceful degradation when Copilot not installed
 *
 * Phase 2+ (future):
 * - Open/resume sessions
 * - Send prompts
 * - Subscribe to events
 */

import type { ChildProcess } from "node:child_process";
import type { ProviderAdapter } from "../contracts.js";
import type {
  ProviderCapabilities,
  ProviderHealthStatus,
  SessionListResult,
  SessionFilters,
  PromptInput,
  PromptOptions,
  EventSubscription,
  NormalizedSession,
  NormalizedEvent,
} from "../provider-types.js";
import { AcpClient } from "./acp-client.js";
import { ACPStreamingNormalizer } from "../normalizers/acp-event-normalizer.js";
import { findExecutable, spawnProcess, killProcess, processHealth } from "./process-utils.js";

/**
 * Configuration for Copilot ACP adapter
 */
export interface CopilotAcpConfig {
  /**
   * Timeout for ACP operations in milliseconds (default: 5000)
   */
  timeout?: number;

  /**
   * Custom executable path (overrides PATH search)
   */
  executablePath?: string;
}

/**
 * Copilot ACP adapter implementation
 */
export class CopilotAcpAdapter implements ProviderAdapter {
  readonly providerId = "copilot-acp";
  readonly providerName = "GitHub Copilot (ACP)";

  readonly capabilities: ProviderCapabilities = {
    listSessions: true,
    openSession: false, // Phase 2
    sendPrompt: true, // Phase 2 - Issue #144
    streaming: true, // Phase 2 - Issue #145
    attachments: false, // Phase 2
    approvals: false, // Phase 2
    multiTurn: false, // Phase 2
    filtering: false, // Phase 1 - basic list only
    pagination: false, // Phase 1 - basic list only
  };

  private config: CopilotAcpConfig;
  private process: ChildProcess | null = null;
  private client: AcpClient | null = null;
  private executablePath: string | null = null;
  private normalizer: ACPStreamingNormalizer;
  private subscriptions = new Map<string, EventSubscription>();

  constructor(config: CopilotAcpConfig = {}) {
    this.config = {
      timeout: 5000,
      ...config,
    };
    this.normalizer = new ACPStreamingNormalizer();
  }

  /**
   * Start the Copilot process and perform handshake/authentication.
   */
  async start(): Promise<void> {
    // Find Copilot executable
    this.executablePath = await this.findCopilotExecutable();

    if (!this.executablePath) {
      console.warn("[copilot-acp] Copilot CLI not found in PATH");
      // Don't throw - allow graceful degradation
      return;
    }

    try {
      // Spawn copilot in ACP mode
      console.log(`[copilot-acp] Spawning: ${this.executablePath} --acp`);
      this.process = spawnProcess(this.executablePath, ["--acp"]);

      // Create JSON-RPC client
      this.client = new AcpClient(this.process, this.config.timeout);

      // Setup notification handler (for future use)
      this.client.onNotification((notification) => {
        console.log("[copilot-acp] Notification:", notification.method, notification.params);
      });

      // Perform handshake (if ACP requires it)
      // Note: The actual ACP handshake protocol may vary - this is a placeholder
      // For Phase 1, we'll assume the process is ready immediately
      await this.performHandshake();

      console.log("[copilot-acp] Started successfully");
    } catch (err) {
      console.error("[copilot-acp] Failed to start:", err);
      // Clean up on failure
      await this.stop();
      // Don't throw - allow graceful degradation
    }
  }

  /**
   * Stop the Copilot process and clean up resources.
   */
  async stop(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }

    if (this.process && this.process.pid) {
      try {
        await killProcess(this.process.pid);
      } catch (err) {
        console.warn("[copilot-acp] Error killing process:", err);
      }
      this.process = null;
    }

    console.log("[copilot-acp] Stopped");
  }

  /**
   * Check health status of the Copilot adapter.
   */
  async health(): Promise<ProviderHealthStatus> {
    const now = new Date().toISOString();

    // If executable not found, return degraded
    if (!this.executablePath) {
      return {
        status: "degraded",
        message: "Copilot CLI not found in PATH",
        lastCheck: now,
        details: {
          reason: "executable_not_found",
          searchedPaths: process.env.PATH?.split(":") || [],
        },
      };
    }

    // If process not running, return unhealthy
    if (!this.process || !this.process.pid || !processHealth(this.process.pid)) {
      return {
        status: "unhealthy",
        message: "Copilot process not running",
        lastCheck: now,
        details: {
          reason: "process_not_running",
          pid: this.process?.pid,
        },
      };
    }

    // Try a simple ping/health check via JSON-RPC
    try {
      // Attempt to list sessions as a health check
      // If this succeeds, the process is responsive
      await this.client?.sendRequest("list_sessions", {}, 2000);

      return {
        status: "healthy",
        message: "Copilot ACP is running and responsive",
        lastCheck: now,
        details: {
          pid: this.process.pid,
          executable: this.executablePath,
        },
      };
    } catch (err) {
      return {
        status: "degraded",
        message: "Copilot process running but not responsive",
        lastCheck: now,
        details: {
          reason: "unresponsive",
          pid: this.process.pid,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * List sessions from Copilot.
   */
  async listSessions(
    cursor?: string,
    filters?: SessionFilters,
  ): Promise<SessionListResult> {
    if (!this.client) {
      throw new Error("Copilot adapter not started or not available");
    }

    try {
      // Call list_sessions via JSON-RPC
      const result = await this.client.sendRequest("list_sessions", {
        cursor,
        filters,
      });

      // Parse and normalize the response
      // Note: The actual ACP response format may vary - this is a placeholder
      const rawSessions = (result as any)?.sessions || [];
      const sessions: NormalizedSession[] = rawSessions.map((raw: any) =>
        this.normalizeSession(raw),
      );

      return {
        sessions,
        hasMore: (result as any)?.hasMore || false,
        nextCursor: (result as any)?.nextCursor,
        totalCount: (result as any)?.totalCount,
      };
    } catch (err) {
      console.error("[copilot-acp] Failed to list sessions:", err);
      throw err;
    }
  }

  /**
   * Open a session (not implemented in Phase 1).
   */
  async openSession(_sessionId: string): Promise<NormalizedSession> {
    throw new Error("openSession not implemented in Phase 1 (read-only)");
  }

  /**
   * Send a prompt to a Copilot session (Phase 2 - Issue #144).
   *
   * @param sessionId - The session to send the prompt to
   * @param input - The prompt input (text and optional attachments)
   * @param options - Optional prompt options (mode, model, etc.)
   * @returns Promise resolving to { turnId, status } on success
   * @throws Error if validation fails, client not available, or JSON-RPC error
   */
  async sendPrompt(
    sessionId: string,
    input: PromptInput,
    options?: PromptOptions,
  ): Promise<{ turnId?: string; requestId?: string; status?: string; [key: string]: unknown }> {
    // Input validation
    if (!sessionId || typeof sessionId !== "string" || sessionId.trim() === "") {
      throw new Error("Invalid sessionId: must be a non-empty string");
    }

    if (!input || !input.text || typeof input.text !== "string" || input.text.trim() === "") {
      throw new Error("Invalid input: text must be a non-empty string");
    }

    if (!this.client) {
      throw new Error("Copilot adapter not started or not available");
    }

    try {
      // Construct JSON-RPC request per PHASE2_PLAN.md
      const params = {
        sessionId,
        input: {
          text: input.text,
          attachments: input.attachments || [],
        },
        options: {
          mode: options?.mode ?? "auto",
          ...(options?.model && { model: options.model }),
          ...options,
        },
      };

      // Send request with 5-second timeout
      const result = await this.client.sendRequest(
        "sendPrompt",
        params,
        5000,
      );

      // Extract turnId and status from response
      const response = result as any;
      return {
        turnId: response.turnId,
        status: response.status || "streaming",
        ...response,
      };
    } catch (err) {
      // Let caller handle errors (consistent with listSessions)
      throw err;
    }
  }

  /**
   * Subscribe to events for a specific session (Phase 2 - Issue #145).
   *
   * @param sessionId - The session to subscribe to
   * @param callback - Callback invoked for each normalized event
   * @returns EventSubscription with unsubscribe method
   */
  async subscribe(
    sessionId: string,
    callback: (event: NormalizedEvent) => void,
  ): Promise<EventSubscription> {
    if (!this.client) {
      throw new Error("Copilot adapter not started or not available");
    }

    const subscriptionId = `copilot-acp-${sessionId}-${Date.now()}`;

    // Create event handler that processes notifications through normalizer
    const handler = (notification: any) => {
      try {
        // Pass notification to normalizer
        const normalizedEvent = this.normalizer.handleUpdate(notification);
        // If event was flushed, invoke callback
        if (normalizedEvent) {
          callback(normalizedEvent);
        }
      } catch (err) {
        console.error("[copilot-acp] Error processing notification:", err);
      }
    };

    // Also subscribe to normalizer's event emitter for flushed events
    const normalizerHandler = (event: NormalizedEvent) => {
      if (event.sessionId === sessionId) {
        callback(event);
      }
    };
    this.normalizer.on('event', normalizerHandler);

    // Register handler with client
    this.client.onSessionEvent(sessionId, handler);

    // Create subscription object
    const subscription: EventSubscription = {
      id: subscriptionId,
      sessionId,
      provider: this.providerId,
      unsubscribe: async () => {
        if (this.client) {
          this.client.offSessionEvent(sessionId, handler);
        }
        this.normalizer.off('event', normalizerHandler);
        this.subscriptions.delete(subscriptionId);
      },
    };

    this.subscriptions.set(subscriptionId, subscription);

    return subscription;
  }

  /**
   * Unsubscribe from events (Phase 2 - Issue #145).
   */
  async unsubscribe(subscription: EventSubscription): Promise<void> {
    await subscription.unsubscribe();
  }

  /**
   * Normalize an event (not implemented in Phase 1).
   */
  async normalizeEvent(_rawEvent: unknown): Promise<NormalizedEvent | null> {
    throw new Error("normalizeEvent not implemented in Phase 1");
  }

  // --- Private helper methods ---

  /**
   * Find the Copilot executable in PATH.
   * Tries both `copilot` and `gh copilot` patterns.
   */
  private async findCopilotExecutable(): Promise<string | null> {
    // Use custom path if provided
    if (this.config.executablePath) {
      return this.config.executablePath;
    }

    // Try `copilot` first
    const copilotPath = await findExecutable("copilot");
    if (copilotPath) {
      return copilotPath;
    }

    // Try `gh` (GitHub CLI) as fallback
    const ghPath = await findExecutable("gh");
    if (ghPath) {
      // Note: If using gh, we'd need to adjust the spawn command to use "gh copilot --acp"
      // For now, just return gh path and let the caller handle it
      return ghPath;
    }

    return null;
  }

  /**
   * Perform ACP handshake/authentication.
   * The actual protocol may vary - this is a placeholder.
   */
  private async performHandshake(): Promise<void> {
    // Phase 1: Assume no handshake required or that the process handles it internally
    // Phase 2: Implement actual handshake protocol if needed
    console.log("[copilot-acp] Handshake complete (placeholder)");
  }

  /**
   * Normalize a raw Copilot session into the unified session model.
   */
  private normalizeSession(raw: any): NormalizedSession {
    return {
      provider: this.providerId,
      sessionId: raw.id || raw.sessionId || String(Math.random()),
      title: raw.title || raw.name || "Untitled Session",
      project: raw.project || raw.workspace,
      repo: raw.repo || raw.repository,
      status: this.normalizeStatus(raw.status),
      createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString(),
      preview: raw.preview || raw.lastMessage,
      metadata: raw.metadata,
      rawSession: raw,
    };
  }

  /**
   * Normalize session status from Copilot format to our enum.
   */
  private normalizeStatus(status: string | undefined): NormalizedSession["status"] {
    if (!status) return "idle";

    const s = status.toLowerCase();
    if (s.includes("active") || s.includes("running")) return "active";
    if (s.includes("complete") || s.includes("done")) return "completed";
    if (s.includes("error") || s.includes("failed")) return "error";
    if (s.includes("interrupt") || s.includes("cancel")) return "interrupted";

    return "idle";
  }
}
