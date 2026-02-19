/**
 * ACP JSON-RPC Client
 *
 * Implements a JSON-RPC 2.0 client for stdio-based communication with
 * agent control protocol (ACP) servers like GitHub Copilot CLI.
 *
 * Protocol details:
 * - Newline-delimited JSON (NDJSON) over stdio
 * - Request format: {"jsonrpc":"2.0","id":1,"method":"name","params":{}}
 * - Response format: {"jsonrpc":"2.0","id":1,"result":{...}}
 * - Error format: {"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"..."}}
 * - Notifications: {"jsonrpc":"2.0","method":"name","params":{}} (no id field)
 * - Server requests: {"jsonrpc":"2.0","id":1,"method":"name","params":{}} (has BOTH id and method)
 *   These require a response from the client.
 */

import type { ChildProcess } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

/**
 * JSON-RPC 2.0 request
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC 2.0 response
 */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC 2.0 error
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC 2.0 notification (no id field)
 */
export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

/**
 * Pending request tracker
 */
interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
  startTime: number;
}

/**
 * Session-specific event handler
 */
type SessionEventHandler = (notification: JsonRpcNotification) => void;

/**
 * ACP JSON-RPC client for stdio communication.
 *
 * Manages request/response correlation, timeout handling, and NDJSON parsing.
 */
export class AcpClient {
  private process: ChildProcess;
  private nextId = 1;
  private pendingRequests = new Map<number | string, PendingRequest>();
  private notificationHandlers: Array<(notification: JsonRpcNotification) => void> = [];
  private sessionEventHandlers = new Map<string, SessionEventHandler[]>();
  private requestHandlers = new Map<string, (params: unknown, id: string | number) => Promise<unknown> | unknown>();
  private readline: ReadlineInterface | null = null;
  private defaultTimeout: number;

  /**
   * Create an ACP client for the given child process.
   *
   * @param process - Child process with stdio pipes
   * @param defaultTimeout - Default timeout for requests in milliseconds (default: 5000)
   */
  constructor(process: ChildProcess, defaultTimeout: number = 5000) {
    this.process = process;
    this.defaultTimeout = defaultTimeout;
    this.setupStdio();
  }

  /**
   * Setup stdio parsing and event handling
   */
  private setupStdio(): void {
    if (!this.process.stdout) {
      throw new Error("Process stdout is not available");
    }

    // Use readline to parse NDJSON line-by-line
    this.readline = createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    });

    this.readline.on("line", (line: string) => {
      this.handleLine(line);
    });

    // Handle process exit
    this.process.on("exit", (code: number | null) => {
      console.log(`[acp-client] Process exited with code ${code}`);
      this.cleanup();
    });

    // Log stderr for debugging
    if (this.process.stderr) {
      this.process.stderr.on("data", (data: Buffer) => {
        console.error("[acp-client] stderr:", data.toString());
      });
    }
  }

  /**
   * Handle a single line of NDJSON output
   */
  private handleLine(line: string): void {
    if (!line.trim()) {
      return; // Skip empty lines
    }

    try {
      const message = JSON.parse(line);

      // Distinguish server→client requests (has id AND method) from responses (id, no method)
      if ("id" in message && "method" in message) {
        // Server is sending us a request that requires a response
        void this.handleIncomingRequest(message as JsonRpcRequest);
      } else if ("id" in message) {
        this.handleResponse(message as JsonRpcResponse);
      } else if ("method" in message) {
        this.handleNotification(message as JsonRpcNotification);
      } else {
        console.warn("[acp-client] Received unknown message format:", message);
      }
    } catch (err) {
      console.error("[acp-client] Failed to parse JSON:", line, err);
    }
  }

  /**
   * Handle an incoming JSON-RPC request from the server (server → client).
   * Dispatches to registered request handlers and sends back a response.
   */
  private async handleIncomingRequest(request: JsonRpcRequest): Promise<void> {
    const handler = this.requestHandlers.get(request.method);
    if (handler) {
      try {
        const result = await handler(request.params, request.id);
        this.sendResponse(request.id, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[acp-client] Request handler error for ${request.method}:`, err);
        this.sendErrorResponse(request.id, -32603, `Internal error: ${msg}`);
      }
    } else {
      console.warn(`[acp-client] No handler registered for server request method: ${request.method}`);
      this.sendErrorResponse(request.id, -32601, "Method not found");
    }
  }

  /**
   * Send a JSON-RPC response to the server (client → server, in reply to a server request).
   */
  private sendResponse(id: string | number, result: unknown): void {
    if (!this.process.stdin) {
      console.error("[acp-client] Cannot send response: process stdin is not available");
      return;
    }
    try {
      const line = JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n";
      this.process.stdin.write(line, (err?: Error | null) => {
        if (err) {
          console.error(`[acp-client] Failed to write response for id=${id}:`, err);
        }
      });
    } catch (err) {
      console.error(`[acp-client] Failed to serialize response for id=${id}:`, err);
    }
  }

  /**
   * Send a JSON-RPC error response to the server.
   */
  private sendErrorResponse(id: string | number, code: number, message: string): void {
    if (!this.process.stdin) {
      console.error("[acp-client] Cannot send error response: process stdin is not available");
      return;
    }
    try {
      const line = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n";
      this.process.stdin.write(line, (err?: Error | null) => {
        if (err) {
          console.error(`[acp-client] Failed to write error response for id=${id}:`, err);
        }
      });
    } catch (err) {
      console.error(`[acp-client] Failed to serialize error response for id=${id}:`, err);
    }
  }

  /**
   * Handle a JSON-RPC response
   */
  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn(`[acp-client] Received response for unknown request ${response.id}`);
      return;
    }

    // Calculate elapsed time for telemetry
    const elapsed = Date.now() - pending.startTime;
    
    // Log slow responses (>3s) for performance monitoring
    if (elapsed > 3000) {
      console.warn(
        `[acp-client] Slow response: ${pending.method} took ${elapsed}ms (degraded performance)`
      );
    } else if (elapsed > 1000) {
      console.log(
        `[acp-client] ${pending.method} completed in ${elapsed}ms`
      );
    }

    // Clear timeout
    clearTimeout(pending.timer);
    this.pendingRequests.delete(response.id);

    // Resolve or reject based on response
    if (response.error) {
      pending.reject(
        new Error(`JSON-RPC error ${response.error.code}: ${response.error.message}`),
      );
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Handle a JSON-RPC notification
   */
  private handleNotification(notification: JsonRpcNotification): void {
    // Route to session-specific handlers if sessionId is present
    if (notification.method === "update" && notification.params) {
      const params = notification.params as any;
      if (params.sessionId) {
        const sessionHandlers = this.sessionEventHandlers.get(params.sessionId);
        if (sessionHandlers) {
          for (const handler of sessionHandlers) {
            try {
              handler(notification);
            } catch (err) {
              console.error("[acp-client] Session event handler error:", err);
            }
          }
        }
      }
    }

    // Also call global notification handlers
    for (const handler of this.notificationHandlers) {
      try {
        handler(notification);
      } catch (err) {
        console.error("[acp-client] Notification handler error:", err);
      }
    }
  }

  /**
   * Send a JSON-RPC request and wait for response.
   *
   * @param method - JSON-RPC method name
   * @param params - Method parameters (optional)
   * @param timeout - Request timeout in milliseconds (uses default if not specified)
   * @returns Promise resolving to the response result
   * @throws Error if request times out or receives an error response
   */
  async sendRequest(
    method: string,
    params?: unknown,
    timeout?: number,
  ): Promise<unknown> {
    const id = this.nextId++;
    const startTime = Date.now();
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutMs = timeout ?? this.defaultTimeout;

      // Setup timeout with enhanced error message
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        const elapsed = Date.now() - startTime;
        console.warn(
          `[acp-client] Timeout: ${method} (id=${id}) exceeded ${timeoutMs}ms (actual: ${elapsed}ms)`
        );
        reject(
          new Error(
            `ACP operation timed out: ${method} exceeded ${timeoutMs}ms. ` +
            `The provider may be slow or unresponsive.`
          )
        );
      }, timeoutMs);

      // Track pending request with telemetry metadata
      this.pendingRequests.set(id, { resolve, reject, timer, method, startTime });

      // Send request
      if (!this.process.stdin) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(new Error("Process stdin is not available"));
        return;
      }

      try {
        const line = JSON.stringify(request) + "\n";
        this.process.stdin.write(line, (err?: Error | null) => {
          if (err) {
            clearTimeout(timer);
            this.pendingRequests.delete(id);
            reject(new Error(`Failed to write request: ${err.message}`));
          }
        });
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  /**
   * Register a handler for server-initiated JSON-RPC requests.
   * The server sends these when it needs a response from the client
   * (e.g., `session/request_permission` for ACP approvals).
   *
   * @param method - JSON-RPC method name to handle
   * @param handler - Callback invoked with (params, id); may return a value or Promise
   */
  onRequest(method: string, handler: (params: unknown, id: string | number) => Promise<unknown> | unknown): void {
    this.requestHandlers.set(method, handler);
  }

  /**
   * Register a notification handler.
   * Notifications are events from the server that don't have a request ID.
   *
   * @param handler - Callback to invoke for each notification
   */
  onNotification(handler: (notification: JsonRpcNotification) => void): void {
    this.notificationHandlers.push(handler);
  }

  /**
   * Register a handler for specific session's events.
   * These handlers receive only notifications for the specified sessionId.
   *
   * @param sessionId - Session ID to subscribe to
   * @param handler - Callback to invoke for session events
   */
  onSessionEvent(sessionId: string, handler: SessionEventHandler): void {
    if (!this.sessionEventHandlers.has(sessionId)) {
      this.sessionEventHandlers.set(sessionId, []);
    }
    this.sessionEventHandlers.get(sessionId)!.push(handler);
  }

  /**
   * Remove a session event handler.
   *
   * @param sessionId - Session ID to unsubscribe from
   * @param handler - Handler to remove
   */
  offSessionEvent(sessionId: string, handler: SessionEventHandler): void {
    const handlers = this.sessionEventHandlers.get(sessionId);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) {
        handlers.splice(idx, 1);
      }
      // Clean up empty handler arrays
      if (handlers.length === 0) {
        this.sessionEventHandlers.delete(sessionId);
      }
    }
  }

  /**
   * Clean up resources and reject all pending requests
   */
  private cleanup(): void {
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    // Reject all pending requests
    for (const [_id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Process exited before response received"));
    }
    this.pendingRequests.clear();
  }

  /**
   * Close the client and terminate the process
   */
  close(): void {
    this.cleanup();
    if (this.process.stdin) {
      this.process.stdin.end();
    }
  }
}
