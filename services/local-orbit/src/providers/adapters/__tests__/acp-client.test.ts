import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { AcpClient } from "../acp-client";
import { Readable, Writable } from "node:stream";

class MockReadable extends Readable {
  _read() {}
  pushLine(line: string) {
    this.push(line + "\n");
  }
}

class MockWritable extends Writable {
  written: string[] = [];
  _write(chunk: any, encoding: string, callback: Function) {
    this.written.push(chunk.toString());
    callback();
  }
}

describe("AcpClient", () => {
  let stdout: MockReadable;
  let stdin: MockWritable;
  let client: AcpClient;
  let mockProcess: any;

  beforeEach(() => {
    stdout = new MockReadable();
    stdin = new MockWritable();
    mockProcess = {
      stdout,
      stdin,
      on: mock(() => {}), // for exit handler
      stderr: new MockReadable(),
    };
    client = new AcpClient(mockProcess as any);
  });

  afterEach(() => {
    client.close();
  });

  it("sends JSON-RPC request and receives response", async () => {
    const responsePromise = client.sendRequest("test/method", { param: "value" });
    
    // Simulate response from server
    setTimeout(() => {
      const written = JSON.parse(stdin.written[0]);
      stdout.pushLine(JSON.stringify({
        jsonrpc: "2.0",
        id: written.id,
        result: { success: true }
      }));
    }, 10);

    const response = await responsePromise;
    expect((response as any).success).toBe(true);
  });

  it("correlates requests and responses by ID", async () => {
    const req1 = client.sendRequest("method1", {});
    const req2 = client.sendRequest("method2", {});
    
    setTimeout(() => {
      const written1 = JSON.parse(stdin.written[0]);
      const written2 = JSON.parse(stdin.written[1]);
      
      // Respond out of order
      stdout.pushLine(JSON.stringify({ jsonrpc: "2.0", id: written2.id, result: { order: 2 } }));
      stdout.pushLine(JSON.stringify({ jsonrpc: "2.0", id: written1.id, result: { order: 1 } }));
    }, 10);

    const [res1, res2] = await Promise.all([req1, req2]);
    expect((res1 as any).order).toBe(1);
    expect((res2 as any).order).toBe(2);
  });

  it("times out after 5 seconds", async () => {
    const start = Date.now();
    
    try {
      await client.sendRequest("slow/method", {}, 100); // 100ms timeout
      expect(true).toBe(false); // Should not reach
    } catch (err: any) {
      const elapsed = Date.now() - start;
      expect(err.message).toContain("ACP operation timed out");
      expect(err.message).toContain("slow/method");
      expect(elapsed).toBeGreaterThanOrEqual(95); // 5ms tolerance for timing variance
      expect(elapsed).toBeLessThan(500); // Allow some buffer
    }
  });

  it("handles NDJSON line parsing", async () => {
    const responsePromise = client.sendRequest("test", {});
    
    setTimeout(() => {
      const written = JSON.parse(stdin.written[0]);
      // Partial line, then complete
      stdout.push('{"jsonrpc":"2.0","id":');
      stdout.pushLine(`${written.id},"result":{"ok":true}}`);
    }, 10);

    const response = await responsePromise;
    expect((response as any).ok).toBe(true);
  });

  it("ignores notifications (messages without ID)", async () => {
    const onNotification = mock(() => {});
    client.onNotification(onNotification);
    
    stdout.pushLine(JSON.stringify({ jsonrpc: "2.0", method: "notify", params: {} }));
    
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(onNotification).toHaveBeenCalled();
  });

  it("cleans up pending requests on destroy", async () => {
    const req = client.sendRequest("test", {});
    client.close();
    
    try {
      await req;
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain("exited");
    }
  });

  describe("session routing", () => {
    it("routes notifications to session-specific handlers", async () => {
      const session1Handler = mock(() => {});
      const session2Handler = mock(() => {});
      
      client.onSessionEvent("session-1", session1Handler);
      client.onSessionEvent("session-2", session2Handler);
      
      // Send update for session-1
      stdout.pushLine(JSON.stringify({
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: { type: "content", delta: "hello" }
        }
      }));
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(session1Handler).toHaveBeenCalledTimes(1);
      expect(session2Handler).not.toHaveBeenCalled();
    });

    it("removes handlers via offSessionEvent", async () => {
      const handler = mock(() => {});
      
      client.onSessionEvent("session-1", handler);
      client.offSessionEvent("session-1", handler);
      
      // Send update for session-1
      stdout.pushLine(JSON.stringify({
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: { type: "content", delta: "hello" }
        }
      }));
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(handler).not.toHaveBeenCalled();
    });

    it("isolates sessions (no cross-session leakage)", async () => {
      const sessionAHandler = mock(() => {});
      const sessionBHandler = mock(() => {});
      
      client.onSessionEvent("session-a", sessionAHandler);
      client.onSessionEvent("session-b", sessionBHandler);
      
      // Send update for session-a
      stdout.pushLine(JSON.stringify({
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-a",
          turnId: "turn-1",
          update: { type: "content", delta: "hello" }
        }
      }));
      
      // Send update for session-b
      stdout.pushLine(JSON.stringify({
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-b",
          turnId: "turn-1",
          update: { type: "content", delta: "world" }
        }
      }));
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Each handler should only receive its own session's events
      expect(sessionAHandler).toHaveBeenCalledTimes(1);
      expect(sessionBHandler).toHaveBeenCalledTimes(1);
      
      // Verify session-a handler received session-a notification
      const sessionANotification = sessionAHandler.mock.calls[0][0];
      expect(sessionANotification.params.sessionId).toBe("session-a");
      
      // Verify session-b handler received session-b notification
      const sessionBNotification = sessionBHandler.mock.calls[0][0];
      expect(sessionBNotification.params.sessionId).toBe("session-b");
    });

    it("cleans up empty handler arrays on offSessionEvent", async () => {
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});
      
      client.onSessionEvent("session-1", handler1);
      client.onSessionEvent("session-1", handler2);
      
      client.offSessionEvent("session-1", handler1);
      client.offSessionEvent("session-1", handler2);
      
      // Send update for session-1
      stdout.pushLine(JSON.stringify({
        jsonrpc: "2.0",
        method: "update",
        params: {
          sessionId: "session-1",
          turnId: "turn-1",
          update: { type: "content", delta: "hello" }
        }
      }));
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });
});

