import { describe, it, expect } from "bun:test";
import { ACPSessionNormalizer } from "../session-normalizer";
import type { NormalizedSession } from "../../provider-types.js";

describe("ACPSessionNormalizer", () => {
  const normalizer = new ACPSessionNormalizer();

  it("normalizes complete ACP session", async () => {
    const acpSession = {
      id: "session-123",
      title: "Test Session",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" }
      ],
      created_at: "2024-01-15T10:30:00Z",
      updated_at: "2024-01-15T10:31:00Z",
      status: "active",
      metadata: {
        model: "gpt-4",
        tokens: 150
      }
    };

    const normalized: NormalizedSession | null = await normalizer.normalizeSession(acpSession);

    expect(normalized).not.toBeNull();
    if (normalized) {
      expect(normalized.sessionId).toBe("session-123");
      expect(normalized.title).toBe("Test Session");
      expect(normalized.preview).toContain("Hi there!");
      expect(normalized.createdAt).toBe("2024-01-15T10:30:00.000Z");
      expect(normalized.updatedAt).toBe("2024-01-15T10:31:00.000Z");
      expect(normalized.status).toBe("active");
      expect((normalized.metadata as any).model).toBe("gpt-4");
    }
  });

  it("generates title from first message if missing", async () => {
    const acpSession = {
      id: "session-456",
      messages: [
        { role: "user", content: "What is the capital of France?" }
      ]
    };

    const normalized = await normalizer.normalizeSession(acpSession);

    expect(normalized?.title).toContain("What is the capital");
  });

  it("generates preview from messages", async () => {
    const acpSession = {
      id: "session-789",
      title: "Test",
      messages: [
        { role: "user", content: "First message" },
        { role: "assistant", content: "Response here" }
      ]
    };

    const normalized = await normalizer.normalizeSession(acpSession);

    expect(normalized?.preview).toContain("Response here");
  });

  it("handles missing timestamps", async () => {
    const acpSession = {
      id: "session-no-time",
      title: "No Timestamps"
    };

    const normalized = await normalizer.normalizeSession(acpSession);

    // Should have fallback timestamps
    expect(normalized?.createdAt).toBeDefined();
    expect(normalized?.updatedAt).toBeDefined();
  });

  it("maps status values", async () => {
    const statuses = [
      { input: "active", expected: "active" },
      { input: "completed", expected: "completed" },
      { input: "error", expected: "error" },
      { input: "unknown", expected: "idle" } // Code defaults to idle
    ];

    for (const { input, expected } of statuses) {
      const normalized = await normalizer.normalizeSession({
        id: "test",
        status: input
      });
      expect(normalized?.status).toBe(expected);
    }
  });

  it("extracts metadata", async () => {
    const acpSession = {
      id: "session-meta",
      metadata: {
        model: "gpt-4-turbo",
        temperature: 0.7,
        maxTokens: 2000
      }
    };

    const normalized = await normalizer.normalizeSession(acpSession);

    const metadata = normalized?.metadata as any;
    expect(metadata.model).toBe("gpt-4-turbo");
    expect(metadata.temperature).toBe(0.7);
    expect(metadata.maxTokens).toBe(2000);
  });

  it("handles empty session gracefully", async () => {
    const acpSession = { id: "empty" };

    const normalized = await normalizer.normalizeSession(acpSession);

    expect(normalized?.sessionId).toBe("empty");
    expect(normalized?.title).toContain("Session");
    expect(normalized?.status).toBe("idle");
  });

  it("truncates long titles when generated", async () => {
    const longContent = "A".repeat(200);
    const acpSession = {
      id: "long-title",
      messages: [
        { role: "user", content: longContent }
      ]
    };

    const normalized = await normalizer.normalizeSession(acpSession);

    expect(normalized?.title.length).toBeLessThanOrEqual(50);
    expect(normalized?.title).toContain("...");
  });

  it("truncates long previews", async () => {
    const longMessage = "B".repeat(500);
    const acpSession = {
      id: "long-preview",
      messages: [{ role: "user", content: longMessage }]
    };

    const normalized = await normalizer.normalizeSession(acpSession);

    expect(normalized?.preview?.length).toBeLessThanOrEqual(200);
  });
});
