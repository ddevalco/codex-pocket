<script lang="ts">
  import type { ModeKind, ModelOption, ReasoningEffort } from "../types";
  import type { AgentPreset } from "../presets";
  import { api } from "../api";
  import { loadQuickReplies, type QuickReply } from "../quickReplies";

	  interface Props {
    model: string;
    reasoningEffort: ReasoningEffort;
    mode?: ModeKind;
    presets?: AgentPreset[];
    modelOptions?: ModelOption[];
    modelsLoading?: boolean;
    disabled?: boolean;
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

  const ENTER_BEHAVIOR_KEY = "codex_pocket_enter_behavior";
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

  const canSubmit = $derived((input.trim().length > 0 || pendingAttachments.length > 0) && !disabled);
	  let uploadBusy = $state(false);
	  let uploadError = $state<string | null>(null);
	  let pendingAttachments = $state<ImageAttachment[]>([]);

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
    if (disabled) return;
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
    {#if quickReplies.length}
      <div class="quick-replies row" role="group" aria-label="Quick reply shortcuts">
        {#each quickReplies as reply, i (`${reply.label}:${reply.text}:${i}`)}
          <button
            type="button"
            class="quick-reply-btn"
            onclick={() => sendQuickReply(reply.text)}
            disabled={disabled}
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
      {disabled}
	    ></textarea>
    {#if pendingAttachments.length}
      <div class="attachment-chips" role="list" aria-label="Selected attachments">
        {#each pendingAttachments as item, i (`${item.localPath}:${item.filename}:${i}`)}
          <div class="attachment-chip" role="listitem">
            <img class="attachment-thumb" src={item.viewUrl} alt={item.filename} loading="lazy" />
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
	        <!-- Image upload -->
	        <!--
	          On iOS Safari, `capture` forces the camera UI and can hide the photo library picker.
	          We want the user to be able to choose either Camera or Photo Library.
	        -->
	        <label class="tool-btn row" title="Attach image">
		          <input
		            class="file-input"
		            type="file"
		            accept="image/*"
                multiple
		            onchange={handlePickImage}
		            disabled={disabled || uploadBusy}
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
        <button type="submit" class="submit-btn row" disabled={!canSubmit}>
          {#if disabled}
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
    {#if uploadError}
      <div class="hint hint-error" style="padding: 0 var(--space-md) var(--space-sm);">{uploadError}</div>
    {/if}
  </div>
</form>

<style>
  .prompt-input {
    padding: var(--space-md);
  }

  .input-container {
    --stack-gap: 0;
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-md);
    background: var(--cli-bg);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .input-container:focus-within {
    border-color: var(--cli-text-muted);
    box-shadow: var(--shadow-focus);
  }

  .quick-replies {
    --row-gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md) 0 var(--space-md);
    overflow-x: auto;
    flex-wrap: nowrap;
  }

  .quick-reply-btn {
    border: 1px solid var(--cli-border);
    background: var(--cli-bg-elevated);
    color: var(--cli-text-dim);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    white-space: nowrap;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .quick-reply-btn:hover:enabled {
    background: var(--cli-bg-hover);
    color: var(--cli-text);
    border-color: color-mix(in srgb, var(--cli-prefix-agent) 35%, var(--cli-border));
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
    color: var(--cli-text);
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
    color: var(--cli-text-muted);
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
    border: 1px solid var(--cli-border);
    background: var(--cli-bg-elevated);
    color: var(--cli-text-dim);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    max-width: 100%;
  }

  .attachment-thumb {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    object-fit: cover;
    border: 1px solid var(--cli-border);
    background: var(--cli-bg);
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
    color: var(--cli-text-muted);
    cursor: pointer;
    font-size: var(--text-sm);
    line-height: 1;
    padding: 0;
  }

  .attachment-remove:hover {
    color: var(--cli-error);
  }

  .footer {
    --split-gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-top: 1px solid var(--cli-border);
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
    color: var(--cli-text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .file-input {
    display: none;
  }

  .tool-btn:hover {
    background: var(--cli-bg-hover);
    color: var(--cli-text);
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
    background: color-mix(in srgb, var(--cli-prefix-agent) 15%, transparent);
    color: var(--cli-prefix-agent);
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
    background: var(--cli-bg-elevated);
    border: 1px solid var(--cli-border);
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
    color: var(--cli-text);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    text-align: left;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .dropdown-item:hover {
    background: var(--cli-bg-hover);
  }

  .dropdown-item.selected {
    color: var(--cli-prefix-agent);
  }

  .dropdown-empty {
    padding: var(--space-sm);
    color: var(--cli-text-muted);
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
    background: var(--cli-prefix-agent);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: opacity var(--transition-fast);
    --row-gap: 0;
  }

  .submit-btn svg {
    width: 1rem;
    height: 1rem;
    color: var(--cli-bg);
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
    background: var(--cli-error);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: opacity var(--transition-fast);
    --row-gap: 0;
  }

  .stop-btn svg {
    width: 1rem;
    height: 1rem;
    color: var(--cli-bg);
  }

  .stop-btn:hover {
    opacity: 0.85;
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
