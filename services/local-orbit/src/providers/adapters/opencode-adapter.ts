/**
 * OpenCode Adapter
 *
 * Provider adapter for a local OpenCode HTTP server (`opencode serve`).
 * Uses Bun-native fetch to integrate with OpenCode session/message endpoints.
 *
 * Phase 1 scope:
 * - Health probing and graceful startup degradation
 * - Session listing and session open
 * - Prompt send over HTTP
 * - No-op subscription/event normalization stubs
 */

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

/**
 * Configuration for OpenCode adapter
 */
export interface OpenCodeConfig {
  /**
   * OpenCode server URL
   * Default: "http://127.0.0.1:4096"
   */
  serverUrl?: string;

  /**
   * Request timeout in milliseconds
   * Default: 30000
   */
  requestTimeout?: number;

  /**
   * Whether to try starting opencode serve automatically
   * Default: false (not implemented in Phase 1)
   */
  autoStart?: boolean;
}

/**
 * OpenCode adapter implementation
 */
export class OpenCodeAdapter implements ProviderAdapter {
  readonly providerId = "opencode";
  readonly providerName = "OpenCode";

  readonly capabilities: ProviderCapabilities = {
    listSessions: true,
    openSession: true,
    sendPrompt: true,
    streaming: false, // Phase 1 does not implement streaming (normalizeEvent is a no-op)
    attachments: false,
    approvals: false,
    multiTurn: true,
    filtering: false,
    pagination: false,
  };

  private config: Required<OpenCodeConfig>;
  private lastHealthCheck: ProviderHealthStatus | null = null;

  constructor(config: OpenCodeConfig = {}) {
    this.config = {
      serverUrl: "http://127.0.0.1:4096",
      requestTimeout: 30000,
      autoStart: false,
      ...config,
    };
    this.validateServerUrl(this.config.serverUrl);
  }

  private validateServerUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`[opencode] Invalid serverUrl: ${url}`);
    }

    const allowedHosts = ["127.0.0.1", "localhost", "::1", "[::1]"];
    if (!allowedHosts.includes(parsed.hostname)) {
      throw new Error(
        `[opencode] serverUrl must be localhost (got ${parsed.hostname}). ` +
        "Remote OpenCode servers are not supported for security reasons.",
      );
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`[opencode] serverUrl must use http or https (got ${parsed.protocol})`);
    }
  }

  /**
   * Start the OpenCode adapter by probing server availability.
   * Gracefully degrades if the server is not running.
   */
  async start(): Promise<void> {
    try {
      const health = await this.health();
      if (health.status !== "healthy") {
        console.warn(`[opencode] Server not healthy at ${this.config.serverUrl}: ${health.message ?? "unknown"}`);
      } else {
        console.log(`[opencode] Connected to server at ${this.config.serverUrl}`);
      }
    } catch (err) {
      console.warn(
        `[opencode] Server unavailable at ${this.config.serverUrl}. Continuing with graceful degradation.`,
        err,
      );
    }
  }

  /**
   * Stop the OpenCode adapter and clean up resources.
   */
  async stop(): Promise<void> {
    console.log("[opencode] Stopped");
  }

  /**
   * Check OpenCode server health via /global/health.
   */
  async health(): Promise<ProviderHealthStatus> {
    const now = new Date().toISOString();

    try {
      const response = await this.request("/global/health", { method: "GET" });
      if (!response.ok) {
        const status: ProviderHealthStatus = {
          status: response.status >= 500 ? "unhealthy" : "degraded",
          message: `OpenCode health check failed (${response.status})`,
          lastCheck: now,
          details: {
            statusCode: response.status,
            statusText: response.statusText,
            serverUrl: this.config.serverUrl,
          },
        };
        this.lastHealthCheck = status;
        return status;
      }

      const body = (await this.safeJson(response)) as Record<string, unknown> | null;
      const healthy = Boolean(body?.healthy);
      const status: ProviderHealthStatus = {
        status: healthy ? "healthy" : "degraded",
        message: healthy ? "OpenCode server is healthy" : "OpenCode server responded without healthy=true",
        lastCheck: now,
        details: {
          serverUrl: this.config.serverUrl,
          version: typeof body?.version === "string" ? body.version : undefined,
          raw: body,
        },
      };
      this.lastHealthCheck = status;
      return status;
    } catch (err) {
      const status: ProviderHealthStatus = {
        status: "degraded",
        message: "OpenCode server unavailable",
        lastCheck: now,
        details: {
          serverUrl: this.config.serverUrl,
          error: err instanceof Error ? err.message : String(err),
        },
      };
      this.lastHealthCheck = status;
      return status;
    }
  }

  /**
   * List sessions from OpenCode /session endpoint.
   */
  async listSessions(_cursor?: string, _filters?: SessionFilters): Promise<SessionListResult> {
    try {
      const response = await this.request("/session", { method: "GET" });
      if (!response.ok) {
        return {
          sessions: [],
          hasMore: false,
          error: `OpenCode listSessions failed (${response.status})`,
        };
      }

      const payload = await this.safeJson(response);
      const rawSessions = Array.isArray(payload)
        ? payload
        : isRecord(payload) && Array.isArray(payload.sessions)
          ? payload.sessions
          : [];

      const sessions = rawSessions
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map((raw) => this.normalizeSession(raw));

      return {
        sessions,
        hasMore: false,
        totalCount: sessions.length,
      };
    } catch (err) {
      return {
        sessions: [],
        hasMore: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Open/resume a specific OpenCode session by ID.
   */
  async openSession(sessionId: string): Promise<NormalizedSession> {
    const encodedSessionId = encodeURIComponent(sessionId);

    let response = await this.request(`/session/${encodedSessionId}`, { method: "GET" });

    if (!response.ok && response.status === 405) {
      response = await this.request(`/session/${encodedSessionId}`, { method: "POST" });
    }

    if (!response.ok) {
      throw new Error(`OpenCode openSession failed (${response.status})`);
    }

    const payload = await this.safeJson(response);
    if (!isRecord(payload)) {
      throw new Error("OpenCode openSession returned invalid response");
    }

    return this.normalizeSession(payload);
  }

  /**
   * Send a prompt to OpenCode via /session/:id/message.
   */
  async sendPrompt(
    sessionId: string,
    input: PromptInput,
    options?: PromptOptions,
  ): Promise<{ turnId?: string; requestId?: string; [key: string]: unknown }> {
    const encodedSessionId = encodeURIComponent(sessionId);
    const parts = [{ type: "text", text: input.text }];

    if (input.attachments && input.attachments.length > 0) {
      console.warn("[opencode] Attachments are not supported in Phase 1; sending text only");
    }

    const body: Record<string, unknown> = {
      parts,
    };

    if (typeof options?.model === "string" && options.model.trim()) {
      body.model = options.model;
    }

    if (isRecord(options?.custom) && typeof options?.custom.agent === "string") {
      body.agent = options.custom.agent;
    }

    const response = await this.request(`/session/${encodedSessionId}/message`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`OpenCode sendPrompt failed (${response.status})`);
    }

    const payload = await this.safeJson(response);
    const record = isRecord(payload) ? payload : {};
    const requestId = this.pickString(record, ["requestId", "request_id", "id"]);
    const turnId = this.pickString(record, ["turnId", "turn_id", "messageId", "message_id"]);

    return {
      requestId,
      turnId,
      ...record,
    };
  }

  /**
   * Subscribe to session events.
   * Phase 1 returns a no-op subscription.
   */
  async subscribe(
    sessionId: string,
    _callback: (event: NormalizedEvent) => void,
  ): Promise<EventSubscription> {
    const id = `opencode-${sessionId}-${crypto.randomUUID()}`;

    return {
      id,
      sessionId,
      provider: this.providerId,
      unsubscribe: async () => {},
    };
  }

  /**
   * Unsubscribe from session events.
   * Phase 1 is a no-op.
   */
  async unsubscribe(_subscription: EventSubscription): Promise<void> {
    return;
  }

  /**
   * Normalize raw provider events.
   * Phase 1 does not map streaming events yet.
   */
  async normalizeEvent(_rawEvent: unknown): Promise<NormalizedEvent | null> {
    return null;
  }

  private normalizeSession(raw: Record<string, unknown>): NormalizedSession {
    const now = new Date().toISOString();
    const sessionId = this.pickString(raw, ["id", "sessionId", "session_id"]) ?? `opencode-${crypto.randomUUID()}`;
    const createdAt = this.pickString(raw, ["createdAt", "created_at", "created"]) ?? now;
    const updatedAt = this.pickString(raw, ["updatedAt", "updated_at", "updated", "lastUpdatedAt"]) ?? createdAt;
    const title = this.pickString(raw, ["title", "name"]) ?? "Untitled Session";
    const preview = this.pickString(raw, ["preview", "lastMessage", "summary"]);
    const project = this.pickString(raw, ["project", "workspace", "path"]);
    const repo = this.pickString(raw, ["repo", "repository"]);

    return {
      provider: this.providerId,
      sessionId,
      title,
      project,
      repo,
      status: this.normalizeStatus(this.pickString(raw, ["status"])),
      createdAt,
      updatedAt,
      preview,
      capabilities: this.capabilities,
      metadata: {
        source: "opencode",
      },
      rawSession: raw,
    };
  }

  private normalizeStatus(status: string | undefined): NormalizedSession["status"] {
    if (!status) return "idle";
    const value = status.toLowerCase();
    if (value.includes("active") || value.includes("running") || value.includes("stream")) return "active";
    if (value.includes("complete") || value.includes("done") || value.includes("success")) return "completed";
    if (value.includes("error") || value.includes("fail")) return "error";
    if (value.includes("cancel") || value.includes("interrupt") || value.includes("abort")) return "interrupted";
    console.warn(`[opencode] Unrecognized session status "${status}", defaulting to "idle"`);
    return "idle";
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.config.serverUrl.replace(/\/$/, "")}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeout);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async safeJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }

  private pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
