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

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { defaultAgentCapabilities, type ProviderAdapter } from "../contracts.js";
import type {
  ProviderAgentCapabilities,
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

  /**
   * HTTP Basic auth username for opencode serve.
   * Corresponds to the OPENCODE_SERVER_USERNAME env var used by opencode.
   * Defaults to OPENCODE_SERVER_USERNAME env var, then "opencode" as fallback.
   */
  username?: string;

  /**
   * HTTP Basic auth password for opencode serve.
   * Corresponds to the OPENCODE_SERVER_PASSWORD env var used by opencode.
   * Defaults to OPENCODE_SERVER_PASSWORD env var.
   * If neither is set, no Authorization header is sent.
   */
  password?: string;

  /**
   * Whether to auto-detect credentials from the running opencode serve process.
   * When true (default), CodeRelay will probe `ps eww` to find OPENCODE_SERVER_USERNAME
   * and OPENCODE_SERVER_PASSWORD set by the launcher (e.g. CodeNomad) on the opencode process.
   * This is necessary because CodeNomad generates a fresh password each launch.
   * Default: true
   */
  autoDetect?: boolean;
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
  private agentCapabilitiesCache: { value: ProviderAgentCapabilities; expiresAt: number } | null = null;
  private credentialsDetected = false;

  constructor(config: OpenCodeConfig = {}) {
    const serverUrl = typeof config.serverUrl === "string" && config.serverUrl.trim()
      ? config.serverUrl.trim()
      : "http://127.0.0.1:4096";
    this.config = {
      serverUrl,
      requestTimeout: 30000,
      autoStart: false,
      autoDetect: true,
      username: process.env.OPENCODE_SERVER_USERNAME ?? "opencode",
      password: process.env.OPENCODE_SERVER_PASSWORD ?? "",
      ...config,
    };
    this.validateServerUrl(this.config.serverUrl);
  }

  async getAgentCapabilities(): Promise<ProviderAgentCapabilities> {
    const now = Date.now();
    if (this.agentCapabilitiesCache && this.agentCapabilitiesCache.expiresAt > now) {
      return this.agentCapabilitiesCache.value;
    }

    const fallback: ProviderAgentCapabilities = {
      ...defaultAgentCapabilities(),
      canCreateNew: true,
    };

    try {
      const configPath = `${homedir()}/.config/opencode/oh-my-opencode.json`;
      const raw = readFileSync(configPath, "utf8");
      const parsed = JSON.parse(raw) as { agents?: Record<string, unknown> };
      const agentMap = parsed?.agents && typeof parsed.agents === "object" ? parsed.agents : {};

      const agents = Object.entries(agentMap)
        .map(([id, value]) => {
          if (!value || typeof value !== "object") {
            return {
              id,
              name: id,
            };
          }

          const record = value as Record<string, unknown>;
          const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : id;
          const description = typeof record.description === "string" && record.description.trim()
            ? record.description.trim()
            : undefined;
          const model = typeof record.model === "string" && record.model.trim() ? record.model.trim() : undefined;

          return {
            id,
            name,
            ...(description ? { description } : {}),
            ...(model ? { model } : {}),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      const resolved: ProviderAgentCapabilities = {
        agents,
        models: [],
        canCreateNew: true,
      };
      this.agentCapabilitiesCache = { value: resolved, expiresAt: now + 60_000 };
      return resolved;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code !== "ENOENT") {
        console.warn("[opencode] Failed to read oh-my-opencode agent config:", err.message);
      }
      this.agentCapabilitiesCache = { value: fallback, expiresAt: now + 60_000 };
      return fallback;
    }
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
   * Attempt to auto-detect credentials from the running opencode serve process.
   * Reads OPENCODE_SERVER_USERNAME and OPENCODE_SERVER_PASSWORD from the process environment
   * using `ps eww`, which exposes env vars for processes owned by the current user.
   * This handles the case where CodeNomad launches opencode with a dynamically generated password
   * that is not stored in any config file.
   * Returns true if credentials were found and applied.
   */
  private tryDetectCredentials(): boolean {
    if (!this.config.autoDetect) return false;
    if (this.credentialsDetected) return false;

    try {
      // `ps eww -A` lists all processes with their full environment on macOS/Linux.
      // We search for any process running the opencode binary with serve args.
      const output = execSync("ps eww -A 2>/dev/null || ps ewwx 2>/dev/null", {
        encoding: "utf8",
        timeout: 3000,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Find lines that look like opencode serve processes
      const lines = output.split("\n");
      for (const line of lines) {
        if (!line.includes("opencode") || !line.includes("serve")) continue;

        // Extract OPENCODE_SERVER_USERNAME
        const usernameMatch = line.match(/OPENCODE_SERVER_USERNAME=([^\s]+)/);
        const passwordMatch = line.match(/OPENCODE_SERVER_PASSWORD=([^\s]+)/);

        if (usernameMatch && passwordMatch) {
          const username = usernameMatch[1];
          const password = passwordMatch[1];

          if (username && password) {
            this.config.username = username;
            this.config.password = password;
            this.credentialsDetected = true;
            console.log(`[opencode] Auto-detected credentials for user "${username}" from running process`);
            return true;
          }
        }
      }
    } catch {
      // ps may not be available or may fail — silently ignore
    }

    return false;
  }

  /**
   * Start the OpenCode adapter by probing server availability.
   * Gracefully degrades if the server is not running.
   */
  async start(): Promise<void> {
    // Attempt credential auto-detection before first health check
    if (this.config.autoDetect && !this.credentialsDetected) {
      this.tryDetectCredentials();
    }

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
        // On 401, attempt credential auto-detection and retry once
        if (response.status === 401 && this.config.autoDetect && !this.credentialsDetected) {
          const detected = this.tryDetectCredentials();
          if (detected) {
            // Retry with newly detected credentials
            const retryResponse = await this.request("/global/health", { method: "GET" });
            if (retryResponse.ok) {
              const body = (await this.safeJson(retryResponse)) as Record<string, unknown> | null;
              const healthy = Boolean(body?.healthy);
              const status: ProviderHealthStatus = {
                status: healthy ? "healthy" : "degraded",
                message: healthy ? "OpenCode server is healthy" : "OpenCode server responded without healthy=true",
                lastCheck: now,
                details: {
                  serverUrl: this.config.serverUrl,
                  version: typeof body?.version === "string" ? body.version : undefined,
                  raw: body,
                  credentialsAutoDetected: true,
                },
              };
              this.lastHealthCheck = status;
              return status;
            }
          }
        }

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
    const url = `${this.config.serverUrl.replace(/\/$$/, "")}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeout);

    // Build headers, injecting Basic auth if a password is configured
    const headers = new Headers(init?.headers as any);
    if (this.config.password) {
      const credentials = btoa(`${this.config.username}:${this.config.password}`);
      headers.set("Authorization", `Basic ${credentials}`);
    }

    try {
      return await fetch(url, {
        ...init,
        headers,
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
