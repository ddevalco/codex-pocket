/**
 * Token Cost Calculator
 *
 * Provider-agnostic cost calculation for token usage.
 * Uses static pricing tables for common models.
 *
 * Pricing is per 1M tokens (OpenAI standard).
 * Update pricing tables as needed when provider costs change.
 */

import type { TokenUsage } from "./provider-types.js";

/**
 * Pricing table entry for a specific provider and model
 */
export interface PricingTable {
  /**
   * Provider identifier (e.g., "codex", "copilot-acp", "claude")
   */
  provider: string;

  /**
   * Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet")
   */
  model: string;

  /**
   * Cost per 1M prompt tokens in USD
   */
  promptTokenCost: number;

  /**
   * Cost per 1M completion tokens in USD
   */
  completionTokenCost: number;
}

/**
 * Static pricing tables for common models.
 *
 * Source: OpenAI, Anthropic, etc. pricing pages as of Feb 2026.
 * Update as needed when pricing changes.
 *
 * Note: These are estimates and may not reflect exact billing.
 */
const PRICING_TABLES: PricingTable[] = [
  // OpenAI models (used by Codex and Copilot)
  {
    provider: "codex",
    model: "gpt-4o",
    promptTokenCost: 2.5,
    completionTokenCost: 10.0,
  },
  {
    provider: "codex",
    model: "gpt-4o-mini",
    promptTokenCost: 0.15,
    completionTokenCost: 0.6,
  },
  {
    provider: "codex",
    model: "gpt-4-turbo",
    promptTokenCost: 10.0,
    completionTokenCost: 30.0,
  },
  {
    provider: "codex",
    model: "gpt-3.5-turbo",
    promptTokenCost: 0.5,
    completionTokenCost: 1.5,
  },
  {
    provider: "copilot-acp",
    model: "gpt-4o",
    promptTokenCost: 2.5,
    completionTokenCost: 10.0,
  },
  {
    provider: "copilot-acp",
    model: "gpt-4o-mini",
    promptTokenCost: 0.15,
    completionTokenCost: 0.6,
  },
  {
    provider: "copilot-acp",
    model: "gpt-4-turbo",
    promptTokenCost: 10.0,
    completionTokenCost: 30.0,
  },

  // Anthropic Claude models
  {
    provider: "claude",
    model: "claude-3-5-sonnet-20241022",
    promptTokenCost: 3.0,
    completionTokenCost: 15.0,
  },
  {
    provider: "claude",
    model: "claude-3-5-haiku-20241022",
    promptTokenCost: 0.8,
    completionTokenCost: 4.0,
  },
  {
    provider: "claude",
    model: "claude-3-opus-20240229",
    promptTokenCost: 15.0,
    completionTokenCost: 75.0,
  },
  {
    provider: "claude",
    model: "claude-3-sonnet-20240229",
    promptTokenCost: 3.0,
    completionTokenCost: 15.0,
  },
  {
    provider: "claude",
    model: "claude-3-haiku-20240307",
    promptTokenCost: 0.25,
    completionTokenCost: 1.25,
  },
];

/**
 * Calculate estimated cost for token usage.
 *
 * @param provider - Provider identifier
 * @param model - Model identifier
 * @param promptTokens - Number of prompt tokens
 * @param completionTokens - Number of completion tokens
 * @returns Estimated cost in USD, or null if pricing unavailable
 */
export function calculateCost(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  // Find pricing table for provider and model
  const pricing = PRICING_TABLES.find(
    (p) => p.provider === provider && p.model === model,
  );

  if (!pricing) {
    // No pricing data available for this provider/model
    return null;
  }

  // Calculate cost per 1M tokens
  const promptCost = (promptTokens / 1_000_000) * pricing.promptTokenCost;
  const completionCost =
    (completionTokens / 1_000_000) * pricing.completionTokenCost;
  const totalCost = promptCost + completionCost;

  // Round to 6 decimal places (sub-cent precision)
  return Math.round(totalCost * 1_000_000) / 1_000_000;
}

/**
 * Enrich token usage with cost calculation.
 *
 * @param provider - Provider identifier
 * @param model - Model identifier
 * @param promptTokens - Number of prompt tokens
 * @param completionTokens - Number of completion tokens
 * @returns TokenUsage with estimated cost (if available)
 */
export function enrichTokenUsage(
  provider: string,
  model: string | undefined,
  promptTokens: number,
  completionTokens: number,
): TokenUsage {
  const totalTokens = promptTokens + completionTokens;
  const estimatedCost = model
    ? calculateCost(provider, model, promptTokens, completionTokens) ?? undefined
    : undefined;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCost,
    model,
  };
}

/**
 * Get available pricing tables (for admin UI or debugging).
 *
 * @returns Array of all pricing tables
 */
export function getPricingTables(): PricingTable[] {
  return [...PRICING_TABLES];
}
