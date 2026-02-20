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
  import { getProviderConfig, updateProviderConfig, type ProviderConfig } from "../lib/api/config";
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
  import { getToggleState, resetToggles, setToggleState, type UIToggleKey } from "../lib/uiToggles.svelte";
  import { type CustomAgent } from "../lib/types";
import { agents } from "../lib/agents.svelte";

  const OLD_ENTER_BEHAVIOR_KEY = "codex_pocket_enter_behavior";
  const ENTER_BEHAVIOR_KEY = "coderelay_enter_behavior";

  if (typeof localStorage !== "undefined" && !localStorage.getItem(ENTER_BEHAVIOR_KEY)) {
    const old = localStorage.getItem(OLD_ENTER_BEHAVIOR_KEY);
    if (old) localStorage.setItem(ENTER_BEHAVIOR_KEY, old);
  }
  
  let customAgentImportInput = $state<HTMLInputElement | null>(null);
  let customAgentImportError = $state<string | null>(null);

  // VS Code Sync State
  let syncingAgentId = $state<string | null>(null);
  let syncError = $state<string | null>(null);
  let showConfirmModal = $state(false);
  let confirmAgent = $state<CustomAgent | null>(null);

  // Batch Sync State
  let isSyncingAll = $state(false);
  let syncAllResult = $state<any>(null);

  async function syncAllAgents() {
    isSyncingAll = true;
    syncAllResult = null;
    
    try {
      const res = await fetch('/api/agents/sync-all-vscode', {
        method: 'POST'
      });
      
      const data = await res.json();
      syncAllResult = data;
      
      if (data.success) {
         await agents.load();
      }
    } catch (error: any) {
      alert(`Batch sync failed: ${error.message}`);
    } finally {
      isSyncingAll = false;
    }
  }
  
  async function syncAgentToVSCode(agent: CustomAgent, force = false) {
    syncingAgentId = agent.id;
    syncError = null;
    
    try {
      // Force refresh if confirming overwrite
      const url = `/api/agents/${agent.id}/sync-vscode${force ? '?force=true' : ''}`;
      
      const res = await fetch(url, {
        method: 'POST'
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        if (data.conflictDetected && !force) {
           // Provide better error if it was a conflict but returned 409 or similar (though we implemented 200 with conflictDetected)
           // But wait, my backend implementation returns 200 OK with conflictDetected: true, success: false
        } else {
           syncError = data.error || 'Sync failed';
           return;
        }
      }
      
      if (data.conflictDetected && !force) {
        // Show confirmation modal
        confirmAgent = agent;
        showConfirmModal = true;
        return;
      }
      
      if (data.success) {
        // Update local agent data with lastSyncedAt
        // We need to update the store item. Since agents.list is a getter, we might need to reload or manually update if possible.
        // The store `agents.svelte.ts` exposes a getter `list`.
        // To update UI reactively, we should probably call `agents.load()` or if we can mutate the object in place (Svelte 5 context).
        // `agent` here is a reference to an object in the list. If `agents.list` contains state objects, mutating them *might* work?
        // But `agents.list` is likely just an array of objects.
        // Let's just reload the agents to be safe and consistent.
        await agents.load();
        
        // Success feedback
        // alert(`Agent synced to VS Code at ${data.path}`);
        // Maybe a toast? The prompt used alert.
      } else {
         syncError = data.message || "Sync failed";
      }
    } catch (error) {
      syncError = error instanceof Error ? error.message : "Network error";
    } finally {
      syncingAgentId = null;
    }
  }
  
  function confirmOverwrite() {
    if (confirmAgent) {
      syncAgentToVSCode(confirmAgent, true);
    }
    showConfirmModal = false;
    confirmAgent = null;
  }
  
  function formatSyncTime(timestamp?: number): string {
    if (!timestamp) return 'Never';
    
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  $effect(() => {
    agents.load();
  });

  async function handleCustomAgentImport(e: Event) {
    customAgentImportError = null;
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const res = await agents.import(file);
      if (!res.success) {
        customAgentImportError = res.error || "Import failed";
      }
      if (customAgentImportInput) customAgentImportInput.value = "";
    }
  }

  type EnterBehavior = "newline" | "send";
  let enterBehavior = $state<EnterBehavior>("newline");
  let quickReplies = $state<QuickReply[]>([]);
  let quickReplySaveNote = $state<string>("");
  let agentPresets = $state<AgentPreset[]>([]);
  let presetSaveNote = $state<string>("");
  let presetImportInput: HTMLInputElement | null = null;
  let helperProfiles = $state<HelperProfile[]>([]);
  let helperProfileSaveNote = $state<string>("");
  let uiToggleNote = $state<string>("");

  type ProviderKey = "codex" | "copilot-acp" | "claude" | "claude-mcp";
  type ProviderHealth = { status?: string; message?: string };

  const providerKeys: ProviderKey[] = ["codex", "copilot-acp", "claude", "claude-mcp"];
  const defaultProviderConfig: Record<ProviderKey, ProviderConfig> = {
    codex: { enabled: true },
    "copilot-acp": { enabled: false },
    claude: { enabled: false },
    "claude-mcp": { enabled: false },
  };

  function normalizeProviderConfig(
    input?: Record<string, ProviderConfig>
  ): Record<ProviderKey, ProviderConfig> {
    return providerKeys.reduce((acc, key) => {
      acc[key] = { ...defaultProviderConfig[key], ...(input?.[key] ?? {}) };
      return acc;
    }, {} as Record<ProviderKey, ProviderConfig>);
  }

  function cloneProviderConfig(value: Record<ProviderKey, ProviderConfig>) {
    return JSON.parse(JSON.stringify(value)) as Record<ProviderKey, ProviderConfig>;
  }

  function normalizeProviderHealth(input?: Record<string, ProviderHealth>) {
    return providerKeys.reduce((acc, key) => {
      acc[key] = { ...(input?.[key] ?? {}) };
      return acc;
    }, {} as Record<ProviderKey, ProviderHealth>);
  }

  function mapStatus(status?: string): "success" | "warning" | "error" | "neutral" {
    if (status === "healthy") return "success";
    if (status === "degraded") return "warning";
    if (status === "unhealthy") return "error";
    return "neutral";
  }

  function formatStatusLabel(status?: string): string {
    if (!status) return "unknown";
    return status;
  }

  let providerConfig = $state<Record<ProviderKey, ProviderConfig>>(normalizeProviderConfig());
  let originalConfig = $state<Record<ProviderKey, ProviderConfig>>(normalizeProviderConfig());
  let loadingConfig = $state(false);
  let savingConfig = $state(false);
  let configError = $state<string | null>(null);
  let showRestartBanner = $state(false);

  let providerHealth = $state<Record<ProviderKey, ProviderHealth>>(normalizeProviderHealth());
  let healthInterval: ReturnType<typeof setInterval> | null = null;

  async function loadProviderConfig() {
    if (!auth.token) return;
    loadingConfig = true;
    configError = null;
    showRestartBanner = false;
    try {
      const data = await getProviderConfig(auth.token);
      const normalized = normalizeProviderConfig(data.providers);
      providerConfig = normalized;
      originalConfig = cloneProviderConfig(normalized);
    } catch {
      configError = "Failed to load provider configuration.";
    } finally {
      loadingConfig = false;
    }
  }

  async function pollHealth() {
    if (!auth.token) return;
    try {
      const res = await fetch("/admin/health", {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      providerHealth = normalizeProviderHealth(data?.providers ?? {});
    } catch {
      // ignore health polling errors
    }
  }

  async function saveProviderConfig() {
    if (!auth.token) return;
    savingConfig = true;
    configError = null;
    try {
      const result = await updateProviderConfig(auth.token, providerConfig);
      if (result.success) {
        originalConfig = cloneProviderConfig(providerConfig);
        showRestartBanner = true;
      } else {
        configError = result.error || "Failed to save configuration.";
      }
    } catch {
      configError = "Failed to save configuration.";
    } finally {
      savingConfig = false;
    }
  }

  const isProviderConfigDirty = $derived(
    JSON.stringify(providerConfig) !== JSON.stringify(originalConfig)
  );

  type UiToggleItem = {
    key: UIToggleKey;
    label: string;
    help: string;
  };

  type UiToggleGroup = {
    title: string;
    description: string;
    items: UiToggleItem[];
  };

  const uiToggleGroups: UiToggleGroup[] = [
    {
      title: "Thread List",
      description: "Control quick actions and exports in the home thread list.",
      items: [
        {
          key: "showProjectGrouping",
          label: "Group threads by project",
          help: "Organize threads into collapsible groups by repo/project. Disable for a flat list.",
        },
        {
          key: "showThreadListExports",
          label: "Thread list exports",
          help: "Show quick export actions on each thread row.",
        },
      ],
    },
    {
      title: "Composer",
      description: "Tune the composer shortcuts and attachment previews.",
      items: [
        {
          key: "showComposerQuickReplies",
          label: "Quick replies",
          help: "Show the one-tap shortcut row in the composer.",
        },
        {
          key: "showComposerThumbnails",
          label: "Attachment thumbnails",
          help: "Display attachment previews under the input.",
        },
      ],
    },
    {
      title: "Messages",
      description: "Choose which copy actions appear on messages and tool output.",
      items: [
        {
          key: "showMessageCopyButton",
          label: "Copy button",
          help: "Show the primary copy action on messages.",
        },
        {
          key: "showMessageCopyMarkdown",
          label: "Copy as markdown",
          help: "Include the markdown copy action when available.",
        },
        {
          key: "showMessageCopyQuoted",
          label: "Copy as quoted",
          help: "Include the quoted copy action when available.",
        },
        {
          key: "showToolOutputCopy",
          label: "Tool output copy",
          help: "Show copy controls on tool outputs.",
        },
      ],
    },
    {
      title: "Analytics & Costs",
      description: "Optional token usage and cost tracking",
      items: [
        {
          key: "showTokenCosts" as UIToggleKey,
          label: "Show token costs",
          help: "Display token usage and estimated cost per message. Token data is calculated locally and never transmitted.",
        },
      ],
    },
    {
      title: "Thread View",
      description: "Show or hide secondary actions in the thread header.",
      items: [
        {
          key: "showThreadHeaderActions",
          label: "Thread header actions",
          help: "Show secondary actions in the thread header.",
        },
      ],
    },
  ];

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

  function resetUiToggles() {
    resetToggles();
    uiToggleNote = "Reset to defaults.";
  }

  let threadsPerProjectLimit = $state(10);

  $effect(() => {
    const saved = localStorage.getItem('coderelay_threads_per_project_limit');
    if (saved) {
      threadsPerProjectLimit = Math.max(1, Math.min(50, parseInt(saved) || 10));
    }
  });

  function saveThreadsPerProjectLimit() {
    const clamped = Math.max(1, Math.min(50, threadsPerProjectLimit));
    threadsPerProjectLimit = clamped;
    localStorage.setItem('coderelay_threads_per_project_limit', String(clamped));
    uiToggleNote = "Saved thread limit.";
  }

  function exportAgentPresetConfig() {
    try {
      const text = exportAgentPresetsJson(agentPresets);
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "coderelay-presets.json";
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

  const UI_COMMIT = String(import.meta.env.VITE_CODERELAY_COMMIT ?? "");
  const UI_BUILT_AT = String(import.meta.env.VITE_CODERELAY_BUILT_AT ?? "");

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

  $effect(() => {
    if (!auth.token) {
      if (healthInterval) clearInterval(healthInterval);
      healthInterval = null;
      return;
    }
    loadProviderConfig();
    pollHealth();
    if (healthInterval) clearInterval(healthInterval);
    healthInterval = setInterval(pollHealth, 30000);
    return () => {
      if (healthInterval) clearInterval(healthInterval);
    };
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

<div class="settings stack relative min-h-screen bg-cli-bg text-cli-text font-sans text-sm">
  <div class="pointer-events-none absolute inset-0 overflow-hidden">
    <div class="absolute -left-32 -top-40 h-[460px] w-[920px] rounded-full bg-cli-prefix-agent/10 blur-[80px]"></div>
    <div class="absolute -right-32 -top-48 h-[360px] w-[780px] rounded-full bg-cli-prefix-web/10 blur-[90px]"></div>
  </div>
  <div class="relative z-10">
    <AppHeader status={socket.status}>
      {#snippet actions()}
        <button
          type="button"
          class="rounded-sm px-2 py-1 font-mono text-xs text-cli-text-muted transition-colors duration-200 hover:text-cli-text"
          onclick={() => theme.cycle()}
          title="Theme: {theme.current}"
          aria-label={`Cycle theme (current: ${theme.current})`}
        >
          {themeIcons[theme.current]}
        </button>
      {/snippet}
    </AppHeader>

    <div class="content mx-auto grid w-full max-w-[1220px] grid-cols-1 gap-6 px-4 pt-6 pb-8 min-[1040px]:grid-cols-[1.35fr_1fr] min-[1040px]:items-start max-[660px]:px-2 max-[660px]:pt-4 max-[660px]:pb-6">
    <div class="panel min-w-0 col-span-full">
      <SectionCard title="Connection">
        <div class="field flex flex-col gap-1">
          <label class="text-xs font-sans lowercase text-cli-text-dim" for="orbit-url">orbit url</label>
          <input
            id="orbit-url"
            type="text"
            bind:value={config.url}
            placeholder="wss://orbit.example.com/ws/client"
            aria-describedby="orbit-url-help"
            disabled={orbitLocked}
            class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <p class="text-xs leading-relaxed text-cli-text-muted" id="orbit-url-help">
          {LOCAL_MODE
            ? "Local mode: Orbit URL is derived automatically from the site you opened."
            : "Use your orbit websocket URL. Disconnect first to edit while connected."}
        </p>
        <div class="row">
          <StatusChip tone={socket.status === "connected" ? "success" : socket.status === "error" ? "error" : "neutral"}>
            {socket.status}
          </StatusChip>
        </div>
        <div class="connect-actions row gap-2">
          <button
            type="button"
            onclick={() => {
              if (canDisconnect) {
                connectionManager.requestDisconnect();
              } else if (canConnect) {
                connectionManager.requestConnect();
              }
            }}
            disabled={!canDisconnect && !canConnect}
            class="connect-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text transition-all duration-200 hover:border-cli-prefix-agent/40 hover:bg-cli-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {connectionActionLabel}
          </button>
        </div>
        {#if socket.error}
          <p class="text-xs leading-relaxed text-cli-error">{socket.error}</p>
        {/if}
        <p class="text-xs leading-relaxed text-cli-text-muted">
          {socket.status === "disconnected"
            ? "Auto-connect paused. Click Connect to resume."
            : "Connection is automatic on app load. Disconnect to pause and to change the URL."}
        </p>
      </SectionCard>
    </div>

    <div class="panel min-w-0">
      <SectionCard title="Devices">
        {#if !isSocketConnected}
          <p class="text-xs leading-relaxed text-cli-text-muted">
            Connect to load devices.
          </p>
        {:else if anchorList.length === 0}
          <p class="text-xs leading-relaxed text-cli-text-muted">
            No devices connected yet. If this is a fresh install, give it a few seconds. Otherwise check <a class="text-cli-prefix-agent hover:opacity-80" href="/admin">/admin</a>.
          </p>
        {:else}
          <ul class="anchor-list flex flex-col gap-1 list-none p-0 m-0">
            {#each anchorList as anchor (anchor.id)}
              <li class="anchor-item flex items-start gap-2 py-1">
                <span class="anchor-status mt-0.5 text-xs text-cli-success" title="Connected" aria-hidden="true">●</span>
                <div class="anchor-info flex min-w-0 flex-col gap-0.5">
                  <span class="anchor-hostname font-medium text-cli-text">{anchor.hostname}</span>
                  <span class="anchor-meta text-xs text-cli-text-muted">{platformLabels[anchor.platform] ?? anchor.platform} · since {formatSince(anchor.connectedAt)}</span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </SectionCard>
    </div>

    <div class="panel min-w-0">
      <NotificationSettings />
    </div>

    <div class="panel min-w-0 col-span-full">
      <SectionCard title="Providers" subtitle="Configure AI providers">
        {#if configError}
          <p class="text-xs leading-relaxed text-cli-error" role="alert">{configError}</p>
        {/if}
        {#if showRestartBanner}
          <div class="restart-banner flex flex-col gap-0.5 rounded-md border border-cli-prefix-agent/45 bg-cli-prefix-agent/12 p-3 text-cli-text" role="status" aria-live="polite">
            <div class="restart-title text-xs font-semibold">Configuration saved.</div>
            <div class="restart-body text-xs text-cli-text-muted">Restart the service to apply changes.</div>
          </div>
        {/if}
        {#if loadingConfig}
          <p class="text-xs leading-relaxed text-cli-text-muted">Loading provider configuration...</p>
        {:else}
          <div class="provider-grid grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            <div class="provider-card flex flex-col gap-2 rounded-md border border-cli-border bg-cli-bg-elevated p-4">
              <div class="provider-header flex flex-wrap items-center gap-2">
                <h4 class="m-0 font-sans text-sm text-cli-text">Codex</h4>
                <StatusChip tone={mapStatus(providerHealth.codex?.status)}>
                  {formatStatusLabel(providerHealth.codex?.status)}
                </StatusChip>
              </div>
              <p class="provider-subtitle m-0 text-xs text-cli-text-muted">Local CLI via Anchor (always enabled)</p>
              <div class="provider-status text-xs text-cli-text-muted">
                {providerHealth.codex?.message || "Unknown"}
              </div>
            </div>

            <div class="provider-card flex flex-col gap-2 rounded-md border border-cli-border bg-cli-bg-elevated p-4">
              <div class="provider-header flex flex-wrap items-center gap-2">
                <h4 class="m-0 font-sans text-sm text-cli-text">GitHub Copilot</h4>
                <StatusChip tone={mapStatus(providerHealth["copilot-acp"]?.status)}>
                  {formatStatusLabel(providerHealth["copilot-acp"]?.status)}
                </StatusChip>
                <label class="provider-toggle inline-flex items-center gap-1.5 text-xs text-cli-text-dim">
                  <input type="checkbox" bind:checked={providerConfig["copilot-acp"].enabled} />
                  <span>Enabled</span>
                </label>
              </div>
              <div class="field flex flex-col gap-1">
                <label class="text-xs font-sans lowercase text-cli-text-dim" for="provider-copilot-exec">executable path (optional)</label>
                <input
                  id="provider-copilot-exec"
                  type="text"
                  bind:value={providerConfig["copilot-acp"].executablePath}
                  placeholder="Auto-detected from PATH"
                  class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                />
              </div>
              <div class="provider-status text-xs text-cli-text-muted">
                {providerHealth["copilot-acp"]?.message || "Unknown"}
              </div>
            </div>

            <div class="provider-card flex flex-col gap-2 rounded-md border border-cli-border bg-cli-bg-elevated p-4">
              <div class="provider-header flex flex-wrap items-center gap-2">
                <h4 class="m-0 font-sans text-sm text-cli-text">Claude (Web API)</h4>
                <StatusChip tone={mapStatus(providerHealth.claude?.status)}>
                  {formatStatusLabel(providerHealth.claude?.status)}
                </StatusChip>
                <label class="provider-toggle inline-flex items-center gap-1.5 text-xs text-cli-text-dim">
                  <input type="checkbox" bind:checked={providerConfig.claude.enabled} />
                  <span>Enabled</span>
                </label>
              </div>
              {#if providerConfig.claude.enabled}
                <div class="field flex flex-col gap-1">
                  <label class="text-xs font-sans lowercase text-cli-text-dim" for="provider-claude-api-key">api key</label>
                  <input
                    id="provider-claude-api-key"
                    type="password"
                    bind:value={providerConfig.claude.apiKey}
                    placeholder="sk-ant-..."
                    autocomplete="off"
                    class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                  />
                </div>
                <div class="field flex flex-col gap-1">
                  <label class="text-xs font-sans lowercase text-cli-text-dim" for="provider-claude-model">model</label>
                  <select id="provider-claude-model" bind:value={providerConfig.claude.model} class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-text-muted focus:outline-none">
                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                    <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                    <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                  </select>
                </div>
                <details class="advanced-section flex flex-col gap-2">
                  <summary class="cursor-pointer text-xs text-cli-text-dim">Advanced settings</summary>
                  <div class="field flex flex-col gap-1">
                    <label class="text-xs font-sans lowercase text-cli-text-dim" for="provider-claude-base-url">base url</label>
                    <input
                      id="provider-claude-base-url"
                      type="text"
                      bind:value={providerConfig.claude.baseUrl}
                      placeholder="https://api.anthropic.com"
                      class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                    />
                  </div>
                  <div class="field flex flex-col gap-1">
                    <label class="text-xs font-sans lowercase text-cli-text-dim" for="provider-claude-timeout">timeout (ms)</label>
                    <input
                      id="provider-claude-timeout"
                      type="number"
                      bind:value={providerConfig.claude.timeout}
                      placeholder="30000"
                      class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                    />
                  </div>
                </details>
              {/if}
              <div class="provider-status text-xs text-cli-text-muted">
                {providerHealth.claude?.message || "Not configured"}
              </div>
            </div>

            <div class="provider-card flex flex-col gap-2 rounded-md border border-cli-border bg-cli-bg-elevated p-4">
              <div class="provider-header flex flex-wrap items-center gap-2">
                <h4 class="m-0 font-sans text-sm text-cli-text">Claude (Local CLI)</h4>
                <StatusChip tone={mapStatus(providerHealth["claude-mcp"]?.status)}>
                  {formatStatusLabel(providerHealth["claude-mcp"]?.status)}
                </StatusChip>
                <label class="provider-toggle inline-flex items-center gap-1.5 text-xs text-cli-text-dim">
                  <input type="checkbox" bind:checked={providerConfig["claude-mcp"].enabled} />
                  <span>Enabled</span>
                </label>
              </div>
              {#if providerConfig["claude-mcp"].enabled}
                <div class="field flex flex-col gap-1">
                  <label class="text-xs font-sans lowercase text-cli-text-dim" for="provider-claude-mcp-exec">executable path (optional)</label>
                  <input
                    id="provider-claude-mcp-exec"
                    type="text"
                    bind:value={providerConfig["claude-mcp"].executablePath}
                    placeholder="Auto-detected from PATH"
                    class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                  />
                </div>
                <div class="field flex flex-col gap-1">
                  <label class="text-xs font-sans lowercase text-cli-text-dim" for="provider-claude-mcp-model">model</label>
                  <input
                    id="provider-claude-mcp-model"
                    type="text"
                    bind:value={providerConfig["claude-mcp"].model}
                    placeholder="claude-sonnet-4-6"
                    class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                  />
                </div>
                <details class="advanced-section flex flex-col gap-2">
                  <summary class="cursor-pointer text-xs text-cli-text-dim">Advanced settings</summary>
                  <div class="field flex flex-col gap-1">
                    <label class="text-xs font-sans lowercase text-cli-text-dim" for="provider-claude-mcp-max-tokens">max tokens</label>
                    <input
                      id="provider-claude-mcp-max-tokens"
                      type="number"
                      bind:value={providerConfig["claude-mcp"].maxTokens}
                      placeholder="8192"
                      class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                    />
                  </div>
                  <div class="field flex flex-col gap-1">
                    <label class="text-xs font-sans lowercase text-cli-text-dim" for="provider-claude-mcp-prompt-timeout">prompt timeout (ms)</label>
                    <input
                      id="provider-claude-mcp-prompt-timeout"
                      type="number"
                      bind:value={providerConfig["claude-mcp"].promptTimeout}
                      placeholder="60000"
                      class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                    />
                  </div>
                  <label class="provider-checkbox inline-flex items-center gap-1.5 text-xs text-cli-text-dim">
                    <input type="checkbox" bind:checked={providerConfig["claude-mcp"].debug} />
                    <span>Debug mode</span>
                  </label>
                </details>
              {/if}
              <div class="provider-status text-xs text-cli-text-muted">
                {providerHealth["claude-mcp"]?.message || "Not configured"}
              </div>
            </div>
          </div>

          <div class="save-actions mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              class="connect-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text transition-all duration-200 hover:border-cli-prefix-agent/40 hover:bg-cli-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onclick={saveProviderConfig}
              disabled={!isProviderConfigDirty || savingConfig}
            >
              {savingConfig ? "Saving..." : "Save changes"}
            </button>
            {#if isProviderConfigDirty && !savingConfig}
              <span class="text-xs leading-relaxed text-cli-text-muted">Unsaved changes</span>
            {/if}
          </div>
        {/if}
      </SectionCard>
    </div>

    <div class="panel min-w-0">
      <SectionCard title="Composer">
        <div class="field flex flex-col gap-1">
          <label class="text-xs font-sans lowercase text-cli-text-dim" for="enter-behavior">enter key</label>
          <select
            id="enter-behavior"
            aria-describedby="enter-behavior-help"
            bind:value={enterBehavior}
            onchange={(e) => setEnterBehavior((e.target as HTMLSelectElement).value as EnterBehavior)}
            class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-text-muted focus:outline-none"
          >
            <option value="newline">Enter inserts newline (Cmd/Ctrl+Enter sends)</option>
            <option value="send">Enter sends (Shift+Enter newline)</option>
          </select>
        </div>
        <p class="text-xs leading-relaxed text-cli-text-muted" id="enter-behavior-help">Default is newline on all devices. This is stored per-device in your browser.</p>
      </SectionCard>
    </div>

    <div class="panel min-w-0 col-span-full">
      <SectionCard title="UI Elements" subtitle="Control optional interface elements">
        <div class="stack ui-toggles flex flex-col gap-2">
          <div class="ui-toggles-header row flex-wrap items-center justify-between gap-2">
            <div class="row ui-toggles-chips gap-1">
              <StatusChip tone="neutral">Per-device</StatusChip>
              <StatusChip tone="success">Defaults on</StatusChip>
            </div>
            <button type="button" class="plain-btn inline-flex items-center justify-center rounded-full border border-cli-border/80 bg-cli-bg-elevated px-3 py-1 text-xs font-semibold text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text" onclick={resetUiToggles}>Reset to defaults</button>
          </div>
          {#if uiToggleNote}
            <p class="text-xs leading-relaxed text-cli-text-muted" aria-live="polite">{uiToggleNote}</p>
          {/if}
          <p class="text-xs leading-relaxed text-cli-text-muted">These preferences are stored on this device only.</p>
          <div class="ui-toggle-groups grid grid-cols-1 gap-4 min-[980px]:grid-cols-2">
            {#each uiToggleGroups as group (group.title)}
              <div class="ui-toggle-group rounded-md border border-cli-border bg-cli-bg-elevated p-4">
                <div class="ui-toggle-group-header text-xs font-sans uppercase tracking-[0.06em] text-cli-text-dim">{group.title}</div>
                <p class="ui-toggle-group-help mt-1 text-xs leading-relaxed text-cli-text-muted">{group.description}</p>
                <div class="ui-toggle-list mt-2 flex flex-col gap-2">
                  {#each group.items as item (item.key)}
                    <label class="ui-toggle-row flex items-center justify-between gap-4 max-[640px]:items-start">
                      <span class="ui-toggle-text flex min-w-0 flex-col gap-0.5">
                        <span class="ui-toggle-label text-sm font-sans text-cli-text">{item.label}</span>
                        <span class="ui-toggle-help text-xs leading-relaxed text-cli-text-muted">{item.help}</span>
                      </span>
                      <span class="ui-toggle-control relative h-6 w-11 flex-shrink-0">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={getToggleState(item.key)}
                          onchange={(e) => setToggleState(item.key, (e.target as HTMLInputElement).checked)}
                          class="peer absolute inset-0 m-0 cursor-pointer opacity-0"
                        />
                        <span
                          class="ui-toggle-track absolute inset-0 rounded-full border border-cli-border bg-cli-bg transition-all duration-200 after:absolute after:left-0.5 after:top-0.5 after:h-[18px] after:w-[18px] after:rounded-full after:bg-cli-text-muted after:transition-all after:duration-200 peer-checked:border-cli-prefix-agent/60 peer-checked:bg-cli-prefix-agent/25 peer-checked:after:translate-x-5 peer-checked:after:bg-cli-prefix-agent peer-focus-visible:ring-2 peer-focus-visible:ring-cli-prefix-agent/55"
                          aria-hidden="true"
                        ></span>
                      </span>
                    </label>
                  {/each}
                </div>
              </div>
            {/each}
            <div class="ui-toggle-group rounded-md border border-cli-border bg-cli-bg-elevated p-4">
                <div class="ui-toggle-group-header text-xs font-sans uppercase tracking-[0.06em] text-cli-text-dim">Thread Limits</div>
                <p class="ui-toggle-group-help mt-1 text-xs leading-relaxed text-cli-text-muted">Limit the number of threads shown per project group.</p>
                <div class="ui-toggle-list mt-2 flex flex-col gap-2">
                  <label class="ui-toggle-row flex items-center justify-between gap-4 max-[640px]:items-start">
                    <span class="ui-toggle-text flex min-w-0 flex-col gap-0.5">
                      <span class="ui-toggle-label text-sm font-sans text-cli-text">Threads per project</span>
                      <span class="ui-toggle-help text-xs leading-relaxed text-cli-text-muted">Maximum threads to show per project group (1-50)</span>
                    </span>
                    <span class="ui-toggle-control flex-shrink-0">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        bind:value={threadsPerProjectLimit}
                        onchange={saveThreadsPerProjectLimit}
                        class="w-20 rounded-sm border border-cli-border bg-cli-bg p-1 text-sm text-cli-text"
                      />
                    </span>
                  </label>
                </div>
              </div>
          </div>
        </div>
      </SectionCard>
    </div>

    <div class="panel min-w-0 col-span-full">
      <SectionCard title="Copilot Tool Approvals">
        <div class="stack approval-policy-settings flex flex-col gap-2">
          <p class="text-xs leading-relaxed text-cli-text-muted">Manage your saved "always allow" and "always reject" rules for Copilot tool actions.</p>
          {#if approvalPolicyStore.policies.length === 0}
            <p class="text-xs leading-relaxed text-cli-text-muted">No saved rules. Rules are created when you choose "always allow" or "always reject" during an approval prompt.</p>
          {:else}
            <div class="policy-list flex flex-col gap-1">
              {#each approvalPolicyStore.policies as policy (policy.id)}
                <div class="policy-row grid items-center gap-2 rounded-md border border-cli-border bg-cli-bg-elevated px-2 py-1.5 [grid-template-columns:max-content_1fr_auto] max-[760px]:grid-cols-1 max-[760px]:items-start">
                  <span
                    class="policy-decision font-mono text-xs uppercase tracking-[0.04em]"
                    class:text-cli-success={policy.decision === "allow"}
                    class:text-cli-error={policy.decision === "reject"}
                  >
                    {policy.decision === "allow" ? "✓ Always Allow" : "✗ Always Reject"}
                  </span>
                  <span class="policy-tool font-mono text-xs text-cli-text">
                    {policy.toolKind ?? "any tool"}{policy.toolTitle ? `: ${policy.toolTitle}` : ""}
                  </span>
                  <button
                    type="button"
                    class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text"
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

    <div class="panel min-w-0 col-span-full">
      <SectionCard title="Quick Replies">
        <div class="stack quick-reply-settings flex flex-col gap-2">
          {#each quickReplies as reply, i (`${i}-${reply.label}-${reply.text}`)}
            <div class="quick-reply-row grid items-end gap-2 min-[760px]:grid-cols-[160px_1fr_auto] max-[760px]:grid-cols-1 max-[760px]:items-stretch">
              <div class="field flex flex-col gap-1">
                <label class="text-xs font-sans lowercase text-cli-text-dim" for={`quick-reply-label-${i}`}>label</label>
                <input
                  id={`quick-reply-label-${i}`}
                  type="text"
                  maxlength="24"
                  value={reply.label}
                  oninput={(e) => updateQuickReply(i, "label", (e.target as HTMLInputElement).value)}
                  placeholder="Proceed"
                  class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                />
              </div>
              <div class="field flex flex-col gap-1">
                <label class="text-xs font-sans lowercase text-cli-text-dim" for={`quick-reply-text-${i}`}>text</label>
                <input
                  id={`quick-reply-text-${i}`}
                  type="text"
                  maxlength="280"
                  value={reply.text}
                  oninput={(e) => updateQuickReply(i, "text", (e.target as HTMLInputElement).value)}
                  placeholder="Proceed."
                  class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                />
              </div>
              <button
                type="button"
                class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text"
                onclick={() => removeQuickReply(i)}
                aria-label={`Remove quick reply ${reply.label || i + 1}`}
              >
                Remove
              </button>
            </div>
          {/each}
          <div class="row">
            <button type="button" class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text disabled:cursor-not-allowed disabled:opacity-60" onclick={addQuickReply} disabled={quickReplies.length >= MAX_QUICK_REPLIES}>
              Add preset
            </button>
            <button type="button" class="connect-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text transition-all duration-200 hover:border-cli-prefix-agent/40 hover:bg-cli-bg-hover" onclick={saveQuickReplyConfig}>Save presets</button>
            {#if quickReplySaveNote}
              <span class="text-xs leading-relaxed text-cli-text-muted">{quickReplySaveNote}</span>
            {/if}
          </div>
          <p class="text-xs leading-relaxed text-cli-text-muted">Shown in the thread composer as one-tap shortcuts. Stored per-device in your browser.</p>
        </div>
      </SectionCard>
    </div>

    <div class="panel min-w-0 col-span-full">
      <SectionCard title="Custom Agents">
         {#if customAgentImportError}
          <div class="error-msg rounded-md border border-cli-error/50 bg-cli-error/10 px-3 py-2 text-xs text-cli-error">{customAgentImportError}</div>
         {/if}
        <div class="stack custom-agents flex flex-col gap-3">
            {#if agents.list.length === 0}
            <p class="text-xs leading-relaxed text-cli-text-muted">No custom agents imported yet.</p>
            {/if}
            {#each agents.list as agent (agent.id)}
            <div class="agent-row flex flex-wrap items-center justify-between gap-3 rounded-md border border-cli-border bg-cli-bg-elevated p-3">
              <div class="agent-info flex flex-col gap-1">
                <strong class="text-sm text-cli-text">{agent.name}</strong>
                <span class="text-xs text-cli-text-muted">{agent.description}</span>
                {#if agent.model}
                  <span class="badge inline-flex max-w-full rounded-full border border-cli-border px-2 py-0.5 text-xs text-cli-text-dim">{agent.model}</span>
                {/if}
              </div>
              <div class="agent-actions flex flex-wrap gap-2">
                <button
                  class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text disabled:cursor-not-allowed disabled:opacity-60"
                  onclick={() => syncAgentToVSCode(agent)}
                  disabled={syncingAgentId === agent.id}
                  title={agent.lastSyncedAt ? `Last synced: ${formatSyncTime(agent.lastSyncedAt)}` : "Sync to VS Code"}
                >
                  {syncingAgentId === agent.id ? 'Syncing...' : 'Sync to VS Code'}
                </button>
                <button class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text" onclick={() => agents.export(agent.id)}>Export</button>
                <button class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-error/60 bg-cli-error/10 px-3 py-2 font-mono text-xs text-cli-error transition-all duration-200 hover:border-cli-error/70 hover:bg-cli-error/20" onclick={() => agents.delete(agent.id)}>Delete</button>
              </div>
              {#if agent.lastSyncedAt}
                <div class="sync-status temp-sync-status w-full text-xs text-cli-text-muted">
                 <small>Synced: {formatSyncTime(agent.lastSyncedAt)}</small>
                </div>
              {/if}
              {#if syncError && syncingAgentId === agent.id}
                <div class="error-msg w-full rounded-md border border-cli-error/50 bg-cli-error/10 px-3 py-2 text-xs text-cli-error">{syncError}</div>
              {/if}
            </div>
            {/each}
            
            <input
               bind:this={customAgentImportInput}
               type="file"
               accept=".json"
              class="hidden"
               onchange={handleCustomAgentImport}
            />
          <div class="actions flex flex-wrap gap-2">
            <button class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text" onclick={() => customAgentImportInput?.click()}>Import Agent JSON</button>
            <button
              class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text disabled:cursor-not-allowed disabled:opacity-60"
              onclick={syncAllAgents}
              disabled={isSyncingAll || agents.list.length === 0}
            >
              {isSyncingAll ? 'Syncing All...' : 'Sync All to VS Code'}
            </button>
          </div>
            {#if syncAllResult}
            <div class="sync-status text-xs text-cli-text-muted">
                  Synced {syncAllResult.synced} agents.
                  {#if syncAllResult.failed > 0}
                     {syncAllResult.failed} failed.
                  {/if}
               </div>
            {/if}
         </div>
      </SectionCard>
      <SectionCard title="Presets">
        <div class="stack preset-settings flex flex-col gap-2">
          <input
            bind:this={presetImportInput}
            type="file"
            accept="application/json"
            class="hidden"
            onchange={handlePresetImport}
          />
          {#if agentPresets.length === 0}
            <p class="text-xs leading-relaxed text-cli-text-muted">No presets yet. Add one to reuse mode/model/instructions and starter prompts.</p>
          {/if}
          {#each agentPresets as preset, i (preset.id)}
            <div class="preset-row grid items-end gap-2 min-[760px]:grid-cols-[minmax(120px,170px)_110px_1fr_130px_1fr_1fr_auto] max-[760px]:grid-cols-1 max-[760px]:items-stretch">
              <div class="field flex flex-col gap-1">
                <label class="text-xs font-sans lowercase text-cli-text-dim" for={`preset-name-${i}`}>name</label>
                <input
                  id={`preset-name-${i}`}
                  type="text"
                  maxlength="64"
                  value={preset.name}
                  oninput={(e) => updateAgentPreset(i, "name", (e.target as HTMLInputElement).value)}
                  placeholder="Plan review"
                  class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                />
              </div>
              <div class="field flex flex-col gap-1">
                <label class="text-xs font-sans lowercase text-cli-text-dim" for={`preset-mode-${i}`}>mode</label>
                <select
                  id={`preset-mode-${i}`}
                  value={preset.mode}
                  onchange={(e) => updateAgentPreset(i, "mode", (e.target as HTMLSelectElement).value)}
                  class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-text-muted focus:outline-none"
                >
                  <option value="code">Code</option>
                  <option value="plan">Plan</option>
                </select>
              </div>
              <div class="field flex flex-col gap-1">
                <label class="text-xs font-sans lowercase text-cli-text-dim" for={`preset-model-${i}`}>model</label>
                <input
                  id={`preset-model-${i}`}
                  type="text"
                  maxlength="120"
                  value={preset.model}
                  oninput={(e) => updateAgentPreset(i, "model", (e.target as HTMLInputElement).value)}
                  placeholder="gpt-5"
                  class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                />
              </div>
              <div class="field flex flex-col gap-1">
                <label class="text-xs font-sans lowercase text-cli-text-dim" for={`preset-reasoning-${i}`}>reasoning</label>
                <select
                  id={`preset-reasoning-${i}`}
                  value={preset.reasoningEffort}
                  onchange={(e) => updateAgentPreset(i, "reasoningEffort", (e.target as HTMLSelectElement).value)}
                  class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-text-muted focus:outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div class="field flex flex-col gap-1">
                <label class="text-xs font-sans lowercase text-cli-text-dim" for={`preset-dev-${i}`}>developer instructions</label>
                <textarea
                  id={`preset-dev-${i}`}
                  rows="2"
                  maxlength="4000"
                  value={preset.developerInstructions}
                  oninput={(e) => updateAgentPreset(i, "developerInstructions", (e.target as HTMLTextAreaElement).value)}
                  placeholder="Prioritize small safe diffs and explain tradeoffs."
                  class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                ></textarea>
              </div>
              <div class="field flex flex-col gap-1">
                <label class="text-xs font-sans lowercase text-cli-text-dim" for={`preset-starter-${i}`}>starter prompt</label>
                <textarea
                  id={`preset-starter-${i}`}
                  rows="2"
                  maxlength="4000"
                  value={preset.starterPrompt}
                  oninput={(e) => updateAgentPreset(i, "starterPrompt", (e.target as HTMLTextAreaElement).value)}
                  placeholder="Review open PR feedback and apply requested changes."
                  class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                ></textarea>
              </div>
              <button
                type="button"
                class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text"
                onclick={() => removeAgentPreset(i)}
                aria-label={`Remove preset ${preset.name || i + 1}`}
              >
                Remove
              </button>
            </div>
          {/each}
          <div class="row">
            <button type="button" class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text disabled:cursor-not-allowed disabled:opacity-60" onclick={addAgentPreset} disabled={agentPresets.length >= MAX_AGENT_PRESETS}>
              Add preset
            </button>
            <button type="button" class="connect-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text transition-all duration-200 hover:border-cli-prefix-agent/40 hover:bg-cli-bg-hover" onclick={saveAgentPresetConfig}>Save presets</button>
            <button type="button" class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text disabled:cursor-not-allowed disabled:opacity-60" onclick={exportAgentPresetConfig} disabled={agentPresets.length === 0}>Export JSON</button>
            <button type="button" class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text" onclick={() => presetImportInput?.click()}>Import JSON</button>
            {#if presetSaveNote}
              <span class="text-xs leading-relaxed text-cli-text-muted">{presetSaveNote}</span>
            {/if}
          </div>
          <p class="text-xs leading-relaxed text-cli-text-muted">Apply these from the thread composer to set mode, model, reasoning, developer instructions, and optional starter prompt in one action.</p>
        </div>
      </SectionCard>
    </div>

    <div class="panel min-w-0 col-span-full">
      <SectionCard title="Helper Profiles">
        <div class="stack preset-settings flex flex-col gap-2">
          {#if agentPresets.length === 0}
            <p class="text-xs leading-relaxed text-cli-text-muted">Create at least one preset first. Helper profiles reuse preset mode/model/instructions.</p>
          {:else if helperProfiles.length === 0}
            <p class="text-xs leading-relaxed text-cli-text-muted">No helper profiles yet. Add one to launch helper agents from thread UI in one tap.</p>
          {/if}

          {#each helperProfiles as profile, i (profile.id)}
            <div class="helper-row grid items-end gap-2 min-[760px]:grid-cols-[minmax(120px,190px)_minmax(160px,220px)_1fr_auto] max-[760px]:grid-cols-1 max-[760px]:items-stretch">
              <div class="field flex flex-col gap-1">
                <label class="text-xs font-sans lowercase text-cli-text-dim" for={`helper-name-${i}`}>name</label>
                <input
                  id={`helper-name-${i}`}
                  type="text"
                  maxlength="64"
                  value={profile.name}
                  oninput={(e) => updateHelperProfile(i, "name", (e.target as HTMLInputElement).value)}
                  placeholder="Code reviewer"
                  class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                />
              </div>
              <div class="field flex flex-col gap-1">
                <label class="text-xs font-sans lowercase text-cli-text-dim" for={`helper-preset-${i}`}>preset</label>
                <select
                  id={`helper-preset-${i}`}
                  value={profile.presetId}
                  onchange={(e) => updateHelperProfile(i, "presetId", (e.target as HTMLSelectElement).value)}
                  class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-text-muted focus:outline-none"
                >
                  {#each agentPresets as preset (preset.id)}
                    <option value={preset.id}>{preset.name}</option>
                  {/each}
                </select>
              </div>
              <div class="field flex flex-col gap-1">
                <label class="text-xs font-sans lowercase text-cli-text-dim" for={`helper-prompt-${i}`}>helper objective</label>
                <textarea
                  id={`helper-prompt-${i}`}
                  rows="2"
                  maxlength="4000"
                  value={profile.prompt}
                  oninput={(e) => updateHelperProfile(i, "prompt", (e.target as HTMLTextAreaElement).value)}
                  placeholder="Review current implementation and list concrete follow-up patches."
                  class="rounded-md border border-cli-border bg-cli-bg-elevated p-2 font-mono text-sm text-cli-text transition-all duration-200 focus:border-cli-prefix-agent focus:outline-none"
                ></textarea>
              </div>
              <button
                type="button"
                class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text"
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
              class="plain-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text disabled:cursor-not-allowed disabled:opacity-60"
              onclick={addHelperProfile}
              disabled={agentPresets.length === 0 || helperProfiles.length >= MAX_HELPER_PROFILES}
            >
              Add helper
            </button>
            <button type="button" class="connect-btn inline-flex items-center justify-center rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text transition-all duration-200 hover:border-cli-prefix-agent/40 hover:bg-cli-bg-hover disabled:cursor-not-allowed disabled:opacity-60" onclick={saveHelperProfileConfig} disabled={agentPresets.length === 0}>
              Save helpers
            </button>
            {#if helperProfileSaveNote}
              <span class="text-xs leading-relaxed text-cli-text-muted">{helperProfileSaveNote}</span>
            {/if}
          </div>
          <p class="text-xs leading-relaxed text-cli-text-muted">Thread view uses these profiles to launch helper agents without manual prompt crafting.</p>
        </div>
      </SectionCard>
    </div>

    <div class="panel min-w-0">
      <SectionCard title="About">
        <p class="text-xs leading-relaxed text-cli-text-muted">
          UI build: <span class="font-mono text-cli-text">{UI_COMMIT || "unknown"}</span>
          {#if UI_BUILT_AT}
            <span class="text-cli-text-dim">({UI_BUILT_AT})</span>
          {/if}
        </p>
        <p class="text-xs leading-relaxed text-cli-text-muted">
          Server: <span class="font-mono text-cli-text">{appCommit || "unknown"}</span>
        </p>
      </SectionCard>
    </div>

    <div class="panel min-w-0">
      <SectionCard title="Account">
        <DangerZone>
          <button class="sign-out-btn inline-flex items-center justify-center rounded-sm border border-cli-error/60 bg-cli-error/10 px-3 py-2 font-mono text-xs text-cli-error transition-all duration-200 hover:border-cli-error/70 hover:bg-cli-error/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cli-prefix-agent/55" type="button" onclick={() => auth.signOut()} aria-label="Sign out and clear local auth token">Sign out</button>
        </DangerZone>
      </SectionCard>
    </div>
  </div>
</div>
</div>

<!-- Confirmation Modal -->
{#if showConfirmModal}
  <div class="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="modal max-w-[400px] rounded-md border border-cli-border bg-cli-bg-elevated p-6 text-cli-text shadow-popover">
      <h3 class="text-base font-semibold">Overwrite Existing Agent?</h3>
      <p class="mt-2 text-sm text-cli-text-muted">
        Agent <strong>{confirmAgent?.name}</strong> already exists in VS Code.
        Do you want to overwrite it?
      </p>
      <div class="modal-actions mt-6 flex justify-end gap-4">
        <button
          class="rounded-sm border border-cli-border bg-cli-bg-elevated px-3 py-2 font-mono text-xs text-cli-text-dim transition-all duration-200 hover:bg-cli-bg-hover hover:text-cli-text"
          onclick={() => { showConfirmModal = false; confirmAgent = null; }}
        >
          Cancel
        </button>
        <button
          onclick={confirmOverwrite}
          class="rounded-sm bg-cli-prefix-agent px-3 py-2 font-mono text-xs text-cli-bg transition-opacity duration-200 hover:opacity-90"
        >
          Overwrite
        </button>
      </div>
    </div>
  </div>
{/if}
