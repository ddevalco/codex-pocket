<script lang="ts">
  import AppHeader from "../lib/components/AppHeader.svelte";
  import { socket } from "../lib/socket.svelte";
  import { theme } from "../lib/theme.svelte";
  import { auth } from "../lib/auth.svelte";

  const UI_COMMIT = String(import.meta.env.VITE_CODEX_POCKET_COMMIT ?? "");
  const UI_BUILT_AT = String(import.meta.env.VITE_CODEX_POCKET_BUILT_AT ?? "");

  type Status = {
    server: { host: string; port: number };
    uiDistDir: string;
    anchor: { running: boolean; cwd: string; host: string; port: number; log: string };
    anchorAuth?: { status: "unknown" | "ok" | "invalid"; at?: string; code?: string; message?: string };
    db: { path: string; retentionDays: number; uploadDir?: string; uploadRetentionDays?: number };
    version?: { appCommit?: string };
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
  let savingUploadRetention = $state(false);
  let cliCommands = $state<Array<{ id: string; label: string; description: string; risky?: boolean }>>([]);
  let cliSelected = $state<string>("");
  let cliOutput = $state<string>("");
  let cliRunning = $state(false);
  let cliError = $state<string | null>(null);

  type ValidateResp = {
    ok: boolean;
    checks?: Array<{ id: string; ok: boolean; summary: string; detail?: string }>;
  };

  let validateResp = $state<ValidateResp | null>(null);
  let validating = $state(false);
  let repairing = $state(false);

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
    } catch (e) {
      cliError = e instanceof Error ? e.message : "Failed to run command";
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
    } finally {
      pruningUploads = false;
      await loadStatus();
      await loadOpsLog();
    }
  }


  async function rotateToken() {
    if (rotatingToken) return;
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
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Failed to rotate token";
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
        body: JSON.stringify({ retentionDays: uploadRetentionDays }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `save failed (${res.status})`);
      }
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Failed to save upload retention";
    } finally {
      savingUploadRetention = false;
      await loadStatus();
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
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Validate failed";
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
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Repair failed";
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
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Failed to start anchor";
    } finally {
      busy = false;
      await loadStatus();
      await loadLogs();
    }
  }

  async function stopAnchor() {
    if (busy) return;
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
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Failed to stop anchor";
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
    } catch (e) {
      pairError = e instanceof Error ? e.message : "Failed to create pairing code";
    }
  }

  $effect(() => {
    loadStatus();
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
      <button type="button" onclick={() => theme.cycle()} title="Theme: {theme.current}">
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
        {#if statusError}
          <p class="hint hint-error">{statusError}</p>
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
          </div>
        {/if}
          </div>
        </div>

        <div class="section stack">
          <div class="section-header">
            <div>
              <span class="section-title">Controls</span>
              <div class="section-subtitle">Validate, repair, and manage the service.</div>
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
    </div>
  </div>
</div>

<style>
  .admin {
    min-height: 100vh;
    background: radial-gradient(1200px 800px at 10% -10%, rgba(255, 255, 255, 0.06), transparent 60%),
      radial-gradient(900px 600px at 90% -20%, rgba(255, 255, 255, 0.04), transparent 55%),
      var(--cli-bg);
  }
  .content {
    padding: calc(var(--space-lg) * 1.2) var(--space-lg);
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
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
    gap: var(--space-sm) var(--space-md);
    font-family: var(--font-mono);
    font-size: 13px;
  }
  .k {
    opacity: 0.7;
  }
  .v code {
    word-break: break-all;
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
    border-radius: var(--radius-sm);
    background: #fff;
    padding: 6px;
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
  }
  .logs {
    max-height: 400px;
    overflow: auto;
    background: rgba(0, 0, 0, 0.25);
    padding: var(--space-md);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .field input {
    width: 100%;
    padding: var(--space-sm);
    background: var(--cli-bg);
    color: var(--cli-text);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  .field select {
    width: 100%;
    padding: var(--space-sm);
    background: var(--cli-bg);
    color: var(--cli-text);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-sm);
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
    border-color: #2c8a5a;
    color: #9be3bf;
  }

  .auth-bad {
    color: var(--cli-error);
    font-weight: 600;
  }

  .auth-ok {
    color: #2c8a5a;
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
    font-size: 13px;
  }

  .dot {
    font-size: 10px;
    color: #2c8a5a;
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
    max-height: 200px;
    overflow: auto;
    font-size: 12px;
  }

  .cli-output {
    margin: 0;
    padding: var(--space-sm);
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-sm);
    max-height: 260px;
    overflow: auto;
    font-size: 12px;
    white-space: pre-wrap;
  }
  .dim { color: var(--cli-text-dim); }
</style>
