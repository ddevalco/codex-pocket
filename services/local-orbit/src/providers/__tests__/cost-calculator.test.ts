/**
 * Cost Calculator Tests
 */

import { describe, test, expect } from "bun:test";
import {
  calculateCost,
  enrichTokenUsage,
  getPricingTables,
} from "../cost-calculator.js";

describe("Cost Calculator", () => {
  describe("calculateCost", () => {
    test("calculates cost for gpt-4o", () => {
      const cost = calculateCost("codex", "gpt-4o", 1000, 1000);
      // 1000/1M * 2.5 + 1000/1M * 10.0 = 0.0025 + 0.01 = 0.0125
      expect(cost).toBe(0.0125);
    });

    test("calculates cost for gpt-4o-mini", () => {
      const cost = calculateCost("codex", "gpt-4o-mini", 10000, 5000);
      // 10000/1M * 0.15 + 5000/1M * 0.6 = 0.0015 + 0.003 = 0.0045
      expect(cost).toBe(0.0045);
    });

    test("calculates cost for claude-3-5-sonnet", () => {
      const cost = calculateCost("claude", "claude-3-5-sonnet-20241022", 5000, 2000);
      // 5000/1M * 3.0 + 2000/1M * 15.0 = 0.015 + 0.03 = 0.045
      expect(cost).toBe(0.045);
    });

    test("returns null for unknown provider/model", () => {
      const cost = calculateCost("unknown-provider", "unknown-model", 1000, 1000);
      expect(cost).toBeNull();
    });

    test("handles zero tokens", () => {
      const cost = calculateCost("codex", "gpt-4o", 0, 0);
      expect(cost).toBe(0);
    });

    test("handles large token counts", () => {
      // 1M prompt tokens, 500k completion tokens
      const cost = calculateCost("codex", "gpt-4o", 1_000_000, 500_000);
      // 1M/1M * 2.5 + 500k/1M * 10.0 = 2.5 + 5.0 = 7.5
      expect(cost).toBe(7.5);
    });

    test("rounds to 6 decimal places", () => {
      // Very small amounts should round correctly
      const cost = calculateCost("codex", "gpt-4o", 1, 1);
      expect(cost).toBeDefined();
      expect(cost).toBeGreaterThanOrEqual(0);
      if (cost !== null) {
        // Check that we have at most 6 decimal places
        const decimals = cost.toString().split('.')[1]?.length || 0;
        expect(decimals).toBeLessThanOrEqual(6);
      }
    });
  });

  describe("enrichTokenUsage", () => {
    test("creates TokenUsage with cost for known model", () => {
      const usage = enrichTokenUsage("codex", "gpt-4o", 1000, 2000);
      
      expect(usage.promptTokens).toBe(1000);
      expect(usage.completionTokens).toBe(2000);
      expect(usage.totalTokens).toBe(3000);
      expect(usage.model).toBe("gpt-4o");
      expect(usage.estimatedCost).toBeDefined();
      expect(usage.estimatedCost).toBeGreaterThan(0);
    });

    test("creates TokenUsage without cost for unknown model", () => {
      const usage = enrichTokenUsage("unknown", "unknown-model", 1000, 2000);
      
      expect(usage.promptTokens).toBe(1000);
      expect(usage.completionTokens).toBe(2000);
      expect(usage.totalTokens).toBe(3000);
      expect(usage.model).toBe("unknown-model");
      expect(usage.estimatedCost).toBeUndefined();
    });

    test("creates TokenUsage without cost when model is undefined", () => {
      const usage = enrichTokenUsage("codex", undefined, 1000, 2000);
      
      expect(usage.promptTokens).toBe(1000);
      expect(usage.completionTokens).toBe(2000);
      expect(usage.totalTokens).toBe(3000);
      expect(usage.model).toBeUndefined();
      expect(usage.estimatedCost).toBeUndefined();
    });

    test("calculates total tokens correctly", () => {
      const usage = enrichTokenUsage("codex", "gpt-4o", 5000, 3000);
      expect(usage.totalTokens).toBe(8000);
    });
  });

  describe("getPricingTables", () => {
    test("returns array of pricing tables", () => {
      const tables = getPricingTables();
      
      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBeGreaterThan(0);
    });

    test("includes expected models", () => {
      const tables = getPricingTables();
      
      const hasGpt4o = tables.some(
        (t) => t.provider === "codex" && t.model === "gpt-4o"
      );
      const hasClaude = tables.some(
        (t) => t.provider === "claude" && t.model === "claude-3-5-sonnet-20241022"
      );
      
      expect(hasGpt4o).toBe(true);
      expect(hasClaude).toBe(true);
    });

    test("all tables have required fields", () => {
      const tables = getPricingTables();
      
      for (const table of tables) {
        expect(table.provider).toBeDefined();
        expect(table.model).toBeDefined();
        expect(typeof table.promptTokenCost).toBe("number");
        expect(typeof table.completionTokenCost).toBe("number");
        expect(table.promptTokenCost).toBeGreaterThanOrEqual(0);
        expect(table.completionTokenCost).toBeGreaterThanOrEqual(0);
      }
    });

    test("returns a copy of tables (immutable)", () => {
      const tables1 = getPricingTables();
      const tables2 = getPricingTables();
      
      expect(tables1).not.toBe(tables2); // Different array instances
      expect(tables1).toEqual(tables2); // Same content
    });
  });

  describe("pricing consistency", () => {
    test("completion tokens cost more than prompt tokens", () => {
      const tables = getPricingTables();
      
      for (const table of tables) {
        // For most models, completion tokens are more expensive
        // (though this isn't always true, so we just check the common ones)
        if (table.model.includes("gpt") || table.model.includes("claude")) {
          expect(table.completionTokenCost).toBeGreaterThanOrEqual(table.promptTokenCost);
        }
      }
    });

    test("costs are reasonable (not negative, not absurdly high)", () => {
      const tables = getPricingTables();
      
      for (const table of tables) {
        expect(table.promptTokenCost).toBeGreaterThan(0);
        expect(table.completionTokenCost).toBeGreaterThan(0);
        expect(table.promptTokenCost).toBeLessThan(1000); // Less than $1000 per 1M tokens
        expect(table.completionTokenCost).toBeLessThan(1000);
      }
    });
  });

  describe("real-world scenarios", () => {
    test("typical chat completion cost", () => {
      // 500 prompt tokens, 200 completion tokens with gpt-4o
      const cost = calculateCost("codex", "gpt-4o", 500, 200);
      
      expect(cost).toBeDefined();
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(0.01); // Should be less than 1 cent
    });

    test("large document processing cost", () => {
      // 50k prompt tokens, 10k completion tokens with gpt-4o
      const cost = calculateCost("codex", "gpt-4o", 50_000, 10_000);
      
      expect(cost).toBeDefined();
      if (cost !== null) {
        expect(cost).toBeGreaterThan(0.1); // Should be more than 10 cents
        expect(cost).toBeLessThan(1.0); // Should be less than $1
      }
    });

    test("comparison: gpt-4o vs gpt-4o-mini", () => {
      const tokens = { prompt: 10_000, completion: 5_000 };
      
      const gpt4oCost = calculateCost("codex", "gpt-4o", tokens.prompt, tokens.completion);
      const miniCost = calculateCost("codex", "gpt-4o-mini", tokens.prompt, tokens.completion);
      
      expect(gpt4oCost).toBeDefined();
      expect(miniCost).toBeDefined();
      
      if (gpt4oCost !== null && miniCost !== null) {
        // Mini should be significantly cheaper
        expect(miniCost).toBeLessThan(gpt4oCost);
        expect(gpt4oCost / miniCost).toBeGreaterThan(10); // At least 10x cheaper
      }
    });
  });
});
