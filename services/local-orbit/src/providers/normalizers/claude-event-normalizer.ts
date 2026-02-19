/**
 * Claude Event Normalizer
 *
 * Normalizes Claude API events and messages into NormalizedEvent format.
 * Handles streaming content blocks, tool usage, and completion events.
 */

import type { NormalizedEvent, EventCategory, TokenUsage } from "../provider-types.js";
import { BaseEventNormalizer } from "./event-normalizer.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Claude event normalizer implementation
 */
export class ClaudeEventNormalizer extends BaseEventNormalizer {
  constructor() {
    super("claude");
  }

  /**
   * Normalize a Claude API message or streaming chunk into NormalizedEvent.
   * Handles both complete messages and streaming delta events.
   */
  async normalizeEvent(rawEvent: unknown): Promise<NormalizedEvent | null> {
    if (!rawEvent || typeof rawEvent !== "object") {
      return null;
    }

    const raw = rawEvent as Record<string, unknown>;

    // Determine event type
    const type = this.extractString(raw.type);

    switch (type) {
      case "message":
        return this.normalizeMessage(raw);
      case "content_block_start":
      case "content_block_delta":
      case "content_block_stop":
        return this.normalizeContentBlock(raw);
      case "message_start":
      case "message_delta":
      case "message_stop":
        return this.normalizeMessageEvent(raw);
      default:
        // Unknown event type, preserve as metadata
        console.warn("[claude] Unknown event type:", type);
        return null;
    }
  }

  /**
   * Normalize a complete Claude message (non-streaming response)
   */
  private async normalizeMessage(raw: Record<string, unknown>): Promise<NormalizedEvent | null> {
    const sessionId = this.extractString(raw.sessionId);
    if (!sessionId) {
      console.warn("[claude] Message missing sessionId");
      return null;
    }

    const eventId = this.extractEventId(raw);
    const timestamp = this.extractTimestamp(raw.timestamp);

    // Extract role to determine category
    const role = this.extractString(raw.role);
    const category: EventCategory = role === "user" ? "user_message" : "agent_message";

    // Extract content from content blocks
    const content = raw.content;
    let text = "";
    const payload: Record<string, unknown> = {};

    if (Array.isArray(content)) {
      for (const block of content) {
        if (typeof block === "object" && block !== null) {
          const blockData = block as Record<string, unknown>;
          if (blockData.type === "text") {
            text += this.extractString(blockData.text);
          } else if (blockData.type === "tool_use") {
            // Tool usage event
            payload.toolUse = blockData;
          }
        }
      }
    }

    // Extract token usage if available
    const tokenUsage = this.extractTokenUsage(raw.usage);

    return this.createEvent({
      sessionId,
      eventId,
      category,
      timestamp,
      text: text || undefined,
      payload: Object.keys(payload).length > 0 ? payload : undefined,
      tokenUsage,
      rawEvent: raw,
    });
  }

  /**
   * Normalize a Claude streaming content block event
   */
  private async normalizeContentBlock(raw: Record<string, unknown>): Promise<NormalizedEvent | null> {
    const sessionId = this.extractString(raw.sessionId);
    if (!sessionId) {
      return null;
    }

    const eventId = this.extractEventId(raw);
    const timestamp = this.extractTimestamp(raw.timestamp);
    const type = this.extractString(raw.type);

    // Extract content from delta or block data
    let text = "";
    let category: EventCategory = "agent_message";

    if (type === "content_block_delta") {
      const delta = raw.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta") {
        text = this.extractString(delta.text);
      } else if (delta?.type === "input_json_delta") {
        // Tool usage delta
        category = "tool_command";
        text = this.extractString(delta.partial_json);
      }
    } else if (type === "content_block_start") {
      const contentBlock = raw.content_block as Record<string, unknown> | undefined;
      if (contentBlock?.type === "text") {
        text = this.extractString(contentBlock.text);
      } else if (contentBlock?.type === "tool_use") {
        category = "tool_command";
        text = `Tool: ${this.extractString(contentBlock.name)}`;
      }
    }

    return this.createEvent({
      sessionId,
      eventId,
      category,
      timestamp,
      text: text || undefined,
      payload: { streamingDelta: true },
      rawEvent: raw,
    });
  }

  /**
   * Normalize a Claude message lifecycle event (start/delta/stop)
   */
  private async normalizeMessageEvent(raw: Record<string, unknown>): Promise<NormalizedEvent | null> {
    const sessionId = this.extractString(raw.sessionId);
    if (!sessionId) {
      return null;
    }

    const eventId = this.extractEventId(raw);
    const timestamp = this.extractTimestamp(raw.timestamp);
    const type = this.extractString(raw.type);

    let text = "";
    let tokenUsage: TokenUsage | undefined;

    if (type === "message_start") {
      text = "Message started";
    } else if (type === "message_delta") {
      text = "Message delta";
      const delta = raw.delta as Record<string, unknown> | undefined;
      if (delta?.stop_reason) {
        text = `Message stopped: ${delta.stop_reason}`;
      }
      // Extract usage from delta
      tokenUsage = this.extractTokenUsage(raw.usage);
    } else if (type === "message_stop") {
      text = "Message completed";
    }

    return this.createEvent({
      sessionId,
      eventId,
      category: "lifecycle_status",
      timestamp,
      text,
      tokenUsage,
      payload: { eventType: type },
      rawEvent: raw,
    });
  }

  /**
   * Extract token usage from Claude API response
   */
  private extractTokenUsage(usage: unknown): TokenUsage | undefined {
    if (!usage || typeof usage !== "object") {
      return undefined;
    }

    const usageData = usage as Record<string, unknown>;

    const inputTokens = typeof usageData.input_tokens === "number" ? usageData.input_tokens : 0;
    const outputTokens = typeof usageData.output_tokens === "number" ? usageData.output_tokens : 0;

    if (inputTokens === 0 && outputTokens === 0) {
      return undefined;
    }

    // Estimate cost based on Claude pricing (as of 2026)
    // Claude 3.5 Sonnet: $3/MTok input, $15/MTok output
    const inputCost = (inputTokens / 1_000_000) * 3.0;
    const outputCost = (outputTokens / 1_000_000) * 15.0;
    const estimatedCost = inputCost + outputCost;

    return {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCost: estimatedCost > 0 ? estimatedCost : undefined,
      model: "claude-3-5-sonnet-20241022",
    };
  }

  /**
   * Normalize a user message for sending to Claude API.
   * Converts PromptInput into Claude message format.
   */
  normalizeUserMessage(text: string, attachments?: Array<{ path: string; mimeType?: string }>): Anthropic.MessageParam {
    const content: Anthropic.MessageParam["content"] = [];

    // Add text content
    if (text) {
      content.push({
        type: "text",
        text,
      });
    }

    // Add attachments as image blocks
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        // For now, skip non-image attachments
        // Full implementation would read file and encode as base64
        if (attachment.mimeType?.startsWith("image/")) {
          // Placeholder for image attachment
          console.warn("[claude] Image attachments require base64 encoding (not implemented)");
        }
      }
    }

    return {
      role: "user",
      content,
    };
  }
}
