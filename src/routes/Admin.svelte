<script lang="ts">
  import AppHeader from "../lib/components/AppHeader.svelte";
  import DangerZone from "../lib/components/system/DangerZone.svelte";
  import SectionCard from "../lib/components/system/SectionCard.svelte";
  import StatusChip from "../lib/components/system/StatusChip.svelte";
  import { socket } from "../lib/socket.svelte";
  import { theme } from "../lib/theme.svelte";
  import { auth } from "../lib/auth.svelte";

  const UI_COMMIT = String(import.meta.env.VITE_CODEX_POCKET_COMMIT ?? "");
  const UI_BUILT_AT = String(import.meta.env.VITE_CODEX_POCKET_BUILT_AT ?? "");

  type Status = {
    tokenSessions?: { total: number; active: number };
    server: { host: string; port: number };
    uiDistDir: string;
    anchor: { running: boolean; cwd: string; host: string; port: number; log: string };
    anchorAuth?: { status: "unknown" | "ok" | "invalid"; at?: string; code?: string; message?: string };
    db: {
      path: string;
      retentionDays: number;
      uploadDir?: string;
      uploadRetentionDays?: number;
      uploadPruneIntervalHours?: number;
    };
    version?: { appCommit?: string };
  };
  type UploadStats = {
    fileCount: number;
    totalBytes: number;
    oldestAt: string | null;
    newestAt: string | null;
    lastPruneAt: string | null;
    lastPruneMessage: string | null;
    lastPruneSource: "manual" | "scheduled" | "unknown" | null;
  };
  type TokenSession = {
    id: string;
    label: string;
    mode: "full" | "read_only";
    createdAt: number;
    lastUsedAt: number;
    revokedAt: number | null;
  };

  let status = $state<Status | null>(null);
  let statusError = $state<string | null>(null);
  let pairError = $state<string | null>(null);
  let busy = $state(false);
  let logs = $state<string>("");
  let pair = $state<{ code: string; pairUrl: string; expiresAt: number } | null>(null);
  let pairQrObjectUrl = $state<string>("");
  let cliPairUrl = $state<string>("");
  let cliPairQrObjectUrl = $state<string>("");
  let autoPairTried = $state(false);
  let debugEvents = $state<string>("");
  let opsLog = $state<string>("");
  let pruningUploads = $state(false);
  let rotatingToken = $state(false);
  let rotatedToken = $state<string | null>(null);
  let uploadRetentionDays = $state<number>(0);
  let uploadPruneIntervalHours = $state<number>(6);
  let uploadStats = $state<UploadStats | null>(null);
  let savingUploadRetention = $state(false);
  let cliCommands = $state<Array<{ id: string; label: string; description: string; risky?: boolean }>>([]);
  let cliSelected = $state<string>("");
  let cliOutput = $state<string>("");
  let cliRunning = $state(false);
  let cliError = $state<string | null>(null);
  let lastAction = $state<{ tone: "success" | "error"; label: string; at: number } | null>(null);
  let showCliAdvanced = $state(false);
  let showLogsAdvanced = $state(false);
  let showDebugAdvanced = $state(false);
  let tokenSessions = $state<TokenSession[]>([]);
  let loadingTokenSessions = $state(false);
  let tokenSessionLabel = $state("");
  let tokenSessionMode = $state<"full" | "read_only">("full");
  let creatingTokenSession = $state(false);
  let createdSessionToken = $state<string | null>(null);
  let tokenSessionError = $state<string | null>(null);
  let revokingSessionId = $state<string | null>(null);

  type ValidateResp = {
    ok: boolean;
    checks?: Array<{ id: string; ok: boolean; summary: string; detail?: string }>;
  };

  let validateResp = $state<ValidateResp | null>(null);
  let validating = $state(false);
  let repairing = $state(false);

  function stampAction(tone: "success" | "error", label: string) {
    lastAction = { tone, label, at: Date.now() };
  }

  function formatActionTime(ts: number): string {
    return new Date(ts).toLocaleTimeString();
  }

  async function loadStatus() {
    statusError = null;
    try {
      const headers: Record<string, string> = {};
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/status", { headers });
      if (res.status === 401) {
        // If the server token changed (reinstall) but the browser still has an old token,
        // force a sign-out so AuthGate shows the access-token prompt again.
        await auth.signOut();
        throw new Error("Unauthorized (token mismatch). Please sign in again with your Access Token.");
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      status = (await res.json()) as Status;
      try {
        const rd = (status.db as any)?.uploadRetentionDays;
        if (typeof rd === "number" && Number.isFinite(rd)) {
          uploadRetentionDays = rd;
        }
        const ph = (status.db as any)?.uploadPruneIntervalHours;
        if (typeof ph === "number" && Number.isFinite(ph)) {
          uploadPruneIntervalHours = Math.max(1, Math.floor(ph));
        }
      } catch {
        // ignore
      }
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Failed to load status";
    }
  }

  async function loadLogs() {
    try {
      const headers: Record<string, string> = {};
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/logs?service=anchor", { headers });
      logs = res.ok ? await res.text() : "";
    } catch {
      logs = "";
    }
  }

  async function loadDebugEvents() {
    try {
      const headers: Record<string, string> = {};
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/debug/events?limit=50", { headers });
      if (!res.ok) {
        debugEvents = "";
        return;
      }
      const data = (await res.json()) as { data?: string[] };
      debugEvents = (data.data ?? []).join("\n");
    } catch {
      debugEvents = "";
    }
  }

  async function loadOpsLog() {
    try {
      const headers: Record<string, string> = {};
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/ops?limit=80", { headers });
      if (!res.ok) {
        opsLog = "";
        return;
      }
      const data = (await res.json()) as { data?: string[] };
      opsLog = (data.data ?? []).join("\n");
    } catch {
      opsLog = "";
    }
  }

  async function loadUploadStats() {
    try {
      const headers: Record<string, string> = {};
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/uploads/stats", { headers });
      if (!res.ok) {
        uploadStats = null;
        return;
      }
      uploadStats = (await res.json()) as UploadStats;
    } catch {
      uploadStats = null;
    }
  }

  async function loadTokenSessions() {
    loadingTokenSessions = true;
    tokenSessionError = null;
    try {
      const headers: Record<string, string> = {};
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/token/sessions", { headers });
      if (!res.ok) throw new Error(`sessions ${res.status}`);
      const data = (await res.json()) as { sessions?: TokenSession[] };
      tokenSessions = Array.isArray(data.sessions) ? data.sessions : [];
    } catch (e) {
      tokenSessionError = e instanceof Error ? e.message : "Failed to load token sessions";
      tokenSessions = [];
    } finally {
      loadingTokenSessions = false;
    }
  }

  async function createTokenSession() {
    if (creatingTokenSession) return;
    creatingTokenSession = true;
    tokenSessionError = null;
    createdSessionToken = null;
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/token/sessions/new", {
        method: "POST",
        headers,
        body: JSON.stringify({ label: tokenSessionLabel, mode: tokenSessionMode }),
      });
      const data = (await res.json().catch(() => null)) as null | { ok?: boolean; token?: string; error?: string };
      if (!res.ok || !data?.ok || !data.token) {
        throw new Error(data?.error || `create failed (${res.status})`);
      }
      createdSessionToken = data.token;
      try {
        await navigator.clipboard.writeText(data.token);
      } catch {
        // ignore
      }
      tokenSessionLabel = "";
      tokenSessionMode = "full";
      stampAction("success", "Token session created");
      await loadTokenSessions();
      await loadStatus();
    } catch (e) {
      tokenSessionError = e instanceof Error ? e.message : "Failed to create token session";
      stampAction("error", "Token session create failed");
    } finally {
      creatingTokenSession = false;
    }
  }

  async function revokeTokenSession(id: string) {
    if (!id || revokingSessionId) return;
    const okToRevoke = confirm("Revoke this token session now?");
    if (!okToRevoke) return;
    revokingSessionId = id;
    tokenSessionError = null;
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/token/sessions/revoke", {
        method: "POST",
        headers,
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => null)) as null | { ok?: boolean; revoked?: boolean; error?: string };
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `revoke failed (${res.status})`);
      }
      stampAction(data.revoked ? "success" : "error", data.revoked ? "Token session revoked" : "Token session already revoked");
      await loadTokenSessions();
      await loadStatus();
    } catch (e) {
      tokenSessionError = e instanceof Error ? e.message : "Failed to revoke token session";
      stampAction("error", "Token session revoke failed");
    } finally {
      revokingSessionId = null;
    }
  }

  function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i += 1;
    }
    return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
  }

  async function loadCliCommands() {
    try {
      const headers: Record<string, string> = {};
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/cli/commands", { headers });
      if (!res.ok) return;
      const data = (await res.json()) as { commands?: Array<{ id: string; label: string; description: string; risky?: boolean }> };
      cliCommands = (data.commands ?? []).filter((c) => c && typeof c.id === "string");
      if (!cliSelected && cliCommands.length) {
        cliSelected = cliCommands[0]!.id;
      }
    } catch {
      // ignore
    }
  }

  async function runCliCommand() {
    if (!cliSelected || cliRunning) return;
    const selectedCmd = cliCommands.find((c) => c.id === cliSelected);
    if (selectedCmd?.risky) {
      const ok = confirm(`Run disruptive command "${selectedCmd.label}"? This may disconnect this admin session.`);
      if (!ok) return;
    }
    cliRunning = true;
    cliError = null;
    cliOutput = "";
    cliPairUrl = "";
    if (cliPairQrObjectUrl) {
      URL.revokeObjectURL(cliPairQrObjectUrl);
      cliPairQrObjectUrl = "";
    }
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/cli/run", {
        method: "POST",
        headers,
        body: JSON.stringify({ id: cliSelected }),
      });
      const data = (await res.json().catch(() => null)) as
        | null
        | { output?: string; timedOut?: boolean; exitCode?: number | null; command?: string; error?: string };
      if (!res.ok) {
        cliError = data?.error ?? `command failed (${res.status})`;
        stampAction("error", `CLI command failed (${selectedCmd?.label || cliSelected})`);
      }
      const summary = [
        data?.command ? `$ ${data.command}` : "",
        data?.timedOut ? "[timed out]" : "",
        typeof data?.exitCode === "number" ? `exit ${data.exitCode}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      cliOutput = `${summary}\n${data?.output ?? ""}`.trim();
      if (cliSelected === "pair") {
        const match = cliOutput.match(/https?:\/\/\S+/i);
        if (match?.[0]) {
          cliPairUrl = match[0];
          const codeMatch = cliPairUrl.match(/[?&]code=([^&]+)/i);
          if (codeMatch?.[1]) {
            await updateCliPairQr(decodeURIComponent(codeMatch[1]));
          }
        }
      }
      if (res.ok) {
        stampAction("success", `CLI command completed (${selectedCmd?.label || cliSelected})`);
      }
    } catch (e) {
      cliError = e instanceof Error ? e.message : "Failed to run command";
      stampAction("error", "CLI command failed");
    } finally {
      cliRunning = false;
    }
  }

  async function updateCliPairQr(code: string) {
    try {
      const headers: Record<string, string> = {};
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch(`/admin/pair/qr.svg?code=${encodeURIComponent(code)}`, { headers });
      if (!res.ok) return;
      const blob = await res.blob();
      if (cliPairQrObjectUrl) URL.revokeObjectURL(cliPairQrObjectUrl);
      cliPairQrObjectUrl = URL.createObjectURL(blob);
    } catch {
      // ignore
    }
  }

  async function pruneUploadsNow() {
    if (pruningUploads) return;
    pruningUploads = true;
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      await fetch("/admin/uploads/prune", { method: "POST", headers, body: "{}" });
      stampAction("success", "Uploads cleanup completed");
    } finally {
      pruningUploads = false;
      await loadStatus();
      await loadUploadStats();
      await loadOpsLog();
    }
  }


  async function rotateToken() {
    if (rotatingToken) return;
    const okToRotate = confirm("Rotate legacy access token now? Devices using session tokens remain valid.");
    if (!okToRotate) return;
    rotatedToken = null;
    rotatingToken = true;
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/token/rotate", { method: "POST", headers, body: "{}" });
      const data = (await res.json().catch(() => null)) as null | { ok?: boolean; token?: string; error?: string };
      if (!res.ok || !data?.ok || !data.token) {
        throw new Error(data?.error || `rotate failed (${res.status})`);
      }
      rotatedToken = data.token;
      try {
        await navigator.clipboard.writeText(data.token);
      } catch {
        // ignore
      }
      // Force sign-out so the admin UI re-prompts for the new token.
      await auth.signOut();
      stampAction("success", "Access token rotated");
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Failed to rotate token";
      stampAction("error", "Access token rotation failed");
    } finally {
      rotatingToken = false;
      await loadStatus();
    }
  }

  async function saveUploadRetention() {
    if (savingUploadRetention) return;
    savingUploadRetention = true;
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/uploads/retention", {
        method: "POST",
        headers,
        body: JSON.stringify({
          retentionDays: uploadRetentionDays,
          pruneIntervalHours: uploadPruneIntervalHours,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `save failed (${res.status})`);
      }
      stampAction("success", "Upload settings saved");
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Failed to save upload settings";
      stampAction("error", "Upload settings save failed");
    } finally {
      savingUploadRetention = false;
      await loadStatus();
      await loadUploadStats();
      await loadDebugEvents();
      await loadOpsLog();
    }
  }

  async function runValidate() {
    if (validating) return;
    validating = true;
    try {
      const headers: Record<string, string> = {};
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/validate", { headers });
      const data = (await res.json().catch(() => null)) as ValidateResp | null;
      if (!res.ok || !data) {
        throw new Error(`validate failed (${res.status})`);
      }
      validateResp = data;
      stampAction(data.ok ? "success" : "error", data.ok ? "Validate completed (ok)" : "Validate completed (issues found)");
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Validate failed";
      stampAction("error", "Validate failed");
    } finally {
      validating = false;
    }
  }

  async function runRepair() {
    if (repairing) return;
    repairing = true;
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;

      // Conservative repairs only.
      // Note: fixTailscaleServe is best-effort and may fail if Serve is not enabled on the tailnet.
      const actions = ["ensureUploadDir", "startAnchor", "pruneUploads", "fixTailscaleServe"];
      const res = await fetch("/admin/repair", {
        method: "POST",
        headers,
        body: JSON.stringify({ actions }),
      });
      const data = (await res.json().catch(() => null)) as ValidateResp | null;
      if (!res.ok || !data) {
        throw new Error(`repair failed (${res.status})`);
      }
      validateResp = data;
      stampAction(data.ok ? "success" : "error", data.ok ? "Repair completed (ok)" : "Repair completed (issues remain)");
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Repair failed";
      stampAction("error", "Repair failed");
    } finally {
      repairing = false;
      await loadStatus();
      await loadLogs();
      await loadOpsLog();
    }
  }

  async function _startAnchor() {
    if (busy) return;
    busy = true;
    statusError = null;
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/anchor/start", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `start failed (${res.status})`);
      }
      stampAction("success", "Anchor start requested");
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Failed to start anchor";
      stampAction("error", "Anchor start failed");
    } finally {
      busy = false;
      await loadStatus();
      await loadLogs();
    }
  }

  async function stopAnchor() {
    if (busy) return;
    const okToStop = confirm("Stop anchor now? Active operations may disconnect.");
    if (!okToStop) return;
    busy = true;
    statusError = null;
    try {
      const headers: Record<string, string> = {};
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/anchor/stop", { method: "POST", headers });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `stop failed (${res.status})`);
      }
      stampAction("success", "Anchor stopped");
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Failed to stop anchor";
      stampAction("error", "Anchor stop failed");
    } finally {
      busy = false;
      await loadStatus();
      await loadLogs();
    }
  }

  async function updateQr() {
    // Security: load QR as an image blob using Authorization header, not by putting the token in a querystring.
    if (!pair?.code) {
      if (pairQrObjectUrl) URL.revokeObjectURL(pairQrObjectUrl);
      pairQrObjectUrl = "";
      return;
    }
    try {
      const headers: Record<string, string> = {};
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch(`/admin/pair/qr.svg?code=${encodeURIComponent(pair.code)}`, { headers });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `QR failed (${res.status})`);
      }
      const blob = await res.blob();
      const nextUrl = URL.createObjectURL(blob);
      if (pairQrObjectUrl) URL.revokeObjectURL(pairQrObjectUrl);
      pairQrObjectUrl = nextUrl;
    } catch (e) {
      if (pairQrObjectUrl) URL.revokeObjectURL(pairQrObjectUrl);
      pairQrObjectUrl = "";
      pairError = e instanceof Error ? e.message : "QR generation failed";
    }
  }

  async function newPair() {
    pairError = null;
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (auth.token) headers.authorization = `Bearer ${auth.token}`;
      const res = await fetch("/admin/pair/new", { method: "POST", headers, body: "{}" });
      const data = (await res.json().catch(() => null)) as null | {
        code?: string;
        pairUrl?: string;
        expiresAt?: number;
        error?: string;
      };
      if (!res.ok || !data?.code || !data?.pairUrl || !data?.expiresAt) {
        throw new Error(data?.error || `pair failed (${res.status})`);
      }
      pair = { code: data.code, pairUrl: data.pairUrl, expiresAt: data.expiresAt };
      await updateQr();
      stampAction("success", "Pairing code generated");
    } catch (e) {
      pairError = e instanceof Error ? e.message : "Failed to create pairing code";
      stampAction("error", "Pairing code generation failed");
    }
  }

  $effect(() => {
    loadStatus();
    loadUploadStats();
    loadLogs();
    loadDebugEvents();
    loadOpsLog();
    const id = setInterval(() => {
      loadStatus();
    }, 5000);
    return () => clearInterval(id);
  });

  $effect(() => {
    if (!auth.token) return;
    loadCliCommands();
    loadTokenSessions();
  });

  $effect(() => {
    // If the pair changes for any reason, re-render the QR.
    void updateQr();

    // Cleanup object URL on component teardown.
    return () => {
      if (pairQrObjectUrl) URL.revokeObjectURL(pairQrObjectUrl);
      if (cliPairQrObjectUrl) URL.revokeObjectURL(cliPairQrObjectUrl);
    };
  });

  $effect(() => {
    // First-run UX: auto-generate a pairing code once after auth succeeds so the user immediately sees a QR.
    // We persist a local flag to avoid minting a new code on every page refresh.
    if (autoPairTried) return;
    if (!auth.token) return;
    if (pair) return;
    try {
      // Key includes a small token fingerprint so reinstall/new-token triggers auto-pair again.
      const fp = auth.token.slice(-8);
      const key = `codex-pocket:autoPairDone:${location.origin}:${fp}`;
      if (localStorage.getItem(key) === "1") {
        autoPairTried = true;
        return;
      }
      autoPairTried = true;
      void (async () => {
        await newPair();
        localStorage.setItem(key, "1");
      })();
    } catch {
      // localStorage may be blocked; still try once per load.
      autoPairTried = true;
      void newPair();
    }
  });
</script>

<div class="admin stack">
  <AppHeader status={socket.status}>
    {#snippet actions()}
      <a href="/settings">Settings</a>
      <button
        type="button"
        onclick={() => theme.cycle()}
        title="Theme: {theme.current}"
        aria-label={`Cycle theme (current: ${theme.current})`}
      >
        {theme.current}
      </button>
    {/snippet}
  </AppHeader>

  <div class="content">
    <div class="admin-grid">
      <div class="col stack">
        <div class="section stack">
          <div class="section-header">
            <div>
              <span class="section-title">Status</span>
              <div class="section-subtitle">Service state, builds, and storage.</div>
            </div>
          </div>
          <div class="section-body stack">
  <div class="content stack">
    <div class="overview-grid">
      <div class="panel panel-core">
      <SectionCard title="Admin" subtitle="System status and core operations">
        {#if statusError}
          <p class="hint hint-error" role="alert">{statusError}</p>
        {/if}
        <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {#if lastAction}
            {lastAction.label} at {formatActionTime(lastAction.at)}
          {/if}
        </p>
        {#if lastAction}
          <div class="row" aria-hidden="true">
            <StatusChip tone={lastAction.tone}>
              {lastAction.label} at {formatActionTime(lastAction.at)}
            </StatusChip>
          </div>
        {/if}

        {#if !status}
          <p class="hint">Loading...</p>
        {:else}
          <div class="status-pills">
            <span class="pill ok">Server online</span>
            <span class={`pill ${status.anchor.running ? "ok" : "warn"}`}>Anchor {status.anchor.running ? "running" : "stopped"}</span>
            <span class={`pill ${status.anchorAuth?.status === "invalid" ? "bad" : status.anchorAuth?.status === "ok" ? "ok" : "muted"}`}>
              Auth {status.anchorAuth?.status ?? "unknown"}
            </span>
          <div class="row">
            <StatusChip tone={status.anchor.running ? "success" : "warning"}>
              Anchor {status.anchor.running ? "running" : "stopped"}
            </StatusChip>
            <StatusChip tone={status.anchorAuth?.status === "invalid" ? "error" : status.anchorAuth?.status === "ok" ? "success" : "neutral"}>
              Auth {status.anchorAuth?.status || "unknown"}
            </StatusChip>
          </div>
          <div class="kv">
            <div class="k">Server</div>
            <div class="v">{status.server.host}:{status.server.port}</div>

            <div class="k">UI dist</div>
            <div class="v"><code>{status.uiDistDir}</code></div>

            <div class="k">UI build</div>
            <div class="v"><code>{UI_COMMIT || "unknown"}</code>{#if UI_BUILT_AT} <span class="dim">({UI_BUILT_AT})</span>{/if}</div>

            <div class="k">Server build</div>
            <div class="v"><code>{status.version?.appCommit || "unknown"}</code></div>

            <div class="k">Anchor</div>
            <div class="v">{status.anchor.running ? "running" : "stopped"}</div>

            <div class="k">Anchor cwd</div>
            <div class="v"><code>{status.anchor.cwd}</code></div>

            <div class="k">Anchor addr</div>
            <div class="v">{status.anchor.host}:{status.anchor.port}</div>

            <div class="k">Anchor log</div>
            <div class="v"><code>{status.anchor.log}</code></div>

            <div class="k">Anchor auth</div>
            <div class="v">
              {#if status.anchorAuth?.status === "invalid"}
                <span class="auth-bad">invalid</span>
                {#if status.anchorAuth.code} <span class="dim">({status.anchorAuth.code})</span>{/if}
                {#if status.anchorAuth.at} <span class="dim">at {status.anchorAuth.at}</span>{/if}
                {#if status.anchorAuth.message}
                  <div class="dim">{status.anchorAuth.message}</div>
                {/if}
                <div class="hint hint-error">Re-login in Codex desktop, then run `codex-pocket restart`.</div>
              {:else if status.anchorAuth?.status === "ok"}
                <span class="auth-ok">ok</span>
                {#if status.anchorAuth.at} <span class="dim">since {status.anchorAuth.at}</span>{/if}
              {:else}
                <span class="dim">unknown</span>
              {/if}
            </div>

            <div class="k">DB</div>
            <div class="v"><code>{status.db.path}</code> (retention {status.db.retentionDays}d)</div>

            <div class="k">Uploads</div>
            <div class="v">{status.db.uploadDir ? `dir: ${status.db.uploadDir}` : "(not configured)"}</div>

            <div class="k">Upload retention</div>
            <div class="v">{(status.db.uploadRetentionDays ?? uploadRetentionDays)} day(s) ({(status.db.uploadRetentionDays ?? uploadRetentionDays) === 0 ? "keep forever" : "auto-clean"})</div>
            <div class="k">Auto cleanup cadence</div>
            <div class="v">every {(status.db.uploadPruneIntervalHours ?? uploadPruneIntervalHours)} hour(s)</div>
          </div>
        {/if}
          </div>
        </div>

        <div class="section stack">
          <div class="section-header">
            <div>
              <span class="section-title">Controls</span>
              <div class="section-subtitle">Validate, repair, and manage the service.</div>

        <div class="row buttons">
          <button type="button" onclick={runValidate} disabled={!auth.token || validating}>
            {validating ? "Validating..." : "Validate"}
          </button>
          <button type="button" onclick={runRepair} disabled={!auth.token || repairing}>
            {repairing ? "Repairing..." : "Repair"}
          </button>
          <button
            class="danger"
            type="button"
            onclick={stopAnchor}
            disabled={busy || !status.anchor.running}
            aria-label="Stop anchor service (disruptive action)"
          >
            Stop anchor
          </button>
          <button type="button" onclick={loadLogs} disabled={busy}>Refresh logs</button>
        </div>

        {#if validateResp?.checks}
          <div class="validate stack">
            <div class="hint {validateResp.ok ? "hint-ok" : "hint-error"}" role="status" aria-live="polite" aria-atomic="true">
              {validateResp.ok ? "Validate: OK" : "Validate: issues detected"}
            </div>
          </div>
          <div class="section-body stack">
            <div class="toolbar">
              <button class="btn" type="button" onclick={runValidate} disabled={!auth.token || validating}>
                {validating ? "Validating..." : "Validate"}
              </button>
              <button class="btn" type="button" onclick={runRepair} disabled={!auth.token || repairing}>
                {repairing ? "Repairing..." : "Repair"}
              </button>
              <button class="btn danger" type="button" onclick={stopAnchor} disabled={busy || !status?.anchor.running}>Stop anchor</button>
              <button class="btn" type="button" onclick={loadLogs} disabled={busy}>Refresh logs</button>
            </div>

            {#if validateResp?.checks}
              <div class="validate stack">
                <div class="hint {validateResp.ok ? "hint-ok" : "hint-error"}">
                  {validateResp.ok ? "Validate: OK" : "Validate: issues detected"}
                </div>
                <div class="checks">
                  {#each validateResp.checks as c (c.id)}
                    <div class="check row">
                      <span class="dot" class:bad={!c.ok}>●</span>
                      <span class="sum">{c.summary}</span>
                    </div>
                    {#if c.detail}
                      <pre class="check-detail">{c.detail}</pre>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>

        <div class="section stack">
          <div class="section-header">
            <div>
              <span class="section-title">Uploads</span>
              <div class="section-subtitle">Retention and maintenance.</div>
            </div>
          </div>
          <div class="section-body stack">
            <p class="hint">Uploads are stored locally on your Mac. Default retention is permanent.</p>

            <div class="field stack">
              <label for="upload-retention">upload retention (days)</label>
              <input
                id="upload-retention"
                type="number"
                min="0"
                max="3650"
                bind:value={uploadRetentionDays}
              />
              <p class="hint">0 = keep uploads forever. Cleanup runs periodically on the Mac (and you can run it manually).</p>
              <div class="toolbar">
                <button class="btn" type="button" onclick={saveUploadRetention} disabled={!auth.token || savingUploadRetention}>
                  {savingUploadRetention ? "Saving..." : "Save"}
                </button>
                <button class="btn" type="button" onclick={pruneUploadsNow} disabled={!auth.token || pruningUploads}>
                  {pruningUploads ? "Pruning..." : "Run cleanup now"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="section stack">
          <div class="section-header">
            <div>
              <span class="section-title">Debug</span>
              <div class="section-subtitle">Events and admin token controls.</div>
            </div>
          </div>
          <div class="section-body stack">
            <p class="hint">Last 50 stored events (redacted). Useful for diagnosing blank threads or protocol mismatches.</p>
            <div class="toolbar">
              <button class="btn" type="button" onclick={loadDebugEvents} disabled={busy}>Refresh events</button>
              <button class="btn" type="button" onclick={pruneUploadsNow} disabled={!auth.token || pruningUploads}>
                {pruningUploads ? "Pruning..." : "Run upload cleanup"}
              </button>
              <button class="btn danger" type="button" onclick={rotateToken} disabled={!auth.token || rotatingToken}>
                {rotatingToken ? "Rotating..." : "Rotate access token"}
              </button>
            </div>
            {#if rotatedToken}
              <p class="hint">New token copied to clipboard. You will need to sign in again on all devices.</p>
              <p><code>{rotatedToken}</code></p>
            {/if}
            <pre class="logs">{debugEvents || "(no events yet)"}</pre>
          </div>
        </div>
      </div>

      <div class="col stack">
        <div class="section stack">
          <div class="section-header">
            <div>
              <span class="section-title">Remote CLI</span>
              <div class="section-subtitle">Run a limited set of safe commands.</div>
            </div>
          </div>
          <div class="section-body stack">
            <div class="row buttons">
              <label class="field">
                <span>Command</span>
                <select bind:value={cliSelected} disabled={cliRunning || cliCommands.length === 0}>
                  {#each cliCommands as cmd (cmd.id)}
                    <option value={cmd.id}>
                      {cmd.label}{cmd.risky ? " (disruptive)" : ""}
                    </option>
                  {/each}
                </select>
              </label>
              <button class="btn" type="button" onclick={runCliCommand} disabled={!auth.token || cliRunning || !cliSelected}>
                {cliRunning ? "Running..." : "Run"}
              </button>
            </div>
            {#if cliSelected}
              {#each cliCommands as cmd (cmd.id)}
                {#if cmd.id === cliSelected}
                  <div class="hint">{cmd.description}</div>
                  {#if cmd.risky}
                    <div class="hint hint-error">This command may disconnect the admin session.</div>
                  {/if}
                {/if}
              {/each}
            {/if}
            {#if cliError}
              <p class="hint hint-error">{cliError}</p>
            {/if}
            {#if cliOutput}
              <pre class="cli-output">{cliOutput}</pre>
            {/if}
            {#if cliPairUrl}
              <div class="kv" style="margin-top: var(--space-md);">
                <div class="k">Pair link</div>
                <div class="v"><a href={cliPairUrl}>{cliPairUrl}</a></div>
              </div>
              {#if cliPairQrObjectUrl}
                <div class="qr"><img alt="Pairing QR code" src={cliPairQrObjectUrl} /></div>
              {/if}
            {/if}
          </div>
        </div>

        <div class="section stack">
          <div class="section-header">
            <div>
              <span class="section-title">Pair iPhone</span>
              <div class="section-subtitle">Scan to connect a new device.</div>
            </div>
          </div>
          <div class="section-body stack">
            <p class="hint">Generate a short-lived pairing code, then scan the QR with your iPhone.</p>
            {#if pairError}
              <p class="hint hint-error">{pairError}</p>
            {/if}
            <div class="toolbar">
              <button class="btn primary" type="button" onclick={newPair} disabled={!auth.token}>Regenerate pairing code</button>
            </div>
            {#if !auth.token}
              <p class="hint hint-error">Sign in first (token required) to create pairing codes.</p>
            {/if}
            {#if pair}
              <div class="kv" style="margin-top: var(--space-md);">
                <div class="k">Code</div>
                <div class="v"><code>{pair.code}</code></div>
                <div class="k">Expires</div>
                <div class="v">{new Date(pair.expiresAt).toLocaleString()}</div>
                <div class="k">Link</div>
                <div class="v"><a href={pair.pairUrl}>{pair.pairUrl}</a></div>
              </div>
              {#if pairQrObjectUrl}
                <div class="qr"><img alt="Pairing QR code" src={pairQrObjectUrl} /></div>
              {:else}
                <p class="hint hint-error">QR did not render. Open the Link above on your iPhone.</p>
              {/if}
            {/if}
        {/if}
        {/if}
      </SectionCard>
      </div>
      <div class="panel panel-pair">
      <SectionCard title="Pair iPhone" subtitle="Generate a short-lived code and scan on iPhone">
        <p class="hint">Generate a short-lived pairing code, then scan the QR with your iPhone.</p>
        {#if pairError}
          <p class="hint hint-error" role="alert">{pairError}</p>
        {/if}
        <div class="row buttons">
          <button class="primary" type="button" onclick={newPair} disabled={!auth.token}>Regenerate pairing code</button>
        </div>
        {#if !auth.token}
          <p class="hint hint-error">Sign in first (token required) to create pairing codes.</p>
        {/if}
        {#if pair}
          <div class="kv" style="margin-top: var(--space-md);">
            <div class="k">Code</div>
            <div class="v"><code>{pair.code}</code></div>
            <div class="k">Expires</div>
            <div class="v">{new Date(pair.expiresAt).toLocaleString()}</div>
            <div class="k">Link</div>
            <div class="v"><a href={pair.pairUrl}>{pair.pairUrl}</a></div>
          </div>
          {#if pairQrObjectUrl}
            <div class="qr"><img alt="Pairing QR code" src={pairQrObjectUrl} /></div>
          {:else}
            <p class="hint hint-error">QR did not render. Open the Link above on your iPhone.</p>
          {/if}
        {/if}
      </SectionCard>
      </div>
    </div>

    <div class="panel panel-full">
      <SectionCard title="Uploads">
        <p class="hint">Uploads are stored locally on your Mac. Default retention is permanent.</p>
        {#if uploadStats}
          <div class="kv">
            <div class="k">Stored files</div>
            <div class="v">{uploadStats.fileCount}</div>
            <div class="k">Storage used</div>
            <div class="v">{formatBytes(uploadStats.totalBytes)}</div>
            <div class="k">Oldest file</div>
            <div class="v">{uploadStats.oldestAt ? new Date(uploadStats.oldestAt).toLocaleString() : "n/a"}</div>
            <div class="k">Newest file</div>
            <div class="v">{uploadStats.newestAt ? new Date(uploadStats.newestAt).toLocaleString() : "n/a"}</div>
            <div class="k">Last prune activity</div>
            <div class="v">{uploadStats.lastPruneAt ? new Date(uploadStats.lastPruneAt).toLocaleString() : "n/a"}</div>
            <div class="k">Last prune source</div>
            <div class="v">{uploadStats.lastPruneSource || "n/a"}</div>
            <div class="k">Last prune detail</div>
            <div class="v">{uploadStats.lastPruneMessage || "n/a"}</div>
          </div>
        {/if}

        <div class="field stack">
          <label for="upload-retention">upload retention (days)</label>
          <input
            id="upload-retention"
            type="number"
            min="0"
            max="3650"
            aria-describedby="upload-retention-help"
            bind:value={uploadRetentionDays}
          />
          <p class="hint" id="upload-retention-help">0 = keep uploads forever. Cleanup runs periodically on the Mac (and you can run it manually).</p>
          <label for="upload-prune-interval">auto cleanup interval (hours)</label>
          <input
            id="upload-prune-interval"
            type="number"
            min="1"
            max="168"
            aria-describedby="upload-prune-interval-help"
            bind:value={uploadPruneIntervalHours}
          />
          <p class="hint" id="upload-prune-interval-help">Valid range is 1 to 168 hours (weekly max).</p>
          <div class="row buttons">
            <button type="button" onclick={saveUploadRetention} disabled={!auth.token || savingUploadRetention}>
              {savingUploadRetention ? "Saving..." : "Save"}
            </button>
            <button type="button" onclick={pruneUploadsNow} disabled={!auth.token || pruningUploads}>
              {pruningUploads ? "Pruning..." : "Run cleanup now"}
            </button>
          </div>
        </div>

        <div class="section stack">
          <div class="section-header">
            <div>
              <span class="section-title">Anchor logs</span>
              <div class="section-subtitle">Tail of the anchor process.</div>
            </div>
          </div>
          <div class="section-body">
            <pre class="logs">{logs || "(no logs yet)"}</pre>
          </div>
        </div>

        <div class="section stack">
          <div class="section-header">
            <div>
              <span class="section-title">Ops log</span>
              <div class="section-subtitle">Server maintenance + installer actions.</div>
            </div>
          </div>
          <div class="section-body">
            <pre class="logs">{opsLog || "(no ops logs yet)"}</pre>
          </div>
        </div>
      </div>
        <pre class="logs">{opsLog || "(no ops logs yet)"}</pre>
      </SectionCard>
    </div>

    <div class="advanced-stack">
      <details class="advanced" bind:open={showCliAdvanced}>
        <summary id="advanced-cli-summary">Advanced: Remote CLI</summary>
        <div role="region" aria-labelledby="advanced-cli-summary">
        <SectionCard title="CLI (Remote)" subtitle="Run a limited set of safe codex-pocket commands">
          <p class="hint">Run a limited set of safe `codex-pocket` CLI commands from this page.</p>
          <div class="row buttons">
            <label class="field">
              <span>Command</span>
              <select id="cli-command" bind:value={cliSelected} disabled={cliRunning || cliCommands.length === 0}>
                {#each cliCommands as cmd (cmd.id)}
                  <option value={cmd.id}>
                    {cmd.label}{cmd.risky ? " (disruptive)" : ""}
                  </option>
                {/each}
              </select>
            </label>
            <button type="button" onclick={runCliCommand} disabled={!auth.token || cliRunning || !cliSelected}>
              {cliRunning ? "Running..." : "Run"}
            </button>
          </div>
          {#if cliSelected}
            {#each cliCommands as cmd (cmd.id)}
              {#if cmd.id === cliSelected}
                <div class="hint">{cmd.description}</div>
                {#if cmd.risky}
                  <div class="hint hint-error">This command may disconnect the admin session.</div>
                {/if}
              {/if}
            {/each}
          {/if}
          {#if cliError}
            <p class="hint hint-error" role="alert">{cliError}</p>
          {/if}
          {#if cliOutput}
            <pre class="cli-output">{cliOutput}</pre>
          {/if}
          {#if cliPairUrl}
            <div class="kv" style="margin-top: var(--space-md);">
              <div class="k">Pair link</div>
              <div class="v"><a href={cliPairUrl}>{cliPairUrl}</a></div>
            </div>
            {#if cliPairQrObjectUrl}
              <div class="qr"><img alt="Pairing QR code" src={cliPairQrObjectUrl} /></div>
            {/if}
          {/if}
        </SectionCard>
        </div>
      </details>

      <details class="advanced" bind:open={showLogsAdvanced}>
        <summary id="advanced-logs-summary">Advanced: Logs</summary>
        <div role="region" aria-labelledby="advanced-logs-summary">
        <SectionCard title="Anchor Logs (Tail)">
          <pre class="logs" aria-label="Anchor logs tail">{logs || "(no logs yet)"}</pre>
        </SectionCard>
        </div>
      </details>

      <details class="advanced" bind:open={showDebugAdvanced}>
        <summary id="advanced-debug-summary">Advanced: Debug</summary>
        <div role="region" aria-labelledby="advanced-debug-summary">
        <SectionCard title="Debug">
          <p class="hint">Last 50 stored events (redacted). Useful for diagnosing blank threads or protocol mismatches.</p>
          <div class="row buttons">
            <button type="button" onclick={loadDebugEvents} disabled={busy}>Refresh events</button>
            <button type="button" onclick={pruneUploadsNow} disabled={!auth.token || pruningUploads}>
              {pruningUploads ? "Pruning..." : "Run upload cleanup"}
            </button>
            <DangerZone>
              <button
                class="danger"
                type="button"
                onclick={rotateToken}
                disabled={!auth.token || rotatingToken}
                aria-label="Rotate access token (disruptive action)"
              >
                {rotatingToken ? "Rotating..." : "Rotate access token"}
              </button>
            </DangerZone>
          </div>
          {#if rotatedToken}
            <p class="hint" role="status" aria-live="polite">New legacy token copied to clipboard. Session-token devices stay connected.</p>
            <p><code>{rotatedToken}</code></p>
          {/if}

          <div class="token-sessions stack">
            <div class="row">
              <StatusChip tone="neutral">Token sessions: {status?.tokenSessions?.active ?? tokenSessions.filter((s) => !s.revokedAt).length} active</StatusChip>
              <StatusChip tone="neutral">Total: {status?.tokenSessions?.total ?? tokenSessions.length}</StatusChip>
            </div>
            <div class="field stack">
              <label for="token-session-label">new token label</label>
              <input
                id="token-session-label"
                type="text"
                maxlength="120"
                bind:value={tokenSessionLabel}
                placeholder="Dane iPhone"
              />
              <label for="token-session-mode">session mode</label>
              <select id="token-session-mode" bind:value={tokenSessionMode}>
                <option value="full">Full access</option>
                <option value="read_only">Read-only</option>
              </select>
              <div class="row buttons">
                <button type="button" onclick={createTokenSession} disabled={!auth.token || creatingTokenSession}>
                  {creatingTokenSession ? "Creating..." : "Create token session"}
                </button>
                <button type="button" onclick={loadTokenSessions} disabled={!auth.token || loadingTokenSessions}>
                  {loadingTokenSessions ? "Refreshing..." : "Refresh sessions"}
                </button>
              </div>
            </div>
            {#if tokenSessionError}
              <p class="hint hint-error">{tokenSessionError}</p>
            {/if}
            {#if createdSessionToken}
              <p class="hint" role="status" aria-live="polite">
                New session token copied to clipboard (best effort). Save it now; this value is shown once.
              </p>
              <p><code>{createdSessionToken}</code></p>
            {/if}
            {#if tokenSessions.length === 0}
              <p class="hint">No session tokens yet. Legacy access token is still enabled.</p>
            {:else}
              <div class="token-session-list stack">
                {#each tokenSessions as session (session.id)}
                  <div class="token-session-item">
                    <div class="row token-session-head">
                      <strong>{session.label || session.id}</strong>
                      <StatusChip tone={session.revokedAt ? "error" : "success"}>
                        {session.revokedAt ? "revoked" : "active"}
                      </StatusChip>
                    </div>
                    <div class="hint mono">id: {session.id}</div>
                    <div class="hint">mode: {session.mode === "read_only" ? "read-only" : "full access"}</div>
                    <div class="hint">created: {new Date(session.createdAt).toLocaleString()}</div>
                    <div class="hint">last used: {new Date(session.lastUsedAt).toLocaleString()}</div>
                    {#if session.revokedAt}
                      <div class="hint">revoked: {new Date(session.revokedAt).toLocaleString()}</div>
                    {:else}
                      <div class="row buttons">
                        <button
                          class="danger"
                          type="button"
                          onclick={() => revokeTokenSession(session.id)}
                          disabled={revokingSessionId === session.id}
                        >
                          {revokingSessionId === session.id ? "Revoking..." : "Revoke"}
                        </button>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
          <pre class="logs" aria-label="Debug events">{debugEvents || "(no events yet)"}</pre>
        </SectionCard>
        </div>
      </details>
    </div>
  </div>
</div>

<style>
  .admin {
    min-height: 100vh;
    background: radial-gradient(1200px 800px at 10% -10%, rgba(255, 255, 255, 0.06), transparent 60%),
      radial-gradient(900px 600px at 90% -20%, rgba(255, 255, 255, 0.04), transparent 55%),
    background:
      radial-gradient(1200px 520px at 8% -18%, color-mix(in srgb, var(--cli-prefix-agent) 14%, transparent), transparent 70%),
      radial-gradient(800px 420px at 92% -30%, color-mix(in srgb, var(--cli-prefix-web) 11%, transparent), transparent 74%),
      var(--cli-bg);
  }

  .content {
    padding: calc(var(--space-lg) * 1.2) var(--space-lg);
    max-width: 1200px;
    padding: var(--space-lg) var(--space-md) var(--space-xl);
    max-width: 1240px;
    margin: 0 auto;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .overview-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-lg);
    align-items: start;
  }

  .advanced-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .admin-grid {
    display: grid;
    grid-template-columns: minmax(320px, 1.2fr) minmax(320px, 0.8fr);
    gap: var(--space-lg);
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }
  @media (max-width: 980px) {
    .admin-grid {
      grid-template-columns: 1fr;
    }
  }
  .section {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  }
  .section-header {
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .section-title {
    font-size: 16px;
    letter-spacing: 0.02em;
    font-weight: 600;
  }
  .section-subtitle {
    margin-top: 4px;
    font-size: 12px;
    color: var(--cli-text-dim);
  }
  .section-body {
    padding: var(--space-lg);
  }
  .kv {
    display: grid;
    grid-template-columns: 140px 1fr;

  @media (min-width: 1040px) {
    .overview-grid {
      grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    }
  }

  .panel {
    min-width: 0;
  }

  .admin :global(.section) {
    border-radius: 12px;
    border-color: color-mix(in srgb, var(--cli-border) 85%, transparent);
    background: color-mix(in srgb, var(--cli-bg-elevated) 84%, var(--cli-bg));
    box-shadow: 0 16px 34px -30px rgba(0, 0, 0, 0.9);
  }

  .admin :global(.section-header) {
    padding: var(--space-md) var(--space-md) var(--space-sm);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--cli-bg-elevated) 75%, var(--cli-bg)),
      color-mix(in srgb, var(--cli-bg) 88%, transparent)
    );
  }

  .admin :global(.section-title) {
    font-size: 0.69rem;
    letter-spacing: 0.11em;
  }

  .admin :global(.section-body) {
    --stack-gap: var(--space-md);
    padding: var(--space-md);
  }

  .kv {
    display: grid;
    grid-template-columns: minmax(140px, 178px) 1fr;
    gap: var(--space-sm) var(--space-md);
    font-family: var(--font-mono);
    font-size: 0.79rem;
    line-height: 1.5;
  }

  .k {
    color: var(--cli-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.65rem;
    padding-top: 3px;
  }

  .v {
    min-width: 0;
    color: var(--cli-text);
  }

  .v code {
    word-break: break-all;
    padding: 0.08rem 0.35rem;
    border-radius: 6px;
    background: color-mix(in srgb, var(--cli-bg-hover) 65%, transparent);
  }

  .buttons {
    gap: var(--space-sm);
    flex-wrap: wrap;
  }
  .toolbar {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }
  .btn {
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: var(--cli-text);
    font-size: 13px;
  }
  .btn:hover {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
  }
  .btn.primary {
    background: rgba(64, 134, 255, 0.18);
    border-color: rgba(64, 134, 255, 0.4);
    color: #cfe1ff;
  }
  .btn.danger {
    background: rgba(178, 60, 60, 0.2);
    border-color: rgba(200, 80, 80, 0.6);
    color: #ffd1d1;
    margin-top: var(--space-sm);
  }

  button,
  .admin a[href]:not(.brand) {
    border-radius: 10px;
  }

  button {
    padding: 0.5rem 0.9rem;
    border: 1px solid color-mix(in srgb, var(--cli-border) 70%, transparent);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--cli-bg-elevated) 95%, #fff 5%),
      color-mix(in srgb, var(--cli-bg-elevated) 80%, var(--cli-bg))
    );
    color: var(--cli-text);
    font-family: var(--font-sans);
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    box-shadow: 0 8px 16px -13px rgba(0, 0, 0, 0.9);
    cursor: pointer;
  }

  button:hover:enabled {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--cli-prefix-agent) 45%, var(--cli-border));
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--cli-bg-hover) 70%, #fff 8%),
      color-mix(in srgb, var(--cli-bg-elevated) 88%, var(--cli-bg))
    );
  }

  button:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }

  button.primary {
    border-color: color-mix(in srgb, var(--cli-prefix-agent) 46%, var(--cli-border));
    background: color-mix(in srgb, var(--cli-prefix-agent) 20%, var(--cli-bg-elevated));
  }

  .advanced {
    border: 1px solid color-mix(in srgb, var(--cli-border) 78%, transparent);
    border-radius: 12px;
    overflow: hidden;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--cli-bg-elevated) 92%, var(--cli-bg)),
      color-mix(in srgb, var(--cli-bg-elevated) 82%, #000 4%)
    );
    box-shadow: 0 14px 32px -30px rgba(0, 0, 0, 0.85);
  }

  .advanced > summary {
    cursor: pointer;
    padding: 0.82rem var(--space-md);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--cli-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.09em;
    list-style: none;
    border-bottom: 1px solid transparent;
  }

  .advanced > summary:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--cli-prefix-agent) 55%, var(--cli-border));
    border-bottom-color: var(--cli-border);
  }

  .advanced[open] > summary {
    border-bottom-color: var(--cli-border);
    background: color-mix(in srgb, var(--cli-bg-hover) 45%, var(--cli-bg-elevated));
    color: var(--cli-text);
  }

  .advanced > summary::after {
    content: "▾";
    font-size: 0.78rem;
    letter-spacing: 0;
    transition: transform 0.16s ease;
  }

  .advanced[open] > summary::after {
    transform: rotate(180deg);
  }

  .advanced > summary::-webkit-details-marker {
    display: none;
  }

  button:focus-visible,
  a:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--cli-prefix-agent) 55%, var(--cli-border));
  }

  .row :global(.danger-zone) {
    flex: 0 0 auto;
  }
  .qr {
    margin-top: var(--space-md);
    display: flex;
    justify-content: flex-start;
  }
  .qr img {
    width: 260px;
    height: 260px;
    image-rendering: pixelated;
    border: 1px solid var(--cli-border);
    border-radius: 10px;
    background: #fff;
    padding: 8px;
  }
  .status-pills {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-bottom: var(--space-md);
  }
  .pill {
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: var(--cli-text-dim);
  }
  .pill.ok {
    border-color: rgba(70, 200, 120, 0.35);
    color: #9be3bf;
    background: rgba(70, 200, 120, 0.08);
  }
  .pill.warn {
    border-color: rgba(240, 170, 70, 0.4);
    color: #ffd79a;
    background: rgba(240, 170, 70, 0.08);
  }
  .pill.bad {
    border-color: rgba(200, 80, 80, 0.6);
    color: #ffd1d1;
    background: rgba(200, 80, 80, 0.1);
  }
  .pill.muted {
    border-color: rgba(255, 255, 255, 0.1);
    color: var(--cli-text-dim);

  .danger {
    border-color: color-mix(in srgb, var(--cli-error) 55%, var(--cli-border));
    color: color-mix(in srgb, var(--cli-error) 75%, var(--cli-text));
    background: color-mix(in srgb, var(--cli-error) 18%, var(--cli-bg-elevated));
  }

  .logs {
    max-height: 400px;
    overflow: auto;
    background: rgba(0, 0, 0, 0.25);
    padding: var(--space-md);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: color-mix(in srgb, var(--cli-bg) 84%, #000 16%);
    padding: var(--space-md);
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--cli-border) 82%, transparent);
    line-height: 1.45;
    font-size: 0.76rem;
  }

  .field input {
    width: 100%;
    padding: var(--space-sm);
    background: color-mix(in srgb, var(--cli-bg) 72%, var(--cli-bg-elevated));
    color: var(--cli-text);
    border: 1px solid color-mix(in srgb, var(--cli-border) 86%, transparent);
    border-radius: 8px;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  .field select {
    width: 100%;
    padding: var(--space-sm);
    background: color-mix(in srgb, var(--cli-bg) 72%, var(--cli-bg-elevated));
    color: var(--cli-text);
    border: 1px solid color-mix(in srgb, var(--cli-border) 86%, transparent);
    border-radius: 8px;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  .field input:focus {
    outline: none;
    border-color: var(--cli-text-muted);
    box-shadow: var(--shadow-focus);
  }

  .field select:focus {
    outline: none;
    border-color: var(--cli-text-muted);
    box-shadow: var(--shadow-focus);
  }
  .qr {
    margin-top: var(--space-md);
  }

  .validate {
    margin-top: var(--space-md);
  }

  .hint-ok {
    color: color-mix(in srgb, var(--cli-success) 72%, var(--cli-text));
  }

  .auth-bad {
    color: var(--cli-error);
    font-weight: 600;
  }

  .auth-ok {
    color: var(--cli-success);
    font-weight: 600;
  }

  .checks {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .check {
    gap: var(--space-sm);
    align-items: baseline;
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }

  .dot {
    font-size: 10px;
    color: var(--cli-success);
  }
  .dot.bad {
    color: var(--cli-error);
  }

  .check-detail {
    margin: 0;
    padding: var(--space-sm);
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--cli-bg) 84%, #000 16%);
    border: 1px solid color-mix(in srgb, var(--cli-border) 82%, transparent);
    border-radius: 8px;
    max-height: 200px;
    overflow: auto;
    font-size: 0.75rem;
  }

  .cli-output {
    margin: 0;
    padding: var(--space-sm);
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--cli-bg) 84%, #000 16%);
    border: 1px solid color-mix(in srgb, var(--cli-border) 82%, transparent);
    border-radius: 8px;
    max-height: 260px;
    overflow: auto;
    font-size: 0.75rem;
    white-space: pre-wrap;
  }

  .hint {
    color: var(--cli-text-muted);
    line-height: 1.55;
  }

  .token-sessions {
    margin-top: var(--space-sm);
    padding-top: var(--space-sm);
    border-top: 1px solid color-mix(in srgb, var(--cli-border) 82%, transparent);
  }

  .token-session-list {
    --stack-gap: var(--space-sm);
  }

  .token-session-item {
    border: 1px solid color-mix(in srgb, var(--cli-border) 82%, transparent);
    border-radius: 8px;
    padding: var(--space-sm);
    background: color-mix(in srgb, var(--cli-bg) 76%, var(--cli-bg-elevated));
  }

  .token-session-head {
    justify-content: space-between;
    align-items: center;
  }

  @media (max-width: 660px) {
    .content {
      padding: var(--space-md) var(--space-sm) var(--space-lg);
      gap: var(--space-md);
    }

    .kv {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }

    .k {
      padding-top: 0;
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .dim { color: var(--cli-text-dim); }
  .mono { font-family: var(--font-mono); }
</style>
