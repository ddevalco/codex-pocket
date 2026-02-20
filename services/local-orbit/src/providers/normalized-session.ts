/**
 * Normalized Session Model Utilities
 *
 * Helpers for working with the unified session model across providers.
 * Provides validation, transformation, and comparison utilities.
 */

import type { NormalizedSession, SessionStatus, ProviderId } from "./provider-types.js";

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
 * Create a minimal valid normalized session.
 * Useful for testing and initial session creation.
 */
export function createNormalizedSession(partial: Partial<NormalizedSession>): NormalizedSession {
  const now = new Date().toISOString();
  return {
    provider: partial.provider ?? "codex",
    sessionId: partial.sessionId ?? "",
    title: partial.title ?? "Untitled Session",
    status: partial.status ?? "idle",
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    project: partial.project,
    repo: partial.repo,
    preview: partial.preview,
    capabilities: partial.capabilities ?? {
      listSessions: false,
      openSession: false,
      sendPrompt: false,
      streaming: false,
      attachments: false,
      approvals: false,
      multiTurn: false,
      filtering: false,
      pagination: false,
    },
    metadata: partial.metadata,
    rawSession: partial.rawSession,
  };
}

/**
 * Validate that a session object conforms to the NormalizedSession shape.
 * Returns an array of validation errors (empty if valid).
 */
export function validateNormalizedSession(session: unknown): string[] {
  const errors: string[] = [];

  if (!session || typeof session !== "object") {
    errors.push("Session must be an object");
    return errors;
  }

  const s = session as Partial<NormalizedSession>;

  if (!s.provider || typeof s.provider !== "string") {
    errors.push("provider is required and must be a string");
  }

  if (!s.sessionId || typeof s.sessionId !== "string") {
    errors.push("sessionId is required and must be a string");
  }

  if (!s.title || typeof s.title !== "string") {
    errors.push("title is required and must be a string");
  }

  const validStatuses: SessionStatus[] = ["active", "idle", "completed", "error", "interrupted"];
  if (!s.status || !validStatuses.includes(s.status)) {
    errors.push(`status must be one of: ${validStatuses.join(", ")}`);
  }

  if (!s.createdAt || typeof s.createdAt !== "string") {
    errors.push("createdAt is required and must be an ISO 8601 string");
  } else if (isNaN(Date.parse(s.createdAt))) {
    errors.push("createdAt must be a valid ISO 8601 timestamp");
  }

  if (!s.updatedAt || typeof s.updatedAt !== "string") {
    errors.push("updatedAt is required and must be an ISO 8601 string");
  } else if (isNaN(Date.parse(s.updatedAt))) {
    errors.push("updatedAt must be a valid ISO 8601 timestamp");
  }

  // Optional fields type checks
  if (s.project !== undefined && typeof s.project !== "string") {
    errors.push("project must be a string");
  }

  if (s.repo !== undefined && typeof s.repo !== "string") {
    errors.push("repo must be a string");
  }

  if (s.preview !== undefined && typeof s.preview !== "string") {
    errors.push("preview must be a string");
  }

  if (!s.capabilities || typeof s.capabilities !== "object") {
    errors.push("capabilities is required and must be an object");
  }

  // Harden metadata validation - must be plain object, not array/null/primitive
  if (s.metadata !== undefined) {
    if (!isPlainRecord(s.metadata)) {
      errors.push("metadata must be a plain object, not array/null/primitive");
    }
  }

  return errors;
}

/**
 * Check if a session matches given filters.
 * Used for client-side filtering when provider doesn't support native filtering.
 */
export function sessionMatchesFilters(
  session: NormalizedSession,
  filters?: {
    project?: string;
    repo?: string;
    status?: SessionStatus;
    query?: string;
    createdAfter?: string;
    createdBefore?: string;
  },
): boolean {
  if (!filters) return true;

  if (filters.project && session.project !== filters.project) {
    return false;
  }

  if (filters.repo && session.repo !== filters.repo) {
    return false;
  }

  if (filters.status && session.status !== filters.status) {
    return false;
  }

  if (filters.query) {
    const query = filters.query.toLowerCase();
    const searchable = [
      session.title,
      session.project,
      session.repo,
      session.preview,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!searchable.includes(query)) {
      return false;
    }
  }

  if (filters.createdAfter) {
    const after = new Date(filters.createdAfter).getTime();
    const created = new Date(session.createdAt).getTime();
    if (created < after) {
      return false;
    }
  }

  if (filters.createdBefore) {
    const before = new Date(filters.createdBefore).getTime();
    const created = new Date(session.createdAt).getTime();
    if (created > before) {
      return false;
    }
  }

  return true;
}

/**
 * Compare two sessions for sorting.
 * Default sort: most recently updated first.
 */
export function compareSessionsByUpdated(a: NormalizedSession, b: NormalizedSession): number {
  const aTime = new Date(a.updatedAt).getTime();
  const bTime = new Date(b.updatedAt).getTime();
  return bTime - aTime; // Descending (newest first)
}

/**
 * Compare two sessions by creation date.
 */
export function compareSessionsByCreated(a: NormalizedSession, b: NormalizedSession): number {
  const aTime = new Date(a.createdAt).getTime();
  const bTime = new Date(b.createdAt).getTime();
  return bTime - aTime; // Descending (newest first)
}

/**
 * Group sessions by project.
 * Returns a map of project name to sessions.
 */
export function groupSessionsByProject(
  sessions: NormalizedSession[],
): Map<string, NormalizedSession[]> {
  const groups = new Map<string, NormalizedSession[]>();

  for (const session of sessions) {
    const key = session.project ?? "(no project)";
    const group = groups.get(key) ?? [];
    group.push(session);
    groups.set(key, group);
  }

  return groups;
}

/**
 * Group sessions by repository.
 * Returns a map of repo name to sessions.
 */
export function groupSessionsByRepo(
  sessions: NormalizedSession[],
): Map<string, NormalizedSession[]> {
  const groups = new Map<string, NormalizedSession[]>();

  for (const session of sessions) {
    const key = session.repo ?? "(no repo)";
    const group = groups.get(key) ?? [];
    group.push(session);
    groups.set(key, group);
  }

  return groups;
}

/**
 * Group sessions by provider.
 * Returns a map of provider ID to sessions.
 */
export function groupSessionsByProvider(
  sessions: NormalizedSession[],
): Map<ProviderId, NormalizedSession[]> {
  const groups = new Map<ProviderId, NormalizedSession[]>();

  for (const session of sessions) {
    const group = groups.get(session.provider) ?? [];
    group.push(session);
    groups.set(session.provider, group);
  }

  return groups;
}

/**
 * Extract a preview text snippet from session data.
 * Useful when provider doesn't provide a preview field.
 */
export function generateSessionPreview(text: string, maxLength: number = 100): string {
  if (!text) return "";

  // Remove markdown formatting for cleaner preview
  const cleaned = text
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/`[^`]+`/g, "") // Remove inline code
    .replace(/[#*_~]/g, "") // Remove markdown symbols
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return cleaned.slice(0, maxLength - 3) + "...";
}

/**
 * Merge a partial update into an existing session.
 * Useful for applying incremental updates from events.
 */
export function mergeSessionUpdate(
  existing: NormalizedSession,
  update: Partial<NormalizedSession>,
): NormalizedSession {
  return {
    ...existing,
    ...update,
    // Always update the updatedAt timestamp
    updatedAt: new Date().toISOString(),
    // Merge metadata if both exist
    metadata:
      existing.metadata || update.metadata
        ? { ...existing.metadata, ...update.metadata }
        : undefined,
  };
}
