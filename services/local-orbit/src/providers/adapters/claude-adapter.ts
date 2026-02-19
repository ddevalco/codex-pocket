/**
 * Claude Provider Adapter
 *
 * Foundation scaffold for Claude integration following the provider adapter pattern.
 * This is a Phase 5 foundation-only implementation - full API integration deferred.
 *
 * Phase 5 scope (foundation):
 * - Adapter interface implementation (scaffold)
 * - Health check wiring (returns false gracefully)
 * - Capability declaration
 * - Registry integration
 *
 * Future phases:
 * - Claude API/CLI integration
 * - Session listing and normalization
 * - Prompt send and streaming
 * - Event normalization
 */

import type { ProviderAdapter } from "../contracts.js";
import type {
  ProviderCapabilities,
  ProviderHealthStatus,
  SessionListResult,
  SessionFilters,
  NormalizedSession,
  PromptInput,
  PromptOptions,
  EventSubscription,
  NormalizedEvent,
} from "../provider-types.js";

/**
 * Configuration for Claude adapter
 */
export interface ClaudeConfig {
  /**
   * Optional Claude API key for authentication
   */
  apiKey?: string;

  /**
   * Optional Claude API base URL (default: Anthropic public API)
   */
  baseUrl?: string;

  /**
   * Optional timeout for Claude API operations in milliseconds
   */
  timeout?: number;

  /**
   * Optional Claude model to use (e.g., "claude-3-opus", "claude-3-sonnet")
   */
  model?: string;
}

/**
 * Claude Provider Adapter implementation (foundation scaffold)
 */
export class ClaudeAdapter implements ProviderAdapter {
  readonly providerId = "claude";
  readonly providerName = "Claude";

  readonly capabilities: ProviderCapabilities = {
    listSessions: false,      // Phase 6+
    openSession: false,       // Phase 6+
    sendPrompt: false,        // Phase 6+
    streaming: true,          // Claude API supports streaming (capability exists)
    attachments: true,        // Claude supports vision/attachments (capability exists)
    approvals: false,         // TBD based on implementation approach
    multiTurn: true,          // Claude supports multi-turn conversations (capability exists)
    filtering: false,         // Phase 6+
    pagination: false,        // Phase 6+
  };

  private config: ClaudeConfig;

  constructor(config: ClaudeConfig = {}) {
    this.config = {
      timeout: 30000,
      model: "claude-3-5-sonnet-20241022", // Latest stable model
      ...config,
    };
  }

  /**
   * Start the Claude adapter.
   * Foundation implementation - no actual startup required yet.
   */
  async start(): Promise<void> {
    console.log("[claude] Adapter started (foundation-only, no API integration)");
    // Future: Initialize Claude API client, validate credentials
  }

  /**
   * Stop the Claude adapter and clean up resources.
   */
  async stop(): Promise<void> {
    console.log("[claude] Adapter stopped");
    // Future: Clean up any persistent connections or subscriptions
  }

  /**
   * Check health status of the Claude adapter.
   * Foundation implementation returns unhealthy gracefully until full integration.
   */
  async health(): Promise<ProviderHealthStatus> {
    return {
      status: "unhealthy",
      message: "Claude adapter foundation-only (no API integration yet)",
      lastCheck: new Date().toISOString(),
      details: {
        reason: "foundation_scaffold",
        phase: "P5-01",
        apiKeyConfigured: !!this.config.apiKey,
      },
    };
  }

  /**
   * List sessions/conversations from Claude.
   * Not implemented in foundation phase.
   */
  async listSessions(_cursor?: string, _filters?: SessionFilters): Promise<SessionListResult> {
    return {
      sessions: [],
      hasMore: false,
    };
  }

  /**
   * Open/resume a specific Claude conversation.
   * Not implemented in foundation phase.
   */
  async openSession(sessionId: string): Promise<NormalizedSession> {
    throw new Error(`Claude adapter foundation-only: openSession(${sessionId}) not implemented`);
  }

  /**
   * Send a prompt to a Claude conversation.
   * Not implemented in foundation phase.
   */
  async sendPrompt(
    sessionId: string,
    _input: PromptInput,
    _options?: PromptOptions,
  ): Promise<{ turnId?: string; requestId?: string; [key: string]: unknown }> {
    throw new Error(`Claude adapter foundation-only: sendPrompt(${sessionId}) not implemented`);
  }

  /**
   * Subscribe to realtime events from a Claude conversation.
   * Not implemented in foundation phase.
   */
  async subscribe(
    sessionId: string,
    _callback: (event: NormalizedEvent) => void,
  ): Promise<EventSubscription> {
    throw new Error(`Claude adapter foundation-only: subscribe(${sessionId}) not implemented`);
  }

  /**
   * Unsubscribe from conversation events.
   */
  async unsubscribe(_subscription: EventSubscription): Promise<void> {
    // No-op for foundation scaffold
  }

  /**
   * Normalize a raw Claude event into the unified event envelope.
   * Not implemented in foundation phase.
   */
  async normalizeEvent(_rawEvent: unknown): Promise<NormalizedEvent | null> {
    // No events to normalize in foundation phase
    return null;
  }
}
