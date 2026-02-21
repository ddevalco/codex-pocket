<script lang="ts">
  import { socket } from "../lib/socket.svelte";
  import { threads } from "../lib/threads.svelte";
  import type { ThreadInfo, ThreadFilterState } from "../lib/types";
  import { messages } from "../lib/messages.svelte";
  import { navigate } from "../router";
  import { models } from "../lib/models.svelte";
  import { agents } from "../lib/agents.svelte";
  import { theme } from "../lib/theme.svelte";
  import { auth } from "../lib/auth.svelte";
  import { uiToggles } from "../lib/uiToggles.svelte";
  import { canSendPrompt, getCapabilityTooltip } from "../lib/thread-capabilities";
  import Archive from "lucide-svelte/icons/archive";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import Pencil from "lucide-svelte/icons/pencil";
  import AppHeader from "../lib/components/AppHeader.svelte";
  import ProjectPicker from "../lib/components/ProjectPicker.svelte";
  import ShimmerDot from "../lib/components/ShimmerDot.svelte";

  const OLD_FILTER_STORAGE_KEY = "codex_pocket_thread_filters";
  const FILTER_STORAGE_KEY = "coderelay_thread_filters";

  const DEFAULT_FILTERS: ThreadFilterState = {
    provider: "all",
    status: "all",
  };

  function loadFilters(): ThreadFilterState {
    if (typeof localStorage === "undefined") return DEFAULT_FILTERS;
    try {
      // Migration: Read old key if new key missing
      const oldStored = localStorage.getItem(OLD_FILTER_STORAGE_KEY);
      const stored = localStorage.getItem(FILTER_STORAGE_KEY);
      
      if (!stored && oldStored) {
        localStorage.setItem(FILTER_STORAGE_KEY, oldStored);
        return JSON.parse(oldStored);
      }
      
      if (!stored) return DEFAULT_FILTERS;

      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") return DEFAULT_FILTERS;

      return {
        provider: ["all", "codex", "copilot-acp", "claude", "opencode"].includes(parsed.provider)
          ? parsed.provider
          : DEFAULT_FILTERS.provider,
        status: ["all", "active", "archived"].includes(parsed.status)
          ? parsed.status
          : DEFAULT_FILTERS.status,
      };
    } catch {
      return DEFAULT_FILTERS;
    }
  }

  function saveFilters(state: ThreadFilterState) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to save filters", e);
    }
  }

  const filters = $state<ThreadFilterState>(loadFilters());

  $effect(() => {
    saveFilters(filters);
  });

  const themeIcons = { system: "◐", light: "○", dark: "●" } as const;

  const permissionPresets = {
    cautious: {
      label: "Cautious",
      detail: "Read-only, always ask",
      approvalPolicy: "on-request",
      sandbox: "read-only",
    },
    standard: {
      label: "Standard",
      detail: "Workspace write, ask",
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
    },
    autonomous: {
      label: "Autonomous",
      detail: "Full access, no prompts",
      approvalPolicy: "never",
      sandbox: "danger-full-access",
    },
  } as const;

  let showTaskModal = $state(false);
  let taskNote = $state("");
  let taskProject = $state("");
  let taskModel = $state("");
  let taskAgent = $state("");
  let taskPlanFirst = $state(true);
  let permissionLevel = $state<keyof typeof permissionPresets>("standard");
  let isCreating = $state(false);
  let legendOpen = $state(false);

  $effect(() => {
    if (showTaskModal) {
      agents.load();
    }
  });

  $effect(() => {
      const selected = agents.list.find(a => a.id === taskAgent);
      if (selected?.model) {
          taskModel = selected.model;
      }
  });

  $effect(() => {
    if (!legendOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") legendOpen = false;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Default to first available model
  $effect(() => {
    if (!taskModel && models.options.length > 0) {
      taskModel = models.options[0].value;
    }
  });

  function openTaskModal() {
    showTaskModal = true;
  }

  function closeTaskModal() {
    showTaskModal = false;
    taskNote = "";
    taskProject = "";
    taskPlanFirst = true;
    permissionLevel = "standard";
    taskModel = models.options[0]?.value ?? "";
  }

  async function handleCreateTask(e?: Event) {
    e?.preventDefault();
    if (!taskNote.trim() || !taskProject.trim() || isCreating) return;

    isCreating = true;
    try {
      const preset = permissionPresets[permissionLevel];
      
      let collaborationMode: any = undefined;
      if (taskAgent) {
        const agent = agents.list.find(a => a.id === taskAgent);
        if (agent) {
           // Frontend defense-in-depth: validate agent data
           const allowedModels = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-5-sonnet', 'claude-3-opus', 'claude-3-sonnet'];
           const safeModel = (agent.model && allowedModels.includes(agent.model)) ? agent.model : taskModel;
           const safeInstructions = agent.instructions?.replace(/[\x00-\x1F\x7F]/g, '').trim() || '';
           
           collaborationMode = {
              mode: taskPlanFirst ? "plan" : "code",
              settings: {
                 model: safeModel,
                 developer_instructions: safeInstructions
              }
           };
        }
      } else if (taskPlanFirst) {
          collaborationMode = threads.resolveCollaborationMode("plan", taskModel);
      }

      threads.start(taskProject, taskNote, {
        approvalPolicy: preset.approvalPolicy,
        sandbox: preset.sandbox,
        suppressNavigation: false,
        collaborationMode,
      });

      closeTaskModal();
    } catch (err) {
      console.error("Failed to create task:", err);
    } finally {
      isCreating = false;
    }
  }

  function formatTime(ts?: number): string {
    if (!ts) return "";
    const date = new Date(ts * 1000);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function normTs(v: number | undefined | null): number | null {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    // Support both seconds and ms.
    return v > 1e12 ? Math.floor(v / 1000) : v;
  }

  function upstreamActivity(t: { updatedAt?: number; lastActivity?: number; lastActiveAt?: number }): number | null {
    return normTs(t.updatedAt) ?? normTs(t.lastActivity) ?? normTs(t.lastActiveAt) ?? null;
  }

  function indicatorRank(ind: "blocked" | "working" | "idle"): number {
    // Rank active threads above idle.
    if (ind === "blocked") return 0;
    if (ind === "working") return 1;
    return 2;
  }

  const visibleThreads = $derived.by(() => {
    let list = threads.list || [];

    // Filter by provider
    if (filters.provider !== "all") {
      list = list.filter((t) => {
        if (filters.provider === "copilot-acp") return t.provider === "copilot-acp";
        if (filters.provider === "claude") return t.provider === "claude" || t.provider === "claude-mcp";
        if (filters.provider === "codex") return t.provider === "codex";
        if (filters.provider === "opencode") return t.provider === "opencode";
        return true;
      });
    }

    // Filter by status
    if (filters.status !== "all") {
      list = list.filter((t) => {
        // Use 'archived' property instead of 'status' string which tracks execution state.
        const isArchived = t.archived === true || t.status === "archived";
        if (filters.status === "archived") return isArchived;
        if (filters.status === "active") return !isArchived;
        return true;
      });
    }

    // Sort by most recently active:
    // 1) active threads (blocked/working) first
    // 2) Pocket-observed activity (live WS events)
    // 3) upstream updatedAt/lastActivity (if provided by Codex)
    // 4) createdAt fallback
    // 5) deterministic tie-breaker by id (prevents refresh from shuffling equal timestamps)
    return [...list].sort((a, b) => {
      const aInd = threadIndicator(a);
      const bInd = threadIndicator(b);
      const r = indicatorRank(aInd) - indicatorRank(bInd);
      if (r !== 0) return r;

      const aAct = messages.getLastActivity(a.id) ?? upstreamActivity(a) ?? a.createdAt ?? 0;
      const bAct = messages.getLastActivity(b.id) ?? upstreamActivity(b) ?? b.createdAt ?? 0;
      if (aAct !== bAct) return bAct - aAct;

      const aUp = upstreamActivity(a) ?? 0;
      const bUp = upstreamActivity(b) ?? 0;
      if (aUp != bUp) return bUp - aUp;

      const aCr = a.createdAt ?? 0;
      const bCr = b.createdAt ?? 0;
      if (aCr !== bCr) return bCr - aCr;

      return String(a.id).localeCompare(String(b.id));
    });
  });

  const threadCounts = $derived.by(() => {
    const list = threads.list || [];
    let codex = 0;
    let copilot = 0;
    let claude = 0;
    let opencode = 0;
    let active = 0;
    let archived = 0;

    for (const t of list) {
      if (t.provider === "copilot-acp") {
        copilot++;
      } else if (t.provider === "claude" || t.provider === "claude-mcp") {
        claude++;
      } else if (t.provider === "opencode") {
        opencode++;
      } else {
        codex++;
      }

      if (t.archived === true || t.status === "archived") {
        archived++;
      } else {
        active++;
      }
    }

    return {
      all: list.length,
      codex,
      copilot,
      claude,
      opencode,
      active,
      archived,
    };
  });

  function threadTime(ts?: number, id?: string) {
    const activity = id ? messages.getLastActivity(id) : null;
    if (activity) return activity;

    const t = id ? threads.list.find((x) => x.id === id) : null;
    if (t) {
      const up = upstreamActivity(t);
      if (up != null) return up;
    }

    return ts;
  }

  function threadIndicator(thread: { id: string; status?: string }): "blocked" | "working" | "idle" {
    const local = messages.getThreadIndicator(thread.id);
    if (local !== "idle") return local;
    const st = (thread.status || "").toLowerCase();
    if (st === "inprogress") return "working";
    return local;
  }

  function threadRepoLabel(thread: { repo?: string }): string {
    return (thread.repo ?? "").trim();
  }

  function threadProjectLabel(thread: { repo?: string; project?: string }): string {
    const repo = threadRepoLabel(thread);
    const project = (thread.project ?? "").trim();
    if (repo && project && repo.toLowerCase() === project.toLowerCase()) return "";
    return project;
  }

  function threadGroupLabel(thread: { repo?: string; project?: string }): string {
    const repo = threadRepoLabel(thread);
    const project = threadProjectLabel(thread);
    if (repo && project) return `${repo}/${project}`;
    if (repo) return repo;
    if (project) return project;
    return "Unlabeled";
  }

  function groupThreadsByProject(threads: ThreadInfo[]) {
    const groups = new Map<string, ThreadInfo[]>();

    for (const thread of threads) {
      const label = threadGroupLabel(thread);
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label)!.push(thread);
    }

    return {
      groups: Array.from(groups.entries()).map(([label, threads]) => ({
        label,
        threads,
      })),
    };
  }

  // Group threads by provider (Codex vs Copilot)
  const providerGroups = $derived.by(() => {
    const codex: ThreadInfo[] = [];
    const copilot: ThreadInfo[] = [];

    for (const thread of visibleThreads) {
      if (thread.provider === "copilot-acp") {
        copilot.push(thread);
      } else {
        codex.push(thread); // undefined provider = Codex default
      }
    }

    return { codex, copilot };
  });

  // Group each provider's threads by repo/project
  const codexGrouped = $derived(groupThreadsByProject(providerGroups.codex));
  const copilotGrouped = $derived(groupThreadsByProject(providerGroups.copilot));

  let collapsedGroups = $state<Record<string, boolean>>({});
  const expandedGroups = $state<Record<string, boolean>>({});
  let threadsPerProjectLimit = $state(10);

  $effect(() => {
    const saved = localStorage.getItem('coderelay_threads_per_project_limit');
    if (saved) {
      threadsPerProjectLimit = Math.max(1, Math.min(50, parseInt(saved) || 10));
    }
  });

  function isGroupCollapsed(label: string): boolean {
    return collapsedGroups[label] === true;
  }

  function toggleGroup(label: string) {
    collapsedGroups = {
      ...collapsedGroups,
      [label]: !collapsedGroups[label],
    };
  }

  function threadContextTitle(
    thread: { cwd?: string; path?: string },
    label: string,
  ): string {
    return thread.cwd || thread.path || label;
  }

  function indicatorTitle(ind: "blocked" | "working" | "idle"): string {
    if (ind === "blocked") return "Waiting for your action";
    if (ind === "working") return "Working";
    return "Idle";
  }

  $effect(() => {
    if (socket.status === "connected") {
      threads.fetch();
      threads.fetchCollaborationPresets();
    }
  });

  // Subscribe to a small window of recent threads so activity + status indicators are live in the list view.
  // Without this, iOS users won't see reliable updates and ordering can lag until a thread is opened.
  // Important: do NOT make this reactive state. This effect both *reads* and *writes*
  // the set, and using $state can create a feedback loop that pegs the UI (manifesting
  // as an "empty" thread list).
  let listSubscribed = new Set<string>();

  $effect(() => {
    if (socket.status !== "connected") {
      // Reset so we re-subscribe cleanly on reconnect.
      listSubscribed = new Set();
      return;
    }

    const desired = new Set<string>();
    for (const t of visibleThreads.slice(0, 25)) desired.add(t.id);
    const keep = threads.currentId;
    if (keep) desired.add(keep);

    // Subscribe new
    for (const id of desired) {
      if (!listSubscribed.has(id)) socket.subscribeThread(id);
    }

    // Unsubscribe removed
    for (const id of listSubscribed) {
      if (!desired.has(id)) socket.unsubscribeThread(id);
    }

    listSubscribed = desired;
  });

  async function renameThread(thread: { id: string; title?: string; name?: string; preview?: string }) {
    const current = (thread.title || thread.name || "").trim();
    const next = window.prompt("Rename thread", current);
    if (next == null) return; // cancel
    const title = next.trim();

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (auth.token) headers.authorization = `Bearer ${auth.token}`;

    const res = await fetch("/admin/thread/title", {
      method: "POST",
      headers,
      body: JSON.stringify({ threadId: thread.id, title }),
    }).catch(() => null);

    if (!res || !res.ok) {
      alert("Failed to rename thread. Open Admin and sign in with the Access Token first.");
      return;
    }

    // Update UI immediately; local-orbit will also inject titles from Codex's local title store.
    (thread as any).title = title;
    (thread as any).name = title;
  }

  function threadToMarkdown(threadId: string): string {
    const info = threads.list.find((t) => t.id === threadId);
    const title = ((info as any)?.title || (info as any)?.name || "").trim() || threadId.slice(0, 8);
    const out: string[] = [];
    out.push(`# ${title}`);
    out.push("");
    out.push(`Thread: ${threadId}`);
    out.push("");

    const msgs = messages.getThreadMessages(threadId);
    for (const m of msgs) {
      const role =
        m.role === "tool"
          ? m.kind
            ? `Tool (${m.kind})`
            : "Tool"
          : m.role === "assistant"
            ? "Assistant"
            : m.role === "user"
              ? "User"
              : "Approval";
      out.push(`## ${role}`);
      out.push("");
      const text = (m.text ?? "").trim();
      if (m.role === "tool") {
        out.push("```text");
        out.push(text);
        out.push("```");
      } else {
        out.push(text);
      }
      out.push("");
    }
    return out.join("\n").trim() + "\n";
  }

  function escapeHtml(text: string): string {
    return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function threadToHtml(threadId: string): string {
    const info = threads.list.find((t) => t.id === threadId);
    const title = ((info as any)?.title || (info as any)?.name || "").trim() || threadId.slice(0, 8);
    const msgs = messages.getThreadMessages(threadId);
    const body = msgs
      .map((m) => {
        const role =
          m.role === "tool"
            ? m.kind
              ? `Tool (${m.kind})`
              : "Tool"
            : m.role === "assistant"
              ? "Assistant"
              : m.role === "user"
                ? "User"
                : "Approval";
        const text = escapeHtml((m.text ?? "").trim()).replaceAll("\n", "<br />");
        const content = m.role === "tool" ? `<pre>${text}</pre>` : `<p>${text}</p>`;
        return `<section><h2>${escapeHtml(role)}</h2>${content}</section>`;
      })
      .join("\n");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 860px; margin: 32px auto; padding: 0 16px; line-height: 1.55; }
    h1 { margin: 0 0 4px; font-size: 1.5rem; }
    .meta { margin: 0 0 24px; color: oklch(0.55 0.03 260); font-size: .9rem; }
    section { border: 1px solid oklch(0.87 0.01 260); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    h2 { margin: 0 0 8px; font-size: 1rem; text-transform: uppercase; letter-spacing: .04em; color: oklch(0.45 0.03 260); }
    p, pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
    pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: oklch(0 0 0 / 0.05); padding: 10px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Thread: ${escapeHtml(threadId)}</p>
  ${body || "<p>No messages.</p>"}
</body>
</html>
`;
  }

  function threadToJson(threadId: string): string {
    const info = threads.list.find((t) => t.id === threadId);
    const title = ((info as any)?.title || (info as any)?.name || "").trim() || threadId.slice(0, 8);
    const msgs = messages.getThreadMessages(threadId);
    const exported = {
      version: 1,
      exportedAt: new Date().toISOString(),
      thread: { id: threadId, title },
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role,
        kind: m.kind ?? null,
        text: m.text ?? "",
        approval: m.role === "approval" ? (m as any).approval ?? null : null,
        metadata: (m as any).metadata ?? null,
      })),
    };
    return JSON.stringify(exported, null, 2) + "\n";
  }

  function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function safeFilename(name: string) {
    return name.replace(/[^a-z0-9\- _]+/gi, "").trim();
  }

  async function shareFileOrFallback(title: string, file: File, fallbackText: string) {
    try {
      const nav = navigator as any;
      if (nav?.share) {
        if (nav.canShare?.({ files: [file] })) {
          await nav.share({ title, files: [file] });
          return true;
        }
        await nav.share({ title, text: fallbackText });
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  function printHtmlAsPdf(html: string): boolean {
    const printDoc = html.replace(
      "</body>",
      "<script>window.addEventListener('load', () => { setTimeout(() => { window.focus(); window.print(); }, 80); });<\\/script></body>"
    );
    const w = window.open("", "_blank");
    if (!w) return false;
    w.document.open();
    w.document.write(printDoc);
    w.document.close();
    return true;
  }

  async function exportThread(threadId: string, format: "md" | "json" | "html" | "pdf", force = false) {
    const info = threads.list.find((t) => t.id === threadId);
    const titleRaw = ((info as any)?.title || (info as any)?.name || (info as any)?.preview || "").trim() || threadId.slice(0, 8);
    const title = safeFilename(titleRaw) || threadId.slice(0, 8);

    // Exports from the thread list may happen before the thread has been opened.
    // If our in-memory cache is cold, best-effort rehydrate from the local-orbit event store first.
    if (messages.getThreadMessages(threadId).length === 0) {
      try {
        await messages.rehydrateFromEvents(threadId, { force });
      } catch {
        // ignore; we'll still export what we have (possibly empty)
      }
    }

    if (format === "md") {
      const md = threadToMarkdown(threadId);
      const f = new File([md], `${title}.md`, { type: "text/markdown" });
      const shared = await shareFileOrFallback(`CodeRelay: ${title}`, f, md);
      if (!shared) downloadBlob(`${title}.md`, new Blob([md], { type: "text/markdown" }));
      return;
    }

    if (format === "html") {
      const html = threadToHtml(threadId);
      const f = new File([html], `${title}.html`, { type: "text/html" });
      const shared = await shareFileOrFallback(`CodeRelay: ${title}`, f, html);
      if (!shared) downloadBlob(`${title}.html`, new Blob([html], { type: "text/html" }));
      return;
    }

    if (format === "pdf") {
      const html = threadToHtml(threadId);
      const opened = printHtmlAsPdf(html);
      if (!opened) {
        downloadBlob(`${title}.html`, new Blob([html], { type: "text/html" }));
      }
      return;
    }

    const json = threadToJson(threadId);
    const f = new File([json], `${title}.json`, { type: "application/json" });
    const shared = await shareFileOrFallback(`CodeRelay: ${title}`, f, json);
    if (!shared) downloadBlob(`${title}.json`, new Blob([json], { type: "application/json" }));
  }
</script>


{#snippet threadItem(thread: any)}
  {@const repoLabel = threadRepoLabel(thread)}
  {@const projectLabel = threadProjectLabel(thread)}
  {@const canManageThread = canSendPrompt(thread)}
  {@const disabledReason = canManageThread ? "" : getCapabilityTooltip("SEND_PROMPT", false)}
  <li class="thread-item row">
    <a
      class="thread-link row"
      href="/thread/{thread.id}"
      onclick={(e) => {
        e.preventDefault();
        threads.open(thread.id);
        navigate("/thread/:id", { params: { id: thread.id } });
      }}
    >
      <span class="thread-icon">›</span>
      <span
        class="thread-indicator"
        class:thread-indicator-idle={threadIndicator(thread) === "idle"}
        class:thread-indicator-working={threadIndicator(thread) === "working"}
        class:thread-indicator-blocked={threadIndicator(thread) === "blocked"}
        title={indicatorTitle(threadIndicator(thread))}
        aria-label={"Thread status: " + indicatorTitle(threadIndicator(thread))}
      >●</span>
      <span class="thread-main stack">
        <span class="thread-preview">{thread.title || thread.name || thread.preview || "New thread"}</span>
        {#if repoLabel || projectLabel}
          <span
            class="thread-context row"
            title={threadContextTitle(
              thread,
              repoLabel && projectLabel ? `${repoLabel}/${projectLabel}` : repoLabel || projectLabel || ""
            )}
          >
            {#if repoLabel}
              <span class="thread-repo-pill">{repoLabel}</span>
            {/if}
            {#if projectLabel}
              <span class="thread-project-pill">{projectLabel}</span>
            {/if}
          </span>
        {/if}
        <span class="thread-meta">{formatTime(threadTime(thread.createdAt, thread.id))}</span>
      </span>
    </a>
    {#if uiToggles.showThreadListExports}
      <button
        class="export-btn"
        onclick={(e) => {
          e.stopPropagation();
          exportThread(thread.id, "md", (e as MouseEvent).shiftKey);
        }}
        title="Share/export thread as Markdown"
      >⇪</button>
      <button
        class="export-btn"
        onclick={(e) => {
          e.stopPropagation();
          exportThread(thread.id, "json", (e as MouseEvent).shiftKey);
        }}
        title="Share/export thread as JSON"
      >⎘</button>
      <button
        class="export-btn"
        onclick={(e) => {
          e.stopPropagation();
          exportThread(thread.id, "html", (e as MouseEvent).shiftKey);
        }}
        title="Share/export thread as HTML"
      >⌘</button>
      <button
        class="export-btn"
        onclick={(e) => {
          e.stopPropagation();
          exportThread(thread.id, "pdf", (e as MouseEvent).shiftKey);
        }}
        title="Print/export thread as PDF"
      >PDF</button>
    {/if}

    <button
      class="thread-action-btn rename-btn"
      onclick={() => renameThread(thread)}
      disabled={!canManageThread}
      title={canManageThread ? "Rename thread" : disabledReason}
      aria-label="Rename thread"
    >
      <Pencil size={16} aria-hidden="true" />
    </button>
    <button
      class="thread-action-btn archive-btn"
      onclick={() => threads.archive(thread.id)}
      disabled={!canManageThread}
      title={canManageThread ? "Archive thread" : disabledReason}
      aria-label="Archive thread"
    >
      <Archive size={16} aria-hidden="true" />
    </button>
  </li>
{/snippet}

{#snippet groupedThreadList(groups: any[])}
  {#if groups.length > 0}
    {#each groups as group (group.label)}
      <div class="thread-group stack">
        <button
          class="thread-group-toggle row"
          type="button"
          onclick={() => toggleGroup(group.label)}
          aria-expanded={!isGroupCollapsed(group.label)}
          title={isGroupCollapsed(group.label) ? "Expand group" : "Collapse group"}
        >
          <span class="thread-group-caret" aria-hidden="true">
            {#if isGroupCollapsed(group.label)}
              <ChevronRight size={14} aria-hidden="true" />
            {:else}
              <ChevronDown size={14} aria-hidden="true" />
            {/if}
          </span>
          <span class="thread-group-title">{group.label}</span>
          <span class="thread-group-count">{group.threads.length}</span>
        </button>
        {#if !isGroupCollapsed(group.label)}
          <ul class="thread-list">
            {#each (expandedGroups[group.label] ? group.threads : group.threads.slice(0, threadsPerProjectLimit)) as thread (thread.id)}
              {@render threadItem(thread)}
            {/each}
          </ul>
          {#if !expandedGroups[group.label] && group.threads.length > threadsPerProjectLimit}
            <div class="show-more-row row">
              <button
                class="plain-btn show-more-btn"
                onclick={() => expandedGroups[group.label] = true}
              >
                Show all {group.threads.length} threads...
              </button>
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
{/snippet}

{#snippet flatThreadList(list: any[])}
  <ul class="thread-list">
    {#each list as thread (thread.id)}
      {@render threadItem(thread)}
    {/each}
  </ul>
{/snippet}


<svelte:head>
  <title>CodeRelay</title>
</svelte:head>

<div class="home stack">
  <AppHeader status={socket.status}>
    {#snippet actions()}
      <a href="/metrics">Metrics</a>
      <a href="/settings">Settings</a>
      <a href="/admin">Admin</a>
      <button type="button" onclick={() => theme.cycle()} title="Theme: {theme.current}">
        {themeIcons[theme.current]}
      </button>
    {/snippet}
  </AppHeader>

  {#if socket.error}
    <div class="error row">
      <span class="error-icon">✗</span>
      <span class="error-text">{socket.error}</span>
    </div>
  {/if}

  {#if socket.status === "connected"}
    <div class="threads-section stack">
      <div class="section-header split">
        <div class="section-title-row row">
          <span class="section-title">Threads</span>
          <span class="indicator-legend row" aria-label="Thread status legend">
            <span class="legend-item row" title="Idle">
              <span class="thread-indicator thread-indicator-idle" aria-hidden="true">●</span>
              <span class="legend-text">idle</span>
            </span>
            <span class="legend-item row" title="Working">
              <span class="thread-indicator thread-indicator-working" aria-hidden="true">●</span>
              <span class="legend-text">working</span>
            </span>
            <span class="legend-item row" title="Waiting for your action">
              <span class="thread-indicator thread-indicator-blocked" aria-hidden="true">●</span>
              <span class="legend-text">blocked</span>
            </span>
          </span>
          <button
            class="legend-help-btn"
            type="button"
            onclick={() => (legendOpen = true)}
            aria-label="Show thread status legend"
            title="Thread status legend"
          >?</button>
          <button class="refresh-btn" onclick={() => threads.fetch()} title="Refresh">↻</button>
        </div>
        <div class="section-actions row">
          <button class="new-task-link" type="button" onclick={openTaskModal}>New task</button>
        </div>
      </div>

      <div class="filter-bar split">
        <div class="filter-group row">
          <span class="filter-label" id="filter-provider-label">Provider:</span>
          <div role="group" aria-labelledby="filter-provider-label" class="filter-options row">
            <button
              class="filter-chip"
              class:selected={filters.provider === "all"}
              aria-pressed={filters.provider === "all"}
              onclick={() => (filters.provider = "all")}
            >All ({threadCounts.all})</button>
            <button
              class="filter-chip"
              class:selected={filters.provider === "codex"}
              aria-pressed={filters.provider === "codex"}
              onclick={() => (filters.provider = "codex")}
            >Codex ({threadCounts.codex})</button>
            <button
              class="filter-chip"
              class:selected={filters.provider === "copilot-acp"}
              aria-pressed={filters.provider === "copilot-acp"}
              onclick={() => (filters.provider = "copilot-acp")}
            >Copilot ({threadCounts.copilot})</button>
            <button
              class="filter-chip"
              class:selected={filters.provider === "claude"}
              aria-pressed={filters.provider === "claude"}
              onclick={() => (filters.provider = "claude")}
            >Claude ({threadCounts.claude})</button>
            <button
              class="filter-chip"
              class:selected={filters.provider === "opencode"}
              aria-pressed={filters.provider === "opencode"}
              onclick={() => (filters.provider = "opencode")}
            >OpenCode ({threadCounts.opencode})</button>
          </div>
        </div>
        <div class="filter-group row">
          <span class="filter-label" id="filter-status-label">Status:</span>
          <div role="group" aria-labelledby="filter-status-label" class="filter-options row">
            <button
              class="filter-chip"
              class:selected={filters.status === "all"}
              aria-pressed={filters.status === "all"}
              onclick={() => (filters.status = "all")}
            >All ({threadCounts.all})</button>
            <button
              class="filter-chip"
              class:selected={filters.status === "active"}
              aria-pressed={filters.status === "active"}
              onclick={() => (filters.status = "active")}
            >Active ({threadCounts.active})</button>
            <button
              class="filter-chip"
              class:selected={filters.status === "archived"}
              aria-pressed={filters.status === "archived"}
              onclick={() => (filters.status = "archived")}
            >Archived ({threadCounts.archived})</button>
          </div>
        </div>
      </div>

      {#if threads.loading}
        <div class="loading row">
          <ShimmerDot /> Loading threads...
        </div>
      {:else if visibleThreads.length === 0}
        <div class="empty row">No threads yet. Create one above.</div>
      {:else}
        {#if legendOpen}
          <div
            class="legend-backdrop"
            role="presentation"
            onclick={(e) => {
              if (e.currentTarget === e.target) legendOpen = false;
            }}
          >
            <div class="legend-modal" role="dialog" aria-modal="true" aria-label="Thread status legend">
              <div class="legend-modal-header row">
                <div class="legend-modal-title">Thread status</div>
                <button class="legend-close-btn" type="button" onclick={() => (legendOpen = false)} aria-label="Close">✕</button>
              </div>
              <div class="legend-modal-body stack">
                <div class="legend-row row">
                  <span class="thread-indicator thread-indicator-idle" aria-hidden="true">●</span>
                  <div class="legend-row-text stack">
                    <div class="legend-row-label">Idle</div>
                    <div class="legend-row-desc">Nothing is currently running in this thread.</div>
                  </div>
                </div>
                <div class="legend-row row">
                  <span class="thread-indicator thread-indicator-working" aria-hidden="true">●</span>
                  <div class="legend-row-text stack">
                    <div class="legend-row-label">Working</div>
                    <div class="legend-row-desc">The model is actively running.</div>
                  </div>
                </div>
                <div class="legend-row row">
                  <span class="thread-indicator thread-indicator-blocked" aria-hidden="true">●</span>
                  <div class="legend-row-text stack">
                    <div class="legend-row-label">Blocked</div>
                    <div class="legend-row-desc">Waiting for your action (approval or input).</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Codex Provider Section -->
        <div class="provider-section">
          <div class="provider-header">
            <div class="provider-title">
              <span class="provider-badge">Codex</span>
            </div>
            <button class="new-thread-btn" onclick={openTaskModal}> ✨ New task </button>
          </div>

          {#if codexGrouped.groups.length > 0}
            {#if uiToggles.showProjectGrouping}
              {@render groupedThreadList(codexGrouped.groups)}
            {:else}
              {@render flatThreadList(providerGroups.codex)}
            {/if}
          {:else}
            <div class="empty-state">No Codex threads yet</div>
          {/if}
        </div>

        <!-- Copilot Provider Section -->
        <div class="provider-section">
          <div class="provider-header">
            <div class="provider-title">
              <span class="provider-badge">GitHub Copilot</span>
            </div>
          </div>

          {#if copilotGrouped.groups.length > 0}
            {#if uiToggles.showProjectGrouping}
              {@render groupedThreadList(copilotGrouped.groups)}
            {:else}
              {@render flatThreadList(providerGroups.copilot)}
            {/if}
          {:else}
            <div class="empty-state">No Copilot sessions detected</div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if showTaskModal}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="modal-overlay" role="presentation" onclick={closeTaskModal}></div>
    <div class="task-modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <span>New task</span>
        <button class="modal-close" type="button" onclick={closeTaskModal}>×</button>
      </div>
      <form class="modal-body stack" onsubmit={handleCreateTask}>
        <div class="field stack">
          <label for="task-note">task</label>
          <textarea
            id="task-note"
            rows="4"
            bind:value={taskNote}
            placeholder="What do you want to do?"
          ></textarea>
        </div>

        <div class="field stack">
          <label for="task-project">project</label>
          <ProjectPicker bind:value={taskProject} />
        </div>

        <div class="field stack">
          <label for="task-agent">agent (optional)</label>
          <select id="task-agent" bind:value={taskAgent}>
            <option value="">None (Standard Assistant)</option>
            {#each agents.list as agent}
              <option value={agent.id}>{agent.name}</option>
            {/each}
          </select>
        </div>

        <div class="field stack">
          <label for="task-model">model</label>
          <select id="task-model" bind:value={taskModel} disabled={!!taskAgent}>
            {#if models.status === "loading"}
              <option value="">Loading...</option>
            {:else if models.options.length === 0}
              <option value="">No models available</option>
            {:else}
              {#each models.options as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            {/if}
          </select>
        </div>

        <div class="field stack">
          <label for="task-permissions">permissions</label>
          <select id="task-permissions" bind:value={permissionLevel}>
            {#each Object.entries(permissionPresets) as [key, preset]}
              <option value={key}>{preset.label} — {preset.detail}</option>
            {/each}
          </select>
        </div>

        <label class="checkbox-field">
          <input type="checkbox" bind:checked={taskPlanFirst} />
          <span>Plan first</span>
        </label>

        <div class="modal-actions row">
          <button type="button" class="ghost-btn" onclick={closeTaskModal} disabled={isCreating}>Cancel</button>
          <button type="submit" class="primary-btn" disabled={!taskNote.trim() || !taskProject.trim() || isCreating}>
            {isCreating ? "Starting..." : taskPlanFirst ? "Start planning" : "Start task"}
          </button>
        </div>
      </form>
    </div>
  {/if}
</div>

<style>
  .home {
    --stack-gap: 0;
    min-height: 100vh;
    background: var(--cli-bg);
    color: var(--cli-text);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  .provider-section {
    margin-bottom: var(--space-xl);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-lg);
    background: var(--cli-bg);
    padding: var(--space-md);
  }

  .provider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--cli-border);
  }

  .provider-title {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }

  .provider-badge {
    font-weight: var(--font-weight-semibold);
    font-size: 0.95rem;
    color: var(--cli-prefix-agent);
  }

  .new-thread-btn {
    padding: var(--space-sm) var(--space-md);
    background: var(--cli-prefix-agent);
    color: var(--cli-bg);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
  }

  .empty-state {
    padding: var(--space-xl);
    text-align: center;
    color: var(--cli-text-muted);
  }

  .field {
    --stack-gap: var(--space-xs);
  }

  .field label {
    color: var(--cli-text-dim);
    font-size: var(--text-xs);
  }

  .field select {
    padding: var(--space-sm);
    background: var(--cli-bg);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-sm);
    color: var(--cli-text);
    font-family: var(--font-mono);
  }

  .field select:focus {
    outline: none;
    border-color: var(--cli-prefix-agent);
  }

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--cli-text);
  }

  .checkbox-field input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    accent-color: var(--cli-prefix-agent);
  }

  .error {
    --row-gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--cli-error-bg);
    border-bottom: 1px solid var(--cli-border);
    color: var(--cli-error);
  }

  .error-icon {
    font-weight: var(--font-weight-semibold);
  }

  .threads-section {
    flex: 1;
    --stack-gap: 0;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: oklch(0.02 0.01 260 / 0.6);
    z-index: 40;
  }

  .task-modal {
    position: fixed;
    top: 12vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(560px, calc(100vw - 2rem));
    background: var(--cli-bg-elevated);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-md);
    z-index: 50;
    box-shadow: 0 30px 80px oklch(0 0 0 / 0.35);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--cli-border);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--cli-text-muted);
  }

  .modal-close {
    background: transparent;
    border: none;
    color: var(--cli-text-muted);
    font-size: var(--text-lg);
    cursor: pointer;
  }

  .modal-body {
    padding: var(--space-md);
    --stack-gap: var(--space-md);
  }

  .modal-body textarea,
  .modal-body input,
  .modal-body select {
    padding: var(--space-sm);
    background: var(--cli-bg);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-sm);
    color: var(--cli-text);
    font-family: var(--font-mono);
  }

  .modal-body textarea:focus,
  .modal-body input:focus,
  .modal-body select:focus {
    outline: none;
    border-color: var(--cli-prefix-agent);
  }

  .modal-actions {
    justify-content: flex-end;
    gap: var(--space-sm);
  }

  .ghost-btn,
  .primary-btn {
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    cursor: pointer;
    text-decoration: none;
  }

  .ghost-btn {
    background: transparent;
    border: 1px solid var(--cli-border);
    color: var(--cli-text-muted);
  }

  .primary-btn {
    background: var(--cli-prefix-agent);
    border: none;
    color: var(--cli-bg);
  }

  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .section-header {
    --split-gap: var(--space-sm);
    padding: var(--space-sm) 0 var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--cli-border);
  }

  .section-title {
    color: var(--cli-text-dim);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section-title-row {
    --row-gap: var(--space-xs);
    align-items: center;
  }

  .indicator-legend {
    --row-gap: var(--space-sm);
    align-items: center;
    color: var(--cli-text-muted);
    font-size: var(--text-xs);
  }

  .legend-item {
    --row-gap: var(--space-1\.5);
    align-items: center;
    text-transform: lowercase;
    user-select: none;
  }

  .legend-text {
    color: var(--cli-text-muted);
  }

  .legend-help-btn {
    display: none;
    width: 26px;
    height: 26px;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full);
    border: 1px solid var(--cli-border);
    background: transparent;
    color: var(--cli-text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    cursor: pointer;
  }

  .legend-help-btn:hover {
    color: var(--cli-text);
    border-color: var(--cli-text-muted);
    background: var(--cli-selection);
  }

  .legend-backdrop {
    position: fixed;
    inset: 0;
    background: oklch(0 0 0 / 0.35);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: calc(var(--space-lg) * 2) var(--space-md);
    z-index: 50;
  }

  .legend-modal {
    width: min(520px, 100%);
    background: var(--cli-bg);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 40px oklch(0 0 0 / 0.35);
    padding: var(--space-md);
  }

  .legend-modal-header {
    justify-content: space-between;
    align-items: center;
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--cli-border);
  }

  .legend-modal-title {
    font-family: var(--font-mono);
    color: var(--cli-text);
    font-size: var(--text-sm);
    letter-spacing: 0.02em;
  }

  .legend-close-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-full);
    border: 1px solid var(--cli-border);
    background: transparent;
    color: var(--cli-text-muted);
    cursor: pointer;
  }

  .legend-close-btn:hover {
    color: var(--cli-text);
    border-color: var(--cli-text-muted);
    background: var(--cli-selection);
  }

  .legend-modal-body {
    padding-top: var(--space-md);
  }

  .legend-row {
    --row-gap: var(--space-sm);
    align-items: flex-start;
    padding: var(--space-sm);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-sm);
    background: oklch(1 0 0 / 0.02);
  }

  .legend-row-text {
    --stack-gap: 4px;
  }

  .legend-row-label {
    color: var(--cli-text);
    font-size: var(--text-sm);
  }

  .legend-row-desc {
    color: var(--cli-text-muted);
    font-size: var(--text-xs);
    line-height: 1.3;
  }

  .section-actions {
    --row-gap: var(--space-sm);
    padding-right: var(--space-sm);
  }

  .new-task-link {
    padding: var(--space-sm);
    background: var(--cli-bg);
    appearance: none;
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-sm);
    color: var(--cli-text-dim);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    text-decoration: none;
    text-transform: lowercase;
    transition: all var(--transition-fast);
    cursor: pointer;
  }

  .new-task-link:hover {
    background: var(--cli-selection);
    color: var(--cli-text);
    border-color: var(--cli-text-muted);
  }

  .refresh-btn {
    padding: var(--space-sm);
    background: transparent;
    border: none;
    color: var(--cli-text-muted);
    font-size: var(--text-base);
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .refresh-btn:hover {
    color: var(--cli-text);
  }

  .loading,
  .empty {
    --row-gap: var(--space-sm);
    padding: var(--space-lg) var(--space-md);
    color: var(--cli-text-muted);
  }

  .thread-group {
    --stack-gap: var(--space-xs);
  }

  .thread-group + .thread-group {
    margin-top: var(--space-sm);
  }

  .thread-group-toggle {
    width: 100%;
    --row-gap: var(--space-xs);
    align-items: center;
    padding: 0 var(--space-md);
    background: transparent;
    border: none;
    color: var(--cli-text-dim);
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    text-align: left;
  }

  .thread-group-toggle:hover {
    color: var(--cli-text);
  }

  .thread-group-caret {
    width: 12px;
    color: var(--cli-text-muted);
  }

  .thread-group-title {
    font-size: var(--text-xs);
  }

  .thread-group-count {
    margin-left: auto;
    color: var(--cli-text-muted);
    font-size: var(--text-xs);
  }

  .thread-list {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
    overflow-y: auto;
  }

  .thread-item {
    --row-gap: 0;
    border-bottom: 1px solid var(--cli-border);
  }

  .thread-item:last-child {
    border-bottom: none;
  }

  .thread-link {
    flex: 1;
    min-width: 0;
    --row-gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    text-decoration: none;
    color: inherit;
    transition: background var(--transition-fast);
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
  }

  .thread-link:hover {
    background: var(--cli-selection);
  }

  .thread-icon {
    color: var(--cli-prefix-agent);
    font-weight: var(--font-weight-semibold);
  }

  .thread-preview {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--cli-text);
  }

  .thread-main {
    flex: 1;
    min-width: 0;
    --stack-gap: 2px;
  }

  .thread-context {
    min-width: 0;
    --row-gap: var(--space-1\.5);
    align-items: center;
  }

  .thread-repo-pill {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 1px var(--space-sm);
    border-radius: var(--radius-full);
    border: 1px solid color-mix(in oklab, var(--cli-prefix-agent) 35%, transparent);
    background: color-mix(in oklab, var(--cli-prefix-agent) 10%, transparent);
    color: var(--cli-text);
    font-size: var(--text-2xs);
    line-height: 1.35;
  }

  .thread-project-pill {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 1px var(--space-sm);
    border-radius: var(--radius-full);
    border: 1px solid color-mix(in oklab, var(--cli-prefix-web) 40%, transparent);
    background: color-mix(in oklab, var(--cli-prefix-web) 14%, transparent);
    color: var(--cli-text);
    font-size: var(--text-2xs);
    line-height: 1.35;
  }

  .thread-meta {
    flex-shrink: 0;
    font-size: var(--text-xs);
    color: var(--cli-text-muted);
  }

  .thread-indicator {
    flex-shrink: 0;
    padding: 0 var(--space-sm);
    font-size: var(--text-xs);
    line-height: 1;
  }
  .thread-indicator-idle {
    color: oklch(0.74 0.16 148);
  }
  .thread-indicator-working {
    color: oklch(0.82 0.14 85);
  }
  .thread-indicator-blocked {
    color: oklch(0.63 0.2 25);
  }

  .export-btn {
    padding: var(--space-sm) var(--space-sm);
    background: transparent;
    border: none;
    color: var(--cli-text-muted);
    font-size: var(--text-base);
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .export-btn:hover {
    color: var(--cli-text);
  }

  .archive-btn {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: none;
    color: var(--cli-text-muted);
    font-size: var(--text-base);
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .rename-btn {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: none;
    color: var(--cli-text-muted);
    font-size: var(--text-base);
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .rename-btn:hover {
    color: var(--cli-text);
  }

  .archive-btn:hover {
    color: var(--cli-error);
  }

  .thread-action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .thread-action-btn:disabled:hover {
    background: transparent;
    color: var(--cli-text-muted) !important;
  }

  /* Mobile: prioritize thread title visibility. */
  @media (max-width: 520px) {
    /* Legend: iOS does not reliably show title tooltips. Use a tap-to-open legend instead. */
    .indicator-legend {
      display: none;
    }

    .legend-help-btn {
      display: inline-flex;
    }

    /* Allow titles to use 2 lines on narrow screens. */
    .thread-preview {
      display: -webkit-box;
      line-clamp: 2;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      white-space: normal;
      overflow: hidden;
      line-height: 1.25;
    }

    /* Keep date visible but compact. */
    .thread-meta {
      display: block;
      font-size: var(--text-2xs);
      line-height: 1.1;
    }

    /* Hide export buttons on mobile; long-press + message menu + thread header already cover export/copy flows. */
    .export-btn {
      display: none;
    }

    /* Keep controls compact but available. */
    .rename-btn,
    .archive-btn {
      padding: var(--space-sm) var(--space-xs);
    }

    .thread-indicator {
      padding: 0 var(--space-xs);
      font-size: 13px;
    }
  }

  /* Filter Bar */
  .filter-bar {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    padding: var(--space-sm) var(--space-md);
    margin-bottom: var(--space-sm);
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--space-sm);
  }

  .filter-label {
    color: var(--cli-text-dim);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .filter-options {
    display: flex;
    flex-direction: row;
    gap: var(--space-1\.5);
    flex-wrap: wrap;
  }

  .filter-chip {
    padding: 3px var(--space-sm);
    background: transparent;
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-full);
    color: var(--cli-text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .filter-chip:hover {
    background: var(--cli-selection);
    color: var(--cli-text);
  }

  .filter-chip.selected {
    background: var(--cli-text);
    color: var(--cli-bg);
    border-color: var(--cli-text);
  }
</style>
