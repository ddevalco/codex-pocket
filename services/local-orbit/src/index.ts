import { hostname, homedir } from "node:os";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { readdir, stat, unlink, mkdir as mkdirAsync, writeFile, rename, access } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { createHash } from "node:crypto";
import { Database } from "bun:sqlite";
import QRCode from "qrcode";
import { createRegistry } from "./providers/registry.js";
import { CodexAdapter, CopilotAcpAdapter, ClaudeAdapter, ClaudeMcpAdapter, OpenCodeAdapter } from "./providers/adapters/index.js";
import { AgentStore } from "./agents/agent-store.js";
import type { PromptInput, PromptAttachment, NormalizedEvent, AcpApprovalPayload } from "./providers/provider-types.js";
import { normalizeAttachment, isValidAttachment } from "./providers/provider-types.js";

// Track thread/list requests for response augmentation
const threadListRequests = new Map<number, number>(); // id -> timestamp

// Local Orbit: a minimal replacement for the Cloudflare Orbit/Auth stack.
//
// Goals:
// - No Cloudflare, no DB, no passkeys.
// - Protect access with a single shared bearer token.
// - Relay JSON messages over WebSocket between "client" (browser) and "anchor" (Mac).
// - Support thread subscriptions like the original Orbit.
//
// Intended exposure pattern:
// - Bind to 127.0.0.1
// - Use `tailscale serve` to expose HTTPS/WSS externally on your tailnet.

const PORT = Number(process.env.CODERELAY_LOCAL_PORT ?? process.env.ZANE_LOCAL_PORT ?? 8790);
const HOST = process.env.CODERELAY_LOCAL_HOST ?? process.env.ZANE_LOCAL_HOST ?? "127.0.0.1";
const CONFIG_JSON_PATH = (process.env.CODERELAY_LOCAL_CONFIG_JSON ?? process.env.ZANE_LOCAL_CONFIG_JSON ?? "").trim();
let AUTH_TOKEN = (process.env.CODERELAY_LOCAL_TOKEN ?? process.env.ZANE_LOCAL_TOKEN ?? "").trim();
const DB_PATH = process.env.CODERELAY_LOCAL_DB ?? process.env.ZANE_LOCAL_DB ?? `${homedir()}/.coderelay/coderelay.db`;
const DB_RETENTION_DAYS = Number(process.env.CODERELAY_LOCAL_RETENTION_DAYS ?? process.env.ZANE_LOCAL_RETENTION_DAYS ?? 14);
const UI_DIST_DIR = process.env.CODERELAY_LOCAL_UI_DIST_DIR ?? process.env.ZANE_LOCAL_UI_DIST_DIR ?? `${process.cwd()}/dist`;
const PUBLIC_ORIGIN = (process.env.CODERELAY_LOCAL_PUBLIC_ORIGIN ?? process.env.ZANE_LOCAL_PUBLIC_ORIGIN ?? "").trim().replace(/\/$/, "");

// Build/version info (best-effort).
// UI_DIST_DIR typically points at <app>/dist, so its parent is the git repo root.
const APP_REPO_DIR = (process.env.CODERELAY_LOCAL_APP_REPO_DIR ?? process.env.ZANE_LOCAL_APP_REPO_DIR ?? dirname(UI_DIST_DIR)).trim();
const APP_COMMIT = (() => {
  const env = (process.env.CODERELAY_LOCAL_APP_COMMIT ?? process.env.ZANE_LOCAL_APP_COMMIT ?? "").trim();
  if (env) return env;
  try {
    const proc = Bun.spawnSync({
      cmd: ["git", "-C", APP_REPO_DIR, "rev-parse", "--short", "HEAD"],
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode === 0) {
      const out = new TextDecoder().decode(proc.stdout as any).trim();
      if (out) return out;
    }
  } catch {
    // ignore
  }
  return "";
})();

let UPLOAD_DIR = (process.env.CODERELAY_LOCAL_UPLOAD_DIR ?? process.env.ZANE_LOCAL_UPLOAD_DIR ?? `${homedir()}/.coderelay/uploads`).trim();
let UPLOAD_RETENTION_DAYS = Number(process.env.CODERELAY_LOCAL_UPLOAD_RETENTION_DAYS ?? process.env.ZANE_LOCAL_UPLOAD_RETENTION_DAYS ?? 0); // 0 = keep forever
const DEFAULT_UPLOAD_PRUNE_INTERVAL_HOURS = 6;
const MIN_UPLOAD_PRUNE_INTERVAL_HOURS = 1;
const MAX_UPLOAD_PRUNE_INTERVAL_HOURS = 168;
let UPLOAD_PRUNE_INTERVAL_HOURS = Number(process.env.CODERELAY_LOCAL_UPLOAD_PRUNE_INTERVAL_HOURS ?? process.env.ZANE_LOCAL_UPLOAD_PRUNE_INTERVAL_HOURS ?? DEFAULT_UPLOAD_PRUNE_INTERVAL_HOURS);
const UPLOAD_MAX_BYTES = Number(process.env.CODERELAY_LOCAL_UPLOAD_MAX_BYTES ?? process.env.ZANE_LOCAL_UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024);
const UPLOAD_URL_TTL_SEC = Number(process.env.CODERELAY_LOCAL_UPLOAD_URL_TTL_SEC ?? process.env.ZANE_LOCAL_UPLOAD_URL_TTL_SEC ?? 7 * 24 * 60 * 60);

const ANCHOR_CWD = process.env.CODERELAY_LOCAL_ANCHOR_CWD ?? process.env.ZANE_LOCAL_ANCHOR_CWD ?? `${process.cwd()}/services/anchor`;
function resolveAnchorCmd(): string {
  const configured = process.env.CODERELAY_LOCAL_ANCHOR_CMD ?? process.env.ZANE_LOCAL_ANCHOR_CMD?.trim();
  if (configured) return configured;

  const candidates: Array<string | null | undefined> = [
    process.execPath,
    (() => {
      try {
        const w = (Bun as any).which;
        return typeof w === "function" ? (w("bun") as string | null | undefined) : undefined;
      } catch {
        return undefined;
      }
    })(),
    `${homedir()}/.bun/bin/bun`,
    "/opt/homebrew/bin/bun",
    "/usr/local/bin/bun",
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (trimmed === "bun") return trimmed;
    if (existsSync(trimmed)) return trimmed;
  }

  return "bun";
}

const ANCHOR_CMD = resolveAnchorCmd();
const ANCHOR_ARGS = ((process.env.CODERELAY_LOCAL_ANCHOR_ARGS ?? process.env.ZANE_LOCAL_ANCHOR_ARGS?.trim()) || "run src/index.ts").split(/\s+/);
const ANCHOR_LOG_PATH = process.env.CODERELAY_LOCAL_ANCHOR_LOG ?? process.env.ZANE_LOCAL_ANCHOR_LOG ?? `${homedir()}/.coderelay/anchor.log`;
const ANCHOR_HOST = process.env.ANCHOR_HOST ?? "127.0.0.1";
const ANCHOR_PORT = Number(process.env.ANCHOR_PORT ?? 8788);
const AUTOSTART_ANCHOR = process.env.CODERELAY_LOCAL_AUTOSTART_ANCHOR ?? process.env.ZANE_LOCAL_AUTOSTART_ANCHOR !== "0";
// A stable anchor id prevents duplicate "devices" when the Anchor reconnects.
// Prefer an explicit env override, otherwise fall back to the machine hostname.
const ANCHOR_ID = (process.env.CODERELAY_LOCAL_ANCHOR_ID ?? process.env.ZANE_LOCAL_ANCHOR_ID ?? hostname()).trim() || "anchor";
const PAIR_TTL_SEC = Number(process.env.CODERELAY_LOCAL_PAIR_TTL_SEC ?? process.env.ZANE_LOCAL_PAIR_TTL_SEC ?? 300);
const PAIR_NEW_RATE_LIMIT_MAX = Number(process.env.CODERELAY_LOCAL_PAIR_RATE_LIMIT_MAX ?? process.env.ZANE_LOCAL_PAIR_RATE_LIMIT_MAX ?? 6);
const PAIR_NEW_RATE_LIMIT_WINDOW_SEC = Number(process.env.CODERELAY_LOCAL_PAIR_RATE_LIMIT_WINDOW_SEC ?? process.env.ZANE_LOCAL_PAIR_RATE_LIMIT_WINDOW_SEC ?? 60);
const UPLOAD_NEW_RATE_LIMIT_MAX = Number(process.env.CODERELAY_LOCAL_UPLOAD_NEW_RATE_LIMIT_MAX ?? process.env.ZANE_LOCAL_UPLOAD_NEW_RATE_LIMIT_MAX ?? 30);
const UPLOAD_NEW_RATE_LIMIT_WINDOW_SEC = Number(process.env.CODERELAY_LOCAL_UPLOAD_NEW_RATE_LIMIT_WINDOW_SEC ?? process.env.ZANE_LOCAL_UPLOAD_NEW_RATE_LIMIT_WINDOW_SEC ?? 60);
const CLI_BIN =
  (process.env.CODERELAY_LOCAL_CLI_BIN ?? process.env.ZANE_LOCAL_CLI_BIN?.trim()) ||
  `${homedir()}/.coderelay/bin/coderelay`;

const CLI_OUTPUT_LIMIT = Number(process.env.CODERELAY_LOCAL_CLI_OUTPUT_LIMIT ?? process.env.ZANE_LOCAL_CLI_OUTPUT_LIMIT ?? 20000);
const CLI_TIMEOUT_MS = Number(process.env.CODERELAY_LOCAL_CLI_TIMEOUT_MS ?? process.env.ZANE_LOCAL_CLI_TIMEOUT_MS ?? 90_000);

const DEFAULT_CONFIG_JSON_PATH = (() => {
  const newPath = join(homedir(), ".coderelay", "config.json");
  const oldPath = join(homedir(), ".codex-pocket", "config.json");
  // Prefer new path, fallback to old if it exists and new does not
  if (!existsSync(newPath) && existsSync(oldPath)) {
    return oldPath;
  }
  return newPath;
})();
const EFFECTIVE_CONFIG_JSON_PATH =
  CONFIG_JSON_PATH || (existsSync(DEFAULT_CONFIG_JSON_PATH) ? DEFAULT_CONFIG_JSON_PATH : "");

function parseUploadPruneIntervalHours(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return null;
  const hours = Math.floor(n);
  if (hours < MIN_UPLOAD_PRUNE_INTERVAL_HOURS || hours > MAX_UPLOAD_PRUNE_INTERVAL_HOURS) return null;
  return hours;
}

function loadConfigJson(): Record<string, unknown> | null {
  if (!EFFECTIVE_CONFIG_JSON_PATH) return null;
  try {
    // Bun.file().textSync() is not available in all Bun versions; use node:fs for sync reads.
    const text = readFileSync(EFFECTIVE_CONFIG_JSON_PATH, "utf8");
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function tokenFromConfigJson(json: Record<string, unknown> | null): string | null {
  if (!json) return null;
  const token = json.token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

function uploadConfigFromConfigJson(json: Record<string, unknown> | null): void {
  if (!json) return;
  const dir = (json.uploadDir as string | undefined) ?? (json.upload_dir as string | undefined);
  if (typeof dir === "string" && dir.trim()) {
    UPLOAD_DIR = dir.trim();
  }
  const rd = (json.uploadRetentionDays as number | string | undefined) ?? (json.upload_retention_days as any);
  const n = typeof rd === "string" ? Number(rd) : typeof rd === "number" ? rd : NaN;
  if (Number.isFinite(n) && n >= 0) {
    UPLOAD_RETENTION_DAYS = n;
  }
  const ph =
    (json.uploadPruneIntervalHours as number | string | undefined) ??
    (json.upload_prune_interval_hours as number | string | undefined);
  const intervalHours = parseUploadPruneIntervalHours(ph);
  if (intervalHours !== null) {
    UPLOAD_PRUNE_INTERVAL_HOURS = intervalHours;
  }
}

const loadedConfig = loadConfigJson();
uploadConfigFromConfigJson(loadedConfig);

// Initialize provider registry
const registry = createRegistry();
const agentStore = new AgentStore(join(homedir(), ".coderelay"));

// Register Codex adapter (placeholder)
registry.register("codex", (cfg) => new CodexAdapter(cfg.extra), {
  enabled: true,
});

// Register Copilot ACP adapter
const providersConfig = (loadedConfig?.providers as Record<string, any>) || {};
const copilotCfg = providersConfig["copilot-acp"] || {};
registry.register(
  "copilot-acp",
  (cfg) => new CopilotAcpAdapter(cfg.extra),
  {
    enabled: copilotCfg.enabled !== false,
    extra: copilotCfg,
  },
);

// Register Claude adapter (foundation-only)
const claudeCfg = providersConfig["claude"] || {};
registry.register(
  "claude",
  (cfg) => new ClaudeAdapter(cfg.extra),
  {
    enabled: claudeCfg.enabled === true, // Disabled by default (explicit opt-in)
    extra: claudeCfg,
  },
);

// Register Claude MCP adapter (local CLI)
const claudeMcpCfg = providersConfig["claude-mcp"] || {};
registry.register(
  "claude-mcp",
  (cfg) => new ClaudeMcpAdapter(cfg.extra),
  {
    enabled: claudeMcpCfg.enabled === true, // Disabled by default (explicit opt-in)
    extra: claudeMcpCfg,
  },
);

// Register OpenCode adapter
const opencodeCfg = providersConfig["opencode"] || {};
registry.register(
  "opencode",
  (cfg) => new OpenCodeAdapter(cfg.extra),
  {
    enabled: opencodeCfg.enabled === true, // Disabled by default (explicit opt-in)
    extra: opencodeCfg,
  },
);

// Prefer config.json (so token rotation persists across restarts), fall back to env.
AUTH_TOKEN = tokenFromConfigJson(loadedConfig) ?? AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error("[local-orbit] Access Token is required (set ZANE_LOCAL_TOKEN or provide ZANE_LOCAL_CONFIG_JSON)");
  process.exit(1);
}

type Role = "client" | "anchor";
type WsData = {
  role: Role;
  anchorId?: string;
  authSource?: "legacy" | "session";
  authScope?: "full" | "read_only";
};

interface AnchorMeta {
  id: string;
  hostname: string;
  platform: string;
  connectedAt: string;
}

type AnchorAuthStatus = "unknown" | "ok" | "invalid";

type AnchorAuthState = {
  status: AnchorAuthStatus;
  at?: string;
  code?: string;
  message?: string;
};

type ReliabilityCounterKey =
  | "wsClientConnected"
  | "wsClientDisconnected"
  | "wsAnchorConnected"
  | "wsAnchorDisconnected"
  | "anchorAuthInvalid"
  | "readOnlyDenied"
  | "rateLimited"
  | "duplicateDropped"
  | "anchorStartFailed"
  | "anchorStopFailed";

type ReliabilityEventKind =
  | "ws_client_connected"
  | "ws_client_disconnected"
  | "ws_anchor_connected"
  | "ws_anchor_disconnected"
  | "anchor_auth_invalid"
  | "read_only_denied"
  | "rate_limited"
  | "duplicate_dropped"
  | "anchor_start_failed"
  | "anchor_stop_failed";

type ReliabilityEvent = {
  ts: string;
  kind: ReliabilityEventKind;
  detail?: string;
};

type DiagnoseCheck = {
  id: string;
  ok: boolean;
  summary: string;
  detail?: string;
};

type CliCommandId =
  | "status"
  | "diagnose"
  | "restart"
  | "start"
  | "stop"
  | "ensure"
  | "self-test"
  | "smoke-test"
  | "logs-server"
  | "logs-anchor"
  | "urls";

type CliCommand = {
  id: CliCommandId;
  label: string;
  args: string[];
  description: string;
  risky?: boolean;
};

// Provider Capability Contract (Phase 4.1: P4-01-A)
interface ProviderCapabilities {
  CAN_ATTACH_FILES: boolean;
  CAN_FILTER_HISTORY: boolean;
  SUPPORTS_APPROVALS: boolean;
  SUPPORTS_STREAMING: boolean;
}

// Default capability sets per provider
const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilities> = {
  codex: {
    CAN_ATTACH_FILES: true,
    CAN_FILTER_HISTORY: true,
    SUPPORTS_APPROVALS: true,
    SUPPORTS_STREAMING: true,
  },
  "copilot-acp": {
    CAN_ATTACH_FILES: true, // P4-03-03 COMPLETE: ACP attachment mapping enabled
    CAN_FILTER_HISTORY: false,
    SUPPORTS_APPROVALS: true,
    SUPPORTS_STREAMING: true,
  },
  claude: {
    CAN_ATTACH_FILES: true,  // Claude supports vision/file attachments
    CAN_FILTER_HISTORY: false,  // Not applicable in foundation phase
    SUPPORTS_APPROVALS: false,  // TBD based on implementation approach
    SUPPORTS_STREAMING: true,  // Claude API supports streaming
  },
  "claude-mcp": {
    CAN_ATTACH_FILES: false,  // CLI vision support TBD
    CAN_FILTER_HISTORY: false,  // Local-only sessions
    SUPPORTS_APPROVALS: false,  // No approval workflow in CLI
    SUPPORTS_STREAMING: true,  // CLI supports JSON streaming
  },
  opencode: {
    CAN_ATTACH_FILES: false,  // TBD based on OpenCode API support
    CAN_FILTER_HISTORY: false,  // TBD
    SUPPORTS_APPROVALS: false,  // TBD
    SUPPORTS_STREAMING: true,  // OpenCode supports streaming
  },
};

function okJson(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function contentTypeForPath(pathname: string): string | null {
  const p = pathname.toLowerCase();
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".json")) return "application/json; charset=utf-8";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".ico")) return "image/x-icon";
  if (p.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (p.endsWith(".woff2")) return "font/woff2";
  if (p.endsWith(".woff")) return "font/woff";
  if (p.endsWith(".ttf")) return "font/ttf";
  return null;
}

function cacheControlForPath(pathname: string): string | null {
  const p = pathname.toLowerCase();
  // Prevent cached index.html from pinning clients to old/broken bundles after updates.
  if (p === "/" || p === "/index.html" || p.endsWith(".html")) return "no-store";
  // Vite build assets are content-addressed, so we can cache them aggressively.
  if (p.startsWith("/assets/")) return "private, max-age=31536000, immutable";
  return null;
}

function requestOrigin(url: URL, req: Request): string {
  // If we're behind a reverse proxy (like `tailscale serve`) then origin should be the externally
  // visible URL, not necessarily what the local process thinks it is.
  // Prefer explicit config, then forwarded headers, then URL host.
  if (PUBLIC_ORIGIN) return PUBLIC_ORIGIN;
  const xfProto = (req.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const xfHost = (req.headers.get("x-forwarded-host") ?? "").split(",")[0].trim();
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`;
  return `${url.protocol}//${url.host}`;
}

type RateLimitBucket = {
  count: number;
  resetAtMs: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

const reliabilityStartedAt = new Date().toISOString();
const reliabilityCounters: Record<ReliabilityCounterKey, number> = {
  wsClientConnected: 0,
  wsClientDisconnected: 0,
  wsAnchorConnected: 0,
  wsAnchorDisconnected: 0,
  anchorAuthInvalid: 0,
  readOnlyDenied: 0,
  rateLimited: 0,
  duplicateDropped: 0,
  anchorStartFailed: 0,
  anchorStopFailed: 0,
};
const reliabilityTimeline: ReliabilityEvent[] = [];
const MAX_RELIABILITY_EVENTS = 80;

function reliabilityRecord(counter: ReliabilityCounterKey, kind: ReliabilityEventKind, detail?: string): void {
  reliabilityCounters[counter] += 1;
  reliabilityTimeline.unshift({ ts: new Date().toISOString(), kind, ...(detail ? { detail } : {}) });
  if (reliabilityTimeline.length > MAX_RELIABILITY_EVENTS) {
    reliabilityTimeline.length = MAX_RELIABILITY_EVENTS;
  }
}

function reliabilitySnapshot() {
  return {
    startedAt: reliabilityStartedAt,
    counters: { ...reliabilityCounters },
    recent: reliabilityTimeline.slice(0, 20),
  };
}

function requestRateLimitKey(req: Request): string {
  const forwarded = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const auth = (req.headers.get("authorization") ?? "").trim();
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (forwarded && token) return `${forwarded}|${token.slice(-8)}`;
  if (forwarded) return forwarded;
  if (token) return `token:${token.slice(-8)}`;
  return (req.headers.get("user-agent") ?? "unknown").slice(0, 64);
}

function enforceRateLimit(scope: string, key: string, max: number, windowSec: number): { ok: true } | { ok: false; retryAfterSec: number } {
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(windowSec) || windowSec <= 0) {
    return { ok: true };
  }
  const now = Date.now();
  const windowMs = Math.floor(windowSec * 1000);
  const bucketKey = `${scope}:${key}`;
  const existing = rateLimitBuckets.get(bucketKey);
  if (!existing || now >= existing.resetAtMs) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAtMs: now + windowMs });
    return { ok: true };
  }
  if (existing.count >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  existing.count += 1;
  // Opportunistic cleanup to avoid unbounded growth.
  if (rateLimitBuckets.size > 2000) {
    for (const [k, v] of rateLimitBuckets) {
      if (now >= v.resetAtMs) rateLimitBuckets.delete(k);
    }
  }
  return { ok: true };
}

function resolveTailscaleCmd(): string | null {
  try {
    const w = (Bun as any).which;
    if (typeof w === "function") {
      const p = w("tailscale") as string | null | undefined;
      if (p) return p;
    }
  } catch {
    // ignore
  }
  const candidates = [
    "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
    "/opt/homebrew/bin/tailscale",
    "/usr/local/bin/tailscale",
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function runCmd(cmd: string, args: string[], timeoutMs = 2500): { ok: boolean; out: string } {
  try {
    const proc = Bun.spawnSync({
      cmd: [cmd, ...args],
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: timeoutMs,
    } as any);
    const out = `${proc.stdout?.toString() ?? ""}${proc.stderr?.toString() ?? ""}`.trim();
    return { ok: proc.exitCode === 0, out };
  } catch (e) {
    return { ok: false, out: e instanceof Error ? e.message : "failed to run" };
  }
}

function parseServeMentionsTarget(out: string, target: string): boolean {
  // Very loose check; output formats vary across Tailscale versions.
  return out.includes(target);
}

const CLI_COMMANDS: CliCommand[] = [
  {
    id: "status",
    label: "Status",
    args: ["status"],
    description: "Fetch /admin/status JSON.",
  },
  {
    id: "diagnose",
    label: "Diagnose",
    args: ["diagnose"],
    description: "One-shot diagnostics (health, ports, tailscale, logs).",
  },
  {
    id: "ensure",
    label: "Ensure",
    args: ["ensure"],
    description: "Best-effort self-heal (validate + safe repairs).",
  },
  {
    id: "self-test",
    label: "Self-test",
    args: ["self-test"],
    description: "Stricter smoke tests (WS relay + events).",
  },
  {
    id: "smoke-test",
    label: "Smoke test",
    args: ["smoke-test"],
    description: "Fast health + admin checks.",
  },
  {
    id: "logs-server",
    label: "Logs: server",
    args: ["logs", "server"],
    description: "Tail server logs.",
  },
  {
    id: "logs-anchor",
    label: "Logs: anchor",
    args: ["logs", "anchor"],
    description: "Tail anchor logs.",
  },
  {
    id: "urls",
    label: "URLs",
    args: ["urls"],
    description: "Print local and tailnet URLs.",
  },
  {
    id: "pair",
    label: "Pair",
    args: ["pair"],
    description: "Mint a short-lived pairing link (prints the URL).",
  },
  {
    id: "open-admin",
    label: "Open Admin",
    args: ["open-admin"],
    description: "Open the Admin UI on the Mac (best-effort).",
    risky: true,
  },
  {
    id: "start",
    label: "Start service",
    args: ["start"],
    description: "Start the service via launchd (or background fallback).",
  },
  {
    id: "stop",
    label: "Stop service",
    args: ["stop"],
    description: "Stop the service (may disconnect this admin session).",
    risky: true,
  },
  {
    id: "restart",
    label: "Restart service",
    args: ["restart"],
    description: "Restart the service (this session may disconnect).",
    risky: true,
  },
];

function findCliCommand(id: string): CliCommand | null {
  const cmd = CLI_COMMANDS.find((c) => c.id === id);
  return cmd ?? null;
}

async function runCliCommand(cmd: CliCommand): Promise<{
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  output: string;
  command: string;
}> {
  const bin = CLI_BIN;
  const command = [bin, ...cmd.args].join(" ");
  try {
    const proc = Bun.spawn({
      cmd: [bin, ...cmd.args],
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, CLI_TIMEOUT_MS);
    const [outBuf, errBuf] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).arrayBuffer(),
    ]);
    const exitCode = await proc.exited.catch(() => null);
    clearTimeout(timeout);
    const out = `${Buffer.from(outBuf).toString()}\n${Buffer.from(errBuf).toString()}`.trim();
    const limited = out.length > CLI_OUTPUT_LIMIT ? out.slice(0, CLI_OUTPUT_LIMIT) + "\n…(truncated)" : out;
    return {
      ok: !timedOut && exitCode === 0,
      exitCode: typeof exitCode === "number" ? exitCode : null,
      timedOut,
      output: limited,
      command,
    };
  } catch (err) {
    return {
      ok: false,
      exitCode: null,
      timedOut: false,
      output: err instanceof Error ? err.message : "failed to run command",
      command,
    };
  }
}

function fixTailscaleServe(): { ok: boolean; detail: string } {
  if (!PUBLIC_ORIGIN) {
    return { ok: false, detail: "PUBLIC_ORIGIN not set (no tailnet URL configured)" };
  }
  const ts = resolveTailscaleCmd();
  if (!ts) return { ok: false, detail: "tailscale CLI not found" };

  const target = wantServeTarget();
  const st = runCmd(ts, ["serve", "status"], 3000);
  if (st.ok && parseServeMentionsTarget(st.out, target)) {
    return { ok: true, detail: "serve already configured" };
  }

  // Best-effort: configure serve in background. This may fail if Serve isn't enabled on the tailnet.
  const cfg = runCmd(ts, ["serve", "--bg", `http://${target}`], 8000);
  if (!cfg.ok) {
    return { ok: false, detail: cfg.out || "tailscale serve failed" };
  }

  const st2 = runCmd(ts, ["serve", "status"], 3000);
  const ok = st2.ok && parseServeMentionsTarget(st2.out, target);
  return { ok, detail: st2.out || cfg.out };
}

function wantServeTarget(): string {
  // Always serve the loopback target; local-orbit is intended to bind to 127.0.0.1.
  return `127.0.0.1:${PORT}`;
}

async function validateSystem(_req: Request, _url: URL): Promise<{ ok: boolean; checks: DiagnoseCheck[] }>{
  const checks: DiagnoseCheck[] = [];

  // Service health is implied by being able to hit this endpoint.
  checks.push({ id: "server", ok: true, summary: `local-orbit reachable at http://${HOST}:${PORT}` });

  // UI dist
  try {
    const distIndexPath = `${UI_DIST_DIR}/index.html`;
    const exists = await Bun.file(distIndexPath).exists().catch(() => false);
    checks.push({
      id: "ui",
      ok: Boolean(exists),
      summary: exists ? "UI dist found" : "UI dist missing",
      detail: `dist: ${UI_DIST_DIR}`,
    });
  } catch (e) {
    checks.push({ id: "ui", ok: false, summary: "UI dist check failed", detail: e instanceof Error ? e.message : "" });
  }

  // DB
  try {
    db.prepare("SELECT 1").get();
    checks.push({ id: "db", ok: true, summary: "SQLite DB reachable", detail: DB_PATH });
  } catch (e) {
    checks.push({ id: "db", ok: false, summary: "SQLite DB error", detail: e instanceof Error ? e.message : "" });
  }

  // Anchor
  const aRunning = isAnchorRunning();
  const aConnected = anchorSockets.size > 0;
  checks.push({
    id: "anchor",
    ok: aRunning && aConnected,
    summary: aRunning
      ? (aConnected ? "Anchor running + connected" : "Anchor running (not connected yet)")
      : "Anchor not running",
    detail: `running=${aRunning} connected=${aConnected} port=${ANCHOR_PORT}`,
  });

  // Uploads dir existence (do not create here; validate should be non-mutating)
  try {
    const exists = UPLOAD_DIR ? existsSync(UPLOAD_DIR) : false;
    checks.push({
      id: "uploads",
      ok: Boolean(UPLOAD_DIR) && exists,
      summary: exists ? "Uploads dir present" : "Uploads dir missing",
      detail: UPLOAD_DIR || "(not configured)",
    });
  } catch (e) {
    checks.push({ id: "uploads", ok: false, summary: "Uploads check failed", detail: e instanceof Error ? e.message : "" });
  }

  // Tailscale (best-effort)
  const ts = resolveTailscaleCmd();
  if (!ts) {
    checks.push({ id: "tailscale", ok: false, summary: "Tailscale CLI not found", detail: "Install Tailscale or add tailscale to PATH." });
  } else {
    const serve = runCmd(ts, ["serve", "status"], 2500);
    checks.push({
      id: "tailscale",
      ok: true,
      summary: "Tailscale CLI found",
      detail: `${ts}${serve.out ? `\n\nserve status:\n${serve.out.slice(0, 2000)}` : ""}`,
    });

    // If we have a public origin, check that serve status mentions our local port.
    if (PUBLIC_ORIGIN) {
      const want = wantServeTarget();
      const mentions = serve.out.includes(want);
      checks.push({
        id: "tailscale-serve",
        ok: mentions,
        summary: mentions ? "tailscale serve appears configured for this port" : "tailscale serve may not be pointing at this service",
        detail: `publicOrigin=${PUBLIC_ORIGIN} want=${want}`,
      });
    }
  }

  const ok = checks.every((c) => c.ok);
  return { ok, checks };
}

function unauth(): Response {
  return new Response("Unauthorised", { status: 401 });
}

function ensureDbDir(path: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // ignore
  }
}

ensureDbDir(DB_PATH);
const db = new Database(DB_PATH);
db.exec(
  "CREATE TABLE IF NOT EXISTS events (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "thread_id TEXT NOT NULL," +
    "turn_id TEXT," +
    "direction TEXT NOT NULL," +
    "role TEXT NOT NULL," +
    "method TEXT," +
    "payload TEXT NOT NULL," +
    "created_at INTEGER NOT NULL" +
  ");" +
  "CREATE INDEX IF NOT EXISTS idx_events_thread_created ON events(thread_id, created_at);" +
  "CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);"
);

db.exec(
  "CREATE TABLE IF NOT EXISTS upload_tokens (" +
    "token TEXT PRIMARY KEY," +
    "path TEXT NOT NULL," +
    "mime TEXT NOT NULL," +
    "bytes INTEGER NOT NULL," +
    "created_at INTEGER NOT NULL," +
    "expires_at INTEGER NOT NULL" +
  ");" +
  "CREATE INDEX IF NOT EXISTS idx_upload_tokens_expires ON upload_tokens(expires_at);"
);

db.exec(
  "CREATE TABLE IF NOT EXISTS token_sessions (" +
    "id TEXT PRIMARY KEY," +
    "token_hash TEXT NOT NULL UNIQUE," +
    "label TEXT NOT NULL," +
    "mode TEXT NOT NULL DEFAULT 'full'," +
    "created_at INTEGER NOT NULL," +
    "last_used_at INTEGER NOT NULL," +
    "revoked_at INTEGER" +
  ");" +
  "CREATE INDEX IF NOT EXISTS idx_token_sessions_revoked ON token_sessions(revoked_at);"
);
try {
  db.exec("ALTER TABLE token_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'full';");
} catch {
  // already migrated
}

// Run FTS5 and thread metadata migrations
try {
  const fts5Migration = Bun.file(join(process.cwd(), "migrations", "002_add_fts5_search.sql"));
  if (await fts5Migration.exists()) {
    const sql = await fts5Migration.text();
    db.exec(sql);
  }
} catch (e) {
  // FTS5 may already exist or not supported, log and continue
  console.warn("[db] FTS5 migration skipped:", e instanceof Error ? e.message : String(e));
}

const insertEvent = db.prepare(
  "INSERT INTO events (thread_id, turn_id, direction, role, method, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
);

const insertUploadToken = db.prepare(
  "INSERT INTO upload_tokens (token, path, mime, bytes, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
);

const getUploadToken = db.prepare(
  "SELECT token, path, mime, bytes, created_at, expires_at FROM upload_tokens WHERE token = ?"
);

const deleteUploadToken = db.prepare("DELETE FROM upload_tokens WHERE token = ?");

const insertTokenSession = db.prepare(
  "INSERT INTO token_sessions (id, token_hash, label, mode, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL)"
);

const getTokenSessionByHash = db.prepare(
  "SELECT id, label, mode, created_at, last_used_at, revoked_at FROM token_sessions WHERE token_hash = ? LIMIT 1"
);

const touchTokenSessionLastUsed = db.prepare(
  "UPDATE token_sessions SET last_used_at = ? WHERE id = ?"
);

const listTokenSessions = db.prepare(
  "SELECT id, label, mode, created_at, last_used_at, revoked_at FROM token_sessions ORDER BY created_at DESC"
);

const revokeTokenSession = db.prepare(
  "UPDATE token_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL"
);

const countTokenSessions = db.prepare(
  "SELECT COUNT(*) as n FROM token_sessions"
);

const countActiveTokenSessions = db.prepare(
  "SELECT COUNT(*) as n FROM token_sessions WHERE revoked_at IS NULL"
);

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function getTokenSessionStats(): { total: number; active: number } {
  try {
    const total = Number((countTokenSessions.get() as { n?: number } | null)?.n ?? 0);
    const active = Number((countActiveTokenSessions.get() as { n?: number } | null)?.n ?? 0);
    return { total, active };
  } catch {
    return { total: 0, active: 0 };
  }
}

function logAdmin(message: string): void {
  const entry = {
    ts: new Date().toISOString(),
    direction: "admin",
    message: { type: "admin.log", message },
  };
  try {
    insertEvent.run(
      "admin",
      null,
      "server",
      "client",
      "admin.log",
      JSON.stringify(entry),
      nowSec()
    );
  } catch {
    // ignore
  }
}

function pruneOldEvents(): void {
  if (!Number.isFinite(DB_RETENTION_DAYS) || DB_RETENTION_DAYS <= 0) return;
  const cutoff = Math.floor(Date.now() / 1000) - DB_RETENTION_DAYS * 24 * 60 * 60;
  try {
    db.prepare("DELETE FROM events WHERE created_at < ?").run(cutoff);
  } catch {
    // ignore
  }
}

async function ensureUploadDir(): Promise<void> {
  try {
    await mkdirAsync(UPLOAD_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

async function pruneUploads(): Promise<void> {
  // Retention disabled (keep forever)
  if (!Number.isFinite(UPLOAD_RETENTION_DAYS) || UPLOAD_RETENTION_DAYS <= 0) return;
  const cutoffMs = Date.now() - UPLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  try {
    await ensureUploadDir();
    const entries = await readdir(UPLOAD_DIR);
    let deleted = 0;
    for (const name of entries) {
      const p = join(UPLOAD_DIR, name);
      let st;
      try {
        st = await stat(p);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      if (st.mtimeMs < cutoffMs) {
        try {
          await unlink(p);
          deleted += 1;
        } catch {
          // ignore
        }
      }
    }
    if (deleted > 0) {
      logAdmin(`upload retention: deleted ${deleted} file(s) older than ${UPLOAD_RETENTION_DAYS} day(s)`);
    }
  } catch {
    // ignore
  }
}

type UploadStats = {
  fileCount: number;
  totalBytes: number;
  oldestAt: string | null;
  newestAt: string | null;
  lastPruneAt: string | null;
  lastPruneMessage: string | null;
  lastPruneSource: "manual" | "scheduled" | "unknown" | null;
};

async function getUploadStats(): Promise<UploadStats> {
  await ensureUploadDir();
  let fileCount = 0;
  let totalBytes = 0;
  let oldestMs = Number.POSITIVE_INFINITY;
  let newestMs = 0;
  try {
    const entries = await readdir(UPLOAD_DIR);
    for (const name of entries) {
      const p = join(UPLOAD_DIR, name);
      let st;
      try {
        st = await stat(p);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      fileCount += 1;
      totalBytes += st.size;
      if (st.mtimeMs < oldestMs) oldestMs = st.mtimeMs;
      if (st.mtimeMs > newestMs) newestMs = st.mtimeMs;
    }
  } catch {
    // treat as empty on read error
  }

  const row = db
    .prepare(
      "SELECT created_at, payload FROM events WHERE thread_id = ? AND method = ? AND payload LIKE ? ORDER BY created_at DESC LIMIT 1"
    )
    .get("admin", "admin.log", "%upload retention:%") as null | { created_at?: number; payload?: string };

  let lastPruneMessage: string | null = null;
  let lastPruneSource: "manual" | "scheduled" | "unknown" | null = null;
  if (row?.payload) {
    try {
      const parsed = JSON.parse(row.payload) as { message?: { message?: string } };
      const msg = parsed?.message?.message;
      if (typeof msg === "string" && msg.trim()) {
        lastPruneMessage = msg.trim();
        if (lastPruneMessage.includes("manual prune")) {
          lastPruneSource = "manual";
        } else if (lastPruneMessage.includes("deleted")) {
          lastPruneSource = "scheduled";
        } else {
          lastPruneSource = "unknown";
        }
      }
    } catch {
      // ignore parse errors; keep null fields
    }
  }

  const toIso = (ms: number): string | null =>
    Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;

  return {
    fileCount,
    totalBytes,
    oldestAt: oldestMs !== Number.POSITIVE_INFINITY ? toIso(oldestMs) : null,
    newestAt: newestMs > 0 ? toIso(newestMs) : null,
    lastPruneAt:
      row && typeof row.created_at === "number" && row.created_at > 0
        ? new Date(row.created_at * 1000).toISOString()
        : null,
    lastPruneMessage,
    lastPruneSource,
  };
}

function pruneExpiredUploadTokens(): void {
  try {
    db.prepare("DELETE FROM upload_tokens WHERE expires_at < ?").run(nowSec());
  } catch {
    // ignore
  }
}

let uploadPruneTimer: ReturnType<typeof setInterval> | null = null;

function scheduleUploadPrune(): void {
  if (uploadPruneTimer) {
    clearInterval(uploadPruneTimer);
    uploadPruneTimer = null;
  }
  const hours = parseUploadPruneIntervalHours(UPLOAD_PRUNE_INTERVAL_HOURS) ?? DEFAULT_UPLOAD_PRUNE_INTERVAL_HOURS;
  UPLOAD_PRUNE_INTERVAL_HOURS = hours;
  uploadPruneTimer = setInterval(() => void pruneUploads(), hours * 60 * 60 * 1000);
  uploadPruneTimer.unref?.();
}

setInterval(pruneOldEvents, 6 * 60 * 60 * 1000).unref?.();
scheduleUploadPrune();
setInterval(pruneExpiredUploadTokens, 10 * 60 * 1000).unref?.();
pruneOldEvents();
void pruneUploads();
pruneExpiredUploadTokens();

let anchorProc: Bun.Subprocess | null = null;

function isAnchorRunning(): boolean {
  return Boolean(anchorProc && anchorProc.exitCode === null);
}

function startAnchor(): { ok: boolean; error?: string } {
  if (isAnchorRunning()) return { ok: true };
  try {
    mkdirSync(dirname(ANCHOR_LOG_PATH), { recursive: true });
    // Ensure the log reflects the current run; stale log tails have been a major debugging footgun.
    try {
      writeFileSync(ANCHOR_LOG_PATH, "");
    } catch {
      // ignore
    }
    const out = Bun.file(ANCHOR_LOG_PATH);

    // Anchor will connect back to this local-orbit instance as its Orbit endpoint.
    // Token is passed via ZANE_ANCHOR_JWT_SECRET and appended as ?token=... by our patched Anchor buildOrbitUrl().
    anchorProc = Bun.spawn({
      cmd: [ANCHOR_CMD, ...ANCHOR_ARGS],
      cwd: ANCHOR_CWD,
      stdin: "ignore",
      stdout: out,
      stderr: out,
      env: {
        ...process.env,
        ANCHOR_HOST,
        ANCHOR_PORT: String(ANCHOR_PORT),
        ANCHOR_ORBIT_URL: `ws://127.0.0.1:${PORT}/ws/anchor?anchorId=${encodeURIComponent(ANCHOR_ID)}`,
        ZANE_ANCHOR_JWT_SECRET: AUTH_TOKEN,
      },
    });
    anchorProc.exited.then(() => {
      anchorProc = null;
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to start anchor" };
  }
}

function stopAnchor(): { ok: boolean; error?: string } {
  if (!isAnchorRunning()) return { ok: true };
  try {
    anchorProc!.kill("SIGTERM");
    anchorProc = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to stop anchor" };
  }
}

function randomPairCode(): string {
  // Crockford-ish base32 without ambiguous chars.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const pairCodes = new Map<string, { token: string; sessionId?: string; expiresAt: number }>();

function prunePairCodes(): void {
  const now = Date.now();
  for (const [code, rec] of pairCodes) {
    if (now > rec.expiresAt) {
      pairCodes.delete(code);
      if (rec.sessionId) {
        try {
          revokeTokenSession.run(nowSec(), rec.sessionId);
        } catch {
          // ignore
        }
      }
    }
  }
}

setInterval(prunePairCodes, 60_000).unref?.();

type TokenSessionRow = {
  id: string;
  label: string;
  mode: "full" | "read_only";
  created_at: number;
  last_used_at: number;
  revoked_at: number | null;
};

function parseTokenSessionMode(mode: unknown): "full" | "read_only" {
  return mode === "read_only" ? "read_only" : "full";
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sanitizeSessionLabel(label: string | null | undefined): string {
  const raw = (label ?? "").trim();
  if (!raw) return `Device ${new Date().toISOString()}`;
  return raw.slice(0, 120);
}

function mintTokenSession(label: string, mode: "full" | "read_only"): { id: string; token: string; row: TokenSessionRow } {
  const token = randomTokenHex(32);
  const tokenHash = hashToken(token);
  const id = randomTokenHex(16);
  const createdAt = nowSec();
  const nextLabel = sanitizeSessionLabel(label);
  const nextMode = parseTokenSessionMode(mode);
  insertTokenSession.run(id, tokenHash, nextLabel, nextMode, createdAt, createdAt);
  return {
    id,
    token,
    row: {
      id,
      label: nextLabel,
      mode: nextMode,
      created_at: createdAt,
      last_used_at: createdAt,
      revoked_at: null,
    },
  };
}

type AuthContext =
  | { ok: true; mode: "legacy" }
  | { ok: true; mode: "session"; sessionId: string; sessionMode: "full" | "read_only" }
  | { ok: false };

function getBearer(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

function authContext(req: Request): AuthContext {
  const provided =
    getBearer(req) ??
    (() => {
      try {
        return new URL(req.url).searchParams.get("token");
      } catch {
        return null;
      }
    })();
  if (!provided) return { ok: false };
  if (timingSafeEqual(provided, AUTH_TOKEN)) return { ok: true, mode: "legacy" };
  try {
    const row = getTokenSessionByHash.get(hashToken(provided)) as TokenSessionRow | null;
    if (!row || row.revoked_at) return { ok: false };
    try {
      touchTokenSessionLastUsed.run(nowSec(), row.id);
    } catch {
      // ignore touch failures
    }
    return { ok: true, mode: "session", sessionId: row.id, sessionMode: parseTokenSessionMode(row.mode) };
  } catch {
    return { ok: false };
  }
}

function authorised(req: Request): boolean {
  const ctx = authContext(req);
  if (!ctx.ok) return false;
  if (ctx.mode !== "session") return true;
  if (ctx.sessionMode !== "read_only") return true;
  const method = req.method.toUpperCase();
  return method === "GET" || method === "HEAD";
}

function randomTokenHex(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function persistTokenToConfigJson(nextToken: string): void {
  if (!EFFECTIVE_CONFIG_JSON_PATH) return;
  try {
    const text = Bun.file(EFFECTIVE_CONFIG_JSON_PATH).textSync();
    const json = JSON.parse(text) as Record<string, unknown>;
    json.token = nextToken;
    Bun.write(EFFECTIVE_CONFIG_JSON_PATH, JSON.stringify(json, null, 2) + "\n");
  } catch {
    // ignore
  }
}

function redactSensitive(text: string): string {
  let out = text;
  if (AUTH_TOKEN) out = out.split(AUTH_TOKEN).join("<redacted-token>");
  // Also redact any obvious 64-hex tokens that might be logged/copied.
  out = out.replace(/\b[a-f0-9]{64}\b/gi, "<redacted-hex>");
  return out;
}

function closeAllSockets(reason: string): void {
  for (const ws of clientSockets.keys()) {
    try {
      ws.close(1000, reason);
    } catch {
      // ignore
    }
  }
  for (const ws of anchorSockets.keys()) {
    try {
      ws.close(1000, reason);
    } catch {
      // ignore
    }
  }
}

function safeExtFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  if (m === "image/svg+xml") return "svg";
  return "bin";
}

// Avoid leaking token timing; Bun/Node doesn't expose a built-in constant-time compare.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function parseJsonMessage(text: string): Record<string, unknown> | null {
  const t = text.trim();
  if (!t.startsWith("{")) return null;
  try {
    const v = JSON.parse(t);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ========== Provider Config Management ==========

/**
 * Read provider configuration from config.json with API keys masked.
 */
function readProviderConfig(): Record<string, any> {
  const config = loadConfigJson();
  const providers = (config?.providers as Record<string, any>) || {};
  return maskProviderConfig(providers);
}

/**
 * Mask sensitive fields in provider configuration.
 */
function maskProviderConfig(providers: Record<string, any>): Record<string, any> {
  const masked = JSON.parse(JSON.stringify(providers));
  
  // Mask Claude API key
  if (masked.claude?.apiKey && typeof masked.claude.apiKey === 'string' && masked.claude.apiKey.trim()) {
    masked.claude.apiKey = '••••';
  }
  
  return masked;
}

/**
 * Validate provider configuration before writing.
 * Returns { ok: true } or { ok: false, error: string }
 */
function validateProviderConfig(providers: Record<string, any>): { ok: true } | { ok: false; error: string } {
  for (const [providerId, cfg] of Object.entries(providers)) {
    if (!cfg || typeof cfg !== 'object') {
      return { ok: false, error: `Provider ${providerId} config must be an object` };
    }
    
    // Validate Claude config
    if (providerId === 'claude') {
      if (cfg.enabled === true) {
        const key = cfg.apiKey;
        if (!key || typeof key !== 'string' || !key.trim()) {
          return { ok: false, error: 'Claude provider requires non-empty apiKey when enabled' };
        }
      }
      
      if (cfg.timeout !== undefined) {
        const timeout = Number(cfg.timeout);
        if (!Number.isFinite(timeout) || timeout <= 0) {
          return { ok: false, error: 'Claude timeout must be a positive number' };
        }
      }
      
      if (cfg.model !== undefined && typeof cfg.model === 'string' && !cfg.model.trim()) {
        return { ok: false, error: 'Claude model must be non-empty if provided' };
      }
    }
    
    // Validate Claude MCP config
    if (providerId === 'claude-mcp') {
      if (cfg.executablePath !== undefined && typeof cfg.executablePath === 'string' && cfg.executablePath.trim()) {
        // Could add file existence check here if needed
      }
      
      if (cfg.maxTokens !== undefined) {
        const maxTokens = Number(cfg.maxTokens);
        if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
          return { ok: false, error: 'Claude MCP maxTokens must be a positive number' };
        }
      }
      
      if (cfg.promptTimeout !== undefined) {
        const timeout = Number(cfg.promptTimeout);
        if (!Number.isFinite(timeout) || timeout <= 0) {
          return { ok: false, error: 'Claude MCP promptTimeout must be a positive number' };
        }
      }
      
      if (cfg.model !== undefined && typeof cfg.model === 'string' && !cfg.model.trim()) {
        return { ok: false, error: 'Claude MCP model must be non-empty if provided' };
      }
    }
    
    // Validate Copilot ACP config
    if (providerId === 'copilot-acp') {
      if (cfg.executablePath !== undefined && typeof cfg.executablePath === 'string' && cfg.executablePath.trim()) {
        // Could add file existence check here if needed
      }
    }
  }
  
  return { ok: true };
}

/**
 * Write provider configuration to config.json atomically.
 * Deep merges with existing config.
 */
function writeProviderConfig(providers: Record<string, any>): void {
  if (!EFFECTIVE_CONFIG_JSON_PATH) {
    throw new Error('Config path not configured');
  }
  
  // Read existing config
  const config = loadConfigJson() || {};
  const existingProviders = (config.providers as Record<string, any>) || {};
  
  // Deep merge provider configs
  for (const [providerId, newCfg] of Object.entries(providers)) {
    if (!existingProviders[providerId]) {
      existingProviders[providerId] = {};
    }
    Object.assign(existingProviders[providerId], newCfg);
  }
  
  config.providers = existingProviders;
  
  // Write atomically using temp file
  const tempPath = `${EFFECTIVE_CONFIG_JSON_PATH}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    // Atomic rename
    const { renameSync } = require('node:fs');
    renameSync(tempPath, EFFECTIVE_CONFIG_JSON_PATH);
  } catch (err) {
    // Clean up temp file on failure
    try {
      const { unlinkSync } = require('node:fs');
      unlinkSync(tempPath);
    } catch {
      // ignore
    }
    throw err;
  }
}

function extractThreadId(message: Record<string, unknown>): string | null {
  // Some upstreams include thread ids at the top-level (non-RPC envelopes).
  const topLevelCandidates = [(message as any).threadId, (message as any).thread_id];
  for (const c of topLevelCandidates) {
    if (typeof c === "string" && c.trim()) return c;
    if (typeof c === "number") return String(c);
  }

  const params = message.params && typeof message.params === "object" ? (message.params as any) : null;
  const result = message.result && typeof message.result === "object" ? (message.result as any) : null;
  const threadFromParams = params?.thread && typeof params.thread === "object" ? params.thread : null;
  const threadFromTurnParams =
    params?.turn?.thread && typeof params.turn.thread === "object" ? params.turn.thread : null;
  const threadIdFromTurnParams = params?.turn?.threadId ?? params?.turn?.thread_id ?? null;
  const threadIdFromItemParams = params?.item?.threadId ?? params?.item?.thread_id ?? null;
  const threadFromResult = result?.thread && typeof result.thread === "object" ? result.thread : null;
  const threadFromTurnResult =
    result?.turn?.thread && typeof result.turn.thread === "object" ? result.turn.thread : null;
  const threadIdFromTurnResult = result?.turn?.threadId ?? result?.turn?.thread_id ?? null;
  const threadIdFromItemResult = result?.item?.threadId ?? result?.item?.thread_id ?? null;

  const candidates = [
    params?.threadId,
    params?.thread_id,
    threadIdFromTurnParams,
    threadIdFromItemParams,
    result?.threadId,
    result?.thread_id,
    threadIdFromTurnResult,
    threadIdFromItemResult,
    threadFromParams?.id,
    threadFromTurnParams?.id,
    threadFromResult?.id,
    threadFromTurnResult?.id,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
    if (typeof c === "number") return String(c);
  }
  return null;
}

function extractTurnId(message: Record<string, unknown>): string | null {
  const params = message.params && typeof message.params === "object" ? (message.params as any) : null;
  const result = message.result && typeof message.result === "object" ? (message.result as any) : null;
  const candidates = [
    params?.turnId,
    params?.turn_id,
    params?.turn?.id,
    params?.turn?.turnId,
    params?.turn?.turn_id,
    result?.turnId,
    result?.turn_id,
    result?.turn?.id,
    result?.turn?.turnId,
    result?.turn?.turn_id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
    if (typeof c === "number") return String(c);
  }
  return null;
}

function extractMethod(message: Record<string, unknown>): string | null {
  return typeof (message as any).method === "string" ? ((message as any).method as string) : null;
}

const CLIENT_REQUEST_ID_TTL_MS = 10 * 60 * 1000;
const clientRequestIdSeenUntil = new Map<string, number>();

function extractClientRequestId(message: Record<string, unknown>): string | null {
  const raw = (message as any).clientRequestId;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id || null;
}

function shouldDropDuplicateClientRequest(message: Record<string, unknown>): boolean {
  const id = extractClientRequestId(message);
  if (!id) return false;

  const now = Date.now();
  if (clientRequestIdSeenUntil.size > 2000) {
    for (const [k, expiresAt] of clientRequestIdSeenUntil) {
      if (expiresAt <= now) clientRequestIdSeenUntil.delete(k);
    }
  }

  const existing = clientRequestIdSeenUntil.get(id);
  if (existing && existing > now) {
    reliabilityRecord("duplicateDropped", "duplicate_dropped", id.slice(0, 32));
    return true;
  }

  clientRequestIdSeenUntil.set(id, now + CLIENT_REQUEST_ID_TTL_MS);
  return false;
}

function isReadOnlySafeRpcMethod(method: string): boolean {
  const m = method.trim().toLowerCase();
  if (!m) return false;
  const explicit = new Set([
    "thread/list",
    "thread/read",
    "thread/get",
    "thread/messages",
    "thread/events",
    "thread/history",
    "model/list",
    "models/list",
    "health",
    "status",
  ]);
  if (explicit.has(m)) return true;
  if (m.endsWith("/list") || m.endsWith("/get") || m.endsWith("/read") || m.endsWith("/status")) return true;
  return false;
}

function logEvent(direction: "client" | "server", role: Role, messageText: string): void {
  const msg = parseJsonMessage(messageText);
  if (!msg) return;

  // Don't double-store replays.
  if ((msg as any)._replay) return;

  const threadId = extractThreadId(msg);
  if (!threadId) return;

  const turnId = extractTurnId(msg);
  const method = extractMethod(msg);
  const entry = {
    ts: new Date().toISOString(),
    direction,
    message: msg,
  };

  try {
    insertEvent.run(
      threadId,
      turnId,
      direction,
      role,
      method,
      JSON.stringify(entry),
      Math.floor(Date.now() / 1000)
    );
  } catch {
    // ignore
  }
}

function send(ws: WebSocket, data: unknown): void {
  try {
    ws.send(typeof data === "string" ? data : JSON.stringify(data));
  } catch {
    // ignore
  }
}

type ThreadTitleMap = Record<string, string>;

function getCodexGlobalStatePath(): string {
  const env = (Bun.env.CODEX_GLOBAL_STATE_JSON || "").trim();
  if (env) return env;
  const home = (Bun.env.HOME || "").trim();
  if (home) return `${home}/.codex/.codex-global-state.json`;
  return ".codex/.codex-global-state.json";
}

let cachedThreadTitles: { path: string; mtimeMs: number; titles: ThreadTitleMap } | null = null;

async function loadCodexThreadTitles(): Promise<ThreadTitleMap> {
  const path = getCodexGlobalStatePath();
  try {
    const st = await Bun.file(path).stat();
    const mtimeMs = st.mtimeMs ?? 0;
    if (cachedThreadTitles && cachedThreadTitles.path === path && cachedThreadTitles.mtimeMs === mtimeMs) {
      return cachedThreadTitles.titles;
    }
    const text = await Bun.file(path).text();
    const json = JSON.parse(text) as any;
    const titles = (json?.["thread-titles"]?.titles ?? json?.thread_titles?.titles ?? {}) as unknown;
    const out: ThreadTitleMap = {};
    if (titles && typeof titles === "object") {
      for (const [k, v] of Object.entries(titles as Record<string, unknown>)) {
        if (typeof k === "string" && typeof v === "string" && k.trim() && v.trim()) {
          out[k] = v;
        }
      }
    }
    cachedThreadTitles = { path, mtimeMs, titles: out };
    return out;
  } catch {
    cachedThreadTitles = { path, mtimeMs: 0, titles: {} };
    return {};
  }
}

async function withFileLock(lockPath: string, fn: () => Promise<void>): Promise<void> {
  // Best-effort lock: create file exclusively. Retry briefly if another writer holds it.
  const started = Date.now();
  for (;;) {
    try {
      const f = Bun.file(lockPath);
      // Bun doesn't expose O_EXCL directly; emulate by writing only if missing.
      if (!(await f.exists())) {
        await Bun.write(lockPath, String(process.pid ?? "") + "\n");
        break;
      }
    } catch {
      // ignore
    }
    if (Date.now() - started > 2000) throw new Error("Timed out waiting for title lock");
    await new Promise((r) => setTimeout(r, 75));
  }
  try {
    await fn();
  } finally {
    try {
      await Bun.write(lockPath, ""); // ensure it is writable before unlink attempt on some FS
    } catch {
      // ignore
    }
    try {
      await Bun.file(lockPath).delete();
    } catch {
      // ignore
    }
  }
}

async function setCodexThreadTitle(threadId: string, title: string | null): Promise<void> {
  const path = getCodexGlobalStatePath();
  const lockPath = `${path}.lock`;
  const trimmedId = threadId.trim();
  const trimmedTitle = (title ?? "").trim();
  if (!trimmedId) throw new Error("threadId is required");

  await withFileLock(lockPath, async () => {
    const text = await Bun.file(path).text();
    const json = JSON.parse(text) as Record<string, any>;
    json["thread-titles"] = json["thread-titles"] && typeof json["thread-titles"] === "object" ? json["thread-titles"] : {};
    json["thread-titles"].titles =
      json["thread-titles"].titles && typeof json["thread-titles"].titles === "object" ? json["thread-titles"].titles : {};

    if (!trimmedTitle) {
      // Clear title
      try {
        delete json["thread-titles"].titles[trimmedId];
      } catch {
        // ignore
      }
    } else {
      json["thread-titles"].titles[trimmedId] = trimmedTitle;
      // Keep order list populated so Codex can show "recent" titles deterministically.
      if (!Array.isArray(json["thread-titles"].order)) json["thread-titles"].order = [];
      if (!json["thread-titles"].order.includes(trimmedId)) json["thread-titles"].order.unshift(trimmedId);
    }

    const backupPath = `${path}.bak.${Date.now()}`;
    try {
      await Bun.write(backupPath, text);
    } catch {
      // ignore backup failures
    }
    const tmpPath = `${path}.tmp`;
    await Bun.write(tmpPath, JSON.stringify(json, null, 2) + "\n");
    // Atomic-ish replace
    await Bun.file(tmpPath).rename(path);

    // Invalidate title cache so relays pick up the new title immediately.
    cachedThreadTitles = null;
  });
}

async function injectThreadTitles(msg: Record<string, unknown>): Promise<void> {
  const titles = await loadCodexThreadTitles();
  if (!titles || Object.keys(titles).length === 0) return;

  const method = typeof (msg as any).method === "string" ? ((msg as any).method as string) : null;
  const params = (msg as any).params && typeof (msg as any).params === "object" ? (msg as any).params : null;
  const result = (msg as any).result && typeof (msg as any).result === "object" ? (msg as any).result : null;

  const applyToThread = (t: any) => {
    if (!t || typeof t !== "object") return;
    const id = typeof t.id === "string" ? t.id : typeof t.threadId === "string" ? t.threadId : null;
    if (!id) return;
    const title = titles[id];
    if (!title) return;
    // Only fill if upstream didn't already supply one.
    if (typeof t.title !== "string" || !t.title.trim()) t.title = title;
    if (typeof t.name !== "string" || !t.name.trim()) t.name = title;
    if (typeof t.displayName !== "string" || !t.displayName.trim()) t.displayName = title;
  };

  if (method === "thread/started" && params?.thread) {
    applyToThread(params.thread);
    return;
  }

  // Requests may include `method`, but responses generally don't. Handle both.
  if (method === "thread/list" || !method) {
    const rawList: any[] = Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result?.threads)
        ? result.threads
        : Array.isArray(result?.items)
          ? result.items
          : Array.isArray(result)
            ? result
            : [];
    for (const t of rawList) applyToThread(t);
    return;
  }

  if ((method === "thread/get" || method === "thread/read" || !method) && result) {
    if (result.thread) applyToThread(result.thread);
    // Some upstream shapes return the thread object directly
    if (typeof result.id === "string") applyToThread(result);
    return;
  }
}

// Helper: Inject capabilities into thread payloads (Phase 4.1: P4-01-B)
async function injectThreadCapabilities(msg: Record<string, unknown>): Promise<void> {
  const method = typeof (msg as any).method === "string" ? ((msg as any).method as string) : null;
  const params = (msg as any).params && typeof (msg as any).params === "object" ? (msg as any).params : null;
  const result = (msg as any).result && typeof (msg as any).result === "object" ? (msg as any).result : null;

  const applyToThread = (t: any) => {
    if (!t || typeof t !== "object") return;
    
    // Skip if capabilities already present (don't override ACP capabilities)
    if (t.capabilities !== undefined) return;
    
    // Determine provider from thread id or provider field
    const providerId = typeof t.provider === "string" ? t.provider : "codex";
    const threadId = typeof t.id === "string" ? t.id : typeof t.threadId === "string" ? t.threadId : null;
    
    // For provider-prefixed threads (e.g. "copilot-acp:abc", "opencode:xyz"), extract provider from prefix
    let effectiveProvider = providerId;
    if (threadId) {
      const colonIdx = threadId.indexOf(":");
      if (colonIdx > 0) {
        const prefix = threadId.slice(0, colonIdx);
        if (PROVIDER_CAPABILITIES[prefix]) {
          effectiveProvider = prefix;
        }
      }
    }
    
    // Inject appropriate capabilities
    t.capabilities = getProviderCapabilities(effectiveProvider);
  };

  // Handle thread/started notification
  if (method === "thread/started" && params?.thread) {
    applyToThread(params.thread);
    return;
  }

  // Handle thread/list responses (multiple thread list shapes)
  if (method === "thread/list" || !method) {
    const rawList: any[] = Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result?.threads)
        ? result.threads
        : Array.isArray(result?.items)
          ? result.items
          : Array.isArray(result)
            ? result
            : [];
    for (const t of rawList) applyToThread(t);
    return;
  }

  // Handle thread/read and thread/get responses
  if ((method === "thread/get" || method === "thread/read" || !method) && result) {
    if (result.thread) applyToThread(result.thread);
    // Some upstream shapes return the thread object directly
    if (typeof result.id === "string") applyToThread(result);
    return;
  }
}

// State
const clientSockets = new Map<WebSocket, Set<string>>();
const anchorSockets = new Map<WebSocket, Set<string>>();
const threadToClients = new Map<string, Set<WebSocket>>();
const threadToAnchors = new Map<string, Set<WebSocket>>();
const anchorMeta = new Map<WebSocket, AnchorMeta>();
let anchorAuth: AnchorAuthState = { status: "unknown" };

function listAnchors(): AnchorMeta[] {
  return Array.from(anchorMeta.values());
}

function broadcastToClients(data: unknown): void {
  for (const ws of clientSockets.keys()) send(ws, data);
}

/**
 * Validate that a client is authorized to resolve an ACP approval decision.
 * Authorization check ensures the client is subscribed to the approval's thread.
 *
 * @param rpcId - The JSON-RPC request ID from the approval request
 * @param clientWs - The WebSocket connection making the resolution attempt
 * @param adapter - The CopilotAcpAdapter instance
 * @param threadToClients - Map of threadId to subscribed client WebSockets
 * @returns Object with authorized flag and optional reason for denial
 */
function validateApprovalDecisionAuthorization(
  rpcId: string,
  clientWs: WebSocket,
  adapter: CopilotAcpAdapter,
  threadToClients: Map<string, Set<WebSocket>>
): { authorized: boolean; reason?: string } {
  const context = adapter.getPendingApprovalContext(rpcId);
  if (!context) {
    return { authorized: false, reason: "Unknown or expired approval" };
  }

  const threadId = context.threadId;
  const subscribers = threadToClients.get(threadId);
  if (!subscribers?.has(clientWs)) {
    return {
      authorized: false,
      reason: "Client not subscribed to approval thread",
    };
  }

  return { authorized: true };
}

// TODO: Emit helper-agent-outcome events when helper runs complete
// This will be implemented when helper agent infrastructure is added
// Example:
// function emitHelperOutcome(helperRunId: string, result: HelperResult) {
//   const outcome = {
//     kind: 'helper-agent-outcome',
//     agentName: result.agentName,
//     status: result.exitCode === 0 ? 'success' : 'failure',
//     summary: result.summary,
//     touchedFiles: extractTouchedFiles(result.toolEvents),
//     suggestedNextStep: result.suggestedNextStep,
//     helperRunId,
//     timestamp: Date.now()
//   };
//   
//   storeEvent(threadId, outcome);
//   broadcastToClients(threadId, outcome);
// }

function subscribe(role: Role, ws: WebSocket, threadId: string): void {
  const subs = role === "client" ? clientSockets.get(ws) : anchorSockets.get(ws);
  if (!subs) return;
  if (subs.has(threadId)) return;
  subs.add(threadId);

  const idx = role === "client" ? threadToClients : threadToAnchors;
  const set = idx.get(threadId) ?? new Set<WebSocket>();
  set.add(ws);
  idx.set(threadId, set);

  if (role === "client") {
    // Tell anchors a client is watching; anchor uses this to replay pending approvals.
    for (const a of threadToAnchors.get(threadId) ?? []) {
      send(a, { type: "orbit.client-subscribed", threadId });
    }
  }
}

function unsubscribeAll(role: Role, ws: WebSocket): void {
  const subs = role === "client" ? clientSockets.get(ws) : anchorSockets.get(ws);
  if (!subs) return;

  const idx = role === "client" ? threadToClients : threadToAnchors;
  for (const threadId of subs) {
    const set = idx.get(threadId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) idx.delete(threadId);
    }
  }
  subs.clear();
}

// Helper: Check if response is for thread/list
function isThreadListResponse(msg: any, fromAnchor: boolean): boolean {
  if (!fromAnchor || !msg.result) return false;
  if (msg.method === "thread/list") return true;
  if (threadListRequests.has(msg.id)) {
    threadListRequests.delete(msg.id);
    return true;
  }
  return false;
}

// Helper: Find and augment thread list in response
// Iterates ALL registered providers with listSessions capability (Fixes #272)
async function augmentThreadList(response: any): Promise<any> {
  const providerIds = registry.list().filter((id) => id !== "codex"); // Codex threads come from Anchor
  if (providerIds.length === 0) return response;

  // Collect sessions from all capable providers in parallel (error-isolated)
  const results = await Promise.allSettled(
    providerIds.map(async (providerId) => {
      const adapter = registry.get(providerId);
      if (!adapter) return { providerId, sessions: [] };

      // Check capability before calling
      if (!adapter.capabilities.listSessions) {
        return { providerId, sessions: [] };
      }

      const result = await adapter.listSessions();
      return { providerId, sessions: result.sessions || [] };
    }),
  );

  // Map sessions from all providers to thread format
  const allProviderThreads: any[] = [];

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[local-orbit] Provider session listing failed:", result.reason);
      continue;
    }

    const { providerId, sessions } = result.value;
    if (sessions.length === 0) continue;

    const capabilities = getProviderCapabilities(providerId);

    for (const session of sessions) {
      allProviderThreads.push({
        id: `${providerId}:${session.sessionId}`,
        provider: providerId,
        name: session.title,
        title: session.title,
        status: session.status,
        project: session.project,
        repo: session.repo,
        preview: session.preview,
        capabilities,
        created_at: Math.floor(new Date(session.createdAt).getTime() / 1000),
        updated_at: Math.floor(new Date(session.updatedAt).getTime() / 1000),
      });
    }
  }

  if (allProviderThreads.length === 0) return response;

  // Find thread list and append
  const list = response.result?.data || response.result?.threads || response.result || [];
  if (Array.isArray(list)) {
    list.push(...allProviderThreads);
  }

  return response;
}

// Helper: Check if operation is write to ACP session
function isAcpWriteOperation(msg: any): boolean {
  if (!msg.method) return false;

  const writeMethods = ["turn/start", "turn/stop", "thread/rename", "thread/archive", "thread/delete"];
  if (!writeMethods.includes(msg.method)) return false;

  const threadId = msg.params?.threadId || msg.params?.thread_id || msg.params?.id;
  return typeof threadId === "string" && threadId.startsWith("copilot-acp:");
}

function isAcpSendPromptOperation(msg: any): boolean {
  if (!msg || typeof msg !== "object") return false;
  if (msg.method !== "turn/start" && msg.method !== "sendPrompt") return false;
  const threadId = msg.params?.threadId || msg.params?.thread_id || msg.params?.id;
  return typeof threadId === "string" && threadId.startsWith("copilot-acp:");
}

function acpSessionIdFromThreadId(threadId: string): string {
  return threadId.replace(/^copilot-acp:/, "").trim();
}

// Capability Normalization Helper (Phase 4.1: P4-01-A)
// Maps provider id/session source to canonical capability payload
function getProviderCapabilities(providerId: string): ProviderCapabilities {
  // Normalize provider ID: strip session suffix if present (e.g., "copilot-acp:abc123" → "copilot-acp")
  const colonIdx = providerId.indexOf(":");
  const normalizedId = colonIdx > 0 && PROVIDER_CAPABILITIES[providerId.slice(0, colonIdx)]
    ? providerId.slice(0, colonIdx)
    : providerId;

  // For copilot-acp, reflect the adapter's live computed capabilities so that
  // SUPPORTS_APPROVALS tracks `!config.allowAllTools` at runtime.
  if (normalizedId === "copilot-acp") {
    const acpAdapter = registry.get("copilot-acp") as CopilotAcpAdapter | undefined;
    if (acpAdapter) {
      const live = acpAdapter.capabilities as any;
      return {
        ...PROVIDER_CAPABILITIES["copilot-acp"],
        SUPPORTS_APPROVALS: Boolean(live.approvals),
      };
    }
  }
  // Return known provider capabilities, fallback to codex defaults
  return PROVIDER_CAPABILITIES[normalizedId] ?? PROVIDER_CAPABILITIES.codex;
}

function extractPromptText(msg: any): string {
  const params = msg?.params ?? {};
  const direct = [params.message, params.text, params.prompt];
  for (const candidate of direct) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  const input = params.input;
  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && typeof item === "object" && item.type === "text" && typeof item.text === "string" && item.text.trim()) {
        return item.text.trim();
      }
    }
  }

  return "";
}

function acpCanSendPrompt(): boolean {
  const adapter = registry.get("copilot-acp") as any;
  return Boolean(adapter?.capabilities?.sendPrompt);
}

async function routeAcpSendPrompt(msg: any, ws?: WebSocket): Promise<void> {
  if (!ws) return;

  const requestId = msg?.id;
  const threadId = msg?.params?.threadId || msg?.params?.thread_id || msg?.params?.id;
  if (typeof threadId !== "string" || !threadId.startsWith("copilot-acp:")) {
    send(ws, {
      jsonrpc: "2.0",
      id: requestId,
      error: { code: -32602, message: "Invalid ACP threadId" },
    });
    return;
  }

  if (!acpCanSendPrompt()) {
    send(ws, {
      jsonrpc: "2.0",
      id: requestId,
      error: {
        code: -32000,
        message: "Copilot ACP provider does not support sendPrompt",
        data: { provider: "copilot-acp", capability: "sendPrompt" },
      },
    });
    return;
  }

  const text = extractPromptText(msg);
  if (!text) {
    send(ws, {
      jsonrpc: "2.0",
      id: requestId,
      error: { code: -32602, message: "Missing prompt text" },
    });
    return;
  }

  // Extract attachments from various sources
  const params = msg?.params ?? {};
  const rawAttachments: any[] = [];

  // Source 1: params.attachments array
  if (Array.isArray(params.attachments)) {
    rawAttachments.push(...params.attachments);
  }

  // Source 2: params.input.attachments (if input is an object)
  if (params.input && typeof params.input === "object" && !Array.isArray(params.input)) {
    if (Array.isArray(params.input.attachments)) {
      rawAttachments.push(...params.input.attachments);
    }
  }

  // Source 3: Codex-style params.input array with image items
  if (params.input && Array.isArray(params.input)) {
    const imageItems = params.input.filter((item: any) => 
      item && typeof item === "object" && item.type === "image"
    );
    rawAttachments.push(...imageItems);
  }

  // Normalize attachments and filter out invalid ones
  const attachments: PromptAttachment[] = [];
  for (const rawAttachment of rawAttachments) {
    const normalized = normalizeAttachment(rawAttachment);
    if (normalized && isValidAttachment(normalized)) {
      attachments.push(normalized);
    } else if (normalized || rawAttachment) {
      // Log warning but don't fail the request
      console.warn(
        `[local-orbit] Skipping invalid attachment in sendPrompt (thread: ${threadId}):`,
        rawAttachment
      );
    }
  }

  // Construct PromptInput object
  const promptInput: PromptInput = {
    text,
    ...(attachments.length > 0 && { attachments }),
  };

  const startTime = Date.now();
  try {
    const adapter = registry.get("copilot-acp") as any;
    const sessionId = acpSessionIdFromThreadId(threadId);
    const result = await adapter.sendPrompt(sessionId, promptInput);
    
    // Track session locally for CLIs without list_sessions (Fixes #273)
    if (adapter.trackSession) {
      adapter.trackSession(sessionId, {
        preview: text.slice(0, 100),
        status: "active",
      });
    }
    
    const elapsed = Date.now() - startTime;
    
    // Log telemetry for relay performance
    const attachmentInfo = attachments.length > 0 ? `, ${attachments.length} attachment(s)` : "";
    if (elapsed > 15000) {
      console.warn(
        `[local-orbit] Slow ACP sendPrompt relay: ${elapsed}ms (degraded, thread: ${threadId}${attachmentInfo})`
      );
    } else {
      console.log(
        `[local-orbit] ACP sendPrompt relay completed in ${elapsed}ms (thread: ${threadId}${attachmentInfo})`
      );
    }
    
    send(ws, {
      jsonrpc: "2.0",
      id: requestId,
      result: {
        ...(result ?? {}),
        provider: "copilot-acp",
        threadId,
        sessionId,
      },
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Failed to send prompt";
    
    // Enhanced error message for timeout scenarios
    const isTimeout = errorMessage.toLowerCase().includes("timeout");
    const displayMessage = isTimeout
      ? `Request timed out after ${elapsed}ms. The ACP provider may be slow or unresponsive.`
      : errorMessage;
    
    console.error(
      `[local-orbit] ACP sendPrompt failed after ${elapsed}ms (thread: ${threadId}):`,
      errorMessage
    );
    
    send(ws, {
      jsonrpc: "2.0",
      id: requestId,
      error: {
        code: isTimeout ? -32001 : -32002,
        message: displayMessage,
        data: { 
          provider: "copilot-acp", 
          threadId,
          elapsed,
          timeout: isTimeout,
        },
      },
    });
  }
}

/**
 * Broadcast an ACP approval_request event to all WebSocket clients subscribed to the
 * thread for the given sessionId (i.e. `copilot-acp:<sessionId>`).
 */
function broadcastApprovalRequest(sessionId: string, event: NormalizedEvent): void {
  const threadId = `copilot-acp:${sessionId}`;
  const payload = event.payload as AcpApprovalPayload;
  const message = {
    type: "acp:approval_request",
    threadId,
    rpcId: payload.rpcId,
    options: payload.options,
    toolCall: {
      toolCallId: payload.toolCallId,
      title: payload.toolTitle,
      kind: payload.toolKind,
    },
  };
  const clients = threadToClients.get(threadId);
  if (clients && clients.size > 0) {
    for (const ws of clients) send(ws, message);
  } else {
    // No clients subscribed to this thread yet — broadcast to all clients so the
    // UI can present the approval prompt even before the thread is open.
    for (const ws of clientSockets.keys()) send(ws, message);
  }
}

async function relay(fromRole: Role, msgText: string, ws?: any): Promise<void> {
  const msg = parseJsonMessage(msgText);
  if (!msg) return;

  // Local orbit control messages
  if (typeof msg.type === "string" && (msg.type as string).startsWith("orbit.")) {
    if (msg.type === "orbit.subscribe" && typeof msg.threadId === "string") {
      // handled in ws message handler (needs ws + role)
    }
    return;
  }

  if (fromRole === "client" && shouldDropDuplicateClientRequest(msg)) {
    return;
  }

  // Track thread/list requests in client message handler (where messages go to anchor)
  const parsed = msg as any;

  if (fromRole === "client" && isAcpSendPromptOperation(parsed) && acpCanSendPrompt()) {
    await routeAcpSendPrompt(parsed, ws);
    return;
  }

  // Block unsupported write operations to ACP sessions
  if (fromRole === "client" && isAcpWriteOperation(parsed)) {
    if (ws) {
      const errorResponse = {
        jsonrpc: "2.0",
        id: parsed.id,
        error: {
          code: -32000,
          message: "Copilot ACP write operation is not supported",
          data: { provider: "copilot-acp", capability: "sendPrompt" },
        },
      };
      send(ws, errorResponse);
    }
    return; // Don't forward to anchor
  }

  if (fromRole === "client" && parsed.method === "thread/list" && typeof parsed.id === "number") {
    threadListRequests.set(parsed.id, Date.now());
    // Clean old entries (> 30s)
    for (const [id, ts] of threadListRequests) {
      if (Date.now() - ts > 30000) threadListRequests.delete(id);
    }
  }

  // Best-effort: enrich thread objects with Codex desktop thread titles (if present locally).
  // This keeps CodeRelay thread list titles in sync with the Codex desktop UI.
  // Only applies for server->client messages, since titles are a presentation concern.
  let msgOut: string = msgText;
  if (fromRole === "anchor") {
    try {
      let cloned = JSON.parse(msgText) as any;
      await injectThreadTitles(cloned);
      await injectThreadCapabilities(cloned);

      if (isThreadListResponse(cloned, true)) {
        cloned = await augmentThreadList(cloned);
      }

      msgOut = JSON.stringify(cloned);
    } catch {
      // ignore
    }
  }

  const threadId = extractThreadId(msg);
  const targets = fromRole === "client" ? threadToAnchors : threadToClients;

  if (threadId) {
    logEvent(fromRole === "client" ? "client" : "server", fromRole, msgText);
    const set = targets.get(threadId);

    // Important: clients must be able to initiate a thread without an anchor having subscribed yet.
    // If no anchors are subscribed for this thread, fall back to broadcasting to all anchors so the
    // anchor can observe the threadId and subscribe itself.
    if (fromRole === "client" && (!set || set.size === 0)) {
      for (const ws of anchorSockets.keys()) send(ws, msgText);
      return;
    }

    // Symmetric safety: if the anchor responds before the client subscription has been registered,
    // the reply can get dropped, which looks like a "blank thread" in the UI.
    //
    // Only do this for RPC-style responses (presence of `id`), to avoid spamming all clients with
    // background streaming updates for threads they aren't watching.
    if (fromRole === "anchor" && (!set || set.size === 0)) {
      const hasRpcId = typeof (msg as any).id === "number" || typeof (msg as any).id === "string";
      if (hasRpcId) {
        for (const ws of clientSockets.keys()) send(ws, msgOut);
        return;
      }
    }

    for (const ws of set ?? []) send(ws, msgOut);
    return;
  }

  // If no thread id, broadcast to all opposite-role sockets.
  const all = fromRole === "client" ? anchorSockets : clientSockets;
  logEvent(fromRole === "client" ? "client" : "server", fromRole, msgText);
  for (const ws of all.keys()) send(ws, msgOut);
}

// Start all enabled providers
await registry.startAll();

// Wire ACP approval requests: forward to UI clients, route decisions back to adapter.
{
  const acpAdapterForApprovals = registry.get("copilot-acp") as CopilotAcpAdapter | undefined;
  if (acpAdapterForApprovals && typeof acpAdapterForApprovals.onApprovalRequest === "function") {
    acpAdapterForApprovals.onApprovalRequest((event) => {
      const payload = event.payload as AcpApprovalPayload;
      broadcastApprovalRequest(payload.sessionId, event);
    });
    console.log("[local-orbit] ACP approval request handler wired");
  }
}

// Helper to get VS Code globalStorage path
function getVSCodeAgentPath(): string {
  const platform = process.platform;
  let basePath: string;
  
  if (platform === 'darwin') {
    basePath = join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'coderelay.agents');
  } else if (platform === 'linux') {
    basePath = join(homedir(), '.config', 'Code', 'User', 'globalStorage', 'coderelay.agents');
  } else if (platform === 'win32') {
    basePath = join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage', 'coderelay.agents');
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  
  return basePath;
}

const server = Bun.serve<WsData>({
  hostname: HOST,
  port: PORT,
	  async fetch(req, server) {
	    const url = new URL(req.url);

    const isHead = req.method === "HEAD";
    const method = isHead ? "GET" : req.method;

    if (method === "GET" && url.pathname === "/health") {
      const distIndexPath = `${UI_DIST_DIR}/index.html`;
      const distIndexExists = await Bun.file(distIndexPath).exists().catch(() => false);
      const res = okJson({
        status: "ok",
        host: HOST,
        port: PORT,
        hostname: hostname(),
        ui: {
          distDir: UI_DIST_DIR,
          indexExists: distIndexExists,
        },
        clients: clientSockets.size,
        anchors: anchorSockets.size,
        anchor: {
          running: isAnchorRunning(),
          host: ANCHOR_HOST,
          port: ANCHOR_PORT,
          log: ANCHOR_LOG_PATH,
        },
        anchorAuth,
        db: {
          path: DB_PATH,
          retentionDays: DB_RETENTION_DAYS,
        },
        reliability: reliabilitySnapshot(),
        version: { appCommit: APP_COMMIT },
      });
      return isHead ? new Response(null, { status: res.status, headers: res.headers }) : res;
    }

    // Metrics Dashboard API
    if (url.pathname === "/api/metrics" && method === "GET") {
      if (!authorised(req)) return unauth();

      const { searchParams } = url;
      const range = searchParams.get("range") || "7d";
      const provider = searchParams.get("provider") || "all";

      // Convert range to timestamp
      const now = Date.now();
      let startTime: number;

      switch (range) {
        case "24h":
          startTime = now - 24 * 60 * 60 * 1000;
          break;
        case "7d":
          startTime = now - 7 * 24 * 60 * 60 * 1000;
          break;
        case "30d":
          startTime = now - 30 * 24 * 60 * 60 * 1000;
          break;
        case "all":
          startTime = 0;
          break;
        default:
          startTime = now - 7 * 24 * 60 * 60 * 1000;
      }

      try {
        const startSec = Math.floor(startTime / 1000);
        
        // Token usage per provider
        const tokenUsageQuery = db.query(`
          SELECT 
            json_extract(payload, '$.provider') as provider,
            SUM(CAST(json_extract(payload, '$.tokenUsage.totalTokens') AS INTEGER)) as totalTokens,
            SUM(CAST(json_extract(payload, '$.tokenUsage.estimatedCost') AS REAL)) as estimatedCost
          FROM events
          WHERE created_at >= ?
            ${provider !== "all" ? "AND json_extract(payload, '$.provider') = ?" : ""}
            AND json_extract(payload, '$.tokenUsage.totalTokens') IS NOT NULL
          GROUP BY provider
        `);
        
        const params = provider !== "all" ? [startSec, provider] : [startSec];
        const tokenUsage = tokenUsageQuery.all(...params) as any[];
        
        // Thread counts per provider
        const threadCountQuery = db.query(`
          SELECT 
            json_extract(payload, '$.provider') as provider,
            COUNT(DISTINCT thread_id) as threadCount
          FROM events
          WHERE created_at >= ?
            ${provider !== "all" ? "AND json_extract(payload, '$.provider') = ?" : ""}
          GROUP BY provider
        `);
        
        const threadCounts = threadCountQuery.all(...params) as any[];
        
        // Daily usage (for chart)
        const dailyUsageQuery = db.query(`
          SELECT 
            DATE(created_at, 'unixepoch') as day,
            json_extract(payload, '$.provider') as provider,
            SUM(CAST(json_extract(payload, '$.tokenUsage.totalTokens') AS INTEGER)) as tokens
          FROM events
          WHERE created_at >= ?
            ${provider !== "all" ? "AND json_extract(payload, '$.provider') = ?" : ""}
            AND json_extract(payload, '$.tokenUsage.totalTokens') IS NOT NULL
          GROUP BY day, provider
          ORDER BY day ASC
        `);
        
        const dailyUsage = dailyUsageQuery.all(...params) as any[];
        
        // Calculate totals
        const totalTokens = tokenUsage.reduce((sum, row) => sum + (row.totalTokens || 0), 0);
        const totalCost = tokenUsage.reduce((sum, row) => sum + (row.estimatedCost || 0), 0);
        const totalThreads = threadCounts.reduce((sum, row) => sum + (row.threadCount || 0), 0);
        
        return okJson({
          range,
          provider,
          totals: {
            tokens: totalTokens,
            cost: totalCost,
            threads: totalThreads,
          },
          byProvider: tokenUsage.map((row) => ({
            provider: row.provider,
            tokens: row.totalTokens || 0,
            cost: row.estimatedCost || 0,
            threads: threadCounts.find((tc) => tc.provider === row.provider)?.threadCount || 0,
          })),
          dailyUsage: dailyUsage.map((row) => ({
            day: row.day,
            provider: row.provider,
            tokens: row.tokens || 0,
          })),
        });
      } catch (error) {
        console.error("Metrics error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch metrics" }), { status: 500 });
      }
    }

    // Custom Agent Management API
    if (url.pathname.startsWith("/api/agents")) {
      if (!authorised(req)) return unauth();

      // List all agents
      if (url.pathname === "/api/agents" && method === "GET") {
        return okJson(agentStore.listAgents());
      }
      
      // Import agent
      if (url.pathname === "/api/agents/import" && method === "POST") {
        const body = await req.json().catch(() => null);
        const agent = agentStore.importAgent(body);
        if (agent) {
          return okJson(agent);
        }
        return new Response(JSON.stringify({ error: "Invalid agent format" }), { status: 400 });
      }

      // Export agent
      if (url.pathname.match(/^\/api\/agents\/[^/]+\/export$/) && method === "GET") {
        const id = url.pathname.split('/')[3];
        const agent = agentStore.exportAgent(id);
        if (agent) {
           const { sanitizeFilename } = await import('./agents/agent-schema.js');
           const safeName = sanitizeFilename(agent.name);
           return new Response(JSON.stringify(agent, null, 2), {
             headers: {
               "Content-Type": "application/json",
               "Content-Disposition": `attachment; filename="${safeName}"`
             }
           });
        }
        return new Response("Agent not found", { status: 404 });
      }

       // Delete agent
      if (url.pathname.match(/^\/api\/agents\/[^/]+$/) && method === "DELETE") {
        const id = url.pathname.split('/')[3];
        const deleted = agentStore.deleteAgent(id);
        if (deleted) {
          return okJson({ success: true });
        }
        return new Response("Agent not found", { status: 404 });
      }

      // Sync with VS Code
      if (url.pathname.match(/^\/api\/agents\/[^/]+\/sync-vscode$/) && method === "POST") {
        const id = url.pathname.split('/')[3];
        
        try {
          const agent = agentStore.getAgent(id);
          if (!agent) {
             return new Response(JSON.stringify({ error: "Agent not found" }), { status: 404 });
          }
          
          // Get VS Code path
          const vscodePath = getVSCodeAgentPath();
          
          try {
            await mkdirAsync(vscodePath, { recursive: true });
          } catch (err: any) {
             if (err.code === 'EACCES') return new Response(JSON.stringify({ error: 'Permission denied' }), { status: 403 });
             if (err.code === 'ENOENT') return new Response(JSON.stringify({ error: 'Path not found' }), { status: 404 });
             throw err;
          }
          
          const targetPath = join(vscodePath, `${id}.json`);
          const force = url.searchParams.get('force') === 'true';
          
          let fileExists = false;
          try { await access(targetPath); fileExists = true; } catch {}
          
          if (fileExists && !force) {
            return okJson({ success: false, agentId: id, path: targetPath, conflictDetected: true });
          }
          
          const tempPath = join(vscodePath, `.${id}.json.tmp`);
          await writeFile(tempPath, JSON.stringify(agent, null, 2), 'utf-8');
          await rename(tempPath, targetPath);
          
          agent.lastSyncedAt = Date.now();
          agentStore.updateAgent(agent);
          
          return okJson({ success: true, agentId: id, path: targetPath, conflictDetected: fileExists, lastSyncedAt: agent.lastSyncedAt });
        } catch (error: any) {
          console.error('VS Code sync error:', error);
          return new Response(JSON.stringify({ error: `Sync failed: ${error.message}` }), { status: 500 });
        }
      }

      // Batch Sync with VS Code
      if (url.pathname === "/api/agents/sync-all-vscode" && method === "POST") {
        try {
          const agents = agentStore.listAgents();
          const results = [];
          const vscodePath = getVSCodeAgentPath();
          await mkdirAsync(vscodePath, { recursive: true });
          
          let anyUpdated = false;
          
          for (const agent of agents) {
            try {
              const targetPath = join(vscodePath, `${agent.id}.json`);
              // Force overwrite for batch sync? The requirement is "Confirm conflict".
              // Batch sync typically implies "Sync All" which might mean overwrite all or skip existing.
              // The user prompt didn't specify batch conflict handling. "Add Batch Sync Endpoint (Optional but useful)" implementation shows overwrite.
              // I'll stick to overwrite for batch sync to keep it simple as requested in the snippet.
              
              const tempPath = join(vscodePath, `.${agent.id}.json.tmp`);
              await writeFile(tempPath, JSON.stringify(agent, null, 2), 'utf-8');
              await rename(tempPath, targetPath);
              
              agent.lastSyncedAt = Date.now();
              results.push({ id: agent.id, success: true });
              anyUpdated = true;
            } catch (error: any) {
              results.push({ id: agent.id, success: false, error: error.message });
            }
          }
          
          if (anyUpdated) {
            // Bulk save. agentStore.updateAgent saves individually which is inefficient but safe.
            // Since we updated objects in memory, we can just call saveAgents() if exposed or just call updateAgent for the last one?
            // Actually agentStore.updateAgent saves the whole list. calling it in loop is bad.
            // But since I modified agent objects in place (reference), calling saveAgents once is enough.
            // But saveAgents is private in AgentStore class? No, I see public saveAgents() in my read_file output?
            // Let's check agent-store.ts again.
            // It has `public saveAgents(): void`.
            agentStore.saveAgents();
          }
          
          return okJson({
            success: true,
            synced: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
          });
        } catch (error: any) {
           return new Response(JSON.stringify({ error: `Batch sync failed: ${error.message}` }), { status: 500 });
        }
      }
    }

    // Thread Context/Memory Management API (Issue #201)
    if (url.pathname.startsWith("/api/threads")) {
      if (!authorised(req)) return unauth();

      // Search in thread (GET /api/threads/:id/search?q=query)
      if (url.pathname.match(/^\/api\/threads\/[^/]+\/search$/) && method === "GET") {
        const parts = url.pathname.split("/").filter(Boolean);
        const threadId = parts.length >= 2 ? parts[2] : null;
        const query = url.searchParams.get("q");
        
        if (!threadId) {
          return new Response(JSON.stringify({ error: "Thread ID required" }), { status: 400 });
        }
        if (!query || typeof query !== "string" || !query.trim()) {
          return new Response(JSON.stringify({ error: "Query parameter 'q' required" }), { status: 400 });
        }

        try {
          // Check if FTS5 table exists
          const ftsExists = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='events_fts'"
          ).get();
          
          if (!ftsExists) {
            return new Response(JSON.stringify({ error: "Search not available (FTS5 not initialized)" }), { status: 503 });
          }

          const results = db.prepare(`
            SELECT e.id, e.payload, e.created_at, e.method, e.role
            FROM events e
            WHERE e.id IN (
              SELECT rowid FROM events_fts
              WHERE events_fts MATCH ? AND thread_id = ?
              ORDER BY rank
            )
            ORDER BY e.created_at ASC
          `).all(query, threadId) as Array<{ id: number; payload: string; created_at: number; method: string | null; role: string }>;
          
          return okJson({
            query,
            threadId,
            results: results.map(r => ({
              id: r.id,
              ...JSON.parse(r.payload),
              created_at: r.created_at,
              method: r.method,
              role: r.role
            })),
            count: results.length
          });
        } catch (error) {
          console.error("[search] Error:", error);
          return new Response(JSON.stringify({ error: "Search failed", details: error instanceof Error ? error.message : String(error) }), { status: 500 });
        }
      }

      // Export thread (GET /api/threads/:id/export?format=json|markdown)
      if (url.pathname.match(/^\/api\/threads\/[^/]+\/export$/) && method === "GET") {
        const parts = url.pathname.split("/").filter(Boolean);
        const threadId = parts.length >= 2 ? parts[2] : null;
        const format = url.searchParams.get("format") || "json";
        
        if (!threadId) {
          return new Response(JSON.stringify({ error: "Thread ID required" }), { status: 400 });
        }

        try {
          const events = db.prepare(`
            SELECT id, thread_id, turn_id, direction, role, method, payload, created_at
            FROM events
            WHERE thread_id = ?
            ORDER BY created_at ASC
          `).all(threadId) as Array<{
            id: number;
            thread_id: string;
            turn_id: string | null;
            direction: string;
            role: string;
            method: string | null;
            payload: string;
            created_at: number;
          }>;
          
          if (format === "json") {
            const exportData = {
              threadId,
              exportedAt: new Date().toISOString(),
              version: "1.0",
              events: events.map(e => ({
                id: e.id,
                thread_id: e.thread_id,
                turn_id: e.turn_id,
                direction: e.direction,
                role: e.role,
                method: e.method,
                payload: JSON.parse(e.payload),
                created_at: e.created_at
              }))
            };
            const filename = `thread-${threadId.replace(/[^a-zA-Z0-9-]/g, "_")}-${Date.now()}.json`;
            return new Response(JSON.stringify(exportData, null, 2), {
              headers: {
                "Content-Type": "application/json",
                "Content-Disposition": `attachment; filename="${filename}"`
              }
            });
          } else if (format === "markdown") {
            let markdown = `# Thread: ${threadId}\n\nExported: ${new Date().toISOString()}\n\n---\n\n`;
            
            for (const event of events) {
              try {
                const payload = JSON.parse(event.payload);
                const text = payload?.message?.text || payload?.text || "";
                if (text) {
                  const role = event.role || payload?.role || "unknown";
                  const timestamp = new Date(event.created_at * 1000).toISOString();
                  markdown += `## ${role} (${timestamp})\n\n${text}\n\n---\n\n`;
                }
              } catch {
                // Skip malformed events
              }
            }
            
            const filename = `thread-${threadId.replace(/[^a-zA-Z0-9-]/g, "_")}-${Date.now()}.md`;
            return new Response(markdown, {
              headers: {
                "Content-Type": "text/markdown; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}"`
              }
            });
          } else {
            return new Response(JSON.stringify({ error: "Unsupported format (use json or markdown)" }), { status: 400 });
          }
        } catch (error) {
          console.error("[export] Error:", error);
          return new Response(JSON.stringify({ error: "Export failed" }), { status: 500 });
        }
      }

      // Import thread (POST /api/threads/import)
      if (url.pathname === "/api/threads/import" && method === "POST") {
        try {
          const body = await req.json().catch(() => null) as { events?: unknown[] } | null;
          
          if (!body || !body.events || !Array.isArray(body.events)) {
            return new Response(JSON.stringify({ error: "Invalid thread format (expected { events: [...] })" }), { status: 400 });
          }

          const timestamp = Date.now();
          const newThreadId = `imported-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
          
          // Insert all events with new thread ID
          const importedEvents: Array<{ id: number; event: any }> = [];
          for (const event of body.events) {
            const eventId = db.prepare(`
              INSERT INTO events (thread_id, turn_id, direction, role, method, payload, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              RETURNING id
            `).get(
              newThreadId,
              (event as any).turn_id || null,
              (event as any).direction || "client",
              (event as any).role || "user",
              (event as any).method || null,
              typeof (event as any).payload === "string" ? (event as any).payload : JSON.stringify((event as any).payload || event),
              (event as any).created_at || Math.floor(timestamp / 1000)
            ) as { id: number } | undefined;
            
            if (eventId) {
              importedEvents.push({ id: eventId.id, event });
            }
          }
          
          return okJson({
            success: true,
            threadId: newThreadId,
            eventCount: importedEvents.length,
            originalEventCount: body.events.length
          });
        } catch (error) {
          console.error("[import] Error:", error);
          return new Response(JSON.stringify({ error: "Import failed", details: error instanceof Error ? error.message : String(error) }), { status: 500 });
        }
      }

      // Archive thread (PATCH /api/threads/:id/archive)
      if (url.pathname.match(/^\/api\/threads\/[^/]+\/archive$/) && method === "PATCH") {
        const parts = url.pathname.split("/").filter(Boolean);
        const threadId = parts.length >= 2 ? parts[2] : null;
        
        if (!threadId) {
          return new Response(JSON.stringify({ error: "Thread ID required" }), { status: 400 });
        }

        try {
          const body = await req.json().catch(() => null) as { archived?: boolean } | null;
          const archived = body?.archived === true;
          const now = Math.floor(Date.now() / 1000);
          
          // Upsert thread metadata
          db.prepare(`
            INSERT INTO thread_metadata (thread_id, archived, archived_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(thread_id) DO UPDATE SET
              archived = ?,
              archived_at = ?,
              updated_at = ?
          `).run(
            threadId,
            archived ? 1 : 0,
            archived ? now : null,
            now,
            archived ? 1 : 0,
            archived ? now : null,
            now
          );
          
          return okJson({ success: true, threadId, archived });
        } catch (error) {
          console.error("[archive] Error:", error);
          return new Response(JSON.stringify({ error: "Archive operation failed" }), { status: 500 });
        }
      }
    }

    // Provider Configuration API
    if (url.pathname === "/api/config/providers" && method === "GET") {
      if (!authorised(req)) return unauth();
      
      try {
        const providers = readProviderConfig();
        return okJson({ providers });
      } catch (error) {
        console.error("[provider-config] Read error:", error);
        return okJson(
          { error: "Failed to read provider configuration" },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/api/config/providers" && method === "PATCH") {
      if (!authorised(req)) return unauth();
      
      try {
        const body = await req.json().catch(() => null) as { providers?: Record<string, any> } | null;
        
        if (!body || !body.providers || typeof body.providers !== "object" || Array.isArray(body.providers)) {
          return okJson(
            { success: false, error: "Request body must contain 'providers' object" },
            { status: 400 }
          );
        }
        
        // Validate configuration
        const validation = validateProviderConfig(body.providers);
        if (!validation.ok) {
          return okJson(
            { success: false, error: validation.error },
            { status: 400 }
          );
        }
        
        // Write configuration
        writeProviderConfig(body.providers);
        
        logAdmin(`provider configuration updated: ${Object.keys(body.providers).join(", ")}`);
        
        return okJson({ success: true });
      } catch (error) {
        console.error("[provider-config] Write error:", error);
        const message = error instanceof Error ? error.message : "Failed to update provider configuration";
        return okJson(
          { success: false, error: message },
          { status: 500 }
        );
      }
    }

	    // Admin endpoints (token required)
    if (url.pathname === "/admin/status" && method === "GET") {
      if (!authorised(req)) return unauth();
      const res = okJson({
        tokenSessions: getTokenSessionStats(),
        server: { host: HOST, port: PORT },
        uiDistDir: UI_DIST_DIR,
        anchor: {
          running: isAnchorRunning(),
          cwd: ANCHOR_CWD,
          host: ANCHOR_HOST,
          port: ANCHOR_PORT,
          log: ANCHOR_LOG_PATH,
        },
        anchorAuth,
        db: {
          path: DB_PATH,
          retentionDays: DB_RETENTION_DAYS,
          uploadDir: UPLOAD_DIR,
          uploadRetentionDays: UPLOAD_RETENTION_DAYS,
          uploadPruneIntervalHours: UPLOAD_PRUNE_INTERVAL_HOURS,
        },
        reliability: reliabilitySnapshot(),
        version: { appCommit: APP_COMMIT },
        providers: await registry.healthAll(),
      });
      return isHead ? new Response(null, { status: res.status, headers: res.headers }) : res;
    }

    if (url.pathname === "/admin/validate" && method === "GET") {
      if (!authorised(req)) return unauth();
      const origin = requestOrigin(url, req);
      const v = await validateSystem(req, url);
      return okJson({
        ok: v.ok,
        origin,
        server: { host: HOST, port: PORT },
        anchor: { running: isAnchorRunning(), connected: anchorSockets.size > 0, port: ANCHOR_PORT },
        anchorAuth,
        db: { path: DB_PATH, retentionDays: DB_RETENTION_DAYS },
        uploads: { dir: UPLOAD_DIR, retentionDays: UPLOAD_RETENTION_DAYS },
        checks: v.checks,
      });
    }

    if (url.pathname === "/admin/repair" && req.method === "POST") {
      if (!authorised(req)) return unauth();
      const body = (await req.json().catch(() => null)) as null | {
        actions?: string[];
      };
      const actions = Array.isArray(body?.actions) ? body!.actions : [];
      const applied: string[] = [];
      const errors: string[] = [];

      // Keep this conservative: only repair things that are safe and local.
      if (actions.includes("ensureUploadDir")) {
        try {
          await ensureUploadDir();
          applied.push("ensureUploadDir");
          logAdmin("repair: ensured uploads dir exists");
        } catch (e) {
          errors.push(`ensureUploadDir: ${e instanceof Error ? e.message : "failed"}`);
        }
      }

      if (actions.includes("startAnchor")) {
        try {
          const res = startAnchor();
          if (!res.ok) throw new Error(res.error || "failed");
          applied.push("startAnchor");
          logAdmin("repair: started anchor");
        } catch (e) {
          errors.push(`startAnchor: ${e instanceof Error ? e.message : "failed"}`);
        }
      }

      if (actions.includes("pruneUploads")) {
        try {
          await pruneUploads();
          pruneExpiredUploadTokens();
          applied.push("pruneUploads");
          logAdmin("repair: pruned uploads");
        } catch (e) {
          errors.push(`pruneUploads: ${e instanceof Error ? e.message : "failed"}`);
        }
      }

      if (actions.includes("fixTailscaleServe")) {
        try {
          const res = fixTailscaleServe();
          if (!res.ok) throw new Error(res.detail || "failed");
          applied.push("fixTailscaleServe");
          logAdmin("repair: tailscale serve configured");
        } catch (e) {
          errors.push(`fixTailscaleServe: ${e instanceof Error ? e.message : "failed"}`);
        }
      }

      // Re-validate after repairs.
      const v = await validateSystem(req, url);
      const ok = errors.length === 0 && v.ok;
      return okJson({ ok, applied, errors, checks: v.checks });
    }

    if (url.pathname === "/admin/uploads/retention" && req.method === "POST") {
      if (!authorised(req)) return unauth();
      const body = (await req.json().catch(() => null)) as null | { retentionDays?: number; pruneIntervalHours?: number };
      const hasRetention = typeof body?.retentionDays !== "undefined";
      const hasPruneInterval = typeof body?.pruneIntervalHours !== "undefined";
      if (!hasRetention && !hasPruneInterval) {
        return okJson({ error: "No upload settings provided" }, { status: 400 });
      }
      if (hasRetention) {
        const next = Number(body?.retentionDays ?? NaN);
        if (!Number.isFinite(next) || next < 0 || next > 3650) {
          return okJson({ error: "retentionDays must be a number between 0 and 3650" }, { status: 400 });
        }
        UPLOAD_RETENTION_DAYS = next;
      }
      if (hasPruneInterval) {
        const intervalHours = parseUploadPruneIntervalHours(body?.pruneIntervalHours);
        if (intervalHours === null) {
          return okJson(
            { error: `pruneIntervalHours must be an integer between ${MIN_UPLOAD_PRUNE_INTERVAL_HOURS} and ${MAX_UPLOAD_PRUNE_INTERVAL_HOURS}` },
            { status: 400 }
          );
        }
        UPLOAD_PRUNE_INTERVAL_HOURS = intervalHours;
        scheduleUploadPrune();
      }
      if (EFFECTIVE_CONFIG_JSON_PATH) {
        try {
          const text = Bun.file(EFFECTIVE_CONFIG_JSON_PATH).textSync();
          const json = JSON.parse(text) as Record<string, unknown>;
          json.uploadRetentionDays = UPLOAD_RETENTION_DAYS;
          json.uploadPruneIntervalHours = UPLOAD_PRUNE_INTERVAL_HOURS;
          json.uploadDir = UPLOAD_DIR;
          Bun.write(EFFECTIVE_CONFIG_JSON_PATH, JSON.stringify(json, null, 2) + "\n");
        } catch {
          // ignore
        }
      }
      if (hasRetention) {
        logAdmin(`upload retention set to ${UPLOAD_RETENTION_DAYS} day(s)`);
      }
      if (hasPruneInterval) {
        logAdmin(`upload retention: auto-cleanup interval set to ${UPLOAD_PRUNE_INTERVAL_HOURS} hour(s)`);
      }
      return okJson({
        ok: true,
        retentionDays: UPLOAD_RETENTION_DAYS,
        pruneIntervalHours: UPLOAD_PRUNE_INTERVAL_HOURS,
      });
    }

    if (url.pathname === "/admin/uploads/prune" && req.method === "POST") {
      if (!authorised(req)) return unauth();
      // Manual maintenance hook for the admin UI.
      const before = nowSec();
      await pruneUploads();
      pruneExpiredUploadTokens();
      const after = nowSec();
      logAdmin(`upload retention: manual prune completed (${after - before}s)`);
      return okJson({ ok: true });
    }

    if (url.pathname === "/admin/uploads/stats" && req.method === "GET") {
      if (!authorised(req)) return unauth();
      const stats = await getUploadStats();
      return okJson(stats);
    }

    if (url.pathname === "/admin/debug/events" && method === "GET") {
      if (!authorised(req)) return unauth();
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
      try {
        const rows = db
          .prepare("SELECT payload FROM events ORDER BY id DESC LIMIT ?")
          .all(limit) as Array<{ payload: string }>;
        const data = rows
          .map((r) => redactSensitive(r.payload))
          .reverse();
        return okJson({ limit, data });
      } catch {
        return new Response("Failed to query events", { status: 500 });
      }
    }

	    if (url.pathname === "/admin/ops" && method === "GET") {
	      if (!authorised(req)) return unauth();
	      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));
	      try {
	        const rows = db
	          .prepare("SELECT payload FROM events WHERE thread_id = ? ORDER BY id DESC LIMIT ?")
	          .all("admin", limit) as Array<{ payload: string }>;
	        const data = rows
	          .map((r) => redactSensitive(r.payload))
	          .reverse();
	        return okJson({ limit, data });
	      } catch {
	        return new Response("Failed to query ops log", { status: 500 });
	      }
	    }

	    if (url.pathname === "/admin/thread/title" && req.method === "POST") {
	      if (!authorised(req)) return unauth();
	      const body = (await req.json().catch(() => null)) as null | {
	        threadId?: string;
	        title?: string | null;
	      };
	      const threadId = (body?.threadId ?? "").trim();
	      const title = body?.title ?? null;
	      if (!threadId) return okJson({ error: "threadId is required" }, { status: 400 });
	      try {
	        await setCodexThreadTitle(threadId, title);
	        logAdmin(`thread title set: ${threadId} -> ${typeof title === "string" ? JSON.stringify(title) : "null"}`);
	        return okJson({ ok: true });
	      } catch (err) {
	        const msg = err instanceof Error ? err.message : "failed to set thread title";
	        return okJson({ error: msg }, { status: 500 });
	      }
	    }

	    if (url.pathname === "/admin/token/rotate" && req.method === "POST") {
	      if (!authorised(req)) return unauth();
	      const next = randomTokenHex(32);

      // Update in-memory token and persist to config.json if available.
      AUTH_TOKEN = next;
      persistTokenToConfigJson(next);

      // Invalidate pairing codes minted under the old token.
      pairCodes.clear();

      // Force connected clients/anchors to reconnect and re-auth with the new token.
      closeAllSockets("token rotated");

	      return okJson({ ok: true, token: next });
	    }

    if (url.pathname === "/admin/token/sessions" && method === "GET") {
      if (!authorised(req)) return unauth();
      const rows = listTokenSessions.all() as TokenSessionRow[];
      return okJson({
        sessions: rows.map((r) => ({
          id: r.id,
          label: r.label,
          mode: parseTokenSessionMode(r.mode),
          createdAt: r.created_at * 1000,
          lastUsedAt: r.last_used_at * 1000,
          revokedAt: typeof r.revoked_at === "number" ? r.revoked_at * 1000 : null,
        })),
        legacyTokenEnabled: true,
      });
    }

    if (url.pathname === "/admin/token/sessions/new" && req.method === "POST") {
      if (!authorised(req)) return unauth();
      const body = (await req.json().catch(() => null)) as null | { label?: string; mode?: string };
      const label = sanitizeSessionLabel(body?.label);
      const mode = parseTokenSessionMode(body?.mode);
      let created: ReturnType<typeof mintTokenSession>;
      try {
        created = mintTokenSession(label, mode);
      } catch {
        return okJson({ error: "failed to create token session" }, { status: 500 });
      }
      logAdmin(`token sessions: created ${created.id} (${JSON.stringify(created.row.label)})`);
      return okJson({
        ok: true,
        token: created.token,
        session: {
          id: created.row.id,
          label: created.row.label,
          mode: created.row.mode,
          createdAt: created.row.created_at * 1000,
          lastUsedAt: created.row.last_used_at * 1000,
          revokedAt: null,
        },
      });
    }

    if (url.pathname === "/admin/token/sessions/revoke" && req.method === "POST") {
      if (!authorised(req)) return unauth();
      const body = (await req.json().catch(() => null)) as null | { id?: string };
      const id = (body?.id ?? "").trim();
      if (!id) return okJson({ error: "id is required" }, { status: 400 });
      let changed = 0;
      try {
        const res = revokeTokenSession.run(nowSec(), id) as { changes?: number };
        changed = Number(res?.changes ?? 0);
      } catch {
        return okJson({ error: "failed to revoke token session" }, { status: 500 });
      }
      if (changed > 0) {
        logAdmin(`token sessions: revoked ${id}`);
      }
      return okJson({ ok: true, revoked: changed > 0 });
    }

	    // Uploads (token required)
		    if (url.pathname === "/uploads/new" && req.method === "POST") {
		      if (!authorised(req)) return unauth();
          const rate = enforceRateLimit(
            "uploads/new",
            requestRateLimitKey(req),
            UPLOAD_NEW_RATE_LIMIT_MAX,
            UPLOAD_NEW_RATE_LIMIT_WINDOW_SEC
          );
          if (!rate.ok) {
            reliabilityRecord("rateLimited", "rate_limited", "uploads/new");
            return okJson(
              { error: "rate limit exceeded", retryAfterSec: rate.retryAfterSec },
              { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } }
            );
          }
		      const body = (await req.json().catch(() => null)) as null | {
		        filename?: string;
		        mime?: string;
		        bytes?: number;
		      };
		      const originalFilename = (body?.filename ?? "").trim();
		      const mime = (body?.mime ?? "").trim() || "application/octet-stream";
		      const bytes = Number(body?.bytes ?? 0);
		      if (!Number.isFinite(bytes) || bytes <= 0) {
		        return okJson({ error: "bytes is required" }, { status: 400 });
		      }
	      if (bytes > UPLOAD_MAX_BYTES) {
	        return okJson({
	          error: `file too large (max ${UPLOAD_MAX_BYTES} bytes)`,
	        }, { status: 413 });
	      }
	      const token = randomTokenHex(16);
	      const ext = safeExtFromMime(mime);
	      const fileName = `${token}.${ext}`;
	      const filePath = join(UPLOAD_DIR, fileName);
	      const createdAt = nowSec();
	      const ttl =
	        Number.isFinite(UPLOAD_RETENTION_DAYS) && UPLOAD_RETENTION_DAYS > 0
	          ? UPLOAD_RETENTION_DAYS * 24 * 60 * 60
	          : 10 * 365 * 24 * 60 * 60;
	      const expiresAt = createdAt + Math.max(ttl, UPLOAD_URL_TTL_SEC);

	      try {
	        await ensureUploadDir();
	        insertUploadToken.run(token, filePath, mime, bytes, createdAt, expiresAt);
	      } catch {
	        return okJson({ error: "failed to create upload token" }, { status: 500 });
	      }

		      const origin = requestOrigin(url, req);
		      return okJson({
		        token,
		        uploadUrl: `${origin}/uploads/${encodeURIComponent(token)}`,
		        viewUrl: `${origin}/u/${encodeURIComponent(token)}`,
		        // This is the local absolute path on the Mac. It's only returned to authorised clients.
		        // Used to pass image pixels to Codex app-server as a file attachment.
		        localPath: filePath,
		        filename: originalFilename || fileName,
		        mime,
		        expiresAt: expiresAt * 1000,
		      });
		    }

	    if (url.pathname.startsWith("/uploads/") && req.method === "PUT") {
	      if (!authorised(req)) return unauth();
	      const token = url.pathname.split("/").filter(Boolean)[1] ?? "";
	      if (!token) return new Response("Not found", { status: 404 });
	      const rec = (getUploadToken.get(token) as any) as null | {
	        token: string;
	        path: string;
	        mime: string;
	        bytes: number;
	        created_at: number;
	        expires_at: number;
	      };
	      if (!rec) return new Response("invalid upload token", { status: 400 });
	      if (nowSec() > rec.expires_at) {
	        deleteUploadToken.run(token);
	        return new Response("upload token expired", { status: 400 });
	      }
	      const ct = (req.headers.get("content-type") ?? "").trim() || rec.mime;
	      if (ct && rec.mime && ct !== rec.mime) {
	        return new Response("content-type mismatch", { status: 400 });
	      }
	      const buf = await req.arrayBuffer();
	      if (buf.byteLength > UPLOAD_MAX_BYTES) {
	        return new Response("file too large", { status: 413 });
	      }
	      try {
	        await ensureUploadDir();
	        await Bun.write(rec.path, new Uint8Array(buf));
	        logAdmin(`upload: saved ${basename(rec.path)} (${buf.byteLength} bytes)`);
	      } catch {
	        return new Response("failed to write upload", { status: 500 });
	      }
	      return okJson({ ok: true, url: `/u/${encodeURIComponent(token)}` });
	    }

	    if (url.pathname.startsWith("/u/") && method === "GET") {
	      const token = url.pathname.split("/").filter(Boolean)[1] ?? "";
	      if (!token) return new Response("Not found", { status: 404 });
	      const rec = (getUploadToken.get(token) as any) as null | {
	        path: string;
	        mime: string;
	        expires_at: number;
	      };
	      if (!rec) return new Response("Not found", { status: 404 });
	      if (nowSec() > rec.expires_at) {
	        deleteUploadToken.run(token);
	        return new Response("Not found", { status: 404 });
	      }
	      const file = Bun.file(rec.path);
	      if (!(await file.exists().catch(() => false))) {
	        return new Response("Not found", { status: 404 });
	      }
	      return new Response(file, {
	        status: 200,
	        headers: {
	          "content-type": rec.mime || "application/octet-stream",
	          "cache-control": "private, max-age=31536000, immutable",
	        },
	      });
	    }

    if (url.pathname === "/admin/pair/new" && req.method === "POST") {
      if (!authorised(req)) return unauth();
      const rate = enforceRateLimit(
        "admin/pair/new",
        requestRateLimitKey(req),
        PAIR_NEW_RATE_LIMIT_MAX,
        PAIR_NEW_RATE_LIMIT_WINDOW_SEC
      );
      if (!rate.ok) {
        reliabilityRecord("rateLimited", "rate_limited", "admin/pair/new");
        return okJson(
          { error: "rate limit exceeded", retryAfterSec: rate.retryAfterSec },
          { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } }
        );
      }
      prunePairCodes();
      const code = randomPairCode();
      const expiresAt = Date.now() + PAIR_TTL_SEC * 1000;
      let created: ReturnType<typeof mintTokenSession>;
      try {
        created = mintTokenSession(`Paired device ${new Date().toISOString()}`, "full");
      } catch {
        return okJson({ error: "failed to create pairing token session" }, { status: 500 });
      }
      pairCodes.set(code, { token: created.token, sessionId: created.id, expiresAt });
      logAdmin(`pair: minted token session ${created.id}`);
      const origin = requestOrigin(url, req);
      return okJson({
        code,
        expiresAt,
        pairUrl: `${origin}/pair?code=${encodeURIComponent(code)}`,
      });
    }

    if (url.pathname === "/admin/pair/qr.svg" && method === "GET") {
      if (!authorised(req)) return unauth();
      prunePairCodes();
      const code = (url.searchParams.get("code") ?? "").trim().toUpperCase();
      if (!code) return new Response("code is required", { status: 400 });
      const rec = pairCodes.get(code);
      if (!rec || Date.now() > rec.expiresAt) return new Response("invalid or expired code", { status: 400 });
      const payloadUrl = `${requestOrigin(url, req)}/pair?code=${encodeURIComponent(code)}`;
      try {
        const svg = await QRCode.toString(payloadUrl, { type: "svg", margin: 1, width: 260, errorCorrectionLevel: "M" });
        const headers = { "content-type": "image/svg+xml" };
        return isHead ? new Response(null, { status: 200, headers }) : new Response(svg, { status: 200, headers });
      } catch (e) {
        return new Response(e instanceof Error ? e.message : "failed to render qr", { status: 500 });
      }
    }

    if (url.pathname === "/pair/consume" && req.method === "POST") {
      prunePairCodes();
      const body = (await req.json().catch(() => null)) as null | { code?: string };
      const code = body?.code?.trim()?.toUpperCase();
      if (!code) return okJson({ error: "code is required" }, { status: 400 });
      const rec = pairCodes.get(code);
      if (!rec) return okJson({ error: "invalid or expired code" }, { status: 400 });
      if (Date.now() > rec.expiresAt) {
        pairCodes.delete(code);
        return okJson({ error: "invalid or expired code" }, { status: 400 });
      }
      // One-time use.
      pairCodes.delete(code);
      return okJson({ token: rec.token });
    }

    if (url.pathname === "/admin/anchor/start" && req.method === "POST") {
      if (!authorised(req)) return unauth();
      const res = startAnchor();
      if (!res.ok) reliabilityRecord("anchorStartFailed", "anchor_start_failed", res.error ?? "unknown");
      return okJson(res, { status: res.ok ? 200 : 500 });
    }

    if (url.pathname === "/admin/anchor/stop" && req.method === "POST") {
      if (!authorised(req)) return unauth();
      const res = stopAnchor();
      if (!res.ok) reliabilityRecord("anchorStopFailed", "anchor_stop_failed", res.error ?? "unknown");
      return okJson(res, { status: res.ok ? 200 : 500 });
    }

    if (url.pathname === "/admin/cli/commands" && method === "GET") {
      if (!authorised(req)) return unauth();
      return okJson({ commands: CLI_COMMANDS });
    }

    if (url.pathname === "/admin/cli/run" && req.method === "POST") {
      if (!authorised(req)) return unauth();
      const body = (await req.json().catch(() => null)) as null | { id?: string };
      const id = (body?.id ?? "").trim();
      const cmd = findCliCommand(id);
      if (!cmd) return okJson({ error: "unknown command" }, { status: 400 });
      if (!existsSync(CLI_BIN)) {
        return okJson({ error: `cli not found at ${CLI_BIN}` }, { status: 500 });
      }
      logAdmin(`cli: run ${cmd.id}`);
      const result = await runCliCommand(cmd);
      return okJson(result, { status: result.ok ? 200 : 500 });
    }

    if (url.pathname === "/admin/logs" && method === "GET") {
      if (!authorised(req)) return unauth();
      const svc = url.searchParams.get("service") ?? "anchor";
      if (svc !== "anchor") return new Response("Not found", { status: 404 });
      // Use Bun.file for simplicity; admin UI only needs tail-ish.
      const res = new Response(Bun.file(ANCHOR_LOG_PATH), {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
      return isHead ? new Response(null, { status: res.status, headers: res.headers }) : res;
    }

    // Compatibility endpoint for the existing web client.
    // Returns NDJSON of stored events (one JSON object per line).
    if (req.method === "GET" && url.pathname.startsWith("/threads/") && url.pathname.endsWith("/events")) {
      if (!authorised(req)) return new Response("Unauthorised", { status: 401 });
      const parts = url.pathname.split("/").filter(Boolean);
      const threadId = parts.length === 3 ? parts[1] : null;
      if (!threadId) return new Response("Not found", { status: 404 });

      try {
        // IMPORTANT: threads can have very large event logs (e.g. repeated `thread/read` results).
        // To keep mobile clients responsive, allow limiting + reversing the result set.
        const limitRaw = url.searchParams.get("limit");
        const limit =
          limitRaw && /^[0-9]+$/.test(limitRaw) ? Math.max(0, Math.min(5000, Number(limitRaw))) : null;
        const order = (url.searchParams.get("order") || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

        const rows = (
          limit != null
            ? db
                .prepare(`SELECT payload FROM events WHERE thread_id = ? ORDER BY id ${order} LIMIT ?`)
                .all(threadId, limit)
            : db.prepare(`SELECT payload FROM events WHERE thread_id = ? ORDER BY id ${order}`).all(threadId)
        ) as Array<{ payload: string }>;
        const body = rows.length ? rows.map((r) => r.payload).join("\n") + "\n" : "";
        return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } });
      } catch {
        return new Response("Failed to query events", { status: 500 });
      }
    }

    // Convenience alias for client WS.
    if (url.pathname === "/ws") {
      const ctx = authContext(req);
      if (!ctx.ok) return new Response("Unauthorised", { status: 401 });
      const data: WsData = {
        role: "client",
        authSource: ctx.mode,
        authScope: ctx.mode === "session" && ctx.sessionMode === "read_only" ? "read_only" : "full",
      };
      if (server.upgrade(req, { data })) return new Response(null, { status: 101 });
      return new Response("Upgrade required", { status: 426 });
    }

    if (url.pathname === "/ws/client" || url.pathname === "/ws/anchor") {
      const ctx = authContext(req);
      if (!ctx.ok) return new Response("Unauthorised", { status: 401 });
      const role: Role = url.pathname.endsWith("/anchor") ? "anchor" : "client";
      const anchorId =
        role === "anchor" ? (url.searchParams.get("anchorId") || url.searchParams.get("anchor_id")) : null;
      const data: WsData = {
        role,
        ...(anchorId ? { anchorId } : {}),
        authSource: ctx.mode,
        authScope: ctx.mode === "session" && ctx.sessionMode === "read_only" ? "read_only" : "full",
      };
      if (server.upgrade(req, { data })) {
        return new Response(null, { status: 101 });
      }
      return new Response("Upgrade required", { status: 426 });
    }

    // Static UI (built with Vite) + SPA fallback.
    // This lets a single process serve both the UI and the local services.
    if (method === "GET") {
      try {
        const path = url.pathname === "/" ? "/index.html" : url.pathname;
        const filePath = `${UI_DIST_DIR}${path}`;
        const file = Bun.file(filePath);
        if (await file.exists()) {
          const ct = contentTypeForPath(path);
          const cc = cacheControlForPath(path);
          const headers: Record<string, string> = {};
          if (ct) headers["content-type"] = ct;
          if (cc) headers["cache-control"] = cc;
          const init = Object.keys(headers).length ? { headers } : undefined;
          return isHead ? new Response(null, { status: 200, headers: (init as any)?.headers }) : new Response(file, init);
        }
      } catch {
        // fall through
      }
      // SPA fallback: serve index.html for non-file paths.
      try {
        const index = Bun.file(`${UI_DIST_DIR}/index.html`);
        if (await index.exists()) {
          const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };
          return isHead ? new Response(null, { status: 200, headers }) : new Response(index, { headers });
        }
      } catch {
        // ignore
      }
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      const role = ws.data.role;
      if (role === "client") clientSockets.set(ws, new Set());
      else anchorSockets.set(ws, new Set());

      send(ws, {
        type: "orbit.hello",
        ts: new Date().toISOString(),
        role,
      });

      if (role === "client") {
        reliabilityRecord("wsClientConnected", "ws_client_connected");
        send(ws, { type: "orbit.anchor-auth", ...anchorAuth });
      }

      if (role === "anchor") {
        reliabilityRecord("wsAnchorConnected", "ws_anchor_connected");
        const stableId = typeof (ws.data as any)?.anchorId === "string" ? ((ws.data as any).anchorId as string) : "";
        const meta: AnchorMeta = {
          // Stable id (preferred) so reconnects don't create duplicate devices.
          // Fallback to "pending" until we learn hostname/platform (anchor.hello).
          id: stableId.trim() ? stableId.trim() : "pending",
          hostname: "unknown",
          platform: "unknown",
          connectedAt: new Date().toISOString(),
        };
        // If an anchor reconnects using the same stable id, close the previous socket.
        if (stableId.trim()) {
          for (const existing of anchorMeta.keys()) {
            if (existing === ws) continue;
            const em = anchorMeta.get(existing);
            if (em?.id === stableId.trim()) {
              try {
                existing.close(1000, "replaced");
              } catch {
                // ignore
              }
            }
          }
        }
        anchorMeta.set(ws, meta);
        broadcastToClients({ type: "orbit.anchor-connected", anchor: meta });
      }
    },
    async message(ws, message) {
      const role = ws.data.role;
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);

      // Handle control messages
      const obj = parseJsonMessage(text);
      if (obj?.type === "ping") {
        // Heartbeat from browser. Must be handled even though it's not an orbit.* message.
        send(ws, { type: "pong" });
        return;
      }
      if (obj && typeof obj.type === "string" && (obj.type as string).startsWith("orbit.")) {
        if (obj.type === "orbit.subscribe" && typeof obj.threadId === "string") {
          subscribe(role, ws, obj.threadId);
          return;
        }
        if (obj.type === "orbit.list-anchors") {
          send(ws, { type: "orbit.anchors", anchors: listAnchors() });
          return;
        }
        // ignore others for now
        return;
      }

      // Anchor identity
      if (obj && obj.type === "anchor.hello" && role === "anchor") {
        const meta = anchorMeta.get(ws);
        if (meta) {
          meta.hostname = typeof obj.hostname === "string" ? obj.hostname : meta.hostname;
          meta.platform = typeof obj.platform === "string" ? obj.platform : meta.platform;
          // Only derive an id from hostname/platform if we don't already have a stable id.
          if (meta.id === "pending" && (meta.hostname !== "unknown" || meta.platform !== "unknown")) {
            meta.id = `${meta.hostname}:${meta.platform}`;
          }
          broadcastToClients({ type: "orbit.anchor-connected", anchor: meta });
        }
        return;
      }

      if (obj && obj.type === "orbit.anchor-auth" && role === "anchor") {
        const status = typeof obj.status === "string" ? obj.status : "unknown";
        if (status === "unknown" || status === "ok" || status === "invalid") {
          anchorAuth = {
            status,
            at: typeof obj.at === "string" ? obj.at : anchorAuth.at,
            code: typeof obj.code === "string" ? obj.code : anchorAuth.code,
            message: typeof obj.message === "string" ? obj.message : anchorAuth.message,
          };
          if (status === "invalid") {
            const detail = typeof obj.code === "string" ? obj.code : (typeof obj.message === "string" ? obj.message.slice(0, 80) : "invalid");
            reliabilityRecord("anchorAuthInvalid", "anchor_auth_invalid", detail);
          }
          broadcastToClients({ type: "orbit.anchor-auth", ...anchorAuth });
        }
        return;
      }

      if (role === "client" && ws.data.authScope === "read_only" && obj) {
        const method = extractMethod(obj);
        if (method && !isReadOnlySafeRpcMethod(method)) {
          reliabilityRecord("readOnlyDenied", "read_only_denied", method);
          const requestId = (obj as any).id;
          const errorPayload = {
            code: -32003,
            message: `Read-only token session cannot call ${method}`,
          };
          if (typeof requestId === "string" || typeof requestId === "number" || requestId === null) {
            send(ws, {
              jsonrpc: "2.0",
              id: requestId,
              error: errorPayload,
            });
          } else {
            send(ws, { type: "orbit.error", error: errorPayload.message });
          }
          return;
        }
      }

      // Handle ACP approval decisions from UI clients — route back to adapter only.
      if (role === "client" && obj && obj.type === "acp:approval_decision") {
        const acpAdapter = registry.get("copilot-acp") as CopilotAcpAdapter | undefined;
        if (!acpAdapter || typeof acpAdapter.resolveApproval !== "function") {
          send(ws, {
            type: "orbit.error",
            error: "ACP adapter not available",
            rpcId: obj.rpcId,
          });
          return;
        }

        const rpcId = String(obj.rpcId);

        // Authorize approval decision
        const authResult = validateApprovalDecisionAuthorization(
          rpcId,
          ws,
          acpAdapter,
          threadToClients
        );

        if (!authResult.authorized) {
          reliabilityRecord(
            "acpApprovalUnauthorized",
            "acp_approval_unauthorized",
            authResult.reason ?? "unknown"
          );
          send(ws, {
            type: "orbit.error",
            error: `Unauthorized: ${authResult.reason}`,
            rpcId,
          });
          return;
        }

        // Authorization passed - resolve the approval
        const outcome = obj.optionId
          ? { outcome: "selected" as const, optionId: String(obj.optionId) }
          : { outcome: "cancelled" as const };
        acpAdapter.resolveApproval(rpcId, outcome);
        return;
      }

      await relay(role, text, ws);
    },
    close(ws) {
      const role = ws.data.role;
      unsubscribeAll(role, ws);
      if (role === "client") {
        clientSockets.delete(ws);
        reliabilityRecord("wsClientDisconnected", "ws_client_disconnected");
      }
      else {
        anchorSockets.delete(ws);
        reliabilityRecord("wsAnchorDisconnected", "ws_anchor_disconnected");
        const meta = anchorMeta.get(ws);
        if (meta) {
          anchorMeta.delete(ws);
          // Client expects anchorId for removal.
          broadcastToClients({ type: "orbit.anchor-disconnected", anchorId: meta.id, anchor: meta });
        }
        if (anchorSockets.size === 0) {
          anchorAuth = { status: "unknown" };
          broadcastToClients({ type: "orbit.anchor-auth", ...anchorAuth });
        }
      }
    },
  },
});

console.log(`[local-orbit] listening on http://${HOST}:${server.port}`);
console.log(`[local-orbit] ws client: ws://${HOST}:${server.port}/ws/client`);
console.log(`[local-orbit] ws anchor: ws://${HOST}:${server.port}/ws/anchor`);

if (AUTOSTART_ANCHOR) {
  const res = startAnchor();
  if (!res.ok) {
    reliabilityRecord("anchorStartFailed", "anchor_start_failed", res.error ?? "unknown");
    console.warn(`[local-orbit] failed to autostart anchor: ${res.error ?? "unknown error"}`);
  }
}

// Graceful shutdown
const shutdown = async () => {
  console.log("[local-orbit] Shutting down providers...");
  await registry.stopAll();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
