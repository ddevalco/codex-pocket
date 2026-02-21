<script lang="ts">
  import type { Message } from "../../types";
  import { uiToggles } from "../../uiToggles.svelte";

  interface Props {
    message: Message;
    copyState: "idle" | "copied" | "error";
    menuOpen: boolean;
    onCopyMessage: () => void;
    onCopyRawMarkdown: () => void;
    onCopyQuoted?: (message: Message) => void;
    onCopyFromHere?: (messageId: string) => void;
    onToggleMenu: () => void;
    onShiftCopy: (e: MouseEvent) => void;
  }

  const {
    message,
    copyState,
    menuOpen,
    onCopyMessage,
    onCopyRawMarkdown,
    onCopyQuoted,
    onCopyFromHere,
    onToggleMenu,
    onShiftCopy,
  }: Props = $props();
</script>

{#if uiToggles.showMessageCopyButton || uiToggles.showMessageCopyMarkdown || uiToggles.showMessageCopyQuoted}
  <div class="absolute top-xs right-md z-10 flex items-center gap-xs max-sm:right-sm" data-message-menu={message.id}>
    <button
      type="button"
      class="bg-transparent border-none text-cli-text-muted cursor-pointer px-1.5 py-0.5 rounded-md text-base leading-none hover:text-cli-text hover:bg-cli-bg-elevated"
      onclick={(e) => {
        e.stopPropagation();
        onToggleMenu();
      }}
      title="Message actions"
      aria-label="Message actions"
    >
      ⋯
    </button>
    {#if menuOpen}
      <div class="absolute top-[22px] right-0 min-w-[160px] bg-cli-bg-elevated border border-white/10 rounded-[10px] p-1.5 shadow-popover z-20" role="menu" aria-label="Message actions">
        {#if uiToggles.showMessageCopyButton}
          <button type="button" class="w-full text-left bg-transparent border-none text-cli-text font-mono text-sm px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white/5" role="menuitem" onclick={() => { onToggleMenu(); onCopyMessage(); }}>Copy</button>
        {/if}
        {#if uiToggles.showMessageCopyMarkdown}
          <button type="button" class="w-full text-left bg-transparent border-none text-cli-text font-mono text-sm px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white/5" role="menuitem" onclick={() => { onToggleMenu(); onCopyRawMarkdown(); }}>Copy markdown</button>
        {/if}
        {#if uiToggles.showMessageCopyQuoted}
          <button
            type="button"
            class="w-full text-left bg-transparent border-none text-cli-text font-mono text-sm px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white/5 disabled:text-cli-text-muted disabled:cursor-not-allowed"
            role="menuitem"
            onclick={() => {
              onToggleMenu();
              onCopyQuoted?.(message);
            }}
            disabled={!onCopyQuoted}
          >Copy quoted</button>
        {/if}
        <button
          type="button"
          class="w-full text-left bg-transparent border-none text-cli-text font-mono text-sm px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white/5 disabled:text-cli-text-muted disabled:cursor-not-allowed"
          role="menuitem"
          onclick={() => {
            onToggleMenu();
            onCopyFromHere?.(message.id);
          }}
          disabled={!onCopyFromHere}
        >Copy from here</button>
      </div>
    {/if}
  </div>
{/if}
{#if uiToggles.showMessageCopyButton}
  <button
    type="button"
    class="absolute top-[6px] right-[10px] px-2.5 py-1 rounded-sm border border-cli-border bg-black/25 text-cli-text-muted font-mono text-[11px] cursor-pointer opacity-0 transition-all duration-200 hover:text-cli-text max-[520px]:opacity-100 max-[520px]:px-3 max-[520px]:py-1.5 max-[520px]:text-xs group-hover:opacity-100 focus-within:opacity-100"
    class:opacity-100={copyState !== "idle"}
    class:border-cli-success={copyState === "copied"}
    class:text-cli-success={copyState === "copied"}
    class:border-cli-error={copyState === "error"}
    class:text-cli-error={copyState === "error"}
    onclick={onShiftCopy}
    title={
      copyState === "copied"
        ? "Copied"
        : "Copy message (Shift+Click to copy raw markdown)"
    }
    aria-label="Copy message"
  >
    {copyState === "copied" ? "copied" : "copy"}
  </button>
{/if}
