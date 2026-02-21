import { describe, it, expect, beforeEach } from "bun:test";
import { OpenCodeAdapter } from "../opencode-adapter.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("OpenCodeAdapter", () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    adapter = new OpenCodeAdapter({
      serverUrl: "http://127.0.0.1:4096",
    });
  });

  describe("normalizeSession – UUID fallback", () => {
    it("returns an opencode-prefixed UUID when no id fields exist", () => {
      const result = (adapter as any).normalizeSession({});
      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).toStartWith("opencode-");
      expect(result.sessionId.replace("opencode-", "")).toMatch(UUID_RE);
    });

    it("produces different IDs on repeated calls", () => {
      const a = (adapter as any).normalizeSession({});
      const b = (adapter as any).normalizeSession({});
      expect(a.sessionId).not.toBe(b.sessionId);
    });

    it("prefers raw.id over UUID fallback", () => {
      const result = (adapter as any).normalizeSession({ id: "my-session" });
      expect(result.sessionId).toBe("my-session");
    });

    it("prefers raw.sessionId when raw.id is missing", () => {
      const result = (adapter as any).normalizeSession({
        sessionId: "sess-456",
      });
      expect(result.sessionId).toBe("sess-456");
    });

    it("prefers raw.session_id when others are missing", () => {
      const result = (adapter as any).normalizeSession({
        session_id: "sess-789",
      });
      expect(result.sessionId).toBe("sess-789");
    });
  });

  describe("validateServerUrl", () => {
    it("accepts localhost URLs", () => {
      expect(() => new OpenCodeAdapter({ serverUrl: "http://127.0.0.1:4096" }))
        .not.toThrow();
      expect(() => new OpenCodeAdapter({ serverUrl: "http://localhost:4096" }))
        .not.toThrow();
      expect(() => new OpenCodeAdapter({ serverUrl: "http://[::1]:4096" }))
        .not.toThrow();
    });

    it("rejects non-localhost URLs", () => {
      expect(
        () => new OpenCodeAdapter({ serverUrl: "http://evil.com:4096" }),
      ).toThrow();
    });

    it("rejects non-http(s) protocols", () => {
      expect(
        () => new OpenCodeAdapter({ serverUrl: "ftp://127.0.0.1:4096" }),
      ).toThrow();
    });
  });

  describe("capabilities", () => {
    it("reports expected capabilities", () => {
      const caps = adapter.capabilities;
      expect(caps.listSessions).toBe(true);
      expect(caps.openSession).toBe(true);
      expect(caps.sendPrompt).toBe(true);
      expect(caps.multiTurn).toBe(true);
      expect(caps.streaming).toBe(false);
      expect(caps.attachments).toBe(false);
    });
  });
});
