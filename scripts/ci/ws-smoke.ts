const BASE = process.env.CI_BASE_URL || "http://127.0.0.1:8790";
const TOKEN = process.env.CI_TOKEN || "ci-token";

function wsUrl(path: string): string {
  const u = new URL(BASE);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = path;
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
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(t);
      reject(new Error(`${label}: error while opening`));
    });
  });

  return ws;
}

async function waitForHello(ws: WebSocket, label: string) {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: hello timeout`)), 5000);
    const onMsg = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg?.type === "orbit.hello") {
          ws.removeEventListener("message", onMsg);
          clearTimeout(t);
          resolve();
        }
      } catch {
        // ignore
      }
    };
    ws.addEventListener("message", onMsg);
  });
}

async function waitForMessage(ws: WebSocket, pred: (msg: any) => boolean, label: string) {
  return await new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: message timeout`)), 5000);
    const onMsg = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (pred(msg)) {
          ws.removeEventListener("message", onMsg);
          clearTimeout(t);
          resolve(msg);
        }
      } catch {
        // ignore
      }
    };
    ws.addEventListener("message", onMsg);
  });
}

async function main() {
  const threadId = `ci-thread-${Date.now()}`;

  const client = await openWS("/ws/client", "client");
  const anchor = await openWS("/ws/anchor", "anchor");

  await waitForHello(client, "client");
  await waitForHello(anchor, "anchor");

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

  client.close();
  anchor.close();

  // Give the runtime a moment to flush close frames.
  await sleep(50);
  console.log("ws relay ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
