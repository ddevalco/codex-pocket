/**
 * Token Usage Enricher
 *
 * Helper utilities for extracting and enriching token usage from provider events.
 * Adapters and normalizers can use these helpers to add cost telemetry to events.
 */

import type { NormalizedEvent, TokenUsage } from "./provider-types.js";
import { enrichTokenUsage } from "./cost-calculator.js";

/**
 * Extract token usage from a raw provider event payload.
 * 
 * This function attempts to find token usage data in common locations:
 * - OpenAI-style: event.usage { prompt_tokens, completion_tokens, total_tokens }
 * - Claude-style: event.usage { input_tokens, output_tokens }
 * - Generic: event.token_usage, event.tokenUsage, event.tokens
 * 
 * @param rawEvent - Raw provider event payload
 * @param provider - Provider identifier
 * @param model - Model identifier (optional)
 * @returns TokenUsage if found, null otherwise
 */
export function extractTokenUsage(
  rawEvent: unknown,
  provider: string,
  model?: string,
): TokenUsage | null {
  if (!rawEvent || typeof rawEvent !== "object") {
    return null;
  }

  const event = rawEvent as Record<string, any>;

  // OpenAI-style usage object
  if (event.usage && typeof event.usage === "object") {
    const usage = event.usage as Record<string, any>;
    
    // Standard OpenAI format
    if (
      typeof usage.prompt_tokens === "number" &&
      typeof usage.completion_tokens === "number"
    ) {
      return enrichTokenUsage(
        provider,
        model || usage.model || event.model,
        usage.prompt_tokens,
        usage.completion_tokens,
      );
    }

    // Claude format (input_tokens, output_tokens)
    if (
      typeof usage.input_tokens === "number" &&
      typeof usage.output_tokens === "number"
    ) {
      return enrichTokenUsage(
        provider,
        model || usage.model || event.model,
        usage.input_tokens,
        usage.output_tokens,
      );
    }
  }

  // Check for camelCase tokenUsage
  if (event.tokenUsage && typeof event.tokenUsage === "object") {
    const usage = event.tokenUsage as Record<string, any>;
    if (
      typeof usage.promptTokens === "number" &&
      typeof usage.completionTokens === "number"
    ) {
      return enrichTokenUsage(
        provider,
        model || usage.model || event.model,
        usage.promptTokens,
        usage.completionTokens,
      );
    }
  }

  // Check for snake_case token_usage
  if (event.token_usage && typeof event.token_usage === "object") {
    const usage = event.token_usage as Record<string, any>;
    if (
      typeof usage.prompt_tokens === "number" &&
      typeof usage.completion_tokens === "number"
    ) {
      return enrichTokenUsage(
        provider,
        model || usage.model || event.model,
        usage.prompt_tokens,
        usage.completion_tokens,
      );
    }
  }

  // Check for direct tokens object at top level
  if (
    typeof event.prompt_tokens === "number" &&
    typeof event.completion_tokens === "number"
  ) {
    return enrichTokenUsage(
      provider,
      model || event.model,
      event.prompt_tokens,
      event.completion_tokens,
    );
  }

  return null;
}

/**
 * Enrich a normalized event with token usage from raw event.
 * 
 * This function modifies the event in place to add tokenUsage field if available.
 * 
 * @param event - NormalizedEvent to enrich
 * @returns The same event (for chaining)
 */
export function enrichEventWithTokenUsage(event: NormalizedEvent): NormalizedEvent {
  // Skip if tokenUsage already present
  if (event.tokenUsage) {
    return event;
  }

  // Extract model from payload if available
  const model = event.payload?.model as string | undefined;

  // Try to extract token usage from raw event
  const tokenUsage = extractTokenUsage(event.rawEvent, event.provider, model);
  
  if (tokenUsage) {
    event.tokenUsage = tokenUsage;
  }

  return event;
}

/**
 * Batch enrich multiple events with token usage.
 * 
 * @param events - Array of NormalizedEvents to enrich
 * @returns The same events array (for chaining)
 */
export function enrichEventsWithTokenUsage(
  events: NormalizedEvent[],
): NormalizedEvent[] {
  for (const event of events) {
    enrichEventWithTokenUsage(event);
  }
  return events;
}
