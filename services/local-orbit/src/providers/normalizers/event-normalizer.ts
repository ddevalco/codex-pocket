/**
 * Event Normalizer Base Classes and Utilities
 *
 * Provides base implementation and helpers for normalizing provider-specific
 * event data into the unified NormalizedEvent model.
 *
 * Provider-specific normalizers should extend BaseEventNormalizer.
 */

import type { NormalizedEvent, EventCategory, ProviderId } from "../provider-types.js";
import {
  createNormalizedEvent,
  validateNormalizedEvent,
  generateEventId,
} from "../normalized-event.js";

/**
 * Abstract base class for event normalizers.
 * Provider implementations should extend this and implement normalizeEvent().
 */
export abstract class BaseEventNormalizer {
  constructor(protected readonly providerId: ProviderId) {}

  /**
   * Normalize a provider-specific event payload into NormalizedEvent.
   * Must be implemented by provider-specific normalizers.
   *
   * @param rawEvent - Raw event data from the provider
   * @returns Normalized event or null if event should be filtered
   * @throws Error if normalization fails in an unrecoverable way
   */
  abstract normalizeEvent(rawEvent: unknown): Promise<NormalizedEvent | null>;

  /**
   * Batch normalize multiple events with error handling.
   * Skips events that fail to normalize and logs errors.
   */
  async normalizeBatch(rawEvents: unknown[]): Promise<NormalizedEvent[]> {
    const normalized: NormalizedEvent[] = [];

    for (const raw of rawEvents) {
      try {
        const event = await this.normalizeEvent(raw);
        if (event) {
          const errors = validateNormalizedEvent(event);
          if (errors.length > 0) {
            console.warn(`[${this.providerId}] Event validation failed:`, errors, "Raw:", raw);
            continue;
          }
          normalized.push(event);
        }
      } catch (err) {
        console.warn(`[${this.providerId}] Event normalization error:`, err, "Raw:", raw);
      }
    }

    return normalized;
  }

  /**
   * Create a normalized event with provider defaults applied.
   */
  protected createEvent(partial: Partial<NormalizedEvent>): NormalizedEvent {
    return createNormalizedEvent({
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
      const timestamp = data > 10000000000 ? data : data * 1000;
      return new Date(timestamp).toISOString();
    }

    return fb;
  }

  /**
   * Extract payload safely from unknown data.
   */
  protected extractPayload(data: unknown): Record<string, unknown> | undefined {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
    return undefined;
  }

  /**
   * Generate or extract event ID from raw data.
   */
  protected extractEventId(raw: unknown): string {
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      if (typeof obj.id === "string" || typeof obj.id === "number") {
        return String(obj.id);
      }
      if (typeof obj.eventId === "string") {
        return obj.eventId;
      }
    }
    return generateEventId();
  }
}

/**
 * Example: Codex app-server event normalizer implementation.
 * Maps Codex JSON-RPC notification methods to normalized event categories.
 *
 * This is a reference implementation showing the event taxonomy mapping.
 */
export class CodexEventNormalizer extends BaseEventNormalizer {
  constructor() {
    super("codex");
  }

  async normalizeEvent(rawEvent: unknown): Promise<NormalizedEvent | null> {
    if (!rawEvent || typeof rawEvent !== "object") {
      return null;
    }

    const raw = rawEvent as Record<string, unknown>;

    // Codex events are JSON-RPC notifications with a "method" field
    const method = this.extractString(raw.method);
    if (!method) {
      // Not a notification, might be a response - skip
      return null;
    }

    // Extract common fields
    const params = this.extractPayload(raw.params);
    if (!params) {
      console.warn("[codex] Event missing params:", raw);
      return null;
    }

    const threadId = this.extractString(params.threadId);
    if (!threadId) {
      console.warn("[codex] Event missing threadId:", raw);
      return null;
    }

    const eventId = this.extractEventId(raw);
    const timestamp = this.extractTimestamp(params.timestamp);

    // Map Codex method to event category and extract relevant data
    const mapping = this.mapCodexMethodToCategory(method, params);
    if (!mapping) {
      // Filter out unmapped events
      return null;
    }

    return this.createEvent({
      sessionId: threadId,
      eventId,
      category: mapping.category,
      timestamp,
      text: mapping.text,
      payload: mapping.payload,
      parentEventId: this.extractString(params.parentId) || undefined,
      rawEvent: raw,
    });
  }

  /**
   * Map Codex JSON-RPC methods to normalized event categories.
   * Returns category, text, and payload for the normalized event.
   */
  private mapCodexMethodToCategory(
    method: string,
    params: Record<string, unknown>,
  ): { category: EventCategory; text?: string; payload?: Record<string, unknown> } | null {
    // Turn start/input
    if (method === "turn/start") {
      return {
        category: "user_message",
        text: this.extractString(params.input),
        payload: { turnId: params.turnId },
      };
    }

    // Agent text output
    if (method === "item/text") {
      return {
        category: "agent_message",
        text: this.extractString(params.text),
        payload: { itemId: params.itemId },
      };
    }

    // Reasoning/thinking
    if (method === "item/reasoning") {
      return {
        category: "reasoning",
        text: this.extractString(params.text),
        payload: { itemId: params.itemId },
      };
    }

    // Planning output
    if (method === "item/plan" || method === "item/planning") {
      return {
        category: "plan",
        text: this.extractString(params.text),
        payload: { itemId: params.itemId, plan: params.plan },
      };
    }

    // Command/tool execution
    if (
      method === "item/commandExecution" ||
      method === "item/tool" ||
      method === "item/mcpToolCall"
    ) {
      return {
        category: "tool_command",
        text: this.extractString(params.command || params.tool),
        payload: {
          itemId: params.itemId,
          command: params.command,
          tool: params.tool,
          args: params.args,
          status: params.status,
          exitCode: params.exitCode,
          output: params.output,
        },
      };
    }

    // File changes/diffs
    if (method === "item/fileChange") {
      return {
        category: "file_diff",
        text: this.extractString(params.path),
        payload: {
          itemId: params.itemId,
          path: params.path,
          diff: params.diff,
          language: params.language,
          changeType: params.changeType,
        },
      };
    }

    // Approval requests
    if (
      method === "item/fileChange/requestApproval" ||
      method === "item/commandExecution/requestApproval" ||
      method === "item/mcpToolCall/requestApproval"
    ) {
      return {
        category: "approval_request",
        text: `Approval required: ${this.extractString(params.path || params.command || params.tool)}`,
        payload: {
          itemId: params.itemId,
          requestId: params.id,
          approvalType: method,
          details: params,
        },
      };
    }

    // User input requests
    if (method === "item/tool/requestUserInput") {
      return {
        category: "user_input_request",
        text: this.extractString(params.prompt || params.message),
        payload: {
          itemId: params.itemId,
          requestId: params.id,
          inputType: params.inputType,
          prompt: params.prompt,
        },
      };
    }

    // Turn lifecycle
    if (method === "turn/completed" || method === "turn/failed" || method === "turn/cancelled") {
      return {
        category: "lifecycle_status",
        text: method.replace("turn/", ""),
        payload: {
          turnId: params.turnId,
          status: method.replace("turn/", ""),
          error: params.error,
        },
      };
    }

    // Thread metadata updates
    if (method === "thread/titleUpdated" || method === "thread/updated") {
      return {
        category: "metadata",
        text: this.extractString(params.title),
        payload: params,
      };
    }

    // Unknown method - filter out
    return null;
  }
}

/**
 * Placeholder: ACP event normalizer.
 * To be implemented when ACP adapter is built.
 */
export class ACPEventNormalizer extends BaseEventNormalizer {
  constructor(providerId: ProviderId = "copilot-acp") {
    super(providerId);
  }

  async normalizeEvent(rawEvent: unknown): Promise<NormalizedEvent | null> {
    // TODO: Implement ACP-specific event normalization
    // This will depend on the actual ACP protocol event structure

    if (!rawEvent || typeof rawEvent !== "object") {
      return null;
    }

    const raw = rawEvent as Record<string, unknown>;
    const eventId = this.extractEventId(raw);
    const sessionId = this.extractString(raw.sessionId);
    const timestamp = this.extractTimestamp(raw.timestamp);

    // Placeholder: generic metadata event
    return this.createEvent({
      sessionId,
      eventId,
      category: "metadata",
      timestamp,
      text: JSON.stringify(raw).slice(0, 100),
      rawEvent: raw,
    });
  }
}

/**
 * Event normalizer factory.
 * Returns the appropriate normalizer for a given provider.
 */
export function createEventNormalizer(providerId: ProviderId): BaseEventNormalizer {
  switch (providerId) {
    case "codex":
      return new CodexEventNormalizer();
    case "copilot-acp":
      return new ACPEventNormalizer();
    default:
      // Generic normalizer for unknown providers
      return new ACPEventNormalizer(providerId);
  }
}
