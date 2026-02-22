/**
 * Provider Adapter System
 *
 * This module exports the provider abstraction layer for CodeRelay,
 * enabling multi-provider support (Codex, ACP, etc.) with consistent interfaces.
 *
 * Usage:
 *   import { ProviderAdapter, NormalizedSession } from './providers/index.js';
 *
 * @module providers
 */

// Core contracts
export type {
  ProviderAdapter,
  ProviderFactory,
  ProviderConfig,
  ProviderRegistry as ProviderRegistryInterface,
} from "./contracts.js";

// Type definitions
export type {
  ProviderId,
  SessionStatus,
  NormalizedSession,
  EventCategory,
  NormalizedEvent,
  ProviderHealthStatus,
  ProviderCapabilities,
  SessionFilters,
  SessionListResult,
  PromptInput,
  PromptAttachment,
  PromptOptions,
  EventSubscription,
} from "./provider-types.js";

// Session utilities and helpers
export {
  createNormalizedSession,
  validateNormalizedSession,
  sessionMatchesFilters,
  compareSessionsByUpdated,
  compareSessionsByCreated,
  groupSessionsByProject,
  groupSessionsByRepo,
  groupSessionsByProvider,
  generateSessionPreview,
  mergeSessionUpdate,
} from "./normalized-session.js";

// Event utilities and helpers
export {
  createNormalizedEvent,
  generateEventId,
  validateNormalizedEvent,
  eventMatchesCategory,
  filterEventsByCategory,
  filterEventsByTimeRange,
  compareEventsByTimestamp,
  buildEventTree,
  getChildEvents,
  extractEventText,
  groupEventsByCategory,
  isActionableEvent,
  filterActionableEvents,
  summarizeEvent,
  batchEventsBySession,
  calculateEventStats,
} from "./normalized-event.js";

export type { EventStats } from "./normalized-event.js";

// Provider Registry
export { ProviderRegistry, createRegistry } from "./registry.js";

// Normalizers
export {
  BaseSessionNormalizer,
  CodexSessionNormalizer,
  ACPSessionNormalizer,
  createSessionNormalizer,
} from "./normalizers/session-normalizer.js";

export {
  BaseEventNormalizer,
  CodexEventNormalizer,
  ACPEventNormalizer,
  createEventNormalizer,
} from "./normalizers/event-normalizer.js";

export {
  ACPStreamingNormalizer,
} from "./normalizers/acp-event-normalizer.js";

export { ClaudeSessionNormalizer } from "./normalizers/claude-session-normalizer.js";
export { ClaudeEventNormalizer } from "./normalizers/claude-event-normalizer.js";

// Token usage and cost tracking
export type { TokenUsage } from "./provider-types.js";
export type { PricingTable } from "./cost-calculator.js";

export {
  calculateCost,
  enrichTokenUsage,
  getPricingTables,
} from "./cost-calculator.js";

export {
  extractTokenUsage,
  enrichEventWithTokenUsage,
  enrichEventsWithTokenUsage,
} from "./token-usage-enricher.js";
