/**
 * Claude Session Normalizer
 *
 * Normalizes Claude conversation data into NormalizedSession format.
 * Claude doesn't have native conversation persistence via API, so we treat
 * each API interaction as ephemeral or integrate with local storage.
 */

import type { NormalizedSession, ProviderCapabilities } from "../provider-types.js";
import { BaseSessionNormalizer } from "./session-normalizer.js";

/**
 * Claude conversation data shape (internal tracking)
 */
export interface ClaudeConversation {
  /**
   * Unique conversation identifier (generated locally)
   */
  id: string;

  /**
   * Conversation title
   */
  title: string;

  /**
   * Last user message or summary
   */
  lastMessage?: string;

  /**
   * ISO 8601 timestamp of creation
   */
  createdAt: string;

  /**
   * ISO 8601 timestamp of last update
   */
  updatedAt: string;

  /**
   * Model identifier used for this conversation
   */
  model?: string;

  /**
   * Custom metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Claude session normalizer implementation
 */
export class ClaudeSessionNormalizer extends BaseSessionNormalizer {
  constructor() {
    super("claude");
  }

  /**
   * Normalize a Claude conversation into NormalizedSession.
   * Claude API doesn't have built-in session persistence, so we normalize
   * from local tracking data or create minimal sessions on-the-fly.
   */
  async normalizeSession(rawSession: unknown): Promise<NormalizedSession | null> {
    if (!rawSession || typeof rawSession !== "object") {
      return null;
    }

    const raw = rawSession as Record<string, unknown>;

    // Extract or generate session ID
    const sessionId = this.extractString(raw.id);
    if (!sessionId) {
      console.warn("[claude] Session missing required 'id' field");
      return null;
    }

    // Extract title (fallback to generic title)
    const title = this.extractString(raw.title, "Claude Conversation");

    // Extract timestamps
    const createdAt = this.extractTimestamp(raw.createdAt);
    const updatedAt = this.extractTimestamp(raw.updatedAt, createdAt);

    // Extract preview text from last message
    const preview = this.extractString(raw.lastMessage);

    // Extract model identifier
    const model = this.extractString(raw.model);

    // Build capabilities for this session
    const capabilities: ProviderCapabilities = {
      listSessions: false, // Claude doesn't have native session listing
      openSession: true,   // Can open/resume via local tracking
      sendPrompt: true,    // Primary capability
      streaming: true,     // Claude supports streaming
      attachments: true,   // Claude supports vision/attachments
      approvals: false,    // No approval workflow in Claude API
      multiTurn: true,     // Claude supports multi-turn conversations
      filtering: false,    // No native filtering
      pagination: false,   // No native pagination
    };

    // Extract custom metadata
    const metadata = this.extractMetadata(raw.metadata);

    return this.createSession({
      sessionId,
      title,
      status: "idle", // Default status for Claude sessions
      createdAt,
      updatedAt,
      preview,
      capabilities,
      metadata: {
        ...metadata,
        model,
      },
      rawSession: raw,
    });
  }

  /**
   * Create a minimal normalized session for a new Claude conversation.
   * Used when creating sessions on-the-fly without pre-existing data.
   */
  createMinimalSession(sessionId: string, title?: string): NormalizedSession {
    const now = new Date().toISOString();

    return this.createSession({
      sessionId,
      title: title || "New Claude Conversation",
      status: "idle",
      createdAt: now,
      updatedAt: now,
      capabilities: {
        listSessions: false,
        openSession: true,
        sendPrompt: true,
        streaming: true,
        attachments: true,
        approvals: false,
        multiTurn: true,
        filtering: false,
        pagination: false,
      },
    });
  }
}
