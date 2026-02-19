<script lang="ts">
  import type { ApprovalRequest } from "../types";

  interface Props {
    approval: ApprovalRequest;
    onApprove: (forSession?: boolean) => void;
    onDecline: () => void;
    onCancel: () => void;
  }

  const { approval, onApprove, onDecline, onCancel }: Props = $props();

  let selectedIndex = $state(0);

  const options = [
    { key: "Y", label: "Yes, proceed", action: () => onApprove(false) },
    { key: "A", label: "Always for session", action: () => onApprove(true) },
    { key: "N", label: "Decline", action: () => onDecline() },
    { key: "Esc", label: "Cancel turn", action: () => onCancel() },
  ];

  const actionLabels: Record<ApprovalRequest["type"], string> = {
    command: "Run shell command",
    file: "Modify file",
    mcp: "Run MCP tool",
    other: "Perform action",
  };

  const statusLabels: Record<string, { text: string; colorVar: string }> = {
    approved: { text: "Approved", colorVar: "--color-cli-success" },
    declined: { text: "Declined", colorVar: "--color-cli-error" },
    cancelled: { text: "Cancelled", colorVar: "--color-cli-text-muted" },
  };

  function handleOptionClick(index: number) {
    if (approval.status !== "pending") return;
    selectedIndex = index;
    options[index].action();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (approval.status !== "pending") return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const key = e.key.toLowerCase();

    if (key === "arrowdown" || key === "j") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, options.length - 1);
    } else if (key === "arrowup" || key === "k") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (key === "enter") {
      e.preventDefault();
      options[selectedIndex].action();
    } else if (key === "y") {
      e.preventDefault();
      onApprove(false);
    } else if (key === "a" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      onApprove(true);
    } else if (key === "n") {
      e.preventDefault();
      onDecline();
    } else if (key === "escape") {
      e.preventDefault();
      onCancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="approval-card" class:resolved={approval.status !== "pending"}>
  <div class="card-header">
    <span class="header-label">Approval Required</span>
    <span class="header-type">{actionLabels[approval.type]}</span>
  </div>

  <div class="card-body">
    {#if approval.command}
      <div class="command-block">
        <span class="prompt">$</span>
        <span class="command-text">{approval.command}</span>
      </div>
    {/if}

    {#if approval.filePath}
      <div class="file-path">{approval.filePath}</div>
    {/if}

    {#if approval.description && approval.description !== approval.command}
      <div class="description">{approval.description}</div>
    {/if}
  </div>

  <div class="card-actions">
    {#if approval.status === "pending"}
      {#each options as option, i}
        <button
          type="button"
          class="option-btn"
          class:focused={i === selectedIndex}
          onclick={() => handleOptionClick(i)}
        >
          <span class="option-key">{option.key}</span>
          <span class="option-label">{option.label}</span>
        </button>
      {/each}
    {:else}
      <div class="status-badge" style:color={`oklch(var(${statusLabels[approval.status].colorVar}))`}>
        {statusLabels[approval.status].text}
      </div>
    {/if}
  </div>
</div>

<style>
  .approval-card {
    margin: var(--space-xs) var(--space-md);
    border: 1px solid oklch(var(--color-cli-border));
    border-radius: var(--radius-md);
    background: oklch(var(--color-cli-bg-elevated));
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    overflow: hidden;
  }

  .approval-card.resolved {
    opacity: 0.6;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid oklch(var(--color-cli-border));
  }

  .header-label {
    color: oklch(var(--color-cli-prefix-tool));
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .header-type {
    color: oklch(var(--color-cli-text-muted));
    font-size: var(--text-xs);
  }

  .card-body {
    padding: var(--space-sm) var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .command-block {
    display: flex;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: oklch(var(--color-cli-bg));
    border-radius: var(--radius-sm);
  }

  .prompt {
    color: oklch(var(--color-cli-prefix-reasoning));
    font-weight: 600;
    flex-shrink: 0;
  }

  .command-text {
    color: oklch(var(--color-cli-text));
    word-break: break-all;
  }

  .file-path {
    color: oklch(var(--color-cli-prefix-user));
    font-size: var(--text-xs);
  }

  .description {
    color: oklch(var(--color-cli-text-dim));
    font-size: var(--text-xs);
  }

  .card-actions {
    display: flex;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    border-top: 1px solid oklch(var(--color-cli-border));
    flex-wrap: wrap;
  }

  .option-btn {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background: transparent;
    border: 1px solid oklch(var(--color-cli-border));
    border-radius: var(--radius-sm);
    color: oklch(var(--color-cli-text));
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .option-btn:hover {
    border-color: oklch(var(--color-cli-text-muted));
    background: oklch(var(--color-cli-bg-hover));
  }

  .option-btn.focused {
    border-color: oklch(var(--color-cli-prefix-agent));
    background: color-mix(in srgb, oklch(var(--color-cli-prefix-agent)) 10%, transparent);
  }

  .option-btn.focused .option-label {
    color: oklch(var(--color-cli-prefix-agent));
  }

  .option-key {
    color: oklch(var(--color-cli-text-muted));
    font-size: var(--text-xs);
    min-width: 1.5ch;
    text-align: center;
  }

  .option-label {
    color: oklch(var(--color-cli-text));
  }

  .status-badge {
    font-size: var(--text-xs);
    font-weight: 600;
  }
</style>
