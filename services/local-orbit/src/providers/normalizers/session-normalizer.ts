/**
 * Session Normalizer Base Classes and Utilities
 *
 * Provides base implementation and helpers for normalizing provider-specific
 * session data into the unified NormalizedSession model.
 *
 * Provider-specific normalizers should extend BaseSessionNormalizer.
 */

import type { NormalizedSession, ProviderId, SessionStatus } from "../provider-types.js";
import { createNormalizedSession, validateNormalizedSession } from "../normalized-session.js";

/**
 * Abstract base class for session normalizers.
 * Provider implementations should extend this and implement normalizeSession().
 */
export abstract class BaseSessionNormalizer {
  constructor(protected readonly providerId: ProviderId) {}

  /**
   * Normalize a provider-specific session payload into NormalizedSession.
   * Must be implemented by provider-specific normalizers.
   *
   * @param rawSession - Raw session data from the provider
   * @returns Normalized session or null if session should be filtered
   * @throws Error if normalization fails in an unrecoverable way
   */
  abstract normalizeSession(rawSession: unknown): Promise<NormalizedSession | null>;

  /**
   * Batch normalize multiple sessions with error handling.
   * Skips sessions that fail to normalize and logs errors.
   */
  async normalizeBatch(rawSessions: unknown[]): Promise<NormalizedSession[]> {
    const normalized: NormalizedSession[] = [];

    for (const raw of rawSessions) {
      try {
        const session = await this.normalizeSession(raw);
        if (session) {
          const errors = validateNormalizedSession(session);
          if (errors.length > 0) {
            console.warn(
              `[${this.providerId}] Session validation failed:`,
              errors,
              "Raw:",
              raw,
            );
            continue;
          }
          normalized.push(session);
        }
      } catch (err) {
        console.warn(`[${this.providerId}] Session normalization error:`, err, "Raw:", raw);
      }
    }

    return normalized;
  }

  /**
   * Create a normalized session with provider defaults applied.
   */
  protected createSession(partial: Partial<NormalizedSession>): NormalizedSession {
    return createNormalizedSession({
      ...partial,
      provider: this.providerId,
    });
  }

  /**
   * Extract a safe string value from unknown data.
   */
  protected extractString(data: unknown, fallback: string = ""): string {
    if (typeof data === "string") return data;
    if (typeof data === "number") return String(data);
    return fallback;
  }

  /**
   * Extract a safe timestamp from unknown data.
   */
  protected extractTimestamp(data: unknown, fallback?: string): string {
    const fb = fallback ?? new Date().toISOString();

    if (typeof data === "string") {
      const parsed = Date.parse(data);
      if (!isNaN(parsed)) return new Date(parsed).toISOString();
    }

    if (typeof data === "number") {
      // Handle both milliseconds and seconds
      const timestamp = data > 10000000000 ? data : data * 1000;
      return new Date(timestamp).toISOString();
    }

    return fb;
  }

  /**
   * Map provider-specific status to normalized status.
   */
  protected mapStatus(rawStatus: unknown): SessionStatus {
    if (typeof rawStatus !== "string") return "idle";

    const lower = rawStatus.toLowerCase();

    if (lower.includes("active") || lower.includes("running") || lower.includes("executing")) {
      return "active";
    }

    if (lower.includes("complete") || lower.includes("done") || lower.includes("finished")) {
      return "completed";
    }

    if (lower.includes("error") || lower.includes("fail")) {
      return "error";
    }

    if (lower.includes("interrupt") || lower.includes("cancel") || lower.includes("abort")) {
      return "interrupted";
    }

    return "idle";
  }

  /**
   * Extract metadata safely from unknown data.
   */
  protected extractMetadata(data: unknown): Record<string, unknown> | undefined {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
    return undefined;
  }
}

/**
 * Example: Codex app-server session normalizer implementation.
 * Demonstrates how to map Codex thread data to NormalizedSession.
 *
 * This is a reference implementation. The actual Codex adapter would
 * use this or a similar normalizer.
 */
export class CodexSessionNormalizer extends BaseSessionNormalizer {
  constructor() {
    super("codex");
  }

  async normalizeSession(rawSession: unknown): Promise<NormalizedSession | null> {
    if (!rawSession || typeof rawSession !== "object") {
      return null;
    }

    const raw = rawSession as Record<string, unknown>;

    // Codex uses "threadId" for session identifier
    const sessionId = this.extractString(raw.threadId || raw.id);
    if (!sessionId) {
      console.warn("[codex] Session missing threadId/id:", raw);
      return null;
    }

    // Codex thread/read provides title, project, repo
    const title = this.extractString(raw.title) || "Untitled Thread";
    const project = this.extractString(raw.project);
    const repo = this.extractString(raw.repo);

    // Extract timestamps
    const createdAt = this.extractTimestamp(raw.createdAt);
    const updatedAt = this.extractTimestamp(raw.updatedAt || raw.lastModified, createdAt);

    // Map status (Codex doesn't have explicit status, infer from state)
    let status: SessionStatus = "idle";
    if (raw.status) {
      status = this.mapStatus(raw.status);
    }

    // Extract preview from last message or summary
    let preview: string | undefined;
    if (typeof raw.preview === "string") {
      preview = raw.preview;
    } else if (typeof raw.lastMessage === "string") {
      preview = raw.lastMessage.slice(0, 100);
    }

    return this.createSession({
      sessionId,
      title,
      project: project || undefined,
      repo: repo || undefined,
      status,
      createdAt,
      updatedAt,
      preview,
      metadata: this.extractMetadata(raw.metadata),
      rawSession: raw,
    });
  }
}

/**
 * ACP (Agent Communication Protocol) session normalizer.
 * Maps ACP session structure to NormalizedSession format.
 *
 * Expected ACP session structure:
 * - id: string (required)
 * - title?: string
 * - status?: string
 * - created_at?: string | number
 * - updated_at?: string | number
 * - metadata?: { project?, repo?, ... }
 * - messages?: Array<{role, content}>
 */
export class ACPSessionNormalizer extends BaseSessionNormalizer {
  constructor(providerId: ProviderId = "copilot-acp") {
    super(providerId);
  }

  async normalizeSession(rawSession: unknown): Promise<NormalizedSession | null> {
    // Validate input is an object
    if (!rawSession || typeof rawSession !== "object") {
      console.warn(`[${this.providerId}] Invalid session: not an object`, rawSession);
      return null;
    }

    const raw = rawSession as Record<string, unknown>;

    // Extract required sessionId (ACP uses 'id')
    const sessionId = this.extractString(raw.id);
    if (!sessionId) {
      console.warn(`[${this.providerId}] Session missing required 'id' field:`, raw);
      return null;
    }

    // Extract title - generate from content if not provided
    let title = this.extractString(raw.title);
    if (!title) {
      title = this.generateTitle(raw);
    }

    // Extract project and repo from metadata if available
    let project: string | undefined;
    let repo: string | undefined;
    if (raw.metadata && typeof raw.metadata === "object") {
      const meta = raw.metadata as Record<string, unknown>;
      project = this.extractString(meta.project) || undefined;
      repo = this.extractString(meta.repo) || undefined;
    }

    // Map status to normalized status enum
    const status = this.mapStatus(raw.status);

    // Extract timestamps with defensive parsing
    const createdAt = this.extractTimestamp(raw.created_at);
    const updatedAt = this.extractTimestamp(raw.updated_at, createdAt);

    // Generate preview snippet from recent messages
    const preview = this.generatePreview(raw);

    // Preserve full raw session for debugging/replay
    return this.createSession({
      sessionId,
      title,
      project,
      repo,
      status,
      createdAt,
      updatedAt,
      preview,
      metadata: this.extractMetadata(raw.metadata),
      rawSession: raw,
    });
  }

  /**
   * Generate a title from session content if title is missing.
   */
  private generateTitle(raw: Record<string, unknown>): string {
    // Try to extract from first user message
    if (Array.isArray(raw.messages) && raw.messages.length > 0) {
      for (const msg of raw.messages) {
        if (
          msg &&
          typeof msg === "object" &&
          "role" in msg &&
          "content" in msg &&
          msg.role === "user"
        ) {
          const content = this.extractString((msg as Record<string, unknown>).content);
          if (content) {
            // Use first line or first 50 chars as title
            const firstLine = content.split("\n")[0];
            return firstLine.length > 50 ? firstLine.slice(0, 47) + "..." : firstLine;
          }
        }
      }
    }

    // Fallback to generic title with timestamp
    const timestamp = this.extractTimestamp(raw.created_at);
    const date = new Date(timestamp);
    return `Session ${date.toLocaleDateString()}`;
  }

  /**
   * Generate a preview snippet from recent session content.
   */
  private generatePreview(raw: Record<string, unknown>): string | undefined {
    // If explicit preview field exists, use it
    if (typeof raw.preview === "string" && raw.preview.trim()) {
      return raw.preview.slice(0, 200);
    }

    // Otherwise, extract from last message
    if (Array.isArray(raw.messages) && raw.messages.length > 0) {
      // Get last message
      const lastMsg = raw.messages[raw.messages.length - 1];
      if (lastMsg && typeof lastMsg === "object" && "content" in lastMsg) {
        const content = this.extractString((lastMsg as Record<string, unknown>).content);
        if (content) {
          return content.slice(0, 200);
        }
      }
    }

    return undefined;
  }
}

/**
 * Session normalizer factory.
 * Returns the appropriate normalizer for a given provider.
 */
export function createSessionNormalizer(providerId: ProviderId): BaseSessionNormalizer {
  switch (providerId) {
    case "codex":
      return new CodexSessionNormalizer();
    case "copilot-acp":
      return new ACPSessionNormalizer();
    default:
      // Generic normalizer for unknown providers
      return new ACPSessionNormalizer(providerId);
  }
}
