<script lang="ts">
    import type { ModeKind, ReasoningEffort, SandboxMode } from "../lib/types";
    import { route } from "../router";
    import { socket } from "../lib/socket.svelte";
    import { threads } from "../lib/threads.svelte";
    import { messages } from "../lib/messages.svelte";
    import { models } from "../lib/models.svelte";
    import { theme } from "../lib/theme.svelte";
    import { uiToggles } from "../lib/uiToggles.svelte";
    import { canSendPrompt, getCapabilityTooltip, supportsApprovals } from "../lib/thread-capabilities";
    import { loadAgentPresets, type AgentPreset } from "../lib/presets";
    import { loadHelperProfiles, type HelperProfile } from "../lib/helperProfiles";
    import AppHeader from "../lib/components/AppHeader.svelte";
    import MessageBlock from "../lib/components/MessageBlock.svelte";
    import ApprovalPrompt from "../lib/components/ApprovalPrompt.svelte";
    import UserInputPrompt from "../lib/components/UserInputPrompt.svelte";
    import PlanCard from "../lib/components/PlanCard.svelte";
    import WorkingStatus from "../lib/components/WorkingStatus.svelte";
    import Reasoning from "../lib/components/Reasoning.svelte";
    import PromptInput from "../lib/components/PromptInput.svelte";
    import OutcomeCard from "../lib/components/OutcomeCard.svelte";
    import { createMockHelperOutcome } from "../lib/test-helpers";

    type ShareNavigator = Navigator & {
        share?: (data?: ShareData) => Promise<void>;
        canShare?: (data?: ShareData) => boolean;
    };

    const themeIcons = { system: "◐", light: "○", dark: "●" } as const;

    let moreMenuOpen = $state(false);
    let helperMenuOpen = $state(false);
    let helperLaunchNote = $state<string | null>(null);

    // Search functionality (Issue #201)
    let searchQuery = $state("");
    let searchResults = $state<any[]>([]);
    let isSearching = $state(false);
    let searchError = $state<string | null>(null);
    let showSearch = $state(false);
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;

    let model = $state("");
    let reasoningEffort = $state<ReasoningEffort>("medium");
    let sandbox = $state<SandboxMode>("workspace-write");
    let mode = $state<ModeKind>("code");
    let developerInstructions = $state("");
    let agentPresets = $state<AgentPreset[]>(loadAgentPresets());
    let helperProfiles = $state<HelperProfile[]>(loadHelperProfiles());
    let modeUserOverride = false;
    let trackedPlanId: string | null = null;
    let container: HTMLDivElement | undefined;
    let turnStartTime = $state<number | undefined>(undefined);
    let promptInput: ReturnType<typeof PromptInput> | undefined;

    const threadId = $derived(route.params.id);

    function handleOutcomeContinue(text: string) {
        if (promptInput) {
            promptInput.setInput(text);
        }
    }

    function handleFileClick(filePath: string) {
        // Implement scrolling to file mentions if needed or just log
        console.log("File clicked:", filePath);
        // Find message with this file or navigate? For now just log.
    }



    const currentThread = $derived.by(() => {
        const id = threadId;
        if (!id) return null;
        return threads.list.find((t) => t.id === id) ?? null;
    });

    const threadProvider = $derived.by(() => {
        if (currentThread?.provider) return currentThread.provider;
        if (threadId?.startsWith("copilot-acp:")) return "copilot-acp";
        if (threadId?.startsWith("claude-mcp:")) return "claude-mcp";
        if (threadId?.startsWith("claude:")) return "claude";
        if (threadId?.startsWith("opencode:")) return "opencode";
        return "codex";
    });

    const canSendPromptInput = $derived(canSendPrompt(currentThread));

    const sendPromptDisabledReason = $derived.by(() => {
        if (canSendPromptInput) return "";
        return getCapabilityTooltip("SEND_PROMPT", false);
    });

    const pendingAcpApproval = $derived.by(() => {
        const id = threadId;
        if (!id || threadProvider !== "copilot-acp") return null;
        return messages.getPendingAcpApproval(id);
    });

    const showAutoApproveBanner = $derived.by(() => {
        return threadProvider === "copilot-acp" && !supportsApprovals(currentThread);
    });

    const composerDisabled = $derived.by(() => {
        // Gating: check capabilities.sendPrompt explicitly as required by regression guard
        if (currentThread?.capabilities?.sendPrompt === false) {
             return true; 
        }
        return isInProgress || !socket.isHealthy || !canSendPromptInput;
    });


    const threadTitle = $derived.by(() => {
        const id = threadId;
        if (!id) return "";
        const info = threads.list.find((t) => t.id === id);
        return (info?.title || info?.name || "").trim();
    });

    async function writeClipboard(text: string) {
        const fallbackCopy = (t: string) => {
            const ta = document.createElement("textarea");
            ta.value = t;
            ta.setAttribute("readonly", "true");
            ta.style.position = "fixed";
            ta.style.top = "-1000px";
            ta.style.left = "-1000px";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                document.execCommand("copy");
            } finally {
                document.body.removeChild(ta);
            }
        };
        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                fallbackCopy(text);
            }
        } catch {
            // ignore
        }
    }

    function roleLabel(m: any) {
        if (m.role === "tool") return m.kind ? `Tool (${m.kind})` : "Tool";
        if (m.role === "assistant") return "Assistant";
        if (m.role === "user") return "User";
        return "Approval";
    }

    function messageToQuotedText(m: any): string {
        const header = `**${roleLabel(m)}**`;
        const raw = (m.text ?? "").trimEnd();
        const lines = raw ? raw.split("\n") : [""];
        const out: string[] = [];
        out.push(`> ${header}`);
        for (const line of lines) out.push(`> ${line}`);
        return out.join("\n").trim() + "\n";
    }

    async function copyQuoted(m: any) {
        await writeClipboard(messageToQuotedText(m));
    }

    function threadToMarkdownSlice(msgs: any[]): string {
        const id = threadId;
        if (!id) return "";
        const title = threadTitle || id.slice(0, 8);
        const out: string[] = [];
        out.push(`# ${title}`);
        out.push("");
        out.push(`Thread: ${id}`);
        out.push("");
        for (const m of msgs) {
            out.push(`## ${roleLabel(m)}`);
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

    async function copyFromHere(messageId: string, maxMessages = 20) {
        const list = messages.current;
        const idx = list.findIndex((m) => m.id === messageId);
        if (idx < 0) return;
        const slice = list.slice(idx, idx + maxMessages);
        await writeClipboard(threadToMarkdownSlice(slice));
    }

    async function copyLastN(maxMessages = 20) {
        const list = messages.current;
        if (!list.length) return;
        const slice = list.slice(Math.max(0, list.length - maxMessages));
        await writeClipboard(threadToMarkdownSlice(slice));
    }

    function threadToMarkdown(): string {
        const id = threadId;
        if (!id) return "";
        const title = threadTitle || id.slice(0, 8);
        const out: string[] = [];
        out.push(`# ${title}`);
        out.push("");
        out.push(`Thread: ${id}`);
        out.push("");

        const msgs = messages.getThreadMessages(id);
        for (const m of msgs) {
            const role = m.role === "tool" ? (m.kind ? `Tool (${m.kind})` : "Tool") : m.role === "assistant" ? "Assistant" : m.role === "user" ? "User" : "Approval";
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

    function threadToHtml(): string {
        const id = threadId;
        if (!id) return "";
        const title = threadTitle || id.slice(0, 8);
        const msgs = messages.getThreadMessages(id);
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
  <p class="meta">Thread: ${escapeHtml(id)}</p>
  ${body || "<p>No messages.</p>"}
</body>
</html>
`;
    }

    async function copyThread() {
        try {
            const md = threadToMarkdown();
            if (!md) return;
            await writeClipboard(md);
        } catch {
            // ignore
        }
    }

    async function shareThread() {
        const id = threadId;
        if (!id) return;
        const md = threadToMarkdown();
        if (!md) return;
        const title = threadTitle || id.slice(0, 8);
        try {
            // Prefer native share sheet when available (iOS).
            const nav = navigator as ShareNavigator;
            if (nav?.share) {
                // Prefer sharing a real file when supported (better UX on iOS).
                // If not supported, fall back to text share.
                try {
                    const f = new File([md], `${title}.md`, { type: "text/markdown" });
                    if (nav.canShare?.({ files: [f] })) {
                        await nav.share({ title: `CodeRelay: ${title}`, files: [f] });
                        return;
                    }
                } catch {
                    // ignore and fall back to text share
                }
                await nav.share({ title: `CodeRelay: ${title}`, text: md });
                return;
            }
        } catch {
            // fall back to copy
        }
        await copyThread();
    }

    async function shareThreadJson() {
        const id = threadId;
        if (!id) return;
        const json = threadToJson();
        if (!json) return;
        const title = threadTitle || id.slice(0, 8);
        try {
            const nav = navigator as ShareNavigator;
            if (nav?.share) {
                try {
                    const f = new File([json], `${title}.json`, { type: "application/json" });
                    if (nav.canShare?.({ files: [f] })) {
                        await nav.share({ title: `CodeRelay: ${title}`, files: [f] });
                        return;
                    }
                } catch {
                    // fall back to text share
                }
                await nav.share({ title: `CodeRelay: ${title}`, text: json });
                return;
            }
        } catch {
            // fall back to download
        }
        downloadThreadJson();
    }

    async function shareThreadHtml() {
        const id = threadId;
        if (!id) return;
        const html = threadToHtml();
        if (!html) return;
        const title = threadTitle || id.slice(0, 8);
        try {
            const nav = navigator as ShareNavigator;
            if (nav?.share) {
                try {
                    const f = new File([html], `${title}.html`, { type: "text/html" });
                    if (nav.canShare?.({ files: [f] })) {
                        await nav.share({ title: `CodeRelay: ${title}`, files: [f] });
                        return;
                    }
                } catch {
                    // fall back to text share
                }
                await nav.share({ title: `CodeRelay: ${title}`, text: html });
                return;
            }
        } catch {
            // fall back to download
        }
        downloadThreadHtml();
    }

    function printThreadPdf() {
        const html = threadToHtml();
        if (!html) return;
        const printDoc = html.replace(
            "</body>",
            "<script>window.addEventListener('load', () => { setTimeout(() => { window.focus(); window.print(); }, 80); });<\\/script></body>"
        );
        const w = window.open("", "_blank");
        if (!w) {
            downloadThreadHtml();
            return;
        }
        w.document.open();
        w.document.write(printDoc);
        w.document.close();
    }

    function downloadThread() {
        const id = threadId;
        if (!id) return;
        const md = threadToMarkdown();
        if (!md) return;
        const title = (threadTitle || id.slice(0, 8)).replace(/[^a-z0-9\- _]+/gi, "").trim() || id.slice(0, 8);
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title}.md`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function threadToJson(): string {
        const id = threadId;
        if (!id) return "";
        const title = threadTitle || id.slice(0, 8);
        const msgs = messages.getThreadMessages(id);

        const exported = {
            version: 1,
            exportedAt: new Date().toISOString(),
            thread: {
                id,
                title,
            },
            messages: msgs.map((m) => ({
                id: m.id,
                role: m.role,
                kind: m.kind ?? null,
                text: m.text ?? "",
                approval: m.role === "approval" ? m.approval ?? null : null,
                metadata: m.metadata ?? null,
            })),
        };
        return JSON.stringify(exported, null, 2) + "\n";
    }

    function downloadThreadJson() {
        const id = threadId;
        if (!id) return;
        const json = threadToJson();
        if (!json) return;
        const title = (threadTitle || id.slice(0, 8)).replace(/[^a-z0-9\- _]+/gi, "").trim() || id.slice(0, 8);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function downloadThreadHtml() {
        const id = threadId;
        if (!id) return;
        const html = threadToHtml();
        if (!html) return;
        const title = (threadTitle || id.slice(0, 8)).replace(/[^a-z0-9\- _]+/gi, "").trim() || id.slice(0, 8);
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title}.html`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // Search functionality (Issue #201)
    async function handleSearch() {
        const id = threadId;
        if (!id || !searchQuery.trim()) {
            searchResults = [];
            searchError = null;
            return;
        }

        isSearching = true;
        searchError = null;
        try {
            const res = await fetch(`/api/threads/${encodeURIComponent(id)}/search?q=${encodeURIComponent(searchQuery.trim())}`);
            if (!res.ok) {
                const error = await res.json().catch(() => ({ error: "Search failed" }));
                searchError = error.error || "Search failed";
                searchResults = [];
            } else {
                const data = await res.json();
                searchResults = data.results || [];
            }
        } catch (error) {
            console.error("[search] Error:", error);
            searchError = "Network error";
            searchResults = [];
        } finally {
            isSearching = false;
        }
    }

    function clearSearch() {
        searchQuery = "";
        searchResults = [];
        searchError = null;
        showSearch = false;
    }

    function onSearchInput() {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            handleSearch();
        }, 500);
    }

    // Server-side export (Issue #201)
    async function exportThreadServer(format: "json" | "markdown") {
        const id = threadId;
        if (!id) return;
        
        try {
            const res = await fetch(`/api/threads/${encodeURIComponent(id)}/export?format=${format}`);
            if (!res.ok) {
                alert("Export failed");
                return;
            }
            
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            
            // Extract filename from Content-Disposition header if available
            const disposition = res.headers.get("Content-Disposition");
            let filename = `thread-${id.slice(0, 8)}.${format === "json" ? "json" : "md"}`;
            if (disposition) {
                const match = disposition.match(/filename="?([^"]+)"?/);
                if (match) filename = match[1];
            }
            
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (error) {
            console.error("[export] Error:", error);
            alert("Export failed: " + (error instanceof Error ? error.message : String(error)));
        }
    }

    // Import thread (Issue #201)
    async function importThread() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json,.json";
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const thread = JSON.parse(text);
                
                const res = await fetch("/api/threads/import", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ events: thread.events || thread })
                });
                
                if (!res.ok) {
                    const error = await res.json().catch(() => ({ error: "Import failed" }));
                    alert("Import failed: " + (error.error || "Unknown error"));
                    return;
                }
                
                const result = await res.json();
                if (result.success && result.threadId) {
                    // Navigate to the newly imported thread
                    window.location.href = `/threads/${result.threadId}`;
                } else {
                    alert("Import succeeded but no thread ID returned");
                }
            } catch (error) {
                console.error("[import] Error:", error);
                alert("Import failed: " + (error instanceof Error ? error.message : String(error)));
            }
        };
        input.click();
    }


    const turnStatus = $derived.by(() => {
        const id = threadId;
        return id ? messages.getTurnStatus(id) : null;
    });
    const isInProgress = $derived.by(() => (turnStatus ?? "").toLowerCase() === "inprogress");
    const isReasoningStreaming = $derived.by(() => {
        const id = threadId;
        return id ? messages.getIsReasoningStreaming(id) : false;
    });
    const streamingReasoningText = $derived.by(() => {
        const id = threadId;
        return id ? messages.getStreamingReasoningText(id) : "";
    });
    const statusDetail = $derived.by(() => {
        const id = threadId;
        return id ? messages.getStatusDetail(id) : null;
    });
    const planExplanation = $derived.by(() => {
        const id = threadId;
        return id ? messages.getPlanExplanation(id) : null;
    });
    const plan = $derived.by(() => {
        const id = threadId;
        return id ? messages.getPlan(id) : [];
    });


    // Always open the thread when the route changes.
    // We do not gate this on socket connectivity because:
    // - opening triggers best-effort local event replay (history)
    // - socket may temporarily be "connecting" during page load; gating causes blank threads
    $effect(() => {
        if (threadId && threads.currentId !== threadId) {
            threads.open(threadId);
        }
    });

    $effect(() => {
        if (!threadId) return;
        const settings = threads.getSettings(threadId);
        model = settings.model;
        reasoningEffort = settings.reasoningEffort;
        sandbox = settings.sandbox;
        developerInstructions = settings.developerInstructions;
        if (!modeUserOverride) {
            mode = settings.mode;
        }
    });

    $effect(() => {
        if (!threadId) return;
        threads.updateSettings(threadId, { model, reasoningEffort, sandbox, mode, developerInstructions });
    });

    $effect(() => {
        if (messages.current.length && container) {
            container.scrollTop = container.scrollHeight;
        }
    });

    $effect(() => {
        if (isInProgress && !turnStartTime) {
            turnStartTime = Date.now();
        } else if (!isInProgress) {
            turnStartTime = undefined;
        }
    });

    let sendError = $state<string | null>(null);
    let promptLoading = $state(false);
    let promptError = $state<string | null>(null);

    type ImageAttachment = {
        kind: "image";
        filename: string;
        mime: string;
        localPath: string;
        viewUrl: string;
    };

    function handleSubmit(inputText: string, attachments: ImageAttachment[] = []) {
        if (!inputText || !threadId) return;

        sendError = null;
        promptError = null;

        const clientRequestId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        messages.addPending(threadId, inputText, clientRequestId);

        if (threadProvider === "copilot-acp") {
            if (!canSendPromptInput) {
                promptError = "Copilot provider does not support prompt input for this session.";
                messages.updateStatus(threadId, clientRequestId, "error");
                return;
            }
            promptLoading = true;

            const params: Record<string, unknown> = {
                threadId,
                message: inputText,
            };

            if (attachments.length > 0) {
                params.attachments = attachments.map((a) => ({
                    kind: a.kind,
                    filename: a.filename,
                    mime: a.mime,
                    localPath: a.localPath,
                    viewUrl: a.viewUrl,
                }));
            }

            const result = socket.sendReliable({
                method: "sendPrompt",
                id: Date.now(),
                clientRequestId,
                params,
            });
            promptLoading = false;
            if (!result.success) {
                promptError = result.error ?? "Failed to send prompt";
                messages.updateStatus(threadId, clientRequestId, "error");
            }
            return;
        }

        const input: Array<Record<string, unknown>> = [{ type: "text", text: inputText }];
        for (const a of attachments) {
            if (a.kind !== "image" || !a.localPath) continue;
            // Codex app-server supports image inputs when provided as a file path on disk.
            // We pass both path + view URL; unknown fields should be ignored by older versions.
            input.push({ type: "image", path: a.localPath, url: a.viewUrl, mime: a.mime, filename: a.filename });
        }

        const params: Record<string, unknown> = {
            threadId,
            input,
        };

        if (model.trim()) {
            params.model = model.trim();
        }
        if (reasoningEffort) {
            params.effort = reasoningEffort;
        }
        if (sandbox) {
            const sandboxTypeMap: Record<SandboxMode, string> = {
                "read-only": "readOnly",
                "workspace-write": "workspaceWrite",
                "danger-full-access": "dangerFullAccess",
            };
            params.sandboxPolicy = { type: sandboxTypeMap[sandbox] };
        }

        if (model.trim()) {
            params.collaborationMode = threads.resolveCollaborationMode(
                mode,
                model.trim(),
                reasoningEffort,
                developerInstructions,
            );
        }

        const result = socket.sendReliable({
            method: "turn/start",
            id: Date.now(),
            clientRequestId,
            params,
        });

        if (!result.success) {
            sendError = result.error ?? "Failed to send message";
            messages.updateStatus(threadId, clientRequestId, "error");
        }
    }

    function handleStop() {
        if (!threadId) return;
        const result = messages.interrupt(threadId);
        if (!result.success) {
            sendError = result.error ?? "Failed to stop turn";
        }
    }

    function handlePlanApprove(messageId: string) {
        messages.approvePlan(messageId);
        modeUserOverride = true;
        mode = "code";
        handleSubmit("Approved. Proceed with implementation.");
    }

    const lastPlanId = $derived.by(() => {
        const msgs = messages.current;
        for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].kind === "plan") return msgs[i].id;
        }
        return null;
    });

    /** P4.3: ID of the last reasoning message so only it defaults to open */
    const lastReasoningId = $derived.by(() => {
        const msgs = messages.current;
        for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === "assistant" && msgs[i].kind === "reasoning") return msgs[i].id;
        }
        return null;
    });

    /**
     * P4.2: Pre-compute which tool messages start a new group and which are
     * continuations. A "tool" here means role === "tool" with a displayable kind
     * (not terminal, wait, or compaction). Consecutive qualifying messages share
     * a group. Returns a Map<messageId, { isFirst: boolean; isLast: boolean; groupSize: number }>.
     */
    const toolGroupMeta = $derived.by(() => {
        const meta = new Map<string, { isFirst: boolean; isLast: boolean; groupSize: number }>();
        const msgs = messages.current;

        const isToolBlock = (m: { role: string; kind?: string }) =>
            m.role === "tool" &&
            m.kind !== "terminal" &&
            m.kind !== "wait" &&
            m.kind !== "compaction";

        let groupStart = -1;
        for (let i = 0; i <= msgs.length; i++) {
            const isTool = i < msgs.length && isToolBlock(msgs[i]);
            if (isTool && groupStart === -1) {
                groupStart = i;
            } else if (!isTool && groupStart !== -1) {
                const groupSize = i - groupStart;
                if (groupSize >= 2) {
                    for (let j = groupStart; j < i; j++) {
                        meta.set(msgs[j].id, {
                            isFirst: j === groupStart,
                            isLast: j === i - 1,
                            groupSize,
                        });
                    }
                }
                groupStart = -1;
            }
        }
        return meta;
    });

    // Auto-sync mode to "plan" when the thread has an active plan
    $effect(() => {
        if (!lastPlanId) return;
        // New plan arrived — reset user override
        if (lastPlanId !== trackedPlanId) {
            trackedPlanId = lastPlanId;
            modeUserOverride = false;
        }
        if (modeUserOverride) return;
        const msgs = messages.current;
        const planIdx = msgs.findIndex((m) => m.id === lastPlanId);
        // If nothing meaningful came after the plan, stay in plan mode
        const hasFollowUp = msgs.slice(planIdx + 1).some(
            (m) => m.role === "user" || (m.role === "assistant" && m.kind !== "reasoning")
        );
        if (!hasFollowUp) {
            mode = "plan";
        }
    });

    $effect(() => {
        if (socket.status === "connected") {
            sendError = null;
        }
    });

    function closeMoreMenu() {
        moreMenuOpen = false;
    }

    function closeHelperMenu() {
        helperMenuOpen = false;
    }

    function launchHelper(profile: HelperProfile) {
        const id = threadId;
        if (!id || socket.status !== "connected") return;

        agentPresets = loadAgentPresets();
        helperProfiles = loadHelperProfiles();
        const preset = agentPresets.find((p) => p.id === profile.presetId);
        if (!preset) {
            helperLaunchNote = "Preset missing. Update helper profile in Settings.";
            setTimeout(() => {
                helperLaunchNote = null;
            }, 2500);
            return;
        }

        const objective = profile.prompt.trim() || preset.starterPrompt.trim();
        if (!objective) {
            helperLaunchNote = "Helper profile has no objective prompt.";
            setTimeout(() => {
                helperLaunchNote = null;
            }, 2500);
            return;
        }
        if (!preset.model.trim()) {
            helperLaunchNote = "Preset model is required for helper launch.";
            setTimeout(() => {
                helperLaunchNote = null;
            }, 2500);
            return;
        }

        const contextLabel = (threadTitle || id.slice(0, 8)).trim();
        const helperPrompt = [
            "Start a helper agent for this task and route results back to this thread.",
            `Profile: ${profile.name}`,
            `Parent thread: ${contextLabel} (${id})`,
            "",
            "Objective:",
            objective,
        ].join("\n");

        const result = socket.sendReliable({
            method: "turn/start",
            id: Date.now(),
            params: {
                threadId: id,
                input: [{ type: "text", text: helperPrompt }],
                collaborationMode: threads.resolveCollaborationMode(
                    preset.mode,
                    preset.model.trim(),
                    preset.reasoningEffort,
                    preset.developerInstructions,
                ),
            },
        });

        if (result.success) {
            helperLaunchNote = `Launched helper: ${profile.name}`;
            setTimeout(() => {
                helperLaunchNote = null;
            }, 2500);
        } else {
            helperLaunchNote = result.error || "Failed to launch helper.";
            setTimeout(() => {
                helperLaunchNote = null;
            }, 3000);
        }
        closeHelperMenu();
    }

    $effect(() => {
        if (!moreMenuOpen) return;
        const onWindowPointerDown = () => {
            // Close on any outside click/tap. Menu container stops propagation.
            closeMoreMenu();
        };
        window.addEventListener("pointerdown", onWindowPointerDown);
        return () => window.removeEventListener("pointerdown", onWindowPointerDown);
    });

    $effect(() => {
        if (!helperMenuOpen) return;
        const onWindowPointerDown = () => {
            closeHelperMenu();
        };
        window.addEventListener("pointerdown", onWindowPointerDown);
        return () => window.removeEventListener("pointerdown", onWindowPointerDown);
    });

</script>

<div class="thread-page stack h-full bg-cli-bg">
    <AppHeader
        status={socket.status}
        threadId={threadId}
        {sandbox}
        onSandboxChange={(v) => sandbox = v}
    >
        {#snippet actions()}
            {#if uiToggles.showThreadHeaderActions}
                <a href={`/thread/${threadId}/review`}>review</a>
                <div class="more-menu relative inline-flex items-center" role="group" onpointerdown={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        class="more-btn px-3 min-h-7 leading-7"
                        aria-haspopup="menu"
                        aria-expanded={helperMenuOpen}
                        aria-label="Launch helper"
                        title="Launch helper"
                        onclick={() => {
                            agentPresets = loadAgentPresets();
                            helperProfiles = loadHelperProfiles();
                            helperMenuOpen = !helperMenuOpen;
                            moreMenuOpen = false;
                        }}
                    >
                        helpers
                    </button>
                    {#if helperMenuOpen}
                        <div class="more-popover absolute right-0 top-[calc(100%+0.5rem)] z-50 flex min-w-[11rem] flex-col gap-0 rounded-md border border-cli-border bg-cli-bg-elevated p-2 shadow-md" role="menu" aria-label="Helper profiles">
                            {#if helperProfiles.length === 0}
                                <a href="/settings" class="block w-full rounded-sm px-3 py-2 text-left font-mono text-xs text-cli-text no-underline hover:bg-cli-bg-hover">Create helper profiles in Settings</a>
                            {:else}
                                {#each helperProfiles as profile (profile.id)}
                                    <button
                                        type="button"
                                        role="menuitem"
                                        class="w-full rounded-sm border-0 bg-transparent px-3 py-2 text-left font-mono text-xs text-cli-text hover:bg-cli-bg-hover"
                                        onclick={() => launchHelper(profile)}
                                        title={profile.prompt}
                                    >
                                        {profile.name}
                                    </button>
                                {/each}
                            {/if}
                        </div>
                    {/if}
                </div>
                <button type="button" onclick={copyThread} title="Copy thread as Markdown">copy</button>
                <button type="button" onclick={shareThread} title="Share thread">share</button>
                <a href="/settings">Settings</a>
                <button type="button" onclick={() => theme.cycle()} title="Theme: {theme.current}">
                    {themeIcons[theme.current]}
                </button>
                <div class="more-menu relative inline-flex items-center" role="group" onpointerdown={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        class="more-btn px-3 min-h-7 leading-7"
                        aria-haspopup="menu"
                        aria-expanded={moreMenuOpen}
                        aria-label="More actions"
                        title="More actions"
                        onclick={() => (moreMenuOpen = !moreMenuOpen)}
                    >
                        ⋯
                    </button>
                    {#if moreMenuOpen}
                        <div class="more-popover absolute right-0 top-[calc(100%+0.5rem)] z-50 flex min-w-[11rem] flex-col gap-0 rounded-md border border-cli-border bg-cli-bg-elevated p-2 shadow-md" role="menu" aria-label="Thread actions">
                            <button
                                type="button"
                                role="menuitem"
                                class="w-full rounded-sm border-0 bg-transparent px-3 py-2 text-left font-mono text-xs text-cli-text hover:bg-cli-bg-hover"
                                onclick={() => {
                                    closeMoreMenu();
                                    copyLastN(20);
                                }}
                                title="Copy last 20 messages"
                            >
                                copy last 20
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                class="w-full rounded-sm border-0 bg-transparent px-3 py-2 text-left font-mono text-xs text-cli-text hover:bg-cli-bg-hover"
                                onclick={() => {
                                    closeMoreMenu();
                                    downloadThread();
                                }}
                                title="Download thread as .md"
                            >
                                export md
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                class="w-full rounded-sm border-0 bg-transparent px-3 py-2 text-left font-mono text-xs text-cli-text hover:bg-cli-bg-hover"
                                onclick={() => {
                                    closeMoreMenu();
                                    downloadThreadJson();
                                }}
                                title="Download thread as .json"
                            >
                                export json
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                class="w-full rounded-sm border-0 bg-transparent px-3 py-2 text-left font-mono text-xs text-cli-text hover:bg-cli-bg-hover"
                                onclick={() => {
                                    closeMoreMenu();
                                    downloadThreadHtml();
                                }}
                                title="Download thread as .html"
                            >
                                export html
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                class="w-full rounded-sm border-0 bg-transparent px-3 py-2 text-left font-mono text-xs text-cli-text hover:bg-cli-bg-hover"
                                onclick={() => {
                                    closeMoreMenu();
                                    printThreadPdf();
                                }}
                                title="Print / save as PDF"
                            >
                                export pdf
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                class="w-full rounded-sm border-0 bg-transparent px-3 py-2 text-left font-mono text-xs text-cli-text hover:bg-cli-bg-hover"
                                onclick={() => {
                                    closeMoreMenu();
                                    shareThreadJson();
                                }}
                                title="Share thread as .json"
                            >
                                share json
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                class="w-full rounded-sm border-0 bg-transparent px-3 py-2 text-left font-mono text-xs text-cli-text hover:bg-cli-bg-hover"
                                onclick={() => {
                                    closeMoreMenu();
                                    shareThreadHtml();
                                }}
                                title="Share thread as .html"
                            >
                                share html
                            </button>
                            <hr style="margin: 4px 0; border: none; border-top: 1px solid #e5e7eb;" />
                            <button
                                type="button"
                                role="menuitem"
                                class="w-full rounded-sm border-0 bg-transparent px-3 py-2 text-left font-mono text-xs text-cli-text hover:bg-cli-bg-hover"
                                onclick={() => {
                                    closeMoreMenu();
                                    exportThreadServer("json");
                                }}
                                title="Export via server (with full event data)"
                            >
                                server export json
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                class="w-full rounded-sm border-0 bg-transparent px-3 py-2 text-left font-mono text-xs text-cli-text hover:bg-cli-bg-hover"
                                onclick={() => {
                                    closeMoreMenu();
                                    exportThreadServer("markdown");
                                }}
                                title="Export via server (markdown format)"
                            >
                                server export md
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                class="w-full rounded-sm border-0 bg-transparent px-3 py-2 text-left font-mono text-xs text-cli-text hover:bg-cli-bg-hover"
                                onclick={() => {
                                    closeMoreMenu();
                                    importThread();
                                }}
                                title="Import thread from JSON file"
                            >
                                import thread
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                class="w-full rounded-sm border-0 bg-transparent px-3 py-2 text-left font-mono text-xs text-cli-text hover:bg-cli-bg-hover"
                                onclick={() => {
                                    closeMoreMenu();
                                    const mock = createMockHelperOutcome();
                                    if (threadId) mock.threadId = threadId;
                                    messages.current.push(mock);
                                }}
                                title="Add Helper Outcome (Dev only)"
                            >
                                mock outcome
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                class="w-full rounded-sm border-0 bg-transparent px-3 py-2 text-left font-mono text-xs text-cli-text hover:bg-cli-bg-hover"
                                onclick={() => {
                                    closeMoreMenu();
                                    showSearch = !showSearch;
                                    if (showSearch && searchQuery) {
                                        handleSearch();
                                    }
                                }}
                                title="Toggle search in thread"
                            >
                                {showSearch ? "hide search" : "search thread"}
                            </button>
                        </div>
                    {/if}
                </div>
            {/if}
        {/snippet}
    </AppHeader>

    {#if threadProvider === "copilot-acp"}
        <div class="provider-badge row gap-0 px-4 pb-2 text-cli-text-muted text-xs font-mono">
            <span>Copilot ACP</span>
        </div>
    {/if}

    {#if showAutoApproveBanner}
        <div class="auto-approve-banner mx-4 mt-3 rounded-md border border-amber-400/60 bg-amber-400/15 px-4 py-3 text-cli-text font-mono text-xs">
            ⚠️ Copilot is running in <strong>auto-approve mode</strong>.
            Tools execute without confirmation.
            <a href="/settings" class="text-cli-prefix-agent">Manage in Settings</a>
        </div>
    {/if}

    {#if showSearch}
        <div class="search-bar border-b border-cli-border bg-cli-bg p-3">
            <div class="search-input-wrapper relative flex items-center gap-2">
                <input
                    type="search"
                    bind:value={searchQuery}
                    oninput={onSearchInput}
                    placeholder="Search in thread..."
                    class="search-input flex-1 rounded-sm border border-cli-border bg-cli-bg-surface px-3 py-2 font-mono text-sm text-cli-text focus:border-cli-accent focus:outline-none"
                />
                {#if searchQuery}
                    <button
                        type="button"
                        onclick={clearSearch}
                        class="search-clear-btn p-2 text-sm text-cli-text-muted hover:text-cli-text"
                        title="Clear search"
                    >
                        ✕
                    </button>
                {/if}
            </div>
            {#if isSearching}
                <div class="search-status mt-2 font-mono text-xs text-cli-text-muted">Searching...</div>
            {:else if searchError}
                <div class="search-error mt-2 font-mono text-xs text-cli-error">{searchError}</div>
            {:else if searchQuery && searchResults.length > 0}
                <div class="search-results-header mt-2 font-mono text-xs text-cli-success">
                    Found {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
                </div>
            {:else if searchQuery && searchResults.length === 0 && !isSearching}
                <div class="search-no-results mt-2 font-mono text-xs text-cli-text-muted">No results for "{searchQuery}"</div>
            {/if}
        </div>
    {/if}

    <div class="transcript timeline-container flex-1 overflow-y-auto overflow-x-hidden py-3" bind:this={container}>
        {#if pendingAcpApproval}
            {@const toolLabel = pendingAcpApproval.toolTitle ?? pendingAcpApproval.toolKind ?? "Tool action"}
            {@const toolMeta = pendingAcpApproval.toolTitle && pendingAcpApproval.toolKind ? pendingAcpApproval.toolKind : null}
            <div class="acp-approval-card mx-4 my-2 overflow-hidden rounded-md border border-cli-border bg-cli-bg-elevated font-mono text-sm">
                <div class="acp-approval-header flex items-center justify-between border-b border-cli-border px-4 py-3">
                    <span class="header-label text-xs font-semibold uppercase tracking-[0.04em] text-cli-prefix-tool">Approval Required</span>
                    <span class="header-type text-xs text-cli-text-muted">Copilot ACP</span>
                </div>
                <div class="acp-approval-body flex flex-col gap-2 px-4 py-3">
                    <div class="acp-tool-title text-xs text-cli-text">{toolLabel}</div>
                    {#if toolMeta}
                        <div class="acp-tool-meta text-xs text-cli-text-muted">{toolMeta}</div>
                    {/if}
                </div>
                <div class="acp-approval-actions flex flex-wrap gap-2 border-t border-cli-border px-4 py-3">
                    {#each pendingAcpApproval.options as option (option.optionId)}
                        <button
                            type="button"
                            class="acp-option-btn inline-flex items-center gap-2 rounded-sm border border-cli-border bg-transparent px-3 py-2 font-mono text-xs text-cli-text transition-all duration-200 hover:border-cli-text-muted hover:bg-cli-bg-hover"
                            class:border-cli-success={option.kind === "allow_once" || option.kind === "allow_always"}
                            class:text-cli-success={option.kind === "allow_once" || option.kind === "allow_always"}
                            class:border-cli-error={option.kind === "reject_once" || option.kind === "reject_always"}
                            class:text-cli-error={option.kind === "reject_once" || option.kind === "reject_always"}
                            onclick={() => messages.resolveAcpApproval(
                                pendingAcpApproval.threadId,
                                pendingAcpApproval.rpcId,
                                option.optionId,
                            )}
                        >
                            <span class="option-label">{option.name}</span>
                        </button>
                    {/each}
                    <button
                        type="button"
                        class="acp-option-btn inline-flex items-center gap-2 rounded-sm border border-cli-border bg-transparent px-3 py-2 font-mono text-xs text-cli-text-muted transition-all duration-200 hover:border-cli-text-muted hover:bg-cli-bg-hover"
                        onclick={() => messages.resolveAcpApproval(
                            pendingAcpApproval.threadId,
                            pendingAcpApproval.rpcId,
                            null,
                        )}
                    >
                        <span class="option-label">Cancel</span>
                    </button>
                </div>
            </div>
        {/if}
        {#if messages.current.length === 0}
            <div class="empty row gap-3 px-4 py-6 font-mono text-sm">
                <span class="empty-prompt text-cli-prefix-agent">&gt;</span>
                <span class="empty-text text-cli-text-muted">No messages yet. Start a conversation.</span>
            </div>
        {:else if searchResults.length > 0 && showSearch}
            <!-- Show search results -->
            {#each searchResults as result}
                {@const message = messages.current.find(m => m.id === result.id)}
                {#if message}
                    <MessageBlock {message} onCopyQuoted={copyQuoted} onCopyFromHere={(id) => copyFromHere(id, 20)} />
                {/if}
            {/each}
        {:else}
            {#each messages.current as message, _i (message.id)}
                {@const tgMeta = toolGroupMeta.get(message.id)}
                {@const isGroupedTool = !!tgMeta}
                {#if message.role === "approval" && message.approval}
                    <div class="timeline-item">
                    <ApprovalPrompt
                        approval={message.approval}
                        onApprove={(forSession) => messages.approve(
                            message.approval!.id,
                            forSession,
                            model.trim() ? threads.resolveCollaborationMode(mode, model.trim(), reasoningEffort, developerInstructions) : undefined,
                        )}
                        onDecline={() => messages.decline(
                            message.approval!.id,
                            model.trim() ? threads.resolveCollaborationMode(mode, model.trim(), reasoningEffort, developerInstructions) : undefined,
                        )}
                        onCancel={() => messages.cancel(message.approval!.id)}
                    />
                    </div>
                {:else if message.kind === "user-input-request" && message.userInputRequest}
                    <div class="timeline-item">
                    <UserInputPrompt
                        request={message.userInputRequest}
                        onSubmit={(answers) => messages.respondToUserInput(
                            message.id,
                            answers,
                            model.trim() ? threads.resolveCollaborationMode(mode, model.trim(), reasoningEffort, developerInstructions) : undefined,
                        )}
                    />
                    </div>
                {:else if message.kind === "plan"}
                    <div class="timeline-item">
                    <PlanCard
                        {message}
                        disabled={isInProgress || !socket.isHealthy}
                        latest={message.id === lastPlanId}
                        onApprove={() => handlePlanApprove(message.id)}
                    />
                    </div>
                {:else if message.kind === "helper-agent-outcome" && message.helperOutcome}
                    <div class="timeline-item">
                    <OutcomeCard
                        outcome={message.helperOutcome}
                        onContinue={handleOutcomeContinue}
                        onFileClick={handleFileClick}
                    />
                    </div>
                {:else}
                    <div
                        class="timeline-item"
                        class:tool-group-item={isGroupedTool}
                        class:tool-group-first={isGroupedTool && tgMeta?.isFirst}
                        class:tool-group-last={isGroupedTool && tgMeta?.isLast}
                    >
                        {#if isGroupedTool && tgMeta?.isFirst}
                            <div class="tool-group-label">{tgMeta.groupSize} tool calls</div>
                        {/if}
                        <MessageBlock
                            {message}
                            onCopyQuoted={copyQuoted}
                            onCopyFromHere={(id) => copyFromHere(id, 20)}
                            isLatestReasoning={message.id === lastReasoningId}
                        />
                    </div>
                {/if}
            {/each}

            {#if isReasoningStreaming}
                <div class="streaming-reasoning px-4 py-2">
                    <Reasoning
                        content={streamingReasoningText}
                        isStreaming={true}
                        defaultOpen={true}
                    />
                </div>
            {/if}

            {#if isInProgress && !isReasoningStreaming}
                <WorkingStatus
                    detail={statusDetail ?? planExplanation}
                    plan={plan}
                    startTime={turnStartTime}
                />
            {/if}
        {/if}

        {#if sendError || promptError || (socket.status !== "connected" && socket.status !== "connecting" && socket.error)}
            <div class="connection-error row gap-3 mx-4 my-3 rounded-md border border-cli-error bg-cli-error-bg px-4 py-3 font-mono text-sm">
                <span class="error-icon row gap-0 h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-cli-error text-xs font-bold text-white">!</span>
                <span class="error-text flex-1 text-cli-error">{sendError || promptError || socket.error}</span>
                {#if socket.status === "reconnecting"}
                    <span class="error-hint text-xs text-cli-text-muted">Reconnecting automatically...</span>
                {:else if socket.status === "error" || socket.status === "disconnected"}
                    <button
                        type="button"
                        class="retry-btn rounded-sm border border-cli-error bg-transparent px-3 py-2 font-mono text-xs text-cli-error transition-all duration-200 hover:bg-cli-error hover:text-white"
                        onclick={() => socket.reconnect()}
                    >
                        Retry
                    </button>
                {/if}
            </div>
        {/if}

        {#if helperLaunchNote}
            <div class="helper-note row gap-3 mx-4 my-3 rounded-md border border-cli-border bg-cli-bg-elevated px-4 py-3 font-mono text-sm">
                <span class="helper-icon row gap-0 h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-cli-prefix-agent text-xs font-bold text-cli-bg">i</span>
                <span class="helper-text flex-1 text-cli-text">{helperLaunchNote}</span>
            </div>
        {/if}
    </div>

    <PromptInput
        bind:this={promptInput}
        draftKey={threadId}
        thread={currentThread}
        {model}
        {reasoningEffort}
        {mode}
        presets={agentPresets}
        modelOptions={models.options}
        modelsLoading={models.status === "loading"}
        disabled={composerDisabled}
        disabledReason={sendPromptDisabledReason}
        loading={promptLoading}
        error={promptError || ""}
        onStop={isInProgress ? handleStop : undefined}
        onSubmit={handleSubmit}
        onModelChange={(v) => model = v}
        onReasoningChange={(v) => reasoningEffort = v}
        onApplyPreset={(preset) => {
            model = preset.model;
            reasoningEffort = preset.reasoningEffort;
            modeUserOverride = true;
            mode = preset.mode;
            developerInstructions = preset.developerInstructions;
            agentPresets = loadAgentPresets();
        }}
        onModeChange={(v) => { modeUserOverride = true; mode = v; }}
    />
</div>

<style>
  /* ── P5.2: Gradient scroll masks ── */
  .transcript {
    --scroll-mask-size: 2rem;
    mask-image:
      linear-gradient(to bottom, transparent, black var(--scroll-mask-size)),
      linear-gradient(to bottom, black calc(100% - var(--scroll-mask-size)), transparent);
    mask-composite: intersect;
    -webkit-mask-image:
      linear-gradient(to bottom, transparent, black var(--scroll-mask-size)),
      linear-gradient(to bottom, black calc(100% - var(--scroll-mask-size)), transparent);
    -webkit-mask-composite: source-in;
  }

  /* ── P5.3: Hover state polish ── */
  .transcript :global(.message-block) {
    transition: background-color var(--transition-fast);
  }

  .transcript :global(.timeline-item) {
    transition: background-color var(--transition-fast);
  }

  .transcript :global(.timeline-item:hover) {
    background-color: color-mix(in oklch, var(--cli-bg-hover), transparent 60%);
  }

  /* ── P4.4: Timeline layout ── */
  .timeline-container {
    --timeline-gutter: 1.5rem;
    --timeline-line-width: 1px;
    --timeline-dot-size: 6px;
    position: relative;
  }

  .timeline-container :global(.timeline-item) {
    position: relative;
    padding-left: var(--timeline-gutter);
  }

  /* Vertical line */
  .timeline-container :global(.timeline-item)::before {
    content: "";
    position: absolute;
    left: calc(var(--timeline-gutter) / 2 - var(--timeline-line-width) / 2);
    top: 0;
    bottom: 0;
    width: var(--timeline-line-width);
    background: var(--color-cli-border);
    opacity: 0.5;
  }

  /* Dot marker */
  .timeline-container :global(.timeline-item)::after {
    content: "";
    position: absolute;
    left: calc(var(--timeline-gutter) / 2 - var(--timeline-dot-size) / 2);
    top: var(--space-md, 1rem);
    width: var(--timeline-dot-size);
    height: var(--timeline-dot-size);
    border-radius: var(--radius-full, 9999px);
    background: var(--color-cli-border);
  }

  /* Hide the line extending above the first item and below the last */
  .timeline-container :global(.timeline-item:first-child)::before {
    top: var(--space-md, 1rem);
  }
  .timeline-container :global(.timeline-item:last-child)::before {
    bottom: calc(100% - var(--space-md, 1rem) - var(--timeline-dot-size) / 2);
  }

  /* ── P4.2: Tool block grouping ── */
  .timeline-container :global(.tool-group-item) {
    padding-top: var(--space-xs, 0.25rem);
    padding-bottom: var(--space-xs, 0.25rem);
  }

  .timeline-container :global(.tool-group-first) {
    padding-top: var(--space-sm, 0.5rem);
  }

  .timeline-container :global(.tool-group-last) {
    padding-bottom: var(--space-sm, 0.5rem);
  }

  /* Suppress dot markers on middle tool-group items for a cleaner look */
  .timeline-container :global(.tool-group-item:not(.tool-group-first))::after {
    display: none;
  }

  .timeline-container :global(.tool-group-label) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: var(--font-size-xs, 0.75rem);
    font-weight: var(--font-weight-semibold, 600);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-cli-text-muted);
    padding-bottom: var(--space-xs, 0.25rem);
  }
</style>
