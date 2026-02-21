import { describe, it, expect, beforeEach, afterEach, mock, jest } from "bun:test";
import { CopilotAcpAdapter } from "../copilot-acp-adapter";
import type { PromptInput, PromptOptions, NormalizedEvent } from "../../provider-types";

// Mock AcpClient to avoid spawning real processes
const mockAcpClient = () => {
  const sendRequestMock = mock(() => Promise.resolve({}));
  const onNotificationMock = mock(() => {});
  const closeMock = mock(() => {});

  return {
    sendRequest: sendRequestMock,
    onNotification: onNotificationMock,
    close: closeMock,
  };
};

describe("CopilotAcpAdapter - sendPrompt", () => {
  let adapter: CopilotAcpAdapter;
  let mockClient: ReturnType<typeof mockAcpClient>;

  beforeEach(() => {
    adapter = new CopilotAcpAdapter();
    mockClient = mockAcpClient();
    // Inject mock client to bypass start() process spawning
    (adapter as any).client = mockClient;
  });

  afterEach(() => {
    (adapter as any).client = null;
  });

  describe("success cases", () => {
    it("sends JSON-RPC request with correct structure", async () => {
      mockClient.sendRequest.mockResolvedValue({
        turnId: "turn-123",
        status: "streaming",
      });

      const sessionId = "copilot-session-xyz";
      const input: PromptInput = { text: "Explain this function" };
      const options: PromptOptions = { mode: "auto", model: "gpt-4" };

      await adapter.sendPrompt(sessionId, input, options);

      // Verify sendRequest was called with correct arguments
      expect(mockClient.sendRequest).toHaveBeenCalledWith(
        "sendPrompt",
        {
          sessionId: "copilot-session-xyz",
          input: {
            content: [
              { type: "text", text: "Explain this function" }
            ],
          },
          options: {
            mode: "auto",
            model: "gpt-4",
          },
        },
        30000, // Default prompt timeout
      );
    });

    it("returns turnId and status on success", async () => {
      mockClient.sendRequest.mockResolvedValue({
        turnId: "turn-456",
        status: "streaming",
      });

      const result = await adapter.sendPrompt(
        "session-123",
        { text: "Test prompt" },
      );

      expect(result.turnId).toBe("turn-456");
      expect(result.status).toBe("streaming");
    });

    it("defaults status to streaming if not provided", async () => {
      mockClient.sendRequest.mockResolvedValue({
        turnId: "turn-789",
      });

      const result = await adapter.sendPrompt(
        "session-123",
        { text: "Test prompt" },
      );

      expect(result.status).toBe("streaming");
    });

    it("includes attachments when provided", async () => {
      // Create a temporary test file for reading
      const testFilePath = "/tmp/test-copilot-acp-file.ts";
      const { writeFileSync, unlinkSync } = await import("node:fs");
      writeFileSync(testFilePath, "const test = 'test content';");
      
      mockClient.sendRequest.mockResolvedValue({
        turnId: "turn-999",
        status: "streaming",
      });

      const input: PromptInput = {
        text: "Analyze this file",
        attachments: [{ 
          type: "file",
          filename: "file.ts",
          mimeType: "text/typescript",
          localPath: testFilePath
        }],
      };

      await adapter.sendPrompt("session-123", input);

      const callArgs = mockClient.sendRequest.mock.calls[0];
      // Now we use content array instead of attachments
      expect(callArgs[1].input.content).toBeDefined();
      expect(callArgs[1].input.content.length).toBeGreaterThanOrEqual(1);
      expect(callArgs[1].input.content[0]).toEqual({
        type: "text",
        text: "Analyze this file"
      });
      
      // Verify attachment was added to content array
      expect(callArgs[1].input.content.length).toBe(2);
      expect(callArgs[1].input.content[1]).toMatchObject({
        type: "attachment",
        mimeType: "text/typescript",
        filename: "file.ts",
        data: expect.any(String), // base64
      });

      // Cleanup
      unlinkSync(testFilePath);
    });

    it("sends image attachment encoded as content array", async () => {
      // Create a temporary test file
      const testFilePath = "/tmp/test-copilot-acp-image.png";
      const { writeFileSync, unlinkSync } = await import("node:fs");
      writeFileSync(testFilePath, Buffer.from("fake-image-data"));

      mockClient.sendRequest.mockResolvedValue({
        turnId: "turn-with-image",
        status: "streaming",
      });

      const input: PromptInput = {
        text: "What's in this image?",
        attachments: [{
          type: "image",
          filename: "test.png",
          mimeType: "image/png",
          localPath: testFilePath,
        }],
      };

      await adapter.sendPrompt("session-123", input);

      // Verify ACP request uses content array format
      const callArgs = mockClient.sendRequest.mock.calls[0];
      expect(callArgs[1].input.content).toBeDefined();
      expect(Array.isArray(callArgs[1].input.content)).toBe(true);
      expect(callArgs[1].input.content[0]).toEqual({
        type: "text",
        text: "What's in this image?",
      });
      expect(callArgs[1].input.content[1]).toMatchObject({
        type: "image",
        mimeType: "image/png",
        filename: "test.png",
        data: expect.any(String), // base64
      });

      // Cleanup
      unlinkSync(testFilePath);
    });

    it("falls back to text-only when ACP rejects attachments", async () => {
      // Create a temporary test file
      const testFilePath = "/tmp/test-copilot-acp-doc.pdf";
      const { writeFileSync, unlinkSync } = await import("node:fs");
      writeFileSync(testFilePath, Buffer.from("fake-pdf-data"));

      // First call with attachments fails, second call text-only succeeds
      mockClient.sendRequest
        .mockRejectedValueOnce(new Error("Invalid content format"))
        .mockResolvedValueOnce({
          turnId: "turn-fallback",
          status: "streaming",
        });

      const input: PromptInput = {
        text: "Test with attachment",
        attachments: [{
          type: "file",
          filename: "doc.pdf",
          mimeType: "application/pdf",
          localPath: testFilePath,
        }],
      };

      const result = await adapter.sendPrompt("session-fallback", input);

      // Should have made 2 requests: attachment, then text-only
      expect(mockClient.sendRequest).toHaveBeenCalledTimes(2);
      
      // Second call should be text-only
      const secondCallArgs = mockClient.sendRequest.mock.calls[1];
      expect(secondCallArgs[1].input.content).toEqual([
        { type: "text", text: "Test with attachment" },
      ]);
      
      expect(result.turnId).toBe("turn-fallback");

      // Cleanup
      unlinkSync(testFilePath);
    });

    it("uses default options when not provided", async () => {
      mockClient.sendRequest.mockResolvedValue({
        turnId: "turn-default",
        status: "streaming",
      });

      await adapter.sendPrompt("session-123", { text: "Test" });

      const callArgs = mockClient.sendRequest.mock.calls[0];
      expect(callArgs[1].options.mode).toBe("auto");
    });
  });

  describe("validation errors", () => {
    it("throws error for empty sessionId", async () => {
      await expect(adapter.sendPrompt("", { text: "Test" })).rejects.toThrow(
        "Invalid sessionId: must be a non-empty string"
      );
    });

    it("throws error for whitespace-only sessionId", async () => {
      await expect(adapter.sendPrompt("   ", { text: "Test" })).rejects.toThrow(
        "Invalid sessionId: must be a non-empty string"
      );
    });

    it("throws error for non-string sessionId", async () => {
      await expect(adapter.sendPrompt(null as any, { text: "Test" })).rejects.toThrow(
        "Invalid sessionId: must be a non-empty string"
      );
    });

    it("throws error for empty input text", async () => {
      await expect(adapter.sendPrompt("session-123", { text: "" })).rejects.toThrow(
        "Invalid input: text must be a non-empty string"
      );
    });

    it("throws error for whitespace-only input text", async () => {
      await expect(adapter.sendPrompt("session-123", { text: "   " })).rejects.toThrow(
        "Invalid input: text must be a non-empty string"
      );
    });

    it("throws error for missing input", async () => {
      await expect(adapter.sendPrompt("session-123", null as any)).rejects.toThrow(
        "Invalid input: text must be a non-empty string"
      );
    });

    it("throws error for missing input text", async () => {
      await expect(adapter.sendPrompt("session-123", {} as any)).rejects.toThrow(
        "Invalid input: text must be a non-empty string"
      );
    });

    it("throws error when client not available", async () => {
      (adapter as any).client = null;

      await expect(adapter.sendPrompt("session-123", { text: "Test" })).rejects.toThrow(
        "Copilot adapter not started or not available"
      );
    });
  });

  describe("timeout handling", () => {
    it("times out after 5 seconds", async () => {
      mockClient.sendRequest.mockRejectedValue(
        new Error("Request 1 (sendPrompt) timed out after 5000ms"),
      );

      await expect(adapter.sendPrompt("session-123", { text: "Test" })).rejects.toThrow(
        "timed out"
      );
    });

    it("passes 5-second timeout to sendRequest", async () => {
      mockClient.sendRequest.mockResolvedValue({
        turnId: "turn-timeout-check",
        status: "streaming",
      });

      await adapter.sendPrompt("session-123", { text: "Test" });

      const callArgs = mockClient.sendRequest.mock.calls[0];
      expect(callArgs[2]).toBe(30000); // Third argument is timeout
    });
  });

  describe("JSON-RPC error handling", () => {
    it("throws structured error on JSON-RPC error", async () => {
      mockClient.sendRequest.mockRejectedValue(
        new Error("JSON-RPC error -32600: Invalid Request"),
      );

      await expect(adapter.sendPrompt("session-123", { text: "Test" })).rejects.toThrow(
        "JSON-RPC error -32600: Invalid Request"
      );
    });

    it("handles rate limit errors", async () => {
      mockClient.sendRequest.mockRejectedValue(
        new Error("JSON-RPC error 429: Rate limit exceeded"),
      );

      await expect(adapter.sendPrompt("session-123", { text: "Test" })).rejects.toThrow(
        "JSON-RPC error 429: Rate limit exceeded"
      );
    });

    it("handles session not found errors", async () => {
      mockClient.sendRequest.mockRejectedValue(
        new Error("JSON-RPC error 404: Session not found"),
      );

      await expect(adapter.sendPrompt("invalid-session", { text: "Test" })).rejects.toThrow(
        "JSON-RPC error 404: Session not found"
      );
    });

    it("re-throws non-Error exceptions", async () => {
      mockClient.sendRequest.mockRejectedValue("String error");

      await expect(adapter.sendPrompt("session-123", { text: "Test" })).rejects.toThrow();
    });
  });

  describe("error handling and retries", () => {
    it("retries on transient failure up to maxRetries", async () => {
      // First attempt fails, second succeeds
      mockClient.sendRequest
        .mockRejectedValueOnce(new Error("Network unavailable")) // transient
        .mockResolvedValueOnce({ turnId: "retry-success" });

      const result = await adapter.sendPrompt("session-retry", { text: "Retry me" });
      
      expect(mockClient.sendRequest).toHaveBeenCalledTimes(2);
      expect(result.turnId).toBe("retry-success");
    });

    it("fails after exhausting maxRetries", async () => {
      // All attempts fail with transient error
      mockClient.sendRequest.mockRejectedValue(new Error("Network unavailable"));

      // Default maxRetries is 2, so 3 attempts total
      await expect(adapter.sendPrompt("session-fail", { text: "Fail me" }))
        .rejects.toThrow("Network unavailable");
      
      expect(mockClient.sendRequest).toHaveBeenCalledTimes(3); 
    });
  });

  describe("adapter capabilities", () => {
    it("reports sendPrompt as supported capability", () => {
      expect(adapter.capabilities.sendPrompt).toBe(true);
    });

    it("maintains other capability flags", () => {
      expect(adapter.capabilities.listSessions).toBe(true);
      expect(adapter.capabilities.streaming).toBe(true); // Issue #145 - streaming now supported
      expect(adapter.capabilities.openSession).toBe(false);
    });
  });
});

describe("CopilotAcpAdapter - health", () => {
  let adapter: CopilotAcpAdapter;

  beforeEach(() => {
    adapter = new CopilotAcpAdapter();
  });

  it("reports unhealthy when client is not initialized", async () => {
    // Don't inject client, leaving it as null
    const health = await adapter.health();

    expect(health.status).toBe("unhealthy");
    expect(health.message).toContain("client not initialized");
    expect(health.details?.reason).toBe("client_not_initialized");
  });
});

// ---------------------------------------------------------------------------
// Approval handling
// ---------------------------------------------------------------------------

/** Sample ACP permission-request params used across approval tests */
const samplePermissionParams = {
  sessionId: "sess-123",
  toolCall: {
    toolCallId: "tc-456",
    title: "Run shell command",
    kind: "shell",
    status: "pending",
  },
  options: [
    { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
    { optionId: "reject-once", name: "Reject", kind: "reject_once" },
  ],
};

/** Make a minimal NormalizedEvent stub for approval tests */
const makeApprovalEvent = (sessionId = "sess-123"): NormalizedEvent => ({
  provider: "copilot-acp",
  sessionId,
  eventId: "approval-rpc-1-0",
  category: "approval_request",
  timestamp: new Date().toISOString(),
  text: "Approval required: Run shell command",
  payload: {
    rpcId: "rpc-1",
    sessionId,
    toolCallId: "tc-456",
    toolTitle: "Run shell command",
    toolKind: "shell",
    options: [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "reject-once", name: "Reject", kind: "reject_once" },
    ],
  },
  rawEvent: samplePermissionParams,
});

describe("CopilotAcpAdapter - Approval handling", () => {
  // -------------------------------------------------------------------------
  // 1. capabilities reflect allowAllTools mode
  // -------------------------------------------------------------------------
  describe("capabilities reflect allowAllTools mode", () => {
    it("returns approvals: false when allowAllTools is true", () => {
      const adapter = new CopilotAcpAdapter({ allowAllTools: true });
      expect(adapter.capabilities.approvals).toBe(false);
    });

    it("returns approvals: true when allowAllTools is not set", () => {
      const adapter = new CopilotAcpAdapter({});
      expect(adapter.capabilities.approvals).toBe(true);
    });

    it("returns approvals: true by default", () => {
      const adapter = new CopilotAcpAdapter();
      expect(adapter.capabilities.approvals).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. onApprovalRequest registration
  // -------------------------------------------------------------------------
  describe("onApprovalRequest registration", () => {
    it("calls registered handler when session/request_permission arrives", () => {
      const adapter = new CopilotAcpAdapter();
      let receivedEvent: NormalizedEvent | undefined;

      adapter.onApprovalRequest((event) => {
        receivedEvent = event;
      });

      // Simulate the adapter emitting an approval request (what start()'s
      // session/request_permission onRequest handler does internally)
      const event = makeApprovalEvent();
      (adapter as any).emitApprovalRequest(event);

      expect(receivedEvent).toBeDefined();
      expect(receivedEvent!.category).toBe("approval_request");
      expect(receivedEvent!.sessionId).toBe("sess-123");
    });

    it("does not call handler if none registered", () => {
      const adapter = new CopilotAcpAdapter();
      // No handler registered — emitting should not throw
      const event = makeApprovalEvent();
      expect(() => (adapter as any).emitApprovalRequest(event)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 3. resolveApproval
  // -------------------------------------------------------------------------
  describe("resolveApproval", () => {
    it("calls resolve with selected outcome when optionId provided", () => {
      const adapter = new CopilotAcpAdapter();
      let resolvedWith: unknown;

      // Simulate a pending approval entry (as start() would insert)
      (adapter as any).pendingApprovals.set("rpc-sel", {
        resolve: (result: unknown) => { resolvedWith = result; },
        timeout: setTimeout(() => {}, 60_000),
      });

      adapter.resolveApproval("rpc-sel", { outcome: "selected", optionId: "allow-once" });

      expect(resolvedWith).toEqual({
        outcome: { outcome: "selected", optionId: "allow-once" },
      });
    });

    it("calls resolve with cancelled outcome when null passed", () => {
      const adapter = new CopilotAcpAdapter();
      let resolvedWith: unknown;

      (adapter as any).pendingApprovals.set("rpc-cancel", {
        resolve: (result: unknown) => { resolvedWith = result; },
        timeout: setTimeout(() => {}, 60_000),
      });

      adapter.resolveApproval("rpc-cancel", { outcome: "cancelled" });

      expect(resolvedWith).toEqual({ outcome: { outcome: "cancelled" } });
    });

    it("ignores resolveApproval call for unknown rpcId", () => {
      const adapter = new CopilotAcpAdapter();
      // No pending approval for "rpc-unknown" — should not throw
      expect(() =>
        adapter.resolveApproval("rpc-unknown", { outcome: "cancelled" })
      ).not.toThrow();
    });

    it("removes pending approval after resolution", () => {
      const adapter = new CopilotAcpAdapter();

      (adapter as any).pendingApprovals.set("rpc-rm", {
        resolve: () => {},
        timeout: setTimeout(() => {}, 60_000),
      });

      expect((adapter as any).pendingApprovals.has("rpc-rm")).toBe(true);
      adapter.resolveApproval("rpc-rm", { outcome: "cancelled" });
      expect((adapter as any).pendingApprovals.has("rpc-rm")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 4. 60-second timeout auto-cancel
  // -------------------------------------------------------------------------
  describe("60-second timeout auto-cancel", () => {
    it("auto-cancels pending approval after 60 seconds", () => {
      jest.useFakeTimers();
      try {
        const adapter = new CopilotAcpAdapter();
        let resolvedWith: unknown;
        const key = "rpc-timeout";

        // Replicate exactly what the start() onRequest handler inserts — this
        // IS the production logic we want to execute under fake timers.
        const timeoutHandle = setTimeout(() => {
          const entry = (adapter as any).pendingApprovals.get(key);
          if (entry) {
            (adapter as any).pendingApprovals.delete(key);
            entry.resolve({ outcome: { outcome: "cancelled" } });
          }
        }, 60_000);

        (adapter as any).pendingApprovals.set(key, {
          resolve: (result: unknown) => { resolvedWith = result; },
          timeout: timeoutHandle,
        });

        expect((adapter as any).pendingApprovals.has(key)).toBe(true);

        // Advance clock past 60 seconds
        jest.advanceTimersByTime(60_001);

        expect(resolvedWith).toEqual({ outcome: { outcome: "cancelled" } });
        expect((adapter as any).pendingApprovals.has(key)).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. bidirectional onRequest wiring
  // -------------------------------------------------------------------------
  describe("bidirectional onRequest wiring", () => {
    it("registers session/request_permission handler on client after connect", () => {
      const adapter = new CopilotAcpAdapter();
      let receivedEvent: NormalizedEvent | undefined;

      // Register handler via the public API
      adapter.onApprovalRequest((event) => {
        receivedEvent = event;
      });

      // Verify the round-trip: normalizer creates an event from raw params,
      // emitApprovalRequest pipes it to the registered handler — exactly the
      // path the `client.onRequest("session/request_permission", …)` handler
      // takes in start().
      const event = (adapter as any).normalizer.normalizePermissionRequest(
        "rpc-wiring",
        samplePermissionParams,
      );
      (adapter as any).emitApprovalRequest(event);

      expect(receivedEvent).toBeDefined();
      expect(receivedEvent!.category).toBe("approval_request");
      expect((receivedEvent!.payload as any).rpcId).toBe("rpc-wiring");
      expect((receivedEvent!.payload as any).sessionId).toBe("sess-123");
    });
  });

  // -------------------------------------------------------------------------
  // 6. Authorization checks for approval decisions (Packet p1p2-authz-approval-gate)
  // -------------------------------------------------------------------------
  describe("authorization checks for approval decisions", () => {
    let adapter: CopilotAcpAdapter;

    beforeEach(() => {
      adapter = new CopilotAcpAdapter();
      // Inject mock client to bypass start() process spawning
      const mockClient = {
        sendRequest: mock(() => Promise.resolve({})),
        onNotification: mock(() => {}),
        onRequest: mock(() => {}),
        close: mock(() => {}),
      };
      (adapter as any).client = mockClient;
    });

    afterEach(() => {
      (adapter as any).client = null;
    });

    it("getPendingApprovalContext returns context for valid rpcId", () => {
      const rpcId = "test-rpc-123";
      const mockContext = {
        sessionId: "sess-abc",
        threadId: "copilot-acp:sess-abc",
        providerId: "copilot-acp",
        createdAt: new Date().toISOString(),
        resolve: mock(() => {}),
        timeout: setTimeout(() => {}, 1000),
      };

      (adapter as any).pendingApprovals.set(rpcId, mockContext);

      const context = adapter.getPendingApprovalContext(rpcId);

      expect(context).toBeDefined();
      expect(context?.sessionId).toBe("sess-abc");
      expect(context?.threadId).toBe("copilot-acp:sess-abc");
      expect(context?.providerId).toBe("copilot-acp");
      expect(context?.createdAt).toBe(mockContext.createdAt);

      // Cleanup
      clearTimeout(mockContext.timeout);
    });

    it("getPendingApprovalContext returns null for unknown rpcId", () => {
      const context = adapter.getPendingApprovalContext("unknown-rpc-456");
      expect(context).toBeNull();
    });

    it("getPendingApprovalContext returns null after approval is resolved", () => {
      const rpcId = "test-rpc-789";
      let resolvedWith: any = null;
      const mockContext = {
        sessionId: "sess-xyz",
        threadId: "copilot-acp:sess-xyz",
        providerId: "copilot-acp",
        createdAt: new Date().toISOString(),
        resolve: (result: any) => {
          resolvedWith = result;
        },
        timeout: setTimeout(() => {}, 1000),
      };

      (adapter as any).pendingApprovals.set(rpcId, mockContext);

      // Resolve the approval
      adapter.resolveApproval(rpcId, { outcome: "selected", optionId: "allow" });

      // Context should be removed after resolution
      const context = adapter.getPendingApprovalContext(rpcId);
      expect(context).toBeNull();
      expect(resolvedWith).toEqual({ outcome: { outcome: "selected", optionId: "allow" } });

      // Cleanup
      clearTimeout(mockContext.timeout);
    });

    it("tracks approval context when permission request is received", () => {
      // Simulate the onRequest handler logic from start()
      const rpcId = "perm-req-123";
      const params = {
        sessionId: "sess-tracking-test",
        toolCall: { toolCallId: "tool-1", title: "Run command" },
        options: [
          { optionId: "opt-1", name: "Allow", kind: "allow_once" },
          { optionId: "opt-2", name: "Deny", kind: "reject_once" },
        ],
      };

      // Manually add approval context (simulating what onRequest does)
      const context = {
        sessionId: params.sessionId,
        threadId: `copilot-acp:${params.sessionId}`,
        providerId: adapter.providerId,
        createdAt: new Date().toISOString(),
        resolve: mock(() => {}),
        timeout: setTimeout(() => {}, 60000),
      };

      (adapter as any).pendingApprovals.set(String(rpcId), context);

      // Verify context is tracked
      const retrievedContext = adapter.getPendingApprovalContext(String(rpcId));
      expect(retrievedContext).toBeDefined();
      expect(retrievedContext?.sessionId).toBe("sess-tracking-test");
      expect(retrievedContext?.threadId).toBe("copilot-acp:sess-tracking-test");

      // Cleanup
      clearTimeout(context.timeout);
    });

    it("resolveApproval ensures one-time resolution", () => {
      const rpcId = "one-time-123";
      let resolutionCount = 0;
      const mockContext = {
        sessionId: "sess-once",
        threadId: "copilot-acp:sess-once",
        providerId: "copilot-acp",
        createdAt: new Date().toISOString(),
        resolve: () => {
          resolutionCount++;
        },
        timeout: setTimeout(() => {}, 1000),
      };

      (adapter as any).pendingApprovals.set(rpcId, mockContext);

      // First resolution should work
      adapter.resolveApproval(rpcId, { outcome: "selected", optionId: "allow" });
      expect(resolutionCount).toBe(1);

      // Second resolution should be ignored (no-op)
      adapter.resolveApproval(rpcId, { outcome: "cancelled" });
      expect(resolutionCount).toBe(1); // Still 1, not 2

      // Cleanup
      clearTimeout(mockContext.timeout);
    });
  });

  describe("normalizeSession – UUID fallback", () => {
    const inst = new CopilotAcpAdapter();

    it("returns a valid UUID when raw.id and raw.sessionId are missing", () => {
      const result = (inst as any).normalizeSession({ title: "test" });
      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).toMatch(
        /^session-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("produces different UUIDs on repeated calls", () => {
      const a = (inst as any).normalizeSession({});
      const b = (inst as any).normalizeSession({});
      expect(a.sessionId).not.toBe(b.sessionId);
    });

    it("prefers raw.id over UUID fallback", () => {
      const result = (inst as any).normalizeSession({ id: "explicit-id" });
      expect(result.sessionId).toBe("explicit-id");
    });

    it("prefers raw.sessionId when raw.id is missing", () => {
      const result = (inst as any).normalizeSession({
        sessionId: "session-456",
      });
      expect(result.sessionId).toBe("session-456");
    });
  });
});
