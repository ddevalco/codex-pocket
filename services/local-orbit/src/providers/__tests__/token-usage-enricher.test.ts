/**
 * Token Usage Enricher Tests
 */

import { describe, test, expect } from "bun:test";
import {
  extractTokenUsage,
  enrichEventWithTokenUsage,
  enrichEventsWithTokenUsage,
} from "../token-usage-enricher.js";
import type { NormalizedEvent } from "../provider-types.js";

describe("Token Usage Enricher", () => {
  describe("extractTokenUsage", () => {
    test("extracts OpenAI-style usage", () => {
      const rawEvent = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        model: "gpt-4o",
      };

      const usage = extractTokenUsage(rawEvent, "codex", "gpt-4o");

      expect(usage).toBeDefined();
      expect(usage?.promptTokens).toBe(100);
      expect(usage?.completionTokens).toBe(50);
      expect(usage?.totalTokens).toBe(150);
      expect(usage?.model).toBe("gpt-4o");
      expect(usage?.estimatedCost).toBeGreaterThan(0);
    });

    test("extracts Claude-style usage (input_tokens, output_tokens)", () => {
      const rawEvent = {
        usage: {
          input_tokens: 200,
          output_tokens: 100,
        },
        model: "claude-3-5-sonnet-20241022",
      };

      const usage = extractTokenUsage(rawEvent, "claude", "claude-3-5-sonnet-20241022");

      expect(usage).toBeDefined();
      expect(usage?.promptTokens).toBe(200);
      expect(usage?.completionTokens).toBe(100);
      expect(usage?.totalTokens).toBe(300);
    });

    test("extracts camelCase tokenUsage", () => {
      const rawEvent = {
        tokenUsage: {
          promptTokens: 150,
          completionTokens: 75,
        },
        model: "gpt-4o",
      };

      const usage = extractTokenUsage(rawEvent, "codex", "gpt-4o");

      expect(usage).toBeDefined();
      expect(usage?.promptTokens).toBe(150);
      expect(usage?.completionTokens).toBe(75);
      expect(usage?.totalTokens).toBe(225);
    });

    test("extracts snake_case token_usage", () => {
      const rawEvent = {
        token_usage: {
          prompt_tokens: 80,
          completion_tokens: 40,
        },
        model: "gpt-4o-mini",
      };

      const usage = extractTokenUsage(rawEvent, "codex", "gpt-4o-mini");

      expect(usage).toBeDefined();
      expect(usage?.promptTokens).toBe(80);
      expect(usage?.completionTokens).toBe(40);
    });

    test("extracts tokens from top level", () => {
      const rawEvent = {
        prompt_tokens: 300,
        completion_tokens: 150,
        model: "gpt-3.5-turbo",
      };

      const usage = extractTokenUsage(rawEvent, "codex", "gpt-3.5-turbo");

      expect(usage).toBeDefined();
      expect(usage?.promptTokens).toBe(300);
      expect(usage?.completionTokens).toBe(150);
    });

    test("returns null for non-object input", () => {
      expect(extractTokenUsage(null, "codex", "gpt-4o")).toBeNull();
      expect(extractTokenUsage(undefined, "codex", "gpt-4o")).toBeNull();
      expect(extractTokenUsage("string", "codex", "gpt-4o")).toBeNull();
      expect(extractTokenUsage(123, "codex", "gpt-4o")).toBeNull();
    });

    test("returns null when no usage data present", () => {
      const rawEvent = { some: "data", but: "no usage" };
      const usage = extractTokenUsage(rawEvent, "codex", "gpt-4o");
      expect(usage).toBeNull();
    });

    test("returns null for incomplete usage data", () => {
      const rawEvent = {
        usage: {
          prompt_tokens: 100,
          // Missing completion_tokens
        },
      };
      const usage = extractTokenUsage(rawEvent, "codex", "gpt-4o");
      expect(usage).toBeNull();
    });

    test("uses model from usage object if not provided", () => {
      const rawEvent = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          model: "gpt-4o",
        },
      };

      const usage = extractTokenUsage(rawEvent, "codex");

      expect(usage?.model).toBe("gpt-4o");
    });

    test("prefers explicit model parameter over event model", () => {
      const rawEvent = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
        },
        model: "wrong-model",
      };

      const usage = extractTokenUsage(rawEvent, "codex", "gpt-4o");

      expect(usage?.model).toBe("gpt-4o");
    });
  });

  describe("enrichEventWithTokenUsage", () => {
    function createMockEvent(rawEvent: unknown): NormalizedEvent {
      return {
        provider: "codex",
        sessionId: "session-1",
        eventId: "event-1",
        category: "agent_message",
        timestamp: new Date().toISOString(),
        rawEvent,
      };
    }

    test("enriches event with token usage", () => {
      const rawEvent = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
        },
        model: "gpt-4o",
      };

      const event = createMockEvent(rawEvent);
      enrichEventWithTokenUsage(event);

      expect(event.tokenUsage).toBeDefined();
      expect(event.tokenUsage?.promptTokens).toBe(100);
      expect(event.tokenUsage?.completionTokens).toBe(50);
    });

    test("does not overwrite existing tokenUsage", () => {
      const rawEvent = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
        },
      };

      const event = createMockEvent(rawEvent);
      event.tokenUsage = {
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
        model: "existing-model",
      };

      enrichEventWithTokenUsage(event);

      // Should keep existing tokenUsage
      expect(event.tokenUsage.promptTokens).toBe(200);
      expect(event.tokenUsage.completionTokens).toBe(100);
    });

    test("returns event for chaining", () => {
      const rawEvent = { usage: { prompt_tokens: 100, completion_tokens: 50 } };
      const event = createMockEvent(rawEvent);

      const result = enrichEventWithTokenUsage(event);

      expect(result).toBe(event);
    });

    test("handles event with no usage data gracefully", () => {
      const event = createMockEvent({ some: "data" });
      enrichEventWithTokenUsage(event);

      expect(event.tokenUsage).toBeUndefined();
    });

    test("uses model from event payload", () => {
      const rawEvent = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
        },
      };

      const event = createMockEvent(rawEvent);
      event.payload = { model: "gpt-4o-mini" };

      enrichEventWithTokenUsage(event);

      expect(event.tokenUsage?.model).toBe("gpt-4o-mini");
    });
  });

  describe("enrichEventsWithTokenUsage", () => {
    function createMockEvent(id: string, rawEvent: unknown): NormalizedEvent {
      return {
        provider: "codex",
        sessionId: "session-1",
        eventId: id,
        category: "agent_message",
        timestamp: new Date().toISOString(),
        rawEvent,
      };
    }

    test("enriches multiple events", () => {
      const events = [
        createMockEvent("1", {
          usage: { prompt_tokens: 100, completion_tokens: 50 },
          model: "gpt-4o",
        }),
        createMockEvent("2", {
          usage: { prompt_tokens: 200, completion_tokens: 100 },
          model: "gpt-4o",
        }),
        createMockEvent("3", { no: "usage" }),
      ];

      enrichEventsWithTokenUsage(events);

      expect(events[0].tokenUsage).toBeDefined();
      expect(events[0].tokenUsage?.promptTokens).toBe(100);
      expect(events[1].tokenUsage).toBeDefined();
      expect(events[1].tokenUsage?.promptTokens).toBe(200);
      expect(events[2].tokenUsage).toBeUndefined();
    });

    test("returns events array for chaining", () => {
      const events = [
        createMockEvent("1", { usage: { prompt_tokens: 100, completion_tokens: 50 } }),
      ];

      const result = enrichEventsWithTokenUsage(events);

      expect(result).toBe(events);
    });

    test("handles empty array", () => {
      const events: NormalizedEvent[] = [];
      enrichEventsWithTokenUsage(events);
      expect(events).toEqual([]);
    });

    test("handles array with mixed providers", () => {
      const events: NormalizedEvent[] = [
        {
          provider: "codex",
          sessionId: "s1",
          eventId: "e1",
          category: "agent_message",
          timestamp: new Date().toISOString(),
          rawEvent: {
            usage: { prompt_tokens: 100, completion_tokens: 50 },
            model: "gpt-4o",
          },
        },
        {
          provider: "claude",
          sessionId: "s2",
          eventId: "e2",
          category: "agent_message",
          timestamp: new Date().toISOString(),
          rawEvent: {
            usage: { input_tokens: 200, output_tokens: 100 },
            model: "claude-3-5-sonnet-20241022",
          },
        },
      ];

      enrichEventsWithTokenUsage(events);

      expect(events[0].tokenUsage?.promptTokens).toBe(100);
      expect(events[1].tokenUsage?.promptTokens).toBe(200);
    });
  });

  describe("integration scenarios", () => {
    test("full pipeline: extract, enrich, verify cost", () => {
      const rawEvent = {
        id: "msg_123",
        type: "content",
        content: "Hello world",
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 500,
        },
        model: "gpt-4o",
      };

      const event: NormalizedEvent = {
        provider: "codex",
        sessionId: "session-1",
        eventId: "event-1",
        category: "agent_message",
        timestamp: new Date().toISOString(),
        text: "Hello world",
        rawEvent,
      };

      enrichEventWithTokenUsage(event);

      expect(event.tokenUsage).toBeDefined();
      expect(event.tokenUsage?.totalTokens).toBe(1500);
      expect(event.tokenUsage?.estimatedCost).toBeGreaterThan(0);
      expect(event.tokenUsage?.model).toBe("gpt-4o");
    });

    test("handles streaming updates without usage", () => {
      const events: NormalizedEvent[] = [
        {
          provider: "codex" as const,
          sessionId: "s1",
          eventId: "e1",
          category: "agent_message" as const,
          timestamp: new Date().toISOString(),
          text: "Chunk 1",
          rawEvent: { delta: "Chunk 1", done: false },
        },
        {
          provider: "codex" as const,
          sessionId: "s1",
          eventId: "e2",
          category: "agent_message" as const,
          timestamp: new Date().toISOString(),
          text: "Chunk 2",
          rawEvent: { delta: "Chunk 2", done: true, usage: { prompt_tokens: 100, completion_tokens: 50 }, model: "gpt-4o" },
        },
      ];

      enrichEventsWithTokenUsage(events);

      // First event has no usage
      expect(events[0].tokenUsage).toBeUndefined();
      // Final event has usage
      expect(events[1].tokenUsage).toBeDefined();
      expect(events[1].tokenUsage?.totalTokens).toBe(150);
    });
  });

  describe("validation of invalid token values", () => {
    test("rejects negative prompt tokens", () => {
      const rawEvent = {
        usage: {
          prompt_tokens: -100,
          completion_tokens: 50,
        },
        model: "gpt-4o",
      };

      const usage = extractTokenUsage(rawEvent, "codex", "gpt-4o");
      expect(usage).toBeNull();
    });

    test("rejects negative completion tokens", () => {
      const rawEvent = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: -50,
        },
        model: "gpt-4o",
      };

      const usage = extractTokenUsage(rawEvent, "codex", "gpt-4o");
      expect(usage).toBeNull();
    });

    test("rejects NaN prompt tokens", () => {
      const rawEvent = {
        usage: {
          prompt_tokens: NaN,
          completion_tokens: 50,
        },
        model: "gpt-4o",
      };

      const usage = extractTokenUsage(rawEvent, "codex", "gpt-4o");
      expect(usage).toBeNull();
    });

    test("rejects NaN completion tokens", () => {
      const rawEvent = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: NaN,
        },
        model: "gpt-4o",
      };

      const usage = extractTokenUsage(rawEvent, "codex", "gpt-4o");
      expect(usage).toBeNull();
    });

    test("rejects Infinity tokens", () => {
      const rawEvent1 = {
        usage: {
          prompt_tokens: Infinity,
          completion_tokens: 50,
        },
        model: "gpt-4o",
      };

      const rawEvent2 = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: Infinity,
        },
        model: "gpt-4o",
      };

      expect(extractTokenUsage(rawEvent1, "codex", "gpt-4o")).toBeNull();
      expect(extractTokenUsage(rawEvent2, "codex", "gpt-4o")).toBeNull();
    });

    test("rejects unreasonably large token counts (> 1 billion)", () => {
      const rawEvent = {
        usage: {
          prompt_tokens: 1e10,
          completion_tokens: 50,
        },
        model: "gpt-4o",
      };

      const usage = extractTokenUsage(rawEvent, "codex", "gpt-4o");
      expect(usage).toBeNull();
    });

    test("enrichEventWithTokenUsage handles invalid tokens", () => {
      const rawEvent = {
        usage: {
          prompt_tokens: -100,
          completion_tokens: 50,
        },
        model: "gpt-4o",
      };

      const event: NormalizedEvent = {
        provider: "codex",
        sessionId: "session-1",
        eventId: "event-1",
        category: "agent_message",
        timestamp: new Date().toISOString(),
        rawEvent,
      };

      enrichEventWithTokenUsage(event);

      // Should not add tokenUsage for invalid values
      expect(event.tokenUsage).toBeUndefined();
    });

    test("validates Claude-style input_tokens", () => {
      const rawEvent = {
        usage: {
          input_tokens: NaN,
          output_tokens: 100,
        },
        model: "claude-3-5-sonnet-20241022",
      };

      const usage = extractTokenUsage(rawEvent, "claude", "claude-3-5-sonnet-20241022");
      expect(usage).toBeNull();
    });

    test("validates camelCase tokenUsage", () => {
      const rawEvent = {
        tokenUsage: {
          promptTokens: -50,
          completionTokens: 100,
        },
        model: "gpt-4o",
      };

      const usage = extractTokenUsage(rawEvent, "codex", "gpt-4o");
      expect(usage).toBeNull();
    });

    test("validates top-level tokens", () => {
      const rawEvent = {
        prompt_tokens: Infinity,
        completion_tokens: 100,
        model: "gpt-4o",
      };

      const usage = extractTokenUsage(rawEvent, "codex", "gpt-4o");
      expect(usage).toBeNull();
    });
  });
});
