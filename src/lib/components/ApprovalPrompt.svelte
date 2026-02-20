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

  const statusLabels: Record<string, { text: string; colorClass: string }> = {
    approved: { text: "Approved", colorClass: "text-cli-success" },
    declined: { text: "Declined", colorClass: "text-cli-error" },
    cancelled: { text: "Cancelled", colorClass: "text-cli-text-muted" },
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

<div class="my-xs mx-md border border-cli-border rounded-md bg-cli-bg-elevated font-mono text-sm overflow-hidden" class:opacity-60={approval.status !== "pending"}>
  <div class="flex items-center justify-between py-sm px-md border-b border-cli-border">
    <span class="text-cli-prefix-tool text-xs font-semibold uppercase tracking-wider">Approval Required</span>
    <span class="text-cli-text-muted text-xs">{actionLabels[approval.type]}</span>
  </div>

  <div class="py-sm px-md flex flex-col gap-xs">
    {#if approval.command}
      <div class="flex gap-sm py-xs px-sm bg-cli-bg rounded-sm">
        <span class="text-cli-prefix-reasoning font-semibold flex-shrink-0">$</span>
        <span class="text-cli-text break-all">{approval.command}</span>
      </div>
    {/if}

    {#if approval.filePath}
      <div class="text-cli-prefix-user text-xs">{approval.filePath}</div>
    {/if}

    {#if approval.description && approval.description !== approval.command}
      <div class="text-cli-text-dim text-xs">{approval.description}</div>
    {/if}
  </div>

  <div class="flex gap-xs py-sm px-md border-t border-cli-border flex-wrap">
    {#if approval.status === "pending"}
      {#each options as option, i}
        <button
          type="button"
          class="flex items-center gap-xs p-xs px-sm bg-transparent border border-cli-border rounded-sm text-cli-text font-mono text-xs cursor-pointer transition-all duration-200 hover:border-cli-text-muted hover:bg-cli-bg-hover"
          class:border-cli-prefix-agent={i === selectedIndex}
          class:bg-cli-prefix-agent={i === selectedIndex}
          class:bg-opacity-10={i === selectedIndex}
          onclick={() => handleOptionClick(i)}
        >
          <span class="text-cli-text-muted text-xs min-w-[1.5ch] text-center">{option.key}</span>
          <span class="text-cli-text" class:text-cli-prefix-agent={i === selectedIndex}>{option.label}</span>
        </button>
      {/each}
    {:else}
      <div class="text-xs font-semibold {statusLabels[approval.status].colorClass}">
        {statusLabels[approval.status].text}
      </div>
    {/if}
  </div>
</div>

<style>
</style>
