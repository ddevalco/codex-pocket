/**
 * ACP Event Normalizer
 *
 * Handles streaming response aggregation and normalization for ACP notifications.
 *
 * Key responsibilities:
 * - Aggregate streaming chunks by turnId
 * - Flush accumulated content on done marker or type switch
 * - Map ACP update types to NormalizedEvent categories
 * - Timeout handling for incomplete streams (30 seconds)
 * - Preserve raw notification in rawEvent field
 *
 * Context management:
 * - Keyed by "sessionId:turnId"
 * - Supports concurrent turns in different sessions
 * - Automatic cleanup on done marker or timeout
 */

import type {
  NormalizedEvent,
  EventCategory,
  AcpPermissionOption,
  AcpApprovalPayload,
} from "../provider-types.js";

/**
 * Raw params from an ACP `session/request_permission` JSON-RPC request
 */
export interface AcpPermissionRequestParams {
  sessionId: string;
  toolCall?: {
    toolCallId?: string;
    title?: string;
    kind?: string;
    status?: string;
    [key: string]: unknown;
  };
  options?: Array<{
    optionId: string;
    name: string;
    kind: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * ACP update notification structure
 */
export interface AcpUpdateNotification {
  jsonrpc: "2.0";
  method: "update";
  params: {
    sessionId: string;
    turnId: string;
    update: {
      type: "content" | "reasoning" | "tool" | "status" | "error";
      delta?: string;
      done?: boolean;
      status?: string;
      error?: {
        code: string;
        message: string;
      };
      // Tool-specific fields
      command?: string;
      args?: unknown;
      output?: string;
      exitCode?: number;
      // File-specific fields
      path?: string;
      diff?: string;
      language?: string;
      // Generic payload for extensibility
      [key: string]: unknown;
    };
  };
}

/**
 * Chunk buffer for aggregating deltas
 */
interface ChunkBuffer {
  delta: string;
  timestamp: string;
}

/**
 * Streaming context for a single turn
 */
interface StreamingContext {
  sessionId: string;
  turnId: string;
  category: EventCategory;
  chunks: ChunkBuffer[];
  lastTimestamp: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  payload?: Record<string, unknown>;
}

/**
 * ACPStreamingNormalizer configuration
 */
export interface ACPStreamingNormalizerConfig {
  /**
   * Timeout for incomplete streams in milliseconds (default: 30000)
   */
  streamTimeout?: number;
}

/**
 * ACPStreamingNormalizer class for handling streaming ACP notifications.
 *
 * Usage:
 * ```typescript
 * const normalizer = new ACPStreamingNormalizer();
 * normalizer.on('event', (event) => {
 *   console.log('Normalized event:', event);
 * });
 * normalizer.handleUpdate(notification);
 * ```
 */
export class ACPStreamingNormalizer {
  private contexts = new Map<string, StreamingContext>();
  private eventHandlers: Array<(event: NormalizedEvent) => void> = [];
  private streamTimeout: number;

  constructor(config: ACPStreamingNormalizerConfig = {}) {
    this.streamTimeout = config.streamTimeout ?? 30000; // 30 seconds default
  }

  /**
   * Register event handler
   */
  on(event: 'event', handler: (event: NormalizedEvent) => void): void {
    if (event === 'event') {
      this.eventHandlers.push(handler);
    }
  }

  /**
   * Remove event handler
   */
  off(event: 'event', handler: (event: NormalizedEvent) => void): void {
    if (event === 'event') {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx !== -1) {
        this.eventHandlers.splice(idx, 1);
      }
    }
  }

  /**
   * Normalize an ACP `session/request_permission` JSON-RPC request into a
   * NormalizedEvent with category `approval_request`.
   *
   * The caller supplies the raw RPC `id` and `params` directly.
   * `rpcId` is preserved in the payload so the relay can route the response
   * back to ACP.
   *
   * @param rpcId  - The JSON-RPC request id (number or string)
   * @param params - The deserialized `params` object from the RPC request
   * @returns A fully-formed NormalizedEvent
   */
  normalizePermissionRequest(
    rpcId: string | number,
    params: AcpPermissionRequestParams,
  ): NormalizedEvent {
    const sessionId = params.sessionId ?? "";
    const toolCallId = params.toolCall?.toolCallId ?? "";
    const toolTitle = params.toolCall?.title;
    const toolKind = params.toolCall?.kind;

    // Validate and cast each permission option
    const rawOptions = Array.isArray(params.options) ? params.options : [];
    const options: AcpPermissionOption[] = rawOptions.map((opt) => ({
      optionId: opt.optionId ?? "",
      name: opt.name ?? "",
      kind: (
        opt.kind === "allow_once" ||
        opt.kind === "allow_always" ||
        opt.kind === "reject_once" ||
        opt.kind === "reject_always"
          ? opt.kind
          : "reject_once"
      ) as AcpPermissionOption["kind"],
    }));

    const payload: AcpApprovalPayload = {
      rpcId,
      sessionId,
      toolCallId,
      ...(toolTitle !== undefined ? { toolTitle } : {}),
      ...(toolKind !== undefined ? { toolKind } : {}),
      options,
    };

    const description = toolTitle
      ? `Approval required: ${toolTitle}`
      : "Approval required";

    const event: NormalizedEvent = {
      provider: "copilot-acp",
      sessionId,
      eventId: `approval-${rpcId}-${Date.now()}`,
      category: "approval_request",
      timestamp: new Date().toISOString(),
      text: description,
      payload: payload as unknown as Record<string, unknown>,
      rawEvent: params,
    };

    this.emitEvent(event);
    return event;
  }

  /**
   * Handle an ACP update notification.
   * Returns a normalized event if the stream is complete, otherwise null.
   *
   * @param notification - The ACP update notification
   * @returns NormalizedEvent if flush occurred, otherwise null
   */
  handleUpdate(notification: AcpUpdateNotification): NormalizedEvent | null {
    const { sessionId, turnId, update } = notification.params;
    const key = `${sessionId}:${turnId}`;

    // Get or create context
    let ctx = this.contexts.get(key);
    if (!ctx) {
      ctx = this.createContext(sessionId, turnId, update.type);
      this.contexts.set(key, ctx);
    }

    // Check for type switch - flush old context and create new one
    const newCategory = this.mapUpdateTypeToCategory(update.type);
    if (ctx.category !== newCategory && ctx.chunks.length > 0) {
      const flushedEvent = this.flushContext(ctx, notification);
      // Create new context for the new type
      ctx = this.createContext(sessionId, turnId, update.type);
      this.contexts.set(key, ctx);
      // Reset timeout for new context (fix context/memory leak)
      this.resetTimeout(ctx, key, notification);
      // Continue processing with new context
      this.appendToContext(ctx, update, notification);
      return flushedEvent;
    }

    // Append to context
    this.appendToContext(ctx, update, notification);

    // Check for done marker or error
    if (update.done === true || update.type === 'error') {
      const event = this.flushContext(ctx, notification);
      this.cleanupContext(key);
      return event;
    }

    // Reset timeout for this context
    this.resetTimeout(ctx, key, notification);

    return null;
  }

  /**
   * Create a new streaming context
   */
  private createContext(
    sessionId: string,
    turnId: string,
    updateType: string,
  ): StreamingContext {
    return {
      sessionId,
      turnId,
      category: this.mapUpdateTypeToCategory(updateType),
      chunks: [],
      lastTimestamp: new Date().toISOString(),
      payload: {},
    };
  }

  /**
   * Append update to context
   */
  private appendToContext(
    ctx: StreamingContext,
    update: AcpUpdateNotification['params']['update'],
    _notification: AcpUpdateNotification,
  ): void {
    const timestamp = new Date().toISOString();

    // Accumulate delta text
    if (update.delta) {
      ctx.chunks.push({
        delta: update.delta,
        timestamp,
      });
    }

    // Update payload with non-delta fields
    if (update.command !== undefined) ctx.payload!.command = update.command;
    if (update.args !== undefined) ctx.payload!.args = update.args;
    if (update.output !== undefined) ctx.payload!.output = update.output;
    if (update.exitCode !== undefined) ctx.payload!.exitCode = update.exitCode;
    if (update.path !== undefined) ctx.payload!.path = update.path;
    if (update.diff !== undefined) ctx.payload!.diff = update.diff;
    if (update.language !== undefined) ctx.payload!.language = update.language;
    if (update.status !== undefined) ctx.payload!.status = update.status;
    if (update.error !== undefined) ctx.payload!.error = update.error;

    ctx.lastTimestamp = timestamp;
  }

  /**
   * Flush context and emit normalized event
   */
  private flushContext(
    ctx: StreamingContext,
    lastNotification: AcpUpdateNotification,
  ): NormalizedEvent {
    // Aggregate all chunks into text
    const text = ctx.chunks.map(c => c.delta).join('');

    // Build normalized event
    const event: NormalizedEvent = {
      provider: 'copilot-acp',
      sessionId: ctx.sessionId,
      eventId: `${ctx.turnId}-${Date.now()}`,
      category: ctx.category,
      timestamp: ctx.lastTimestamp,
      text: text || undefined,
      payload: Object.keys(ctx.payload || {}).length > 0 ? ctx.payload : undefined,
      rawEvent: lastNotification,
    };

    // Emit to handlers
    this.emitEvent(event);

    return event;
  }

  /**
   * Cleanup context and clear timeout
   */
  private cleanupContext(key: string): void {
    const ctx = this.contexts.get(key);
    if (ctx?.timeoutHandle) {
      clearTimeout(ctx.timeoutHandle);
    }
    this.contexts.delete(key);
  }

  /**
   * Reset timeout for context
   */
  private resetTimeout(
    ctx: StreamingContext,
    key: string,
    lastNotification: AcpUpdateNotification,
  ): void {
    // Clear existing timeout
    if (ctx.timeoutHandle) {
      clearTimeout(ctx.timeoutHandle);
    }

    // Set new timeout
    ctx.timeoutHandle = setTimeout(() => {
      console.warn(
        `[ACPStreamingNormalizer] Stream timeout for ${key} after ${this.streamTimeout}ms`,
      );
      // Flush incomplete stream and cleanup
      const context = this.contexts.get(key);
      if (context) {
        this.flushContext(context, lastNotification);
        this.cleanupContext(key);
      }
    }, this.streamTimeout);
  }

  /**
   * Map ACP update type to event category
   */
  private mapUpdateTypeToCategory(updateType: string): EventCategory {
    switch (updateType) {
      case 'content':
        return 'agent_message';
      case 'reasoning':
        return 'reasoning';
      case 'tool':
        return 'tool_command';
      case 'status':
        return 'lifecycle_status';
      case 'error':
        return 'lifecycle_status';
      default:
        return 'metadata';
    }
  }

  /**
   * Emit event to all registered handlers
   */
  private emitEvent(event: NormalizedEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('[ACPStreamingNormalizer] Event handler error:', err);
      }
    }
  }

  /**
   * Get active context count (for testing/debugging)
   */
  getActiveContextCount(): number {
    return this.contexts.size;
  }

  /**
   * Clear all contexts (for cleanup/testing)
   */
  clearAllContexts(): void {
    for (const key of this.contexts.keys()) {
      this.cleanupContext(key);
    }
  }
}
