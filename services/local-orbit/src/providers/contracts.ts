/**
 * Provider Adapter Contracts for CodeRelay
 *
 * This module defines the provider abstraction layer that allows CodeRelay
 * to integrate with multiple agent providers (Codex app-server, GitHub Copilot ACP, etc.)
 * while maintaining a consistent internal interface.
 *
 * Design principles:
 * - Provider-agnostic core UI and transport
 * - Normalized session and event models for cross-provider rendering
 * - Preserve raw provider payloads for debugging, replay, and provider-specific features
 * - Extensible for future providers without breaking existing implementations
 */

import type {
  NormalizedSession,
  NormalizedEvent,
  ProviderHealthStatus,
  ProviderCapabilities,
  SessionFilters,
  SessionListResult,
  PromptInput,
  PromptOptions,
  EventSubscription,
} from "./provider-types.js";

/**
 * Core adapter interface that all provider implementations must satisfy.
 *
 * Each provider adapter manages its own lifecycle, communication protocol,
 * and data normalization while exposing a consistent interface to local-orbit.
 */
export interface ProviderAdapter {
  /**
   * Unique identifier for this provider (e.g., "codex", "copilot-acp")
   */
  readonly providerId: string;

  /**
   * Human-readable provider name for UI display
   */
  readonly providerName: string;

  /**
   * Provider capabilities declaration for graceful feature degradation
   */
  readonly capabilities: ProviderCapabilities;

  /**
   * Start the provider adapter and any required subprocesses.
   * Should be idempotent - multiple calls should not spawn duplicate processes.
   *
   * @throws Error if startup fails in an unrecoverable way
   */
  start(): Promise<void>;

  /**
   * Stop the provider adapter and clean up resources.
   * Should be safe to call even if the adapter was never started.
   */
  stop(): Promise<void>;

  /**
   * Check the health status of the provider.
   * Used by admin diagnostics and runtime monitoring.
   *
   * @returns Current health status with optional diagnostic details
   */
  health(): Promise<ProviderHealthStatus>;

  /**
   * List sessions/threads from this provider with optional filtering and pagination.
   *
   * @param cursor - Opaque pagination cursor from a previous response (provider-specific)
   * @param filters - Optional filters for project, repo, status, etc.
   * @returns Normalized session list with optional cursor for next page
   */
  listSessions(cursor?: string, filters?: SessionFilters): Promise<SessionListResult>;

  /**
   * Open/resume a specific session by ID.
   * This may trigger provider-specific session initialization or state loading.
   *
   * @param sessionId - Provider-specific session identifier
   * @returns The normalized session data
   * @throws Error if session not found or cannot be opened
   */
  openSession(sessionId: string): Promise<NormalizedSession>;

  /**
   * Send a prompt/message to a session and initiate execution.
   *
   * @param sessionId - Target session identifier
   * @param input - Prompt text and optional attachments
   * @param options - Provider-specific execution options
   * @returns Provider-specific response (typically includes a turn/request ID)
   */
  sendPrompt(
    sessionId: string,
    input: PromptInput,
    options?: PromptOptions,
  ): Promise<{ turnId?: string; requestId?: string; [key: string]: unknown }>;

  /**
   * Subscribe to realtime events from a session.
   * The callback will be invoked for each event until unsubscribe() is called.
   *
   * @param sessionId - Session to subscribe to
   * @param callback - Event handler that receives normalized events
   * @returns Subscription handle for cleanup
   */
  subscribe(
    sessionId: string,
    callback: (event: NormalizedEvent) => void,
  ): Promise<EventSubscription>;

  /**
   * Unsubscribe from session events.
   *
   * @param subscription - The subscription handle from subscribe()
   */
  unsubscribe(subscription: EventSubscription): Promise<void>;

  /**
   * Normalize a raw provider event into the unified event envelope.
   * This is the core translation layer that maps provider-specific event
   * shapes into CodeRelay's timeline model.
   *
   * @param rawEvent - Raw event payload from the provider
   * @returns Normalized event envelope (or null if event should be filtered)
   */
  normalizeEvent(rawEvent: unknown): Promise<NormalizedEvent | null>;
}

/**
 * Factory function signature for creating provider adapter instances.
 * Used by the provider registry to instantiate adapters with configuration.
 */
export type ProviderFactory = (config: ProviderConfig) => ProviderAdapter;

/**
 * Configuration shape for provider initialization.
 * Each provider may define additional config fields via the `extra` property.
 */
export interface ProviderConfig {
  /**
   * Whether this provider is enabled
   */
  enabled: boolean;

  /**
   * Provider-specific configuration (e.g., executable paths, auth tokens, endpoints)
   */
  extra?: Record<string, unknown>;
}

/**
 * Provider registry interface for managing multiple active providers.
 * Implemented by local-orbit to coordinate provider lifecycle.
 */
export interface ProviderRegistry {
  /**
   * Register a provider factory under a given ID
   */
  register(providerId: string, factory: ProviderFactory, config: ProviderConfig): void;

  /**
   * Get an active provider adapter by ID
   */
  get(providerId: string): ProviderAdapter | undefined;

  /**
   * List all registered provider IDs
   */
  list(): string[];

  /**
   * Start all enabled providers
   */
  startAll(): Promise<void>;

  /**
   * Stop all providers
   */
  stopAll(): Promise<void>;

  /**
   * Get health status for all providers
   */
  healthAll(): Promise<Record<string, ProviderHealthStatus>>;
}
