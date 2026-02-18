import WebSocket from "ws";

const BASE = process.env.CI_BASE_URL || "http://127.0.0.1:8790";
const TOKEN = process.env.CI_TOKEN || "ci-token";
const MODE = (process.env.CI_WS_SMOKE_MODE || "all").toLowerCase();

function shouldRun(section: "relay" | "capabilities"): boolean {
  if (!MODE || MODE === "all") return true;
  return MODE.split(",").map((part) => part.trim()).includes(section);
}

function wsUrl(path: string): string {
  const u = new URL(BASE);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = path;
  // Pass token via query param so this works in Bun's built-in WebSocket implementation
  // (which may not support custom request headers on all platforms).
  u.searchParams.set("token", TOKEN);
  return u.toString();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function openWS(path: string, label: string): Promise<WebSocket> {
  const url = wsUrl(path);
  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  } as any);

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: open timeout`)), 5000);
    ws.once("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.once("error", (err) => {
      clearTimeout(t);
      reject(new Error(`${label}: error while opening (${String((err as any)?.message || err)})`));
    });
  });

  return ws;
}

async function waitForMessage(ws: WebSocket, pred: (msg: any) => boolean, label: string) {
  return await new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: message timeout`)), 5000);
    const onMsg = (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(String(data));
        if (pred(msg)) {
          ws.off("message", onMsg);
          clearTimeout(t);
          resolve(msg);
        }
      } catch {
        // ignore
      }
    };
    ws.on("message", onMsg);
  });
}

async function sendRpc(ws: WebSocket, msg: any, label: string) {
  ws.send(JSON.stringify(msg));
  return await waitForMessage(ws, (m) => m?.id === msg.id, label);
}

async function runCapabilityChecks(ws: WebSocket) {
  const requestId = Date.now();
  const threadId = `copilot-acp:ci-capability-${requestId}`;
  const resp = await sendRpc(
    ws,
    {
      jsonrpc: "2.0",
      id: requestId,
      method: "thread/delete",
      params: { threadId },
    },
    "capability error response",
  );

  if (!resp?.error || typeof resp.error !== "object") {
    throw new Error("capability check: expected error response");
  }

  if (resp.error.code !== -32000) {
    throw new Error(`capability check: expected code -32000, got ${resp.error.code}`);
  }

  const data = resp.error.data || {};
  if (data.provider !== "copilot-acp") {
    throw new Error(`capability check: expected provider copilot-acp, got ${String(data.provider)}`);
  }
  if (data.capability !== "sendPrompt") {
    throw new Error(`capability check: expected capability sendPrompt, got ${String(data.capability)}`);
  }
  console.log("capability error response ok");
}

async function main() {
  const threadId = `ci-thread-${Date.now()}`;

  const client = await openWS("/ws/client", "client");
  let anchor: WebSocket | null = null;

  if (shouldRun("relay")) {
    anchor = await openWS("/ws/anchor", "anchor");
    // Give the server a moment to finish post-upgrade bookkeeping.
    await sleep(25);

    // 1) Client -> Anchor routing (threadId-specific, no prior subscription)
    const ping = { type: "ci.ping", id: 1, threadId };
    client.send(JSON.stringify(ping));

    await waitForMessage(
      anchor,
      (m) => m?.type === "ci.ping" && m?.id === 1 && m?.threadId === threadId,
      "anchor receive ping",
    );

    // 2) Anchor -> Client routing (RPC-style response w/ id should not be dropped)
    const pong = { type: "ci.pong", id: 1, threadId };
    anchor.send(JSON.stringify(pong));

    await waitForMessage(
      client,
      (m) => m?.type === "ci.pong" && m?.id === 1 && m?.threadId === threadId,
      "client receive pong",
    );
    console.log("ws relay ok");
  }

  if (shouldRun("capabilities")) {
    await runCapabilityChecks(client);
  }

  client.close();
  anchor?.close();

  // Give the runtime a moment to flush close frames.
  await sleep(50);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
