/**
 * Token Usage Enricher
 *
 * Helper utilities for extracting and enriching token usage from provider events.
 * Adapters and normalizers can use these helpers to add cost telemetry to events.
 */

import type { NormalizedEvent, TokenUsage } from "./provider-types.js";
import { enrichTokenUsage } from "./cost-calculator.js";

/**
 * Safely extracts a number from usage data, validating it's a safe numeric value.
 * @param value - Value to extract
 * @returns Validated number or null if invalid
 */
function safeNumberFromUsage(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  if (value > 1e9) return null; // Sanity cap: 1 billion tokens max
  return value;
}

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
    const promptTokens = safeNumberFromUsage(usage.prompt_tokens);
    const completionTokens = safeNumberFromUsage(usage.completion_tokens);
    
    if (promptTokens !== null && completionTokens !== null) {
      return enrichTokenUsage(
        provider,
        model || usage.model || event.model,
        promptTokens,
        completionTokens,
      );
    }

    // Claude format (input_tokens, output_tokens)
    const inputTokens = safeNumberFromUsage(usage.input_tokens);
    const outputTokens = safeNumberFromUsage(usage.output_tokens);
    
    if (inputTokens !== null && outputTokens !== null) {
      return enrichTokenUsage(
        provider,
        model || usage.model || event.model,
        inputTokens,
        outputTokens,
      );
    }
  }

  // Check for camelCase tokenUsage
  if (event.tokenUsage && typeof event.tokenUsage === "object") {
    const usage = event.tokenUsage as Record<string, any>;
    const promptTokens = safeNumberFromUsage(usage.promptTokens);
    const completionTokens = safeNumberFromUsage(usage.completionTokens);
    
    if (promptTokens !== null && completionTokens !== null) {
      return enrichTokenUsage(
        provider,
        model || usage.model || event.model,
        promptTokens,
        completionTokens,
      );
    }
  }

  // Check for snake_case token_usage
  if (event.token_usage && typeof event.token_usage === "object") {
    const usage = event.token_usage as Record<string, any>;
    const promptTokens = safeNumberFromUsage(usage.prompt_tokens);
    const completionTokens = safeNumberFromUsage(usage.completion_tokens);
    
    if (promptTokens !== null && completionTokens !== null) {
      return enrichTokenUsage(
        provider,
        model || usage.model || event.model,
        promptTokens,
        completionTokens,
      );
    }
  }

  // Check for direct tokens object at top level
  const promptTokens = safeNumberFromUsage(event.prompt_tokens);
  const completionTokens = safeNumberFromUsage(event.completion_tokens);
  
  if (promptTokens !== null && completionTokens !== null) {
    return enrichTokenUsage(
      provider,
      model || event.model,
      promptTokens,
      completionTokens,
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
