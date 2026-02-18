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
   * Default timeout for ACP operations in milliseconds (default: 5000)
   */
  timeout?: number;

  /**
   * Timeout for prompt operations in milliseconds (default: 30000)
   */
  promptTimeout?: number;

  /**
   * Number of retry attempts for transient failures (default: 2)
   */
  maxRetries?: number;

  /**
   * Retry delay in milliseconds (default: 1000)
   */
  retryDelay?: number;

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
  private lastHealthCheck: ProviderHealthStatus | null = null;
  private consecutiveFailures = 0;

  constructor(config: CopilotAcpConfig = {}) {
    this.config = {
      timeout: 5000,
      promptTimeout: 30000,
      maxRetries: 2,
      retryDelay: 1000,
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

    // If client not initialized, return unhealthy
    if (!this.client) {
      const status: ProviderHealthStatus = {
        status: "unhealthy",
        message: "ACP client not initialized",
        lastCheck: now,
        details: {
          reason: "client_not_initialized",
          consecutiveFailures: this.consecutiveFailures,
        },
      };
      this.lastHealthCheck = status;
      return status;
    }

    // If executable not found, return degraded
    if (!this.executablePath) {
      const status: ProviderHealthStatus = {
        status: "degraded",
        message: "Copilot CLI not found in PATH",
        lastCheck: now,
        details: {
          reason: "executable_not_found",
          searchedPaths: process.env.PATH?.split(":") || [],
        },
      };
      this.lastHealthCheck = status;
      return status;
    }

    // If process not running, return unhealthy
    if (!this.process || !this.process.pid || !processHealth(this.process.pid)) {
      const status: ProviderHealthStatus = {
        status: "unhealthy",
        message: "Copilot process not running",
        lastCheck: now,
        details: {
          reason: "process_not_running",
          pid: this.process?.pid,
          consecutiveFailures: this.consecutiveFailures,
        },
      };
      this.lastHealthCheck = status;
      this.consecutiveFailures++;
      return status;
    }

    // Try a simple ping/health check via JSON-RPC
    const healthCheckStart = Date.now();
    try {
      // Attempt to list sessions as a health check with short timeout
      await this.client?.sendRequest("list_sessions", {}, 2000);
      const elapsed = Date.now() - healthCheckStart;

      // Reset failure counter on success
      this.consecutiveFailures = 0;

      // Determine status based on response time
      const status: ProviderHealthStatus = {
        status: elapsed > 1500 ? "degraded" : "healthy",
        message:
          elapsed > 1500
            ? `Copilot ACP is running but slow (${elapsed}ms response)`
            : "Copilot ACP is running and responsive",
        lastCheck: now,
        details: {
          pid: this.process.pid,
          executable: this.executablePath,
          responseTime: elapsed,
          consecutiveFailures: this.consecutiveFailures,
        },
      };
      this.lastHealthCheck = status;
      return status;
    } catch (err) {
      this.consecutiveFailures++;
      const elapsed = Date.now() - healthCheckStart;
      const status: ProviderHealthStatus = {
        status: this.consecutiveFailures > 3 ? "unhealthy" : "degraded",
        message:
          this.consecutiveFailures > 3
            ? "Copilot process unresponsive (multiple failures)"
            : "Copilot process running but not responsive",
        lastCheck: now,
        details: {
          reason: "unresponsive",
          pid: this.process.pid,
          error: err instanceof Error ? err.message : String(err),
          responseTime: elapsed,
          consecutiveFailures: this.consecutiveFailures,
        },
      };
      this.lastHealthCheck = status;
      return status;
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
   * Includes retry logic for transient failures and extended timeout for long-running operations.
   *
   * @param sessionId - The session to send the prompt to
   * @param input - The prompt input (text and optional attachments)
   * @param options - Optional prompt options (mode, model, etc.)
   * @returns Promise resolving to { turnId, status } on success
   * @throws Error if validation fails, client not available, or operation fails after retries
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

    const startTime = Date.now();
    const maxRetries = this.config.maxRetries ?? 2;
    const retryDelay = this.config.retryDelay ?? 1000;
    let lastError: Error | null = null;

    // Retry loop for transient failures
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(
            `[copilot-acp] Retrying sendPrompt for session ${sessionId} (attempt ${attempt + 1}/${maxRetries + 1})`
          );
          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
        }

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

        // Send request with extended timeout for prompts (default: 30s)
        const result = await this.client.sendRequest(
          "sendPrompt",
          params,
          this.config.promptTimeout ?? 30000,
        );

        const elapsed = Date.now() - startTime;
        
        // Log performance telemetry
        if (elapsed > 15000) {
          console.warn(
            `[copilot-acp] Slow sendPrompt: ${elapsed}ms (degraded performance, session: ${sessionId})`
          );
        } else {
          console.log(
            `[copilot-acp] sendPrompt completed in ${elapsed}ms (session: ${sessionId})`
          );
        }

        // Reset failure counter on success
        this.consecutiveFailures = 0;

        // Extract turnId and status from response
        const response = result as any;
        return {
          turnId: response.turnId,
          status: response.status || "streaming",
          ...response,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        
        // Check if error is transient and retryable
        const isTransient = this.isTransientError(err);
        const isLastAttempt = attempt === maxRetries;

        if (!isTransient || isLastAttempt) {
          // Log non-transient or final failure
          const elapsed = Date.now() - startTime;
          console.error(
            `[copilot-acp] sendPrompt failed after ${elapsed}ms (attempt ${attempt + 1}/${maxRetries + 1}):`,
            lastError.message
          );
          this.consecutiveFailures++;
          throw lastError;
        }

        // Log transient error for retry
        console.warn(
          `[copilot-acp] Transient error in sendPrompt (attempt ${attempt + 1}/${maxRetries + 1}):`,
          lastError.message
        );
      }
    }

    // Should not reach here, but throw last error as fallback
    throw lastError || new Error("sendPrompt failed with unknown error");
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
      capabilities: this.capabilities,
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

  /**
   * Determine if an error is transient and should be retried.
   * Transient errors include timeouts, network issues, and temporary unavailability.
   */
  private isTransientError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;

    const message = err.message.toLowerCase();

    // Timeout errors are retryable
    if (message.includes("timeout") || message.includes("timed out")) {
      return true;
    }

    // Connection/network errors are retryable
    if (
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("epipe") ||
      message.includes("network")
    ) {
      return true;
    }

    // Temporary unavailability
    if (message.includes("unavailable") || message.includes("busy")) {
      return true;
    }

    // Rate limiting (may be transient)
    if (message.includes("rate limit") || message.includes("too many requests")) {
      return true;
    }

    return false;
  }
}
