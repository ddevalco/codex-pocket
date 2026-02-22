/**
 * Codex Provider Adapter
 *
 * Phase 1 placeholder — listSessions returns empty, all other methods throw 'not implemented'.
 * Full implementation planned for Phase 2.
 */

import { defaultAgentCapabilities, type ProviderAdapter } from "../contracts.js";
import type {
  ProviderAgentCapabilities,
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
 * Configuration for Codex adapter
 */
export interface CodexConfig {
  /**
   * Optional base URL for Codex API
   */
  baseUrl?: string;
}

/**
 * Codex Provider Adapter implementation
 */
export class CodexAdapter implements ProviderAdapter {
  readonly providerId = "codex";
  readonly providerName = "Codex";

  readonly capabilities: ProviderCapabilities = {
    listSessions: true,
    openSession: false,
    sendPrompt: false,
    streaming: false,
    attachments: false,
    approvals: false,
    multiTurn: false,
    filtering: false,
    pagination: false,
  };

  constructor(_config: CodexConfig = {}) {
    // Placeholder config usage
  }

  async getAgentCapabilities(): Promise<ProviderAgentCapabilities> {
    return {
      ...defaultAgentCapabilities(),
      canCreateNew: true,
      models: [
        { id: "gpt-4.1", name: "GPT-4.1" },
        { id: "gpt-4o", name: "GPT-4o" },
        { id: "gpt-4o-mini", name: "GPT-4o Mini" },
        { id: "o3-mini", name: "o3-mini" },
        { id: "o4-mini", name: "o4-mini" },
      ],
    };
  }

  async start(): Promise<void> {
    // No-op for placeholder
  }

  async stop(): Promise<void> {
    // No-op for placeholder
  }

  async health(): Promise<ProviderHealthStatus> {
    return {
      status: "healthy",
      message: "Codex adapter placeholder (Phase 1)",
      lastCheck: new Date().toISOString(),
    };
  }

  async listSessions(_cursor?: string, _filters?: SessionFilters): Promise<SessionListResult> {
    return {
      sessions: [],
      hasMore: false,
    };
  }

  async openSession(sessionId: string): Promise<NormalizedSession> {
    throw new Error(`Method not implemented: openSession(${sessionId})`);
  }

  async sendPrompt(
    sessionId: string,
    _input: PromptInput,
    _options?: PromptOptions,
  ): Promise<{ turnId?: string; requestId?: string; [key: string]: unknown }> {
    throw new Error(`Method not implemented: sendPrompt(${sessionId})`);
  }

  async subscribe(
    sessionId: string,
    _callback: (event: NormalizedEvent) => void,
  ): Promise<EventSubscription> {
    throw new Error(`Method not implemented: subscribe(${sessionId})`);
  }

  async unsubscribe(_subscription: EventSubscription): Promise<void> {
    // No-op for placeholder
  }

  async normalizeEvent(_rawEvent: unknown): Promise<NormalizedEvent | null> {
    return null;
  }
}
