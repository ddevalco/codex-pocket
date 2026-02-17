/**
 * Provider Type Definitions
 *
 * Supporting types for the provider adapter system.
 * These types enable consistent data modeling across different agent providers.
 */

/**
 * Provider identifier literals for type safety
 */
export type ProviderId = "codex" | "copilot-acp" | string;

/**
 * Session/thread status across providers
 */
export type SessionStatus =
  | "active" // Session is currently executing
  | "idle" // Session exists but no active execution
  | "completed" // Session finished successfully
  | "error" // Session encountered an error
  | "interrupted"; // Session was interrupted/cancelled

/**
 * Normalized session model for cross-provider UI rendering.
 * This is the unified shape used by the Home screen and thread list.
 */
export interface NormalizedSession {
  /**
   * Provider identifier (e.g., "codex", "copilot-acp")
   */
  provider: ProviderId;

  /**
   * Provider-specific session/thread identifier
   */
  sessionId: string;

  /**
   * User-visible session title
   */
  title: string;

  /**
   * Optional project name or workspace path
   */
  project?: string;

  /**
   * Optional repository name or URL
   */
  repo?: string;

  /**
   * Current session status
   */
  status: SessionStatus;

  /**
   * ISO 8601 timestamp of session creation
   */
  createdAt: string;

  /**
   * ISO 8601 timestamp of last update
   */
  updatedAt: string;

  /**
   * Optional preview text (last message, summary, etc.)
   */
  preview?: string;

  /**
   * Provider capabilities declaration for this specific session.
   * UI uses these to enable/disable features (attachments, approvals, etc.)
   */
  capabilities: ProviderCapabilities;

  /**
   * Custom metadata (provider-specific flags, tags, etc.)
   */
  metadata?: Record<string, unknown>;

  /**
   * Raw provider-specific session payload for debugging/replay
   * Stored but not used by core UI rendering
   */
  rawSession?: unknown;
}

/**
 * Normalized event categories for timeline rendering.
 * These map provider-specific events into a consistent taxonomy.
 */
export type EventCategory =
  | "user_message" // User input/prompt
  | "agent_message" // Agent/LLM response text
  | "reasoning" // Agent reasoning/thinking steps
  | "plan" // Agent planning output
  | "tool_command" // Tool/command execution
  | "file_diff" // File change/diff
  | "approval_request" // Requires user approval
  | "user_input_request" // Requires user input (not just approval)
  | "lifecycle_status" // Session lifecycle events (started, completed, error)
  | "metadata"; // Metadata updates (title change, etc.)

/**
 * Normalized event envelope for timeline storage and rendering.
 * All provider events are transformed into this shape for consistent UI treatment.
 */
export interface NormalizedEvent {
  /**
   * Provider identifier
   */
  provider: ProviderId;

  /**
   * Session identifier this event belongs to
   */
  sessionId: string;

  /**
   * Unique event identifier (provider may generate or we generate)
   */
  eventId: string;

  /**
   * Event category for timeline grouping/rendering
   */
  category: EventCategory;

  /**
   * ISO 8601 timestamp of event
   */
  timestamp: string;

  /**
   * Optional parent event ID for threading/nesting
   */
  parentEventId?: string;

  /**
   * Primary text content (message body, reasoning text, etc.)
   */
  text?: string;

  /**
   * Structured payload for specific event types
   * - tool_command: { command, args, status, exitCode, output }
   * - file_diff: { path, diff, language }
   * - approval_request: { requestId, approvalType, details }
   */
  payload?: Record<string, unknown>;

  /**
   * Raw provider event payload for debugging/replay
   * CRITICAL: Always preserve the original provider data
   */
  rawEvent: unknown;
}

/**
 * Provider health status for monitoring and diagnostics
 */
export interface ProviderHealthStatus {
  /**
   * Overall health state
   */
  status: "healthy" | "degraded" | "unhealthy" | "unknown";

  /**
   * Human-readable status message
   */
  message?: string;

  /**
   * Detailed diagnostic information
   */
  details?: Record<string, unknown>;

  /**
   * ISO 8601 timestamp of last health check
   */
  lastCheck: string;
}

/**
 * Provider capability flags for feature gating.
 * UI uses these to hide/disable unsupported features per provider.
 */
export interface ProviderCapabilities {
  /**
   * Supports listing sessions
   */
  listSessions: boolean;

  /**
   * Supports opening/resuming sessions
   */
  openSession: boolean;

  /**
   * Supports sending prompts
   */
  sendPrompt: boolean;

  /**
   * Supports realtime event streaming
   */
  streaming: boolean;

  /**
   * Supports file attachments in prompts
   */
  attachments: boolean;

  /**
   * Supports approval requests (file changes, command execution)
   */
  approvals: boolean;

  /**
   * Supports multi-turn conversations
   */
  multiTurn: boolean;

  /**
   * Supports session filtering (by project, repo, status)
   */
  filtering: boolean;

  /**
   * Supports pagination
   */
  pagination: boolean;

  /**
   * Custom capability flags (provider-specific)
   */
  custom?: Record<string, boolean>;
}

/**
 * Session list filters
 */
export interface SessionFilters {
  /**
   * Filter by project name
   */
  project?: string;

  /**
   * Filter by repository
   */
  repo?: string;

  /**
   * Filter by status
   */
  status?: SessionStatus;

  /**
   * Filter by date range (ISO 8601)
   */
  createdAfter?: string;
  createdBefore?: string;

  /**
   * Search query (title, preview, etc.)
   */
  query?: string;

  /**
   * Custom provider-specific filters
   */
  custom?: Record<string, unknown>;
}

/**
 * Paginated session list result
 */
export interface SessionListResult {
  /**
   * Normalized sessions
   */
  sessions: NormalizedSession[];

  /**
   * Opaque cursor for next page (provider-specific)
   */
  nextCursor?: string;

  /**
   * Total count (if available)
   */
  totalCount?: number;

  /**
   * Whether there are more results
   */
  hasMore: boolean;
}

/**
 * Prompt input with optional attachments
 */
export interface PromptInput {
  /**
   * Prompt text
   */
  text: string;

  /**
   * Optional file attachments
   */
  attachments?: PromptAttachment[];

  /**
   * Custom metadata (context, tags, etc.)
   */
  metadata?: Record<string, unknown>;
}

/**
 * File attachment for prompts
 */
export interface PromptAttachment {
  /**
   * File path or URL
   */
  path: string;

  /**
   * MIME type
   */
  mimeType?: string;

  /**
   * Display name
   */
  name?: string;

  /**
   * File content (if inline)
   */
  content?: string | ArrayBuffer;
}

/**
 * Provider-specific prompt options
 */
export interface PromptOptions {
  /**
   * Execution mode (e.g., "auto", "manual", "review")
   */
  mode?: string;

  /**
   * Model selection
   */
  model?: string;

  /**
   * Temperature/creativity setting
   */
  temperature?: number;

  /**
   * Maximum tokens
   */
  maxTokens?: number;

  /**
   * Custom provider-specific options
   */
  custom?: Record<string, unknown>;
}

/**
 * Event subscription handle
 */
export interface EventSubscription {
  /**
   * Subscription ID
   */
  id: string;

  /**
   * Session ID this subscription is for
   */
  sessionId: string;

  /**
   * Provider ID
   */
  provider: ProviderId;

  /**
   * Unsubscribe callback (alternative to adapter.unsubscribe)
   */
  unsubscribe: () => Promise<void>;
}
