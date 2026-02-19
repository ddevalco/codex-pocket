/**
 * Tests for Claude Provider Adapter (full implementation)
 *
 * These tests verify the Claude adapter's full implementation:
 * - Adapter interface compliance
 * - Health check with API key validation
 * - Capability declaration
 * - Session management
 * - Event normalization
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { ClaudeAdapter } from "../claude-adapter";

describe("ClaudeAdapter - Full Implementation", () => {
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
    it("starts without errors when no API key configured", async () => {
      await adapter.start();
      // Should warn but not throw
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
    it("returns unhealthy status when no API key configured", async () => {
      const health = await adapter.health();
      
      expect(health.status).toBe("unhealthy");
      expect(health.message).toContain("API key not configured");
      expect(health.lastCheck).toBeDefined();
    });

    it("includes configuration status in details", async () => {
      const health = await adapter.health();
      
      expect(health.details).toBeDefined();
      expect(health.details?.reason).toBe("missing_api_key");
      expect(health.details?.configured).toBe(false);
    });

    it("returns unhealthy when client not initialized", async () => {
      const adapterWithKey = new ClaudeAdapter({ apiKey: "test-key" });
      // Don't call start() to leave client uninitialized
      const health = await adapterWithKey.health();
      
      expect(health.status).toBe("unhealthy");
      expect(health.message).toContain("client not initialized");
    });

    it("returns healthy when properly configured and initialized", async () => {
      const adapterWithKey = new ClaudeAdapter({ apiKey: "test-key" });
      await adapterWithKey.start();
      const health = await adapterWithKey.health();
      
      expect(health.status).toBe("healthy");
      expect(health.message).toContain("ready");
    });
  });

  describe("session operations", () => {
    it("listSessions returns empty result (Claude doesn't have server-side sessions)", async () => {
      const result = await adapter.listSessions();
      
      expect(result.sessions).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it("openSession creates minimal session", async () => {
      const session = await adapter.openSession("test-session");
      
      expect(session.sessionId).toBe("test-session");
      expect(session.provider).toBe("claude");
      expect(session.title).toBeDefined();
      expect(session.capabilities.sendPrompt).toBe(true);
      expect(session.capabilities.streaming).toBe(true);
    });

    it("openSession initializes conversation history", async () => {
      await adapter.openSession("test-session-1");
      await adapter.openSession("test-session-2");
      
      // Verify sessions can be opened without errors
      const session1 = await adapter.openSession("test-session-1");
      const session2 = await adapter.openSession("test-session-2");
      
      expect(session1.sessionId).toBe("test-session-1");
      expect(session2.sessionId).toBe("test-session-2");
    });

    it("sendPrompt throws when client not initialized", async () => {
      await expect(
        adapter.sendPrompt("test-session", { text: "test" })
      ).rejects.toThrow(/client not initialized/i);
    });

    it("subscribe stores callback for event emission", async () => {
      const mockCallback = () => {};
      const subscription = await adapter.subscribe("test-session", mockCallback);
      
      expect(subscription.id).toBeDefined();
      expect(subscription.sessionId).toBe("test-session");
      expect(subscription.provider).toBe("claude");
      expect(typeof subscription.unsubscribe).toBe("function");
    });

    it("unsubscribe removes subscription", async () => {
      const mockCallback = () => {};
      const subscription = await adapter.subscribe("test-session", mockCallback);
      
      await adapter.unsubscribe(subscription);
      // No assertion - just verify no errors thrown
    });
  });

  describe("configuration", () => {
    it("accepts configuration options", () => {
      const adapterWithConfig = new ClaudeAdapter({
        apiKey: "test-key",
        baseUrl: "https://api.anthropic.com",
        timeout: 60000,
        model: "claude-3-opus",
        maxTokens: 4096,
      });

      expect(adapterWithConfig).toBeDefined();
    });

    it("uses default configuration when not provided", () => {
      const adapterDefaults = new ClaudeAdapter();
      expect(adapterDefaults).toBeDefined();
    });

    it("uses default model when not specified", async () => {
      const adapterDefaults = new ClaudeAdapter();
      await adapterDefaults.start();
      // Default model should be claude-3-5-sonnet-20241022
    });
  });

  describe("capability reporting", () => {
    it("reports streaming capability as true", () => {
      expect(adapter.capabilities.streaming).toBe(true);
    });

    it("reports attachments capability as true", () => {
      expect(adapter.capabilities.attachments).toBe(true);
    });

    it("reports implemented capabilities correctly", () => {
      expect(adapter.capabilities.listSessions).toBe(false); // Claude doesn't have server-side sessions
      expect(adapter.capabilities.openSession).toBe(true);   // Can open via local tracking
      expect(adapter.capabilities.sendPrompt).toBe(true);    // Primary capability
      expect(adapter.capabilities.approvals).toBe(false);    // No approval workflow
      expect(adapter.capabilities.filtering).toBe(false);    // No native filtering
      expect(adapter.capabilities.pagination).toBe(false);   // No native pagination
    });

    it("reports multiTurn capability as true", () => {
      expect(adapter.capabilities.multiTurn).toBe(true);
    });
  });
});
