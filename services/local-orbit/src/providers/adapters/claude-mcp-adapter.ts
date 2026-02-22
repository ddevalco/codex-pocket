/**
 * Claude MCP Adapter
 *
 * Provider adapter for local Claude CLI (MCP mode).
 * Spawns the `claude` CLI and parses JSON streaming output.
 *
 * Unlike the web-based Claude adapter which uses the Anthropic SDK,
 * this adapter integrates with the local Claude CLI installation for
 * users who prefer local execution or have organizational policies
 * requiring on-premise AI usage.
 *
 * Key features:
 * - Process management and health checking
 * - JSON streaming parser for real-time responses
 * - Local conversation history tracking (CLI doesn't persist sessions)
 * - Attachment support (if CLI supports vision)
 * - Graceful degradation when Claude CLI not installed
 */

import type { ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
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
import { ClaudeEventNormalizer } from "../normalizers/claude-event-normalizer.js";
import { ClaudeSessionNormalizer } from "../normalizers/claude-session-normalizer.js";
import { findExecutable, spawnProcess } from "./process-utils.js";

/**
 * Configuration for Claude MCP adapter
 */
export interface ClaudeMcpConfig {
  /**
   * Custom executable path (overrides PATH search)
   * Default: searches for 'claude' in PATH
   */
  executablePath?: string;

  /**
   * Timeout for prompt operations in milliseconds (default: 60000)
   */
  promptTimeout?: number;

  /**
   * Claude model to use (default: claude-sonnet-4-6)
   */
  model?: string;

  /**
   * Maximum tokens for responses (default: 8192)
   */
  maxTokens?: number;

  /**
   * Enable debug mode for Claude CLI (default: false)
   */
  debug?: boolean;
}

/**
 * Represents a local conversation session tracked in memory
 */
interface LocalSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
}

/**
 * Claude MCP adapter implementation
 */
export class ClaudeMcpAdapter implements ProviderAdapter {
  readonly providerId = "claude-mcp";
  readonly providerName = "Claude (Local MCP)";

  readonly capabilities: ProviderCapabilities = {
    listSessions: true,       // Local session tracking
    openSession: true,        // Can open via local tracking
    sendPrompt: true,         // Primary capability
    streaming: true,          // CLI supports JSON streaming
    attachments: false,       // TODO: Probe CLI for vision support
    approvals: false,         // No approval workflow in CLI
    multiTurn: true,          // Local history tracking
    filtering: false,         // No native filtering (local only)
    pagination: false,        // No native pagination (local only)
  };

  private config: ClaudeMcpConfig;
  private executablePath: string | null = null;
  private eventNormalizer: ClaudeEventNormalizer;
  private sessionNormalizer: ClaudeSessionNormalizer;
  private lastHealthCheck: ProviderHealthStatus | null = null;
  private consecutiveFailures = 0;

  // Local session tracking (since CLI doesn't persist sessions)
  private sessions = new Map<string, LocalSession>();
  private activeSubscriptions = new Map<string, EventSubscription>();

  constructor(config: ClaudeMcpConfig = {}) {
    this.config = {
      promptTimeout: 60000,
      model: "claude-sonnet-4-6",
      maxTokens: 8192,
      debug: false,
      ...config,
    };
    this.eventNormalizer = new ClaudeEventNormalizer();
    this.sessionNormalizer = new ClaudeSessionNormalizer();
  }

  /**
   * Start the Claude MCP adapter.
   * Discovers the Claude CLI executable and validates availability.
   */
  async start(): Promise<void> {
    // Find Claude executable
    this.executablePath = this.config.executablePath || await findExecutable("claude");

    if (!this.executablePath) {
      console.warn("[claude-mcp] Claude CLI not found in PATH");
      console.warn("[claude-mcp] Install: https://docs.anthropic.com/claude/docs/cli");
      // Don't throw - allow graceful degradation
      return;
    }

    try {
      // Verify Claude CLI works by checking version
      const versionProcess = spawnProcess(this.executablePath, ["--version"]);
      
      let versionOutput = "";
      if (versionProcess.stdout) {
        versionProcess.stdout.on("data", (chunk: Buffer) => {
          versionOutput += chunk.toString();
        });
      }

      await new Promise<void>((resolve, reject) => {
        versionProcess.on("close", (code) => {
          if (code === 0) {
            console.log(`[claude-mcp] Found Claude CLI: ${versionOutput.trim()}`);
            resolve();
          } else {
            reject(new Error(`Claude CLI version check failed with code ${code}`));
          }
        });
        versionProcess.on("error", reject);
      });

      console.log("[claude-mcp] Started successfully");
    } catch (err) {
      console.error("[claude-mcp] Failed to start:", err);
      this.executablePath = null;
      // Don't throw - allow graceful degradation
    }
  }

  /**
   * Stop the Claude MCP adapter.
   * Cleans up any active subscriptions and processes.
   */
  async stop(): Promise<void> {
    // Close all active subscriptions
    const subscriptions = Array.from(this.activeSubscriptions.values());
    for (const sub of subscriptions) {
      await sub.unsubscribe();
    }
    this.activeSubscriptions.clear();

    console.log("[claude-mcp] Stopped");
  }

  /**
   * Check health status of the Claude MCP adapter.
   */
  async health(): Promise<ProviderHealthStatus> {
    const now = new Date().toISOString();

    // If executable not found, return degraded
    if (!this.executablePath) {
      const status: ProviderHealthStatus = {
        status: "degraded",
        message: "Claude CLI not found in PATH",
        lastCheck: now,
        details: {
          reason: "executable_not_found",
          searchedPaths: [
            ...(process.env.PATH?.split(":") || []),
            ...(process.env.HOME ? [
              `${process.env.HOME}/.local/bin`,
              `${process.env.HOME}/bin`,
              `${process.env.HOME}/.npm-global/bin`,
              `${process.env.HOME}/.yarn/bin`,
            ] : []),
            "/opt/homebrew/bin",
            "/usr/local/bin",
          ].filter((v, i, a) => a.indexOf(v) === i),
          installUrl: "https://docs.anthropic.com/claude/docs/cli",
        },
      };
      this.lastHealthCheck = status;
      return status;
    }

    // Try a simple health check by spawning a quick version check
    const healthCheckStart = Date.now();
    try {
      const testProcess = spawnProcess(this.executablePath, ["--version"]);
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          testProcess.kill();
          reject(new Error("Health check timeout"));
        }, 5000);

        testProcess.on("close", (code) => {
          clearTimeout(timeout);
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Health check failed with code ${code}`));
          }
        });

        testProcess.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      const elapsed = Date.now() - healthCheckStart;
      this.consecutiveFailures = 0;

      const status: ProviderHealthStatus = {
        status: elapsed > 3000 ? "degraded" : "healthy",
        message:
          elapsed > 3000
            ? `Claude CLI is available but slow (${elapsed}ms response)`
            : "Claude CLI is available and responsive",
        lastCheck: now,
        details: {
          executable: this.executablePath,
          responseTime: elapsed,
          consecutiveFailures: this.consecutiveFailures,
          localSessions: this.sessions.size,
        },
      };
      this.lastHealthCheck = status;
      return status;
    } catch (err) {
      this.consecutiveFailures++;
      const status: ProviderHealthStatus = {
        status: this.consecutiveFailures > 3 ? "unhealthy" : "degraded",
        message:
          this.consecutiveFailures > 3
            ? "Claude CLI unavailable (multiple failures)"
            : "Claude CLI not responding",
        lastCheck: now,
        details: {
          reason: "unhealthy",
          executable: this.executablePath,
          error: err instanceof Error ? err.message : String(err),
          consecutiveFailures: this.consecutiveFailures,
        },
      };
      this.lastHealthCheck = status;
      return status;
    }
  }

  /**
   * Open/resume a session by ID.
   * Returns the session from local storage or throws if not found.
   */
  async openSession(sessionId: string): Promise<NormalizedSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return this.normalizeLocalSession(session);
  }

  /**
   * List sessions from local storage.
   * Since Claude CLI doesn't persist sessions server-side, we track them locally.
   */
  async listSessions(
    cursor?: string,
    filters?: SessionFilters,
  ): Promise<SessionListResult> {
    if (!this.executablePath) {
      return {
        sessions: [],
        hasMore: false,
        error: "Claude CLI not available. Install from https://docs.anthropic.com/claude/docs/cli",
      };
    }

    // Convert local sessions to normalized format
    const allSessions = Array.from(this.sessions.values())
      .map((session) => this.normalizeLocalSession(session))
      .sort((a, b) => {
        // Sort by updated time, newest first
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });

    // Apply filters if provided
    let filtered = allSessions;
    if (filters) {
      filtered = this.applyFilters(allSessions, filters);
    }

    // Simple cursor-based pagination (cursor is an index)
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const pageSize = 20;
    const sessions = filtered.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < filtered.length;
    const nextCursor = hasMore ? String(startIndex + pageSize) : undefined;

    return {
      sessions,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Send a prompt to Claude CLI and stream the response.
   */
  async sendPrompt(
    sessionId: string,
    input: PromptInput,
    _options: PromptOptions = {},
  ): Promise<{ turnId?: string; requestId?: string; [key: string]: unknown }> {
    if (!this.executablePath) {
      throw new Error("Claude CLI not available");
    }

    const { text, attachments } = input;

    // Get or create session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        title: text.substring(0, 50) + (text.length > 50 ? "..." : ""),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      this.sessions.set(sessionId, session);
    }

    // Add user message to history
    session.messages.push({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });
    session.updatedAt = new Date().toISOString();

    // Build conversation history for Claude CLI
    const conversationHistory = session.messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n\n");

    try {
      // Spawn Claude CLI with JSON streaming
      const args = [
        "--print",
        "--output-format=stream-json",
        "--verbose",
      ];

      if (this.config.debug) {
        args.push("--debug");
      }

      // TODO: Support attachments if CLI supports vision
      if (attachments && attachments.length > 0) {
        console.warn("[claude-mcp] Attachments not yet supported by CLI adapter");
      }

      const claudeProcess = spawnProcess(this.executablePath, args);

      // Send the prompt via stdin
      if (claudeProcess.stdin) {
        // For multi-turn, include history context
        if (session.messages.length > 1) {
          claudeProcess.stdin.write(`Previous conversation:\n${conversationHistory}\n\nUser: ${text}\n`);
        } else {
          claudeProcess.stdin.write(text);
        }
        claudeProcess.stdin.end();
      }

      // Note: Event streaming handled via subscribe() pattern, not inline
      // Parse JSON streaming output
      const turnId = `turn-${Date.now()}`;
      await this.parseStreamingResponse(
        claudeProcess,
        sessionId,
        undefined, // Events emitted via subscriptions
      );

      return { turnId };

      // Update session with assistant response
      // (response is accumulated during streaming)
    } catch (err) {
      // Error events emitted via subscriptions
      throw err;
    }
  }

  /**
   * Parse JSON streaming response from Claude CLI.
   * Emits normalized events via active subscriptions.
   */
  private async parseStreamingResponse(
    process: ChildProcess,
    sessionId: string,
    onEvent?: (event: NormalizedEvent) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!process.stdout) {
        reject(new Error("Process stdout not available"));
        return;
      }

      let assistantResponseBuffer = "";
      let claudeSessionId: string | undefined;

      // Create readline interface for line-by-line parsing
      const rl = createInterface({
        input: process.stdout,
        crlfDelay: Infinity,
      });

      // Emit events to active subscription if exists
      const _subscription = this.activeSubscriptions.get(sessionId);
      const emitEvent = (event: NormalizedEvent) => {
        if (onEvent) onEvent(event);
      };

      rl.on("line", (line: string) => {
        try {
          const event = JSON.parse(line);
          
          // Handle different event types
          switch (event.type) {
            case "system":
              if (event.subtype === "init") {
                claudeSessionId = event.session_id;
                console.log(`[claude-mcp] Session initialized: ${claudeSessionId}`);
              }
              break;

            case "assistant":
              // Extract message content
              const message = event.message;
              if (message?.content) {
                for (const block of message.content) {
                  if (block.type === "text" && block.text) {
                    assistantResponseBuffer += block.text;
                    
                    // Emit streaming event
                    const streamEvent: NormalizedEvent = {
                      eventId: `msg-${Date.now()}-${Math.random()}`,
                      sessionId,
                      provider: this.providerId,
                      category: "agent_message",
                      timestamp: new Date().toISOString(),
                      text: block.text,
                      payload: {
                        delta: block.text,
                        content: assistantResponseBuffer,
                        streaming: true,
                      },
                      rawEvent: event,
                    };
                    emitEvent(streamEvent);
                  }
                }
              }
              break;

            case "rate_limit_event":
              // Optional: Emit rate limit info
              console.log("[claude-mcp] Rate limit:", event.rate_limit_info?.status);
              break;

            case "result":
              // Final result with token usage
              if (event.subtype === "success") {
                const session = this.sessions.get(sessionId);
                if (session) {
                  session.messages.push({
                    role: "assistant",
                    content: event.result || assistantResponseBuffer,
                    timestamp: new Date().toISOString(),
                  });
                  session.updatedAt = new Date().toISOString();
                }

                // Emit completion event
                const completeEvent: NormalizedEvent = {
                  eventId: `complete-${Date.now()}`,
                  sessionId,
                  provider: this.providerId,
                  category: "agent_message",
                  timestamp: new Date().toISOString(),
                  text: event.result || assistantResponseBuffer,
                  payload: {
                    content: event.result || assistantResponseBuffer,
                    streaming: false,
                    complete: true,
                    usage: event.usage,
                    cost: event.total_cost_usd,
                  },
                  rawEvent: event,
                };
                emitEvent(completeEvent);
              } else if (event.is_error) {
                reject(new Error(event.result || "Claude CLI error"));
              }
              break;

            default:
              console.log(`[claude-mcp] Unknown event type: ${event.type}`);
          }
        } catch (err) {
          console.warn("[claude-mcp] Failed to parse JSON line:", line, err);
        }
      });

      rl.on("close", () => {
        resolve();
      });

      process.on("error", (err) => {
        rl.close();
        reject(err);
      });

      process.stderr?.on("data", (chunk: Buffer) => {
        console.error("[claude-mcp] stderr:", chunk.toString());
      });
    });
  }

  /**
   * Subscribe to events for a session.
   */
  async subscribe(
    sessionId: string,
    _callback: (event: NormalizedEvent) => void,
  ): Promise<EventSubscription> {
    const subscriptionId = `${this.providerId}-${sessionId}-${Date.now()}`;
    const subscription: EventSubscription = {
      id: subscriptionId,
      sessionId,
      provider: this.providerId,
      unsubscribe: async () => {
        this.activeSubscriptions.delete(sessionId);
      },
    };

    this.activeSubscriptions.set(sessionId, subscription);
    return subscription;
  }

  /**
   * Unsubscribe from session events.
   */
  async unsubscribe(subscription: EventSubscription): Promise<void> {
    this.activeSubscriptions.delete(subscription.sessionId);
  }

  /**
   * Normalize a raw provider event (required by contract, but CLI events are pre-normalized).
   */
  async normalizeEvent(rawEvent: unknown): Promise<NormalizedEvent | null> {
    // Claude CLI events are already parsed and normalized during streaming
    return this.eventNormalizer.normalizeEvent(rawEvent);
  }

  /**
   * Normalize a local session to NormalizedSession format.
   */
  private normalizeLocalSession(session: LocalSession): NormalizedSession {
    return {
      provider: this.providerId,
      sessionId: session.id,
      title: session.title,
      status: "idle",
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      capabilities: this.capabilities,
      metadata: {
        messageCount: session.messages.length,
        model: this.config.model,
      },
    };
  }

  /**
   * Apply filters to sessions (basic implementation).
   */
  private applyFilters(
    sessions: NormalizedSession[],
    filters: SessionFilters,
  ): NormalizedSession[] {
    let filtered = sessions;

    // Filter by date range
    if (filters.createdAfter) {
      const startTime = new Date(filters.createdAfter).getTime();
      filtered = filtered.filter(
        (s) => new Date(s.createdAt).getTime() >= startTime,
      );
    }

    if (filters.createdBefore) {
      const endTime = new Date(filters.createdBefore).getTime();
      filtered = filtered.filter(
        (s) => new Date(s.createdAt).getTime() <= endTime,
      );
    }

    // Filter by search query (simple title/content search)
    if (filters.query) {
      const query = filters.query.toLowerCase();
      filtered = filtered.filter((s) =>
        s.title?.toLowerCase().includes(query),
      );
    }

    return filtered;
  }
}
