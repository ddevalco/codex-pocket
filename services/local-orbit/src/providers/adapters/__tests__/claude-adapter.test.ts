/**
 * Tests for Claude Provider Adapter (foundation scaffold)
 *
 * These tests verify the Claude adapter's foundation implementation:
 * - Adapter interface compliance
 * - Health check graceful degradation
 * - Capability declaration
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { ClaudeAdapter } from "../claude-adapter";

describe("ClaudeAdapter - Foundation", () => {
  let adapter: ClaudeAdapter;

  beforeEach(() => {
    adapter = new ClaudeAdapter();
  });

  describe("adapter interface", () => {
    it("has correct providerId", () => {
      expect(adapter.providerId).toBe("claude");
    });

    it("has correct providerName", () => {
      expect(adapter.providerName).toBe("Claude");
    });

    it("declares capabilities", () => {
      expect(adapter.capabilities).toBeDefined();
      expect(typeof adapter.capabilities.listSessions).toBe("boolean");
      expect(typeof adapter.capabilities.streaming).toBe("boolean");
      expect(typeof adapter.capabilities.attachments).toBe("boolean");
    });
  });

  describe("lifecycle methods", () => {
    it("starts without errors", async () => {
      await adapter.start();
      // No assertion - just verify no errors thrown
    });

    it("stops without errors", async () => {
      await adapter.stop();
      // No assertion - just verify no errors thrown
    });

    it("can be started and stopped multiple times", async () => {
      await adapter.start();
      await adapter.stop();
      await adapter.start();
      await adapter.stop();
      // No assertion - just verify no errors thrown
    });
  });

  describe("health check", () => {
    it("returns unhealthy status in foundation phase", async () => {
      const health = await adapter.health();
      
      expect(health.status).toBe("unhealthy");
      expect(health.message).toContain("foundation");
      expect(health.lastCheck).toBeDefined();
    });

    it("includes foundation phase details", async () => {
      const health = await adapter.health();
      
      expect(health.details).toBeDefined();
      expect(health.details?.reason).toBe("foundation_scaffold");
      expect(health.details?.phase).toBe("P5-01");
    });

    it("indicates API key configuration status", async () => {
      const adapterWithKey = new ClaudeAdapter({ apiKey: "test-key" });
      const healthWithKey = await adapterWithKey.health();
      
      expect(healthWithKey.details?.apiKeyConfigured).toBe(true);

      const adapterNoKey = new ClaudeAdapter();
      const healthNoKey = await adapterNoKey.health();
      
      expect(healthNoKey.details?.apiKeyConfigured).toBe(false);
    });
  });

  describe("session operations (not implemented)", () => {
    it("listSessions returns empty result", async () => {
      const result = await adapter.listSessions();
      
      expect(result.sessions).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it("openSession throws not implemented error", async () => {
      await expect(adapter.openSession("test-session")).rejects.toThrow(
        /not implemented/i
      );
    });

    it("sendPrompt throws not implemented error", async () => {
      await expect(
        adapter.sendPrompt("test-session", { text: "test" })
      ).rejects.toThrow(/not implemented/i);
    });

    it("subscribe throws not implemented error", async () => {
      await expect(
        adapter.subscribe("test-session", () => {})
      ).rejects.toThrow(/not implemented/i);
    });

    it("unsubscribe completes without error", async () => {
      const subscription = {
        id: "sub-123",
        sessionId: "test-session",
        provider: "claude" as const,
        unsubscribe: async () => {},
      };
      await adapter.unsubscribe(subscription);
      // No assertion - just verify no errors thrown
    });

    it("normalizeEvent returns null", async () => {
      const result = await adapter.normalizeEvent({ type: "test" });
      expect(result).toBeNull();
    });
  });

  describe("configuration", () => {
    it("accepts configuration options", () => {
      const adapterWithConfig = new ClaudeAdapter({
        apiKey: "test-key",
        baseUrl: "https://api.anthropic.com",
        timeout: 60000,
        model: "claude-3-opus",
      });

      expect(adapterWithConfig).toBeDefined();
    });

    it("uses default configuration when not provided", () => {
      const adapterDefaults = new ClaudeAdapter();
      expect(adapterDefaults).toBeDefined();
    });
  });

  describe("capability reporting", () => {
    it("reports streaming capability as true", () => {
      expect(adapter.capabilities.streaming).toBe(true);
    });

    it("reports attachments capability as true", () => {
      expect(adapter.capabilities.attachments).toBe(true);
    });

    it("reports unimplemented capabilities as false", () => {
      expect(adapter.capabilities.listSessions).toBe(false);
      expect(adapter.capabilities.openSession).toBe(false);
      expect(adapter.capabilities.sendPrompt).toBe(false);
      expect(adapter.capabilities.approvals).toBe(false);
      expect(adapter.capabilities.filtering).toBe(false);
      expect(adapter.capabilities.pagination).toBe(false);
    });

    it("reports multiTurn capability as true (future support)", () => {
      expect(adapter.capabilities.multiTurn).toBe(true);
    });
  });
});
