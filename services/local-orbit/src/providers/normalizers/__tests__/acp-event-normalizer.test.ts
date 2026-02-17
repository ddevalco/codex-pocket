/**
 * Tests for ACPEventNormalizer
 *
 * Covers:
 * - Chunk aggregation by turnId
 * - Flush on done marker
 * - Flush on type switch
 * - Category mapping
 * - Timeout handling
 * - Error handling
 * - Context cleanup
 * - Multiple concurrent streams
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  ACPEventNormalizer,
  type AcpUpdateNotification,
} from "../acp-event-normalizer.js";
import type { NormalizedEvent } from "../../provider-types.js";

describe("ACPEventNormalizer", () => {
  let normalizer: ACPEventNormalizer;
  let dateNowSpy: any;
  let setTimeoutSpy: any;
  let clearTimeoutSpy: any;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    // Save originals
    originalSetTimeout = globalThis.setTimeout;
    originalClearTimeout = globalThis.clearTimeout;
    originalDateNow = Date.now;

    // Create normalizer with short timeout for testing
    normalizer = new ACPEventNormalizer({ streamTimeout: 1000 });
  });

  afterEach(() => {
    normalizer.clearAllContexts();
    // Restore originals
    if (dateNowSpy) {
      Date.now = originalDateNow;
    }
    if (setTimeoutSpy) {
      globalThis.setTimeout = originalSetTimeout;
    }
    if (clearTimeoutSpy) {
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  describe("Basic aggregation", () => {
    it("aggregates content deltas into single event", () => {
      const events: NormalizedEvent[] = [];
      normalizer.on("event", (event) => events.push(event));

      const notification1: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "Hello ",
            done: false,
          },
        },
      };

      const notification2: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "world!",
            done: true,
          },
        },
      };

      // Process chunks
      const result1 = normalizer.handleUpdate(notification1);
      expect(result1).toBeNull(); // No flush yet

      const result2 = normalizer.handleUpdate(notification2);
      expect(result2).not.toBeNull();
      expect(result2?.text).toBe("Hello world!");
      expect(result2?.category).toBe("agent_message");
      expect(result2?.sessionId).toBe("session-1");

      // Also verify event was emitted
      expect(events).toHaveLength(1);
      expect(events[0].text).toBe("Hello world!");
    });

    it("handles empty deltas gracefully", () => {
      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "",
            done: true,
          },
        },
      };

      const result = normalizer.handleUpdate(notification);
      expect(result).not.toBeNull();
      expect(result?.text).toBeUndefined();
    });

    it("preserves raw notification in rawEvent field", () => {
      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "test",
            done: true,
          },
        },
      };

      const result = normalizer.handleUpdate(notification);
      expect(result?.rawEvent).toEqual(notification);
    });
  });

  describe("Category mapping", () => {
    it("maps content to agent_message", () => {
      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "test",
            done: true,
          },
        },
      };

      const result = normalizer.handleUpdate(notification);
      expect(result?.category).toBe("agent_message");
    });

    it("maps reasoning to reasoning", () => {
      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "reasoning",
            delta: "thinking...",
            done: true,
          },
        },
      };

      const result = normalizer.handleUpdate(notification);
      expect(result?.category).toBe("reasoning");
    });

    it("maps tool to tool_command", () => {
      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "tool",
            command: "ls",
            args: ["-la"],
            done: true,
          },
        },
      };

      const result = normalizer.handleUpdate(notification);
      expect(result?.category).toBe("tool_command");
      expect(result?.payload?.command).toBe("ls");
      expect(result?.payload?.args).toEqual(["-la"]);
    });

    it("maps status to lifecycle_status", () => {
      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "status",
            status: "completed",
            done: true,
          },
        },
      };

      const result = normalizer.handleUpdate(notification);
      expect(result?.category).toBe("lifecycle_status");
      expect(result?.payload?.status).toBe("completed");
    });

    it("maps error to lifecycle_status", () => {
      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "error",
            error: {
              code: "E001",
              message: "Something went wrong",
            },
            done: true,
          },
        },
      };

      const result = normalizer.handleUpdate(notification);
      expect(result?.category).toBe("lifecycle_status");
      expect(result?.payload?.error).toEqual({
        code: "E001",
        message: "Something went wrong",
      });
    });
  });

  describe("Type switch flush", () => {
    it("flushes context when switching update types", () => {
      const events: NormalizedEvent[] = [];
      normalizer.on("event", (event) => events.push(event));

      // Send content updates
      const contentNotification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "Content text",
            done: false,
          },
        },
      };

      const reasoningNotification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "reasoning",
            delta: "Reasoning text",
            done: false,
          },
        },
      };

      // Process content
      normalizer.handleUpdate(contentNotification);
      expect(events).toHaveLength(0); // No flush yet

      // Process reasoning - should flush content
      normalizer.handleUpdate(reasoningNotification);
      expect(events).toHaveLength(1);
      expect(events[0].category).toBe("agent_message");
      expect(events[0].text).toBe("Content text");

      // Send done marker for reasoning
      const doneNotification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "reasoning",
            done: true,
          },
        },
      };

      normalizer.handleUpdate(doneNotification);
      expect(events).toHaveLength(2);
      expect(events[1].category).toBe("reasoning");
      expect(events[1].text).toBe("Reasoning text");
    });

    it("does not flush on type switch if no chunks accumulated", () => {
      const events: NormalizedEvent[] = [];
      normalizer.on("event", (event) => events.push(event));

      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            done: false,
          },
        },
      };

      normalizer.handleUpdate(notification);
      expect(events).toHaveLength(0);
    });
  });

  describe("Done marker handling", () => {
    it("flushes immediately on done marker", () => {
      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "Complete message",
            done: true,
          },
        },
      };

      const result = normalizer.handleUpdate(notification);
      expect(result).not.toBeNull();
      expect(result?.text).toBe("Complete message");
      expect(normalizer.getActiveContextCount()).toBe(0); // Cleanup occurred
    });

    it("flushes immediately on error type", () => {
      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "error",
            error: {
              code: "E001",
              message: "Error occurred",
            },
          },
        },
      };

      const result = normalizer.handleUpdate(notification);
      expect(result).not.toBeNull();
      expect(result?.category).toBe("lifecycle_status");
      expect(normalizer.getActiveContextCount()).toBe(0);
    });
  });

  describe("Timeout handling", () => {
    it("flushes incomplete stream after timeout", (done: () => void) => {
      const events: NormalizedEvent[] = [];
      normalizer.on("event", (event) => {
        events.push(event);
        // Check results after timeout
        expect(events).toHaveLength(1);
        expect(events[0].text).toBe("Incomplete");
        // Use setTimeout to check context count after event handler and cleanup complete
        setTimeout(() => {
          expect(normalizer.getActiveContextCount()).toBe(0);
          done();
        }, 0);
      });

      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "Incomplete",
            done: false,
          },
        },
      };

      normalizer.handleUpdate(notification);
      expect(events).toHaveLength(0);
      expect(normalizer.getActiveContextCount()).toBe(1);

      // Timeout will fire after 1000ms
    });

    it("resets timeout on subsequent updates", (done: () => void) => {
      const events: NormalizedEvent[] = [];
      const timeoutNormalizer = new ACPEventNormalizer({ streamTimeout: 500 });

      timeoutNormalizer.on("event", (event) => {
        events.push(event);
        // Check that we got the full message
        expect(events[0].text).toBe("Part 1 Part 2");
        timeoutNormalizer.clearAllContexts();
        done();
      });

      const notification1: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "Part 1 ",
            done: false,
          },
        },
      };

      timeoutNormalizer.handleUpdate(notification1);

      // Send second update after 300ms (before first timeout)
      setTimeout(() => {
        const notification2: AcpUpdateNotification = {
          jsonrpc: "2.0",
          method: "update",
          params: {
            sessionId: "session-1",
            turnId: "turn-1",
            update: {
              type: "content",
              delta: "Part 2",
              done: false,
            },
          },
        };

        timeoutNormalizer.handleUpdate(notification2);
        expect(events).toHaveLength(0); // Should not have timed out yet
      }, 300);

      // Timeout will fire 500ms after notification2
    });
  });

  describe("Concurrent streams", () => {
    it("handles multiple concurrent sessions", () => {
      const events: NormalizedEvent[] = [];
      normalizer.on("event", (event) => events.push(event));

      const session1: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "Session 1",
            done: true,
          },
        },
      };

      const session2: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-2",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "Session 2",
            done: true,
          },
        },
      };

      normalizer.handleUpdate(session1);
      normalizer.handleUpdate(session2);

      expect(events).toHaveLength(2);
      expect(events[0].sessionId).toBe("session-1");
      expect(events[0].text).toBe("Session 1");
      expect(events[1].sessionId).toBe("session-2");
      expect(events[1].text).toBe("Session 2");
    });

    it("handles multiple concurrent turns in same session", () => {
      const events: NormalizedEvent[] = [];
      normalizer.on("event", (event) => events.push(event));

      const turn1: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "Turn 1",
            done: false,
          },
        },
      };

      const turn2: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-2",
          update: {
            type: "content",
            delta: "Turn 2",
            done: false,
          },
        },
      };

      normalizer.handleUpdate(turn1);
      normalizer.handleUpdate(turn2);
      expect(normalizer.getActiveContextCount()).toBe(2);

      // Send done markers
      normalizer.handleUpdate({
        ...turn1,
        params: { ...turn1.params, update: { type: "content", done: true } },
      });
      normalizer.handleUpdate({
        ...turn2,
        params: { ...turn2.params, update: { type: "content", done: true } },
      });

      expect(events).toHaveLength(2);
      expect(normalizer.getActiveContextCount()).toBe(0);
    });
  });

  describe("Payload accumulation", () => {
    it("accumulates tool execution details", () => {
      const notification1: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "tool",
            command: "ls",
            args: ["-la"],
            done: false,
          },
        },
      };

      const notification2: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "tool",
            output: "file1.txt\nfile2.txt",
            exitCode: 0,
            done: true,
          },
        },
      };

      normalizer.handleUpdate(notification1);
      const result = normalizer.handleUpdate(notification2);

      expect(result?.payload).toEqual({
        command: "ls",
        args: ["-la"],
        output: "file1.txt\nfile2.txt",
        exitCode: 0,
      });
    });

    it("accumulates file diff details", () => {
      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "tool",
            path: "src/file.ts",
            diff: "+console.log('test')",
            language: "typescript",
            done: true,
          },
        },
      };

      const result = normalizer.handleUpdate(notification);
      expect(result?.payload).toEqual({
        path: "src/file.ts",
        diff: "+console.log('test')",
        language: "typescript",
      });
    });
  });

  describe("Event handlers", () => {
    it("calls all registered event handlers", () => {
      let handler1CallCount = 0;
      let handler2CallCount = 0;

      const handler1 = () => { handler1CallCount++; };
      const handler2 = () => { handler2CallCount++; };

      normalizer.on("event", handler1);
      normalizer.on("event", handler2);

      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "test",
            done: true,
          },
        },
      };

      normalizer.handleUpdate(notification);

      expect(handler1CallCount).toBe(1);
      expect(handler2CallCount).toBe(1);
    });

    it("can remove event handlers", () => {
      let handler1CallCount = 0;
      let handler2CallCount = 0;

      const handler1 = () => { handler1CallCount++; };
      const handler2 = () => { handler2CallCount++; };

      normalizer.on("event", handler1);
      normalizer.on("event", handler2);
      normalizer.off("event", handler1);

      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "test",
            done: true,
          },
        },
      };

      normalizer.handleUpdate(notification);

      expect(handler1CallCount).toBe(0);
      expect(handler2CallCount).toBe(1);
    });

    it("handles errors in event handlers gracefully", () => {
      let goodHandlerCalled = false;
      const goodHandler = () => { goodHandlerCalled = true; };
      const badHandler = () => {
        throw new Error("Handler error");
      };

      normalizer.on("event", badHandler);
      normalizer.on("event", goodHandler);

      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "test",
            done: true,
          },
        },
      };

      // Should not throw
      expect(() => normalizer.handleUpdate(notification)).not.toThrow();

      // Good handler should still be called
      expect(goodHandlerCalled).toBe(true);
    });
  });

  describe("Context management", () => {
    it("provides active context count", () => {
      expect(normalizer.getActiveContextCount()).toBe(0);

      const notification: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "test",
            done: false,
          },
        },
      };

      normalizer.handleUpdate(notification);
      expect(normalizer.getActiveContextCount()).toBe(1);

      normalizer.handleUpdate({
        ...notification,
        params: { ...notification.params, update: { type: "content", done: true } },
      });
      expect(normalizer.getActiveContextCount()).toBe(0);
    });

    it("clears all contexts", () => {
      const notification1: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: {
            type: "content",
            delta: "test",
            done: false,
          },
        },
      };

      const notification2: AcpUpdateNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-2",
          turnId: "turn-2",
          update: {
            type: "content",
            delta: "test",
            done: false,
          },
        },
      };

      normalizer.handleUpdate(notification1);
      normalizer.handleUpdate(notification2);
      expect(normalizer.getActiveContextCount()).toBe(2);

      normalizer.clearAllContexts();
      expect(normalizer.getActiveContextCount()).toBe(0);
    });
  });
});
