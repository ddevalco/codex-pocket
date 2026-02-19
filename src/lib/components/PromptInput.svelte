<script lang="ts">
  import { untrack } from "svelte";
  import type { ModeKind, ModelOption, ReasoningEffort, ThreadInfo } from "../types";
  import { canAttachFiles, getCapabilityTooltip } from "../thread-capabilities";
  import type { AgentPreset } from "../presets";
  import { api } from "../api";
  import { loadQuickReplies, type QuickReply } from "../quickReplies";
  import { drafts } from "../drafts.svelte";
  import { uiToggles } from "../uiToggles";

	  interface Props {
    model: string;
    reasoningEffort: ReasoningEffort;
    mode?: ModeKind;
    presets?: AgentPreset[];
    modelOptions?: ModelOption[];
    modelsLoading?: boolean;
    disabled?: boolean;
    disabledReason?: string;
    loading?: boolean;
    error?: string;
    draftKey?: string;
    thread?: ThreadInfo | null;
    onStop?: () => void;
	    onSubmit: (input: string, attachments?: ImageAttachment[]) => void;
	    onModelChange: (model: string) => void;
	    onReasoningChange: (effort: ReasoningEffort) => void;
	    onModeChange?: (mode: ModeKind) => void;
      onApplyPreset?: (preset: AgentPreset) => void;
	  }

	  type ImageAttachment = {
	    kind: "image";
	    filename: string;
	    mime: string;
	    localPath: string;
	    viewUrl: string;
	  };

  const {
    model,
    reasoningEffort,
    mode = "code",
    presets = [],
    modelOptions = [],
    modelsLoading = false,
    disabled = false,
    disabledReason = "",
    loading = false,
    error = "",
    draftKey,
    thread,
    onStop,
    onSubmit,
    onModelChange,
    onReasoningChange,
    onModeChange,
    onApplyPreset,
  }: Props = $props();

  let input = $state("");
  let modelOpen = $state(false);
  let reasoningOpen = $state(false);
  let presetOpen = $state(false);
  let quickReplies = $state<QuickReply[]>([]);

  const OLD_ENTER_BEHAVIOR_KEY = "codex_pocket_enter_behavior";
  const ENTER_BEHAVIOR_KEY = "coderelay_enter_behavior";

  if (typeof localStorage !== "undefined" && !localStorage.getItem(ENTER_BEHAVIOR_KEY)) {
    const old = localStorage.getItem(OLD_ENTER_BEHAVIOR_KEY);
    if (old) localStorage.setItem(ENTER_BEHAVIOR_KEY, old);
  }
  type EnterBehavior = "newline" | "send";
  let enterBehavior = $state<EnterBehavior>("newline");

  $effect(() => {
    try {
      const saved = localStorage.getItem(ENTER_BEHAVIOR_KEY);
      if (saved === "send" || saved === "newline") {
        enterBehavior = saved;
      }
    } catch {
      // ignore
    }
  });

  $effect(() => {
    quickReplies = loadQuickReplies();
  });

  export function setInput(text: string) {
    input = text;
  }

  let uploadBusy = $state(false);
  let uploadError = $state<string | null>(null);
  let pendingAttachments = $state<ImageAttachment[]>([]);
  const resolvedDisabledReason = $derived((disabledReason ?? "").trim());

  const canAttach = $derived(canAttachFiles(thread));
  const canSubmit = $derived((input.trim().length > 0 || pendingAttachments.length > 0) && !disabled && !loading);

  // Restore draft when draftKey changes
  $effect(() => {
    if (draftKey) {
      untrack(() => {
        const draft = drafts.get(draftKey!);
        if (draft) {
          input = draft.text;
          pendingAttachments = [...draft.attachments];
        } else {
           // Clear input when switching to a thread with no draft
           // This handles navigation between threads correctly
           input = "";
           pendingAttachments = [];
        }
      });
    }
  });

  // Save changes to draft
  $effect(() => {
    if (draftKey) {
      // Create local references to track changes
      const currentInput = input;
      const currentAttachments = pendingAttachments;
      
      // Store has built-in debounce
      untrack(() => {
         drafts.set(draftKey!, currentInput, currentAttachments);
      });
    }
  });


  const reasoningOptions: { value: ReasoningEffort; label: string }[] = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ];

  const selectedModel = $derived(
    modelOptions.find((m) => m.value === model)?.label || model || "Model"
  );

  const selectedReasoning = $derived(
    reasoningOptions.find((r) => r.value === reasoningEffort)?.label || "Medium"
  );

	  function composeInputWithAttachments(baseText: string): string {
    if (pendingAttachments.length === 0) return baseText.trim();
    const attachmentMarkdown = pendingAttachments
      .map((a) => {
        const alt = (a.filename || "image").replace(/[\r\n\t\u0000]/g, " ").trim();
        return `![${alt}](${a.viewUrl})`;
      })
      .join("\n");
    const text = baseText.trim();
    return text ? `${text}\n${attachmentMarkdown}` : attachmentMarkdown;
  }

	  function handleSubmit(e: Event) {
	    e.preventDefault();
	    if (!canSubmit) return;
	    onSubmit(composeInputWithAttachments(input), pendingAttachments);
	    input = "";
	    pendingAttachments = [];
	  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    if (enterBehavior === "send") {
      if (!e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
      return;
    }
    // newline mode: allow Enter; Cmd+Enter (or Ctrl+Enter) sends
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function closeAllDropdowns() {
    presetOpen = false;
    modelOpen = false;
    reasoningOpen = false;
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest(".dropdown")) {
      closeAllDropdowns();
    }
  }

  function sendQuickReply(text: string) {
    if (disabled || loading) return;
    const trimmed = text.trim();
    if (!trimmed && pendingAttachments.length === 0) return;
    onSubmit(composeInputWithAttachments(trimmed), pendingAttachments);
    input = "";
    pendingAttachments = [];
  }

  function applyPreset(preset: AgentPreset) {
    if (disabled) return;
    onModelChange(preset.model);
    onReasoningChange(preset.reasoningEffort);
    if (onModeChange) {
      onModeChange(preset.mode);
    }
    onApplyPreset?.(preset);
    if (preset.starterPrompt.trim()) {
      input = preset.starterPrompt;
    }
    presetOpen = false;
  }

  function removeAttachment(index: number) {
    pendingAttachments = pendingAttachments.filter((_, i) => i !== index);
  }

	  async function handlePickImage(e: Event) {
    const el = e.target as HTMLInputElement;
    const files = Array.from(el.files ?? []);
    el.value = "";
    if (!files.length) return;

	    uploadError = null;
	    uploadBusy = true;
    const uploaded: ImageAttachment[] = [];
    let failed = 0;
    let lastError = "";
    try {
      for (const file of files) {
        try {
          const meta = await api.post<{
            token: string;
            uploadUrl: string;
            viewUrl: string;
            localPath: string;
            filename: string;
            mime: string;
          }>("/uploads/new", {
            filename: file.name,
            mime: file.type || "application/octet-stream",
            bytes: file.size,
          });

          const buf = await file.arrayBuffer();
          const putPath = `/uploads/${encodeURIComponent(meta.token)}`;
          const res = await api.putRaw(putPath, buf, file.type || "application/octet-stream");
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            throw new Error(t || `upload failed (${res.status})`);
          }

          const fallbackName = (file.name || "image").replace(/[\r\n\t\u0000]/g, " ").trim();
          uploaded.push({
            kind: "image",
            filename: meta.filename || file.name || fallbackName || "image",
            mime: meta.mime || file.type || "application/octet-stream",
            localPath: meta.localPath,
            viewUrl: meta.viewUrl,
          });
        } catch (err) {
          failed += 1;
          lastError = err instanceof Error ? err.message : "Upload failed";
        }
      }
      if (uploaded.length) {
        pendingAttachments = [...pendingAttachments, ...uploaded];
      }
      if (failed) {
        uploadError = uploaded.length
          ? `Uploaded ${uploaded.length}/${files.length} image(s). ${lastError}`
          : lastError || "Upload failed";
      }
    } finally {
      uploadBusy = false;
    }
	  }
</script>

<svelte:window onclick={handleClickOutside} />

<form class="prompt-input" onsubmit={handleSubmit}>
  <div class="input-container stack">
    {#if quickReplies.length && uiToggles.showComposerQuickReplies}
      <div class="quick-replies row" role="group" aria-label="Quick reply shortcuts">
        {#each quickReplies as reply, i (`${reply.label}:${reply.text}:${i}`)}
          <button
            type="button"
            class="quick-reply-btn"
            onclick={() => sendQuickReply(reply.text)}
            disabled={disabled || loading}
            title={reply.text}
          >
            {reply.label}
          </button>
        {/each}
      </div>
    {/if}
	    <textarea
      bind:value={input}
      onkeydown={handleKeydown}
      placeholder="What would you like to do?"
      rows="1"
      disabled={disabled || loading}
      title={resolvedDisabledReason}
	    ></textarea>
    {#if pendingAttachments.length}
      <div class="attachment-chips" role="list" aria-label="Selected attachments">
        {#each pendingAttachments as item, i (`${item.localPath}:${item.filename}:${i}`)}
          <div class="attachment-chip" role="listitem">
            {#if uiToggles.showComposerThumbnails}
              <img class="attachment-thumb" src={item.viewUrl} alt={item.filename} loading="lazy" />
            {/if}
            <span class="attachment-name">{item.filename}</span>
            <button
              type="button"
              class="attachment-remove"
              onclick={() => removeAttachment(i)}
              aria-label={`Remove attachment ${item.filename}`}
              title="Remove attachment"
            >
              ×
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="footer split">
      <div class="tools row">
        <!-- Draft Indicator -->
        {#if draftKey && (input.length > 0 || pendingAttachments.length > 0)}
          <div class="draft-indicator row">
            <span class="draft-label">Draft saved</span>
            <button
              type="button"
              class="draft-clear-btn"
              onclick={() => {
                input = "";
                pendingAttachments = [];
                drafts.deleteDraft(draftKey!);
              }}
              title="Clear draft"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div class="draft-separator"></div>
          </div>
        {/if}

        <!-- Image upload -->
	        <!--
	          On iOS Safari, `capture` forces the camera UI and can hide the photo library picker.
	          We want the user to be able to choose either Camera or Photo Library.
	        -->
        <label
          class="tool-btn row"
          title={canAttach ? "Attach image" : getCapabilityTooltip("CAN_ATTACH_FILES", false)}
          style={!canAttach ? "opacity: 0.5; cursor: not-allowed" : ""}
        >
          <input
            class="file-input"
            type="file"
            accept="image/*"
            multiple
            onchange={handlePickImage}
            disabled={disabled || loading || uploadBusy || !canAttach}
          />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15V8a2 2 0 0 0-2-2h-3l-2-2H10L8 6H5a2 2 0 0 0-2 2v7" />
            <path d="M3 15l4-4 4 4 4-4 6 6" />
          </svg>
          <span class="collapsible-label">{uploadBusy ? "Uploading..." : "Image"}</span>
        </label>

        {#if presets.length}
          <div class="dropdown" class:open={presetOpen}>
            <button
              type="button"
              class="tool-btn row"
              onclick={(e) => {
                e.stopPropagation();
                presetOpen = !presetOpen;
                modelOpen = false;
                reasoningOpen = false;
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 6h10" />
                <path d="M8 12h10" />
                <path d="M8 18h10" />
                <path d="M4 6h.01" />
                <path d="M4 12h.01" />
                <path d="M4 18h.01" />
              </svg>
              <span class="collapsible-label">Preset</span>
              <svg class="chevron collapsible-label" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>
            {#if presetOpen}
              <div class="dropdown-menu">
                {#each presets as preset}
                  <button
                    type="button"
                    class="dropdown-item"
                    onclick={() => applyPreset(preset)}
                  >
                    {preset.name}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Model Selector -->
        <div class="dropdown" class:open={modelOpen}>
          <button
            type="button"
            class="tool-btn row"
            onclick={(e) => {
              e.stopPropagation();
              modelOpen = !modelOpen;
              reasoningOpen = false;
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4Z"/>
              <circle cx="12" cy="14" r="2"/>
            </svg>
            <span class="collapsible-label">{selectedModel}</span>
            <svg class="chevron collapsible-label" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
          {#if modelOpen}
            <div class="dropdown-menu">
              {#if modelsLoading}
                <div class="dropdown-empty">Loading...</div>
              {:else if modelOptions.length === 0}
                <div class="dropdown-empty">No models available</div>
              {:else}
                {#each modelOptions as option}
                  <button
                    type="button"
                    class="dropdown-item split"
                    class:selected={model === option.value}
                    onclick={() => {
                      onModelChange(option.value);
                      modelOpen = false;
                    }}
                  >
                    {option.label}
                    {#if model === option.value}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
        </div>

        <!-- Reasoning Selector -->
        <div class="dropdown" class:open={reasoningOpen}>
          <button
            type="button"
            class="tool-btn row"
            onclick={(e) => {
              e.stopPropagation();
              reasoningOpen = !reasoningOpen;
              modelOpen = false;
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
              <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
              <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
              <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
              <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
              <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
              <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
              <path d="M6 18a4 4 0 0 1-1.967-.516"/>
              <path d="M19.967 17.484A4 4 0 0 1 18 18"/>
            </svg>
            <span class="collapsible-label">{selectedReasoning}</span>
            <svg class="chevron collapsible-label" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
          {#if reasoningOpen}
            <div class="dropdown-menu">
              {#each reasoningOptions as option}
                <button
                  type="button"
                  class="dropdown-item split"
                  class:selected={reasoningEffort === option.value}
                  onclick={() => {
                    onReasoningChange(option.value);
                    reasoningOpen = false;
                  }}
                >
                  {option.label}
                  {#if reasoningEffort === option.value}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Mode Toggle -->
        {#if onModeChange}
          <button
            type="button"
            class="tool-btn mode-toggle row"
            class:active={mode === "plan"}
            onclick={() => onModeChange(mode === "plan" ? "code" : "plan")}
          >
            {#if mode === "plan"}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
              </svg>
              <span>Plan</span>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              <span>Code</span>
            {/if}
          </button>
        {/if}
      </div>

      {#if disabled && onStop}
        <button type="button" class="stop-btn row" onclick={onStop} title="Stop">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="1"/>
          </svg>
        </button>
      {:else}
        <button
          type="submit"
          class="submit-btn row"
          disabled={!canSubmit}
          title={resolvedDisabledReason || "Send"}
        >
          {#if disabled || loading}
            <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m6 17 5-5-5-5"/>
              <path d="m13 17 5-5-5-5"/>
            </svg>
          {/if}
        </button>
      {/if}
    </div>
    {#if resolvedDisabledReason}
      <div class="hint" style="padding: 0 var(--space-md) var(--space-sm);">{resolvedDisabledReason}</div>
    {/if}
    {#if uploadError}
      <div class="hint hint-error" style="padding: 0 var(--space-md) var(--space-sm);">{uploadError}</div>
    {/if}
    {#if error}
      <div class="hint hint-error" style="padding: 0 var(--space-md) var(--space-sm);">{error}</div>
    {/if}
  </div>
</form>

<style>
  .prompt-input {
    padding: var(--space-md);
  }

  .input-container {
    --stack-gap: 0;
    border: 1px solid oklch(var(--color-cli-border));
    border-radius: var(--radius-md);
    background: oklch(var(--color-cli-bg));
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .input-container:focus-within {
    border-color: oklch(var(--color-cli-text-muted));
    box-shadow: var(--shadow-focus);
  }

  .quick-replies {
    --row-gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md) 0 var(--space-md);
    overflow-x: auto;
    flex-wrap: nowrap;
  }

  .quick-reply-btn {
    border: 1px solid oklch(var(--color-cli-border));
    background: oklch(var(--color-cli-bg-elevated));
    color: oklch(var(--color-cli-text-dim));
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    white-space: nowrap;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .quick-reply-btn:hover:enabled {
    background: oklch(var(--color-cli-bg-hover));
    color: oklch(var(--color-cli-text));
    border-color: color-mix(in oklch, oklch(var(--color-cli-prefix-agent)) 35%, oklch(var(--color-cli-border)));
  }

  .quick-reply-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  textarea {
    flex: 1;
    padding: var(--space-md);
    font-family: var(--font-mono);
    line-height: 1.6;
    color: oklch(var(--color-cli-text));
    background: transparent;
    border: none;
    resize: none;
    min-height: 4rem;
    max-height: 12rem;
    field-sizing: content;
  }

  textarea:focus {
    outline: none;
  }

  textarea::placeholder {
    color: oklch(var(--color-cli-text-muted));
  }

  textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .attachment-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding: 0 var(--space-md) var(--space-sm) var(--space-md);
  }

  .attachment-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid oklch(var(--color-cli-border));
    background: oklch(var(--color-cli-bg-elevated));
    color: oklch(var(--color-cli-text-dim));
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    max-width: 100%;
  }

  .attachment-thumb {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    object-fit: cover;
    border: 1px solid oklch(var(--color-cli-border));
    background: oklch(var(--color-cli-bg));
    flex: 0 0 auto;
  }

  .attachment-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 260px;
  }

  .attachment-remove {
    border: none;
    background: transparent;
    color: oklch(var(--color-cli-text-muted));
    cursor: pointer;
    font-size: var(--text-sm);
    line-height: 1;
    padding: 0;
  }

  .attachment-remove:hover {
    color: oklch(var(--color-cli-error));
  }

  .footer {
    --split-gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-top: 1px solid oklch(var(--color-cli-border));
  }

  .tools {
    --row-gap: var(--space-xs);
  }

  /* Tool buttons */
  .tool-btn {
    --row-gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: oklch(var(--color-cli-text-muted));
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .file-input {
    display: none;
  }

  .tool-btn:hover {
    background: oklch(var(--color-cli-bg-hover));
    color: oklch(var(--color-cli-text));
  }

  .tool-btn svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .tool-btn .chevron {
    width: 0.75rem;
    height: 0.75rem;
    opacity: 0.5;
  }

  .mode-toggle.active {
    background: color-mix(in oklch, oklch(var(--color-cli-prefix-agent)) 15%, transparent);
    color: oklch(var(--color-cli-prefix-agent));
  }

  /* Dropdown */
  .dropdown {
    position: relative;
  }

  .dropdown-menu {
    position: absolute;
    bottom: 100%;
    left: 0;
    min-width: 140px;
    margin-bottom: var(--space-xs);
    padding: var(--space-xs);
    background: oklch(var(--color-cli-bg-elevated));
    border: 1px solid oklch(var(--color-cli-border));
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-popover);
    z-index: 100;
    animation: fadeIn 0.1s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-item {
    --split-gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-sm);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: oklch(var(--color-cli-text));
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    text-align: left;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .dropdown-item:hover {
    background: oklch(var(--color-cli-bg-hover));
  }

  .dropdown-item.selected {
    color: oklch(var(--color-cli-prefix-agent));
  }

  .dropdown-empty {
    padding: var(--space-sm);
    color: oklch(var(--color-cli-text-muted));
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    text-align: center;
  }

  .dropdown-item svg {
    width: 0.875rem;
    height: 0.875rem;
    flex-shrink: 0;
  }

  /* Submit button */
  .submit-btn {
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    background: oklch(var(--color-cli-prefix-agent));
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: opacity var(--transition-fast);
    --row-gap: 0;
  }

  .submit-btn svg {
    width: 1rem;
    height: 1rem;
    color: oklch(var(--color-cli-bg));
  }

  .submit-btn:hover:not(:disabled) {
    opacity: 0.85;
  }

  .submit-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .stop-btn {
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    background: oklch(var(--color-cli-error));
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: opacity var(--transition-fast);
    --row-gap: 0;
  }

  .stop-btn svg {
    width: 1rem;
    height: 1rem;
    color: oklch(var(--color-cli-bg));
  }

  .stop-btn:hover {
    opacity: 0.85;
  }


  .draft-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs);
    color: oklch(var(--color-cli-text-dim));
    margin-right: 8px;
    padding-right: 8px;
    border-right: 1px solid oklch(var(--color-cli-border));
  }

  .draft-label {
    white-space: nowrap;
    font-style: italic;
  }

  .draft-clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 50%;
    color: oklch(var(--color-cli-text-muted));
    cursor: pointer;
    background: transparent;
    border: none;
    transition: color var(--transition-fast), background var(--transition-fast);
  }

  .draft-clear-btn:hover {
    color: oklch(var(--color-cli-error));
    background: oklch(var(--color-cli-bg-hover));
  }

  @media (max-width: 480px) {
    .collapsible-label {
      display: none;
    }
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
