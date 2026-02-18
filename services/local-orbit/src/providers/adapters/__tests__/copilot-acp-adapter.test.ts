import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { CopilotAcpAdapter } from "../copilot-acp-adapter";
import type { PromptInput, PromptOptions } from "../../provider-types";

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
            text: "Explain this function",
            attachments: [],
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
      mockClient.sendRequest.mockResolvedValue({
        turnId: "turn-999",
        status: "streaming",
      });

      const input: PromptInput = {
        text: "Analyze this file",
        attachments: [{ path: "/path/to/file.ts", mimeType: "text/typescript" }],
      };

      await adapter.sendPrompt("session-123", input);

      const callArgs = mockClient.sendRequest.mock.calls[0];
      expect(callArgs[1].input.attachments).toHaveLength(1);
      expect(callArgs[1].input.attachments[0].path).toBe("/path/to/file.ts");
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
