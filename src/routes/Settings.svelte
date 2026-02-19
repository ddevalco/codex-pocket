<script lang="ts">
  import { auth } from "../lib/auth.svelte";
  import { theme } from "../lib/theme.svelte";
  import { config } from "../lib/config.svelte";
  import { connectionManager } from "../lib/connection-manager.svelte";
  import { socket } from "../lib/socket.svelte";
  import AppHeader from "../lib/components/AppHeader.svelte";
  import NotificationSettings from "../lib/components/NotificationSettings.svelte";
  import SectionCard from "../lib/components/system/SectionCard.svelte";
  import StatusChip from "../lib/components/system/StatusChip.svelte";
  import DangerZone from "../lib/components/system/DangerZone.svelte";
  import {
    DEFAULT_QUICK_REPLIES,
    MAX_QUICK_REPLIES,
    loadQuickReplies,
    saveQuickReplies,
    type QuickReply,
  } from "../lib/quickReplies";
  import {
    MAX_AGENT_PRESETS,
    exportAgentPresetsJson,
    importAgentPresetsJson,
    loadAgentPresets,
    saveAgentPresets,
    type AgentPreset,
  } from "../lib/presets";
  import {
    MAX_HELPER_PROFILES,
    loadHelperProfiles,
    saveHelperProfiles,
    type HelperProfile,
  } from "../lib/helperProfiles";
  import { approvalPolicyStore } from "../lib/approval-policy-store.svelte";

  const ENTER_BEHAVIOR_KEY = "codex_pocket_enter_behavior";
  type EnterBehavior = "newline" | "send";
  let enterBehavior = $state<EnterBehavior>("newline");
  let quickReplies = $state<QuickReply[]>([]);
  let quickReplySaveNote = $state<string>("");
  let agentPresets = $state<AgentPreset[]>([]);
  let presetSaveNote = $state<string>("");
  let presetImportInput: HTMLInputElement | null = null;
  let helperProfiles = $state<HelperProfile[]>([]);
  let helperProfileSaveNote = $state<string>("");

  $effect(() => {
    try {
      const saved = localStorage.getItem(ENTER_BEHAVIOR_KEY);
      if (saved === "send" || saved === "newline") enterBehavior = saved;
    } catch {
      // ignore
    }
    quickReplies = loadQuickReplies();
    agentPresets = loadAgentPresets();
    helperProfiles = loadHelperProfiles();
  });

  function newPresetId(): string {
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `preset_${Date.now().toString(36)}_${randomPart}`;
  }

  function setEnterBehavior(v: EnterBehavior) {
    enterBehavior = v;
    try {
      localStorage.setItem(ENTER_BEHAVIOR_KEY, v);
    } catch {
      // ignore
    }
  }

  function updateQuickReply(index: number, key: "label" | "text", value: string) {
    quickReplySaveNote = "";
    quickReplies = quickReplies.map((item, i) => {
      if (i !== index) return item;
      return { ...item, [key]: value };
    });
  }

  function addQuickReply() {
    if (quickReplies.length >= MAX_QUICK_REPLIES) return;
    quickReplySaveNote = "";
    quickReplies = [
      ...quickReplies,
      { label: `Reply ${quickReplies.length + 1}`, text: "" },
    ];
  }

  function removeQuickReply(index: number) {
    quickReplySaveNote = "";
    quickReplies = quickReplies.filter((_, i) => i !== index);
    if (quickReplies.length === 0) {
      quickReplies = [...DEFAULT_QUICK_REPLIES];
    }
  }

  function saveQuickReplyConfig() {
    quickReplies = saveQuickReplies(quickReplies);
    quickReplySaveNote = "Saved.";
  }

  function updateAgentPreset(index: number, key: keyof AgentPreset, value: string) {
    presetSaveNote = "";
    agentPresets = agentPresets.map((preset, i) => {
      if (i !== index) return preset;
      if (key === "mode") {
        const nextMode = value === "plan" ? "plan" : "code";
        return { ...preset, mode: nextMode };
      }
      if (key === "reasoningEffort") {
        const nextReasoning = value === "low" || value === "high" ? value : "medium";
        return { ...preset, reasoningEffort: nextReasoning };
      }
      return { ...preset, [key]: value };
    });
  }

  function addAgentPreset() {
    if (agentPresets.length >= MAX_AGENT_PRESETS) return;
    presetSaveNote = "";
    agentPresets = [
      ...agentPresets,
      {
        id: newPresetId(),
        name: `Preset ${agentPresets.length + 1}`,
        mode: "code",
        model: "",
        reasoningEffort: "medium",
        developerInstructions: "",
        starterPrompt: "",
      },
    ];
  }

  function removeAgentPreset(index: number) {
    presetSaveNote = "";
    agentPresets = agentPresets.filter((_, i) => i !== index);
  }

  function saveAgentPresetConfig() {
    agentPresets = saveAgentPresets(agentPresets);
    presetSaveNote = "Saved.";

    const validPresetIds = new Set(agentPresets.map((preset) => preset.id));
    const filteredProfiles = helperProfiles.filter((profile) => validPresetIds.has(profile.presetId));
    if (filteredProfiles.length !== helperProfiles.length) {
      helperProfiles = saveHelperProfiles(filteredProfiles);
      helperProfileSaveNote = "Updated helper profiles for current presets.";
    }
  }

  function newHelperProfileId(): string {
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `helper_${Date.now().toString(36)}_${randomPart}`;
  }

  function updateHelperProfile(index: number, key: keyof HelperProfile, value: string) {
    helperProfileSaveNote = "";
    helperProfiles = helperProfiles.map((profile, i) => {
      if (i !== index) return profile;
      return { ...profile, [key]: value };
    });
  }

  function addHelperProfile() {
    if (helperProfiles.length >= MAX_HELPER_PROFILES || agentPresets.length === 0) return;
    helperProfileSaveNote = "";
    helperProfiles = [
      ...helperProfiles,
      {
        id: newHelperProfileId(),
        name: `Helper ${helperProfiles.length + 1}`,
        presetId: agentPresets[0].id,
        prompt: "Investigate the issue and report back with recommended fix options.",
      },
    ];
  }

  function removeHelperProfile(index: number) {
    helperProfileSaveNote = "";
    helperProfiles = helperProfiles.filter((_, i) => i !== index);
  }

  function saveHelperProfileConfig() {
    helperProfiles = saveHelperProfiles(helperProfiles);
    helperProfileSaveNote = "Saved.";
  }

  function exportAgentPresetConfig() {
    try {
      const text = exportAgentPresetsJson(agentPresets);
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "codex-pocket-presets.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch {
      presetSaveNote = "Export failed.";
      return;
    }
    presetSaveNote = "Exported.";
  }

  async function handlePresetImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    presetSaveNote = "";
    try {
      const text = await file.text();
      const imported = importAgentPresetsJson(text);
      if (!imported.length) {
        presetSaveNote = "No valid presets found.";
        return;
      }
      agentPresets = saveAgentPresets(imported);
      presetSaveNote = `Imported ${agentPresets.length} preset(s).`;
    } catch {
      presetSaveNote = "Import failed.";
    }
  }
  import { anchors } from "../lib/anchors.svelte";
  const LOCAL_MODE = true;

  const UI_COMMIT = String(import.meta.env.VITE_CODEX_POCKET_COMMIT ?? "");
  const UI_BUILT_AT = String(import.meta.env.VITE_CODEX_POCKET_BUILT_AT ?? "");

  type Health = { version?: { appCommit?: string } };
  let appCommit = $state<string>("");

  $effect(() => {
    (async () => {
      try {
        const res = await fetch("/health");
        const data = (await res.json().catch(() => null)) as Health | null;
        const c = data?.version?.appCommit;
        if (typeof c === "string") appCommit = c;
      } catch {
        // ignore
      }
    })();
  });

  const themeIcons = { system: "◐", light: "○", dark: "●" } as const;

  const anchorList = $derived(anchors.list);

  const platformLabels: Record<string, string> = {
    darwin: "macOS",
    linux: "Linux",
    win32: "Windows",
  };

  const urlLocked = $derived(
    socket.status === "connected" || socket.status === "connecting" || socket.status === "reconnecting"
  );
  const orbitLocked = $derived(LOCAL_MODE || urlLocked);
  const canDisconnect = $derived(
    socket.status === "connected" || socket.status === "connecting" || socket.status === "reconnecting"
  );
  const canConnect = $derived(socket.status === "disconnected" || socket.status === "error");
  const isSocketConnected = $derived(socket.status === "connected");
  const connectionActionLabel = $derived.by(() => {
    if (socket.status === "connecting") return "Cancel";
    if (socket.status === "reconnecting") return "Stop reconnect";
    if (socket.status === "connected") return "Disconnect";
    return "Connect";
  });

  function formatSince(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

</script>

<div class="settings stack">
  <AppHeader status={socket.status}>
    {#snippet actions()}
      <button
        type="button"
        onclick={() => theme.cycle()}
        title="Theme: {theme.current}"
        aria-label={`Cycle theme (current: ${theme.current})`}
      >
        {themeIcons[theme.current]}
      </button>
    {/snippet}
  </AppHeader>

  <div class="content">
    <div class="panel panel-wide">
      <SectionCard title="Connection">
        <div class="field stack">
          <label for="orbit-url">orbit url</label>
          <input
            id="orbit-url"
            type="text"
            bind:value={config.url}
            placeholder="wss://orbit.example.com/ws/client"
            aria-describedby="orbit-url-help"
            disabled={orbitLocked}
          />
        </div>
        <p class="hint" id="orbit-url-help">
          {LOCAL_MODE
            ? "Local mode: Orbit URL is derived automatically from the site you opened."
            : "Use your orbit websocket URL. Disconnect first to edit while connected."}
        </p>
        <div class="row">
          <StatusChip tone={socket.status === "connected" ? "success" : socket.status === "error" ? "error" : "neutral"}>
            {socket.status}
          </StatusChip>
        </div>
        <div class="connect-actions row">
          <button
            class="connect-btn"
            type="button"
            onclick={() => {
              if (canDisconnect) {
                connectionManager.requestDisconnect();
              } else if (canConnect) {
                connectionManager.requestConnect();
              }
            }}
            disabled={!canDisconnect && !canConnect}
          >
            {connectionActionLabel}
          </button>
        </div>
        {#if socket.error}
          <p class="hint hint-error">{socket.error}</p>
        {/if}
        <p class="hint">
          {socket.status === "disconnected"
            ? "Auto-connect paused. Click Connect to resume."
            : "Connection is automatic on app load. Disconnect to pause and to change the URL."}
        </p>
      </SectionCard>
    </div>

    <div class="panel">
      <SectionCard title="Devices">
        {#if !isSocketConnected}
          <p class="hint">
            Connect to load devices.
          </p>
        {:else if anchorList.length === 0}
          <p class="hint">
            No devices connected yet. If this is a fresh install, give it a few seconds. Otherwise check <a href="/admin">/admin</a>.
          </p>
        {:else}
          <ul class="anchor-list">
            {#each anchorList as anchor (anchor.id)}
              <li class="anchor-item">
                <span class="anchor-status" title="Connected" aria-hidden="true">●</span>
                <div class="anchor-info">
                  <span class="anchor-hostname">{anchor.hostname}</span>
                  <span class="anchor-meta">{platformLabels[anchor.platform] ?? anchor.platform} · since {formatSince(anchor.connectedAt)}</span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </SectionCard>
    </div>

    <div class="panel">
      <NotificationSettings />
    </div>

    <div class="panel">
      <SectionCard title="Composer">
        <div class="field stack">
          <label for="enter-behavior">enter key</label>
          <select
            id="enter-behavior"
            aria-describedby="enter-behavior-help"
            bind:value={enterBehavior}
            onchange={(e) => setEnterBehavior((e.target as HTMLSelectElement).value as EnterBehavior)}
          >
            <option value="newline">Enter inserts newline (Cmd/Ctrl+Enter sends)</option>
            <option value="send">Enter sends (Shift+Enter newline)</option>
          </select>
        </div>
        <p class="hint" id="enter-behavior-help">Default is newline on all devices. This is stored per-device in your browser.</p>
      </SectionCard>
    </div>

    <div class="panel panel-wide">
      <SectionCard title="Copilot Tool Approvals">
        <div class="stack approval-policy-settings">
          <p class="hint">Manage your saved "always allow" and "always reject" rules for Copilot tool actions.</p>
          {#if approvalPolicyStore.policies.length === 0}
            <p class="hint empty">No saved rules. Rules are created when you choose "always allow" or "always reject" during an approval prompt.</p>
          {:else}
            <div class="policy-list">
              {#each approvalPolicyStore.policies as policy (policy.id)}
                <div class="policy-row">
                  <span
                    class="policy-decision"
                    class:allow={policy.decision === "allow"}
                    class:reject={policy.decision === "reject"}
                  >
                    {policy.decision === "allow" ? "✓ Always Allow" : "✗ Always Reject"}
                  </span>
                  <span class="policy-tool">
                    {policy.toolKind ?? "any tool"}{policy.toolTitle ? `: ${policy.toolTitle}` : ""}
                  </span>
                  <button
                    type="button"
                    class="plain-btn"
                    onclick={() => approvalPolicyStore.revokePolicy(policy.id)}
                  >
                    Revoke
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </SectionCard>
    </div>

    <div class="panel panel-wide">
      <SectionCard title="Quick Replies">
        <div class="stack quick-reply-settings">
          {#each quickReplies as reply, i (`${i}-${reply.label}-${reply.text}`)}
            <div class="quick-reply-row">
              <div class="field stack">
                <label for={`quick-reply-label-${i}`}>label</label>
                <input
                  id={`quick-reply-label-${i}`}
                  type="text"
                  maxlength="24"
                  value={reply.label}
                  oninput={(e) => updateQuickReply(i, "label", (e.target as HTMLInputElement).value)}
                  placeholder="Proceed"
                />
              </div>
              <div class="field stack">
                <label for={`quick-reply-text-${i}`}>text</label>
                <input
                  id={`quick-reply-text-${i}`}
                  type="text"
                  maxlength="280"
                  value={reply.text}
                  oninput={(e) => updateQuickReply(i, "text", (e.target as HTMLInputElement).value)}
                  placeholder="Proceed."
                />
              </div>
              <button
                type="button"
                class="plain-btn"
                onclick={() => removeQuickReply(i)}
                aria-label={`Remove quick reply ${reply.label || i + 1}`}
              >
                Remove
              </button>
            </div>
          {/each}
          <div class="row">
            <button type="button" class="plain-btn" onclick={addQuickReply} disabled={quickReplies.length >= MAX_QUICK_REPLIES}>
              Add preset
            </button>
            <button type="button" class="connect-btn" onclick={saveQuickReplyConfig}>Save presets</button>
            {#if quickReplySaveNote}
              <span class="hint">{quickReplySaveNote}</span>
            {/if}
          </div>
          <p class="hint">Shown in the thread composer as one-tap shortcuts. Stored per-device in your browser.</p>
        </div>
      </SectionCard>
    </div>

    <div class="panel panel-wide">
      <SectionCard title="Presets">
        <div class="stack preset-settings">
          <input
            bind:this={presetImportInput}
            type="file"
            accept="application/json"
            class="file-input-hidden"
            onchange={handlePresetImport}
          />
          {#if agentPresets.length === 0}
            <p class="hint">No presets yet. Add one to reuse mode/model/instructions and starter prompts.</p>
          {/if}
          {#each agentPresets as preset, i (preset.id)}
            <div class="preset-row">
              <div class="field stack">
                <label for={`preset-name-${i}`}>name</label>
                <input
                  id={`preset-name-${i}`}
                  type="text"
                  maxlength="64"
                  value={preset.name}
                  oninput={(e) => updateAgentPreset(i, "name", (e.target as HTMLInputElement).value)}
                  placeholder="Plan review"
                />
              </div>
              <div class="field stack">
                <label for={`preset-mode-${i}`}>mode</label>
                <select
                  id={`preset-mode-${i}`}
                  value={preset.mode}
                  onchange={(e) => updateAgentPreset(i, "mode", (e.target as HTMLSelectElement).value)}
                >
                  <option value="code">Code</option>
                  <option value="plan">Plan</option>
                </select>
              </div>
              <div class="field stack">
                <label for={`preset-model-${i}`}>model</label>
                <input
                  id={`preset-model-${i}`}
                  type="text"
                  maxlength="120"
                  value={preset.model}
                  oninput={(e) => updateAgentPreset(i, "model", (e.target as HTMLInputElement).value)}
                  placeholder="gpt-5"
                />
              </div>
              <div class="field stack">
                <label for={`preset-reasoning-${i}`}>reasoning</label>
                <select
                  id={`preset-reasoning-${i}`}
                  value={preset.reasoningEffort}
                  onchange={(e) => updateAgentPreset(i, "reasoningEffort", (e.target as HTMLSelectElement).value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div class="field stack">
                <label for={`preset-dev-${i}`}>developer instructions</label>
                <textarea
                  id={`preset-dev-${i}`}
                  rows="2"
                  maxlength="4000"
                  value={preset.developerInstructions}
                  oninput={(e) => updateAgentPreset(i, "developerInstructions", (e.target as HTMLTextAreaElement).value)}
                  placeholder="Prioritize small safe diffs and explain tradeoffs."
                ></textarea>
              </div>
              <div class="field stack">
                <label for={`preset-starter-${i}`}>starter prompt</label>
                <textarea
                  id={`preset-starter-${i}`}
                  rows="2"
                  maxlength="4000"
                  value={preset.starterPrompt}
                  oninput={(e) => updateAgentPreset(i, "starterPrompt", (e.target as HTMLTextAreaElement).value)}
                  placeholder="Review open PR feedback and apply requested changes."
                ></textarea>
              </div>
              <button
                type="button"
                class="plain-btn"
                onclick={() => removeAgentPreset(i)}
                aria-label={`Remove preset ${preset.name || i + 1}`}
              >
                Remove
              </button>
            </div>
          {/each}
          <div class="row">
            <button type="button" class="plain-btn" onclick={addAgentPreset} disabled={agentPresets.length >= MAX_AGENT_PRESETS}>
              Add preset
            </button>
            <button type="button" class="connect-btn" onclick={saveAgentPresetConfig}>Save presets</button>
            <button type="button" class="plain-btn" onclick={exportAgentPresetConfig} disabled={agentPresets.length === 0}>Export JSON</button>
            <button type="button" class="plain-btn" onclick={() => presetImportInput?.click()}>Import JSON</button>
            {#if presetSaveNote}
              <span class="hint">{presetSaveNote}</span>
            {/if}
          </div>
          <p class="hint">Apply these from the thread composer to set mode, model, reasoning, developer instructions, and optional starter prompt in one action.</p>
        </div>
      </SectionCard>
    </div>

    <div class="panel panel-wide">
      <SectionCard title="Helper Profiles">
        <div class="stack preset-settings">
          {#if agentPresets.length === 0}
            <p class="hint">Create at least one preset first. Helper profiles reuse preset mode/model/instructions.</p>
          {:else if helperProfiles.length === 0}
            <p class="hint">No helper profiles yet. Add one to launch helper agents from thread UI in one tap.</p>
          {/if}

          {#each helperProfiles as profile, i (profile.id)}
            <div class="helper-row">
              <div class="field stack">
                <label for={`helper-name-${i}`}>name</label>
                <input
                  id={`helper-name-${i}`}
                  type="text"
                  maxlength="64"
                  value={profile.name}
                  oninput={(e) => updateHelperProfile(i, "name", (e.target as HTMLInputElement).value)}
                  placeholder="Code reviewer"
                />
              </div>
              <div class="field stack">
                <label for={`helper-preset-${i}`}>preset</label>
                <select
                  id={`helper-preset-${i}`}
                  value={profile.presetId}
                  onchange={(e) => updateHelperProfile(i, "presetId", (e.target as HTMLSelectElement).value)}
                >
                  {#each agentPresets as preset (preset.id)}
                    <option value={preset.id}>{preset.name}</option>
                  {/each}
                </select>
              </div>
              <div class="field stack">
                <label for={`helper-prompt-${i}`}>helper objective</label>
                <textarea
                  id={`helper-prompt-${i}`}
                  rows="2"
                  maxlength="4000"
                  value={profile.prompt}
                  oninput={(e) => updateHelperProfile(i, "prompt", (e.target as HTMLTextAreaElement).value)}
                  placeholder="Review current implementation and list concrete follow-up patches."
                ></textarea>
              </div>
              <button
                type="button"
                class="plain-btn"
                onclick={() => removeHelperProfile(i)}
                aria-label={`Remove helper profile ${profile.name || i + 1}`}
              >
                Remove
              </button>
            </div>
          {/each}

          <div class="row">
            <button
              type="button"
              class="plain-btn"
              onclick={addHelperProfile}
              disabled={agentPresets.length === 0 || helperProfiles.length >= MAX_HELPER_PROFILES}
            >
              Add helper
            </button>
            <button type="button" class="connect-btn" onclick={saveHelperProfileConfig} disabled={agentPresets.length === 0}>
              Save helpers
            </button>
            {#if helperProfileSaveNote}
              <span class="hint">{helperProfileSaveNote}</span>
            {/if}
          </div>
          <p class="hint">Thread view uses these profiles to launch helper agents without manual prompt crafting.</p>
        </div>
      </SectionCard>
    </div>

    <div class="panel">
      <SectionCard title="About">
        <p class="hint">
          UI build: <span class="mono">{UI_COMMIT || "unknown"}</span>
          {#if UI_BUILT_AT}
            <span class="dim">({UI_BUILT_AT})</span>
          {/if}
        </p>
        <p class="hint">
          Server: <span class="mono">{appCommit || "unknown"}</span>
        </p>
      </SectionCard>
    </div>

    <div class="panel">
      <SectionCard title="Account">
        <DangerZone>
          <button class="sign-out-btn" type="button" onclick={() => auth.signOut()} aria-label="Sign out and clear local auth token">Sign out</button>
        </DangerZone>
      </SectionCard>
    </div>
  </div>
</div>

<style>
  .settings {
    --stack-gap: 0;
    min-height: 100vh;
    background:
      radial-gradient(920px 460px at 0% -20%, color-mix(in srgb, var(--cli-prefix-agent) 12%, transparent), transparent 72%),
      radial-gradient(780px 360px at 100% -30%, color-mix(in srgb, var(--cli-prefix-web) 10%, transparent), transparent 74%),
      var(--cli-bg);
    color: var(--cli-text);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
  }

  .content {
    padding: var(--space-lg) var(--space-md) var(--space-xl);
    max-width: 1220px;
    margin: 0 auto;
    width: 100%;
    display: grid;
    gap: var(--space-lg);
    grid-template-columns: 1fr;
  }

  @media (min-width: 1040px) {
    .content {
      grid-template-columns: 1.35fr 1fr;
      align-items: start;
    }
  }

  .panel {
    min-width: 0;
  }

  .panel-wide {
    grid-column: 1 / -1;
  }

  .settings :global(.section) {
    border-radius: 12px;
    border-color: color-mix(in srgb, var(--cli-border) 86%, transparent);
    background: color-mix(in srgb, var(--cli-bg-elevated) 86%, var(--cli-bg));
    box-shadow: 0 15px 34px -30px rgba(0, 0, 0, 0.88);
  }

  .settings :global(.section-header) {
    padding: var(--space-md) var(--space-md) var(--space-sm);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--cli-bg-elevated) 76%, var(--cli-bg)),
      color-mix(in srgb, var(--cli-bg) 90%, transparent)
    );
  }

  .settings :global(.section-title) {
    font-size: 0.69rem;
    letter-spacing: 0.1em;
  }

  .field {
    --stack-gap: var(--space-xs);
  }

  .field label {
    color: var(--cli-text-dim);
    font-size: var(--text-xs);
    text-transform: lowercase;
  }

  .field input {
    padding: var(--space-sm);
    background: color-mix(in srgb, var(--cli-bg) 72%, var(--cli-bg-elevated));
    border: 1px solid color-mix(in srgb, var(--cli-border) 86%, transparent);
    border-radius: 8px;
    color: var(--cli-text);
    font-family: var(--font-mono);
  }

  .field textarea {
    width: 100%;
    padding: var(--space-sm);
    background: color-mix(in srgb, var(--cli-bg) 72%, var(--cli-bg-elevated));
    border: 1px solid color-mix(in srgb, var(--cli-border) 86%, transparent);
    border-radius: 8px;
    color: var(--cli-text);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    resize: vertical;
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

  .field select:focus {
    outline: none;
    border-color: var(--cli-text-muted);
    box-shadow: var(--shadow-focus);
  }

  .field input:focus {
    outline: none;
    border-color: var(--cli-prefix-agent);
    box-shadow: var(--shadow-focus);
  }

  .field textarea:focus {
    outline: none;
    border-color: var(--cli-prefix-agent);
    box-shadow: var(--shadow-focus);
  }

  .field input:disabled {
    opacity: 0.6;
    background: var(--cli-bg-elevated);
  }

  .connect-actions {
    align-items: center;
    gap: var(--space-sm);
  }

  .connect-btn {
    padding: 0.45rem 0.72rem;
    background: color-mix(in srgb, var(--cli-bg-elevated) 86%, transparent);
    border: 1px solid color-mix(in srgb, var(--cli-border) 86%, transparent);
    border-radius: 7px;
    color: var(--cli-text);
    font-family: var(--font-mono);
    font-size: 0.74rem;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .plain-btn {
    padding: 0.45rem 0.72rem;
    background: color-mix(in srgb, var(--cli-bg-elevated) 86%, transparent);
    border: 1px solid color-mix(in srgb, var(--cli-border) 86%, transparent);
    border-radius: 7px;
    color: var(--cli-text-dim);
    font-family: var(--font-sans);
    font-size: 0.74rem;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .plain-btn:hover:enabled {
    background: var(--cli-bg-hover);
    color: var(--cli-text);
  }

  .connect-btn:hover:enabled {
    background: color-mix(in srgb, var(--cli-bg-hover) 60%, var(--cli-bg-elevated));
    border-color: color-mix(in srgb, var(--cli-prefix-agent) 38%, var(--cli-border));
  }

  .connect-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .connect-btn:focus-visible,
  .plain-btn:focus-visible,
  .sign-out-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--cli-prefix-agent) 55%, var(--cli-border));
  }

  .quick-reply-settings {
    --stack-gap: var(--space-sm);
  }

  .approval-policy-settings {
    --stack-gap: var(--space-sm);
  }

  .preset-settings {
    --stack-gap: var(--space-sm);
  }

  .policy-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .policy-row {
    display: grid;
    grid-template-columns: max-content 1fr auto;
    gap: var(--space-sm);
    align-items: center;
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid color-mix(in srgb, var(--cli-border) 86%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--cli-bg) 72%, var(--cli-bg-elevated));
  }

  .policy-decision {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .policy-decision.allow {
    color: var(--cli-success, #4ade80);
  }

  .policy-decision.reject {
    color: var(--cli-error);
  }

  .policy-tool {
    color: var(--cli-text);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .quick-reply-row {
    display: grid;
    grid-template-columns: 160px 1fr auto;
    gap: var(--space-sm);
    align-items: end;
  }

  .preset-row {
    display: grid;
    grid-template-columns: minmax(120px, 170px) 110px 1fr 130px 1fr 1fr auto;
    gap: var(--space-sm);
    align-items: end;
  }

  .helper-row {
    display: grid;
    grid-template-columns: minmax(120px, 190px) minmax(160px, 220px) 1fr auto;
    gap: var(--space-sm);
    align-items: end;
  }

  @media (max-width: 760px) {
    .quick-reply-row {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .policy-row {
      grid-template-columns: 1fr;
      align-items: start;
    }

    .preset-row {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .helper-row {
      grid-template-columns: 1fr;
      align-items: stretch;
    }
  }

  .file-input-hidden {
    display: none;
  }

  .anchor-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .anchor-item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-xs) 0;
  }

  .anchor-status {
    font-size: var(--text-xs);
    color: var(--cli-success, #4ade80);
    margin-top: 2px;
  }

  .anchor-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .anchor-hostname {
    color: var(--cli-text);
    font-weight: 500;
  }

  .anchor-meta {
    color: var(--cli-text-muted);
    font-size: var(--text-xs);
  }

  .hint {
    color: var(--cli-text-muted);
    font-size: var(--text-xs);
    line-height: 1.55;
    margin: 0;
  }

  .hint-error {
    color: var(--cli-error);
  }

  .hint a {
    color: var(--cli-prefix-agent);
  }

  .sign-out-btn {
    align-self: flex-start;
    padding: 0.45rem 0.72rem;
    background: color-mix(in srgb, var(--cli-error) 10%, var(--cli-bg-elevated));
    border: 1px solid color-mix(in srgb, var(--cli-error) 55%, var(--cli-border));
    border-radius: 7px;
    color: color-mix(in srgb, var(--cli-error) 76%, var(--cli-text));
    font-family: var(--font-mono);
    font-size: 0.74rem;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .sign-out-btn:hover {
    background: color-mix(in srgb, var(--cli-error) 16%, var(--cli-bg-elevated));
    border-color: color-mix(in srgb, var(--cli-error) 68%, var(--cli-border));
  }

  @media (max-width: 660px) {
    .content {
      padding: var(--space-md) var(--space-sm) var(--space-lg);
      gap: var(--space-md);
    }
  }
  .mono { font-family: var(--font-mono); }
  .dim { color: var(--cli-text-dim); }
</style>
