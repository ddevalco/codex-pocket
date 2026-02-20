/**
 * Normalized Event Model Utilities
 *
 * Helpers for working with the unified event model across providers.
 * Provides validation, transformation, and filtering utilities.
 */

import type { NormalizedEvent, EventCategory } from "./provider-types.js";

/**
 * Checks if value is a plain object (not null, not array, not function)
 * @param value Value to check
 * @returns true if plain object Record
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Create a minimal valid normalized event.
 * Useful for testing and event construction.
 */
export function createNormalizedEvent(partial: Partial<NormalizedEvent>): NormalizedEvent {
  const now = new Date().toISOString();
  return {
    provider: partial.provider ?? "codex",
    sessionId: partial.sessionId ?? "",
    eventId: partial.eventId ?? generateEventId(),
    category: partial.category ?? "metadata",
    timestamp: partial.timestamp ?? now,
    parentEventId: partial.parentEventId,
    text: partial.text,
    payload: partial.payload,
    rawEvent: partial.rawEvent ?? {},
  };
}

/**
 * Generate a unique event ID.
 * Uses timestamp + random suffix for uniqueness.
 */
export function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `evt_${timestamp}_${random}`;
}

/**
 * Validate that an event object conforms to the NormalizedEvent shape.
 * Returns an array of validation errors (empty if valid).
 */
export function validateNormalizedEvent(event: unknown): string[] {
  const errors: string[] = [];

  if (!event || typeof event !== "object") {
    errors.push("Event must be an object");
    return errors;
  }

  const e = event as Partial<NormalizedEvent>;

  if (!e.provider || typeof e.provider !== "string") {
    errors.push("provider is required and must be a string");
  }

  if (!e.sessionId || typeof e.sessionId !== "string") {
    errors.push("sessionId is required and must be a string");
  }

  if (!e.eventId || typeof e.eventId !== "string") {
    errors.push("eventId is required and must be a string");
  }

  const validCategories: EventCategory[] = [
    "user_message",
    "agent_message",
    "reasoning",
    "plan",
    "tool_command",
    "file_diff",
    "approval_request",
    "user_input_request",
    "lifecycle_status",
    "metadata",
  ];
  if (!e.category || !validCategories.includes(e.category)) {
    errors.push(`category must be one of: ${validCategories.join(", ")}`);
  }

  if (!e.timestamp || typeof e.timestamp !== "string") {
    errors.push("timestamp is required and must be an ISO 8601 string");
  } else if (isNaN(Date.parse(e.timestamp))) {
    errors.push("timestamp must be a valid ISO 8601 timestamp");
  }

  // Optional fields type checks
  if (e.parentEventId !== undefined && typeof e.parentEventId !== "string") {
    errors.push("parentEventId must be a string");
  }

  if (e.text !== undefined && typeof e.text !== "string") {
    errors.push("text must be a string");
  }

  // Harden payload validation - must be plain object, not array/null/primitive
  if (e.payload !== undefined) {
    if (!isPlainRecord(e.payload)) {
      errors.push("payload must be a plain object, not array/null/primitive");
    }
  }

  if (e.rawEvent === undefined) {
    errors.push("rawEvent is required (must preserve original provider data)");
  }

  return errors;
}

/**
 * Check if an event matches given category filters.
 * Used for timeline filtering.
 */
export function eventMatchesCategory(
  event: NormalizedEvent,
  categories: EventCategory[],
): boolean {
  return categories.includes(event.category);
}

/**
 * Filter events by category.
 */
export function filterEventsByCategory(
  events: NormalizedEvent[],
  categories: EventCategory[],
): NormalizedEvent[] {
  return events.filter((event) => eventMatchesCategory(event, categories));
}

/**
 * Filter events by time range.
 */
export function filterEventsByTimeRange(
  events: NormalizedEvent[],
  startTime?: string,
  endTime?: string,
): NormalizedEvent[] {
  return events.filter((event) => {
    const eventTime = new Date(event.timestamp).getTime();

    if (startTime) {
      const start = new Date(startTime).getTime();
      if (eventTime < start) return false;
    }

    if (endTime) {
      const end = new Date(endTime).getTime();
      if (eventTime > end) return false;
    }

    return true;
  });
}

/**
 * Compare events by timestamp for sorting.
 * Default: chronological order (oldest first).
 */
export function compareEventsByTimestamp(a: NormalizedEvent, b: NormalizedEvent): number {
  const aTime = new Date(a.timestamp).getTime();
  const bTime = new Date(b.timestamp).getTime();
  return aTime - bTime; // Ascending (oldest first)
}

/**
 * Build an event tree from flat event list.
 * Groups events by parentEventId for hierarchical rendering.
 */
export function buildEventTree(
  events: NormalizedEvent[],
): Map<string | undefined, NormalizedEvent[]> {
  const tree = new Map<string | undefined, NormalizedEvent[]>();

  for (const event of events) {
    const parent = event.parentEventId;
    const children = tree.get(parent) ?? [];
    children.push(event);
    tree.set(parent, children);
  }

  return tree;
}

/**
 * Get all child events recursively.
 */
export function getChildEvents(
  eventId: string,
  allEvents: NormalizedEvent[],
): NormalizedEvent[] {
  const children: NormalizedEvent[] = [];
  const directChildren = allEvents.filter((e) => e.parentEventId === eventId);

  for (const child of directChildren) {
    children.push(child);
    children.push(...getChildEvents(child.eventId, allEvents));
  }

  return children;
}

/**
 * Extract text content from an event, considering both text field and payload.
 * Useful for search and preview generation.
 */
export function extractEventText(event: NormalizedEvent): string {
  const parts: string[] = [];

  if (event.text) {
    parts.push(event.text);
  }

  if (event.payload) {
    // Extract text from common payload fields
    const p = event.payload as Record<string, unknown>;
    if (typeof p.message === "string") parts.push(p.message);
    if (typeof p.output === "string") parts.push(p.output);
    if (typeof p.diff === "string") parts.push(p.diff);
    if (typeof p.command === "string") parts.push(p.command);
  }

  return parts.join("\n");
}

/**
 * Group events by category.
 */
export function groupEventsByCategory(
  events: NormalizedEvent[],
): Map<EventCategory, NormalizedEvent[]> {
  const groups = new Map<EventCategory, NormalizedEvent[]>();

  for (const event of events) {
    const group = groups.get(event.category) ?? [];
    group.push(event);
    groups.set(event.category, group);
  }

  return groups;
}

/**
 * Check if an event requires user action (approval or input).
 */
export function isActionableEvent(event: NormalizedEvent): boolean {
  return event.category === "approval_request" || event.category === "user_input_request";
}

/**
 * Filter events to only actionable ones.
 */
export function filterActionableEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  return events.filter(isActionableEvent);
}

/**
 * Create a lightweight event summary for logging/debugging.
 * Excludes raw payload to keep output minimal.
 */
export function summarizeEvent(event: NormalizedEvent): Record<string, unknown> {
  return {
    eventId: event.eventId,
    category: event.category,
    timestamp: event.timestamp,
    sessionId: event.sessionId,
    provider: event.provider,
    hasText: !!event.text,
    hasPayload: !!event.payload,
    parentEventId: event.parentEventId,
  };
}

/**
 * Batch events by session for efficient processing.
 */
export function batchEventsBySession(
  events: NormalizedEvent[],
): Map<string, NormalizedEvent[]> {
  const batches = new Map<string, NormalizedEvent[]>();

  for (const event of events) {
    const batch = batches.get(event.sessionId) ?? [];
    batch.push(event);
    batches.set(event.sessionId, batch);
  }

  return batches;
}

/**
 * Calculate event statistics for a session.
 */
export interface EventStats {
  total: number;
  byCategory: Record<EventCategory, number>;
  userMessages: number;
  agentMessages: number;
  toolExecutions: number;
  fileDiffs: number;
  approvalRequests: number;
  timespan: { start: string; end: string } | null;
}

export function calculateEventStats(events: NormalizedEvent[]): EventStats {
  const stats: EventStats = {
    total: events.length,
    byCategory: {} as Record<EventCategory, number>,
    userMessages: 0,
    agentMessages: 0,
    toolExecutions: 0,
    fileDiffs: 0,
    approvalRequests: 0,
    timespan: null,
  };

  if (events.length === 0) return stats;

  // Sort by timestamp to get timespan
  const sorted = [...events].sort(compareEventsByTimestamp);
  stats.timespan = {
    start: sorted[0].timestamp,
    end: sorted[sorted.length - 1].timestamp,
  };

  // Count by category
  for (const event of events) {
    stats.byCategory[event.category] = (stats.byCategory[event.category] ?? 0) + 1;

    switch (event.category) {
      case "user_message":
        stats.userMessages++;
        break;
      case "agent_message":
        stats.agentMessages++;
        break;
      case "tool_command":
        stats.toolExecutions++;
        break;
      case "file_diff":
        stats.fileDiffs++;
        break;
      case "approval_request":
      case "user_input_request":
        stats.approvalRequests++;
        break;
    }
  }

  return stats;
}
