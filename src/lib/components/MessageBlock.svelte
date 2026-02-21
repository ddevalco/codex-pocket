<script lang="ts">
  import { marked } from "marked";
  import DOMPurify from "dompurify";
  import type { Message } from "../types";
  import { uiToggles } from "../uiToggles.svelte";
  import Reasoning from "./Reasoning.svelte";
  import Tool from "./Tool.svelte";
  import {
    MessageActions,
    TokenCost,
    MarkdownRenderer,
    WaitMessage,
    CompactionMessage,
    TerminalMessage,
  } from "./message/index";

  interface Props {
    message: Message;
    onCopyQuoted?: (message: Message) => void;
    onCopyFromHere?: (messageId: string) => void;
    /** Whether this reasoning block is the last one in the thread */
    isLatestReasoning?: boolean;
  }

  const { message, onCopyQuoted, onCopyFromHere, isLatestReasoning = false }: Props = $props();

  type CopyState = "idle" | "copied" | "error";
  let copyState = $state<CopyState>("idle");
  let menuOpen = $state(false);

  // Safety guarantee: ensure at least one copy action remains enabled.
  $effect(() => {
    const anyCopyEnabled =
      uiToggles.showMessageCopyButton ||
      uiToggles.showMessageCopyMarkdown ||
      uiToggles.showMessageCopyQuoted;
    if (!anyCopyEnabled) {
      uiToggles.showMessageCopyButton = true;
    }
  });

  $effect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // Close if click occurs outside the menu container.
      if (!t.closest?.(`[data-message-menu="${message.id}"]`)) {
        menuOpen = false;
      }
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  });

  /* ── Message type classification ── */
  const isUser = $derived(message.role === "user");
  const isReasoning = $derived(message.role === "assistant" && message.kind === "reasoning");
  const isTool = $derived(
    message.role === "tool" &&
      message.kind !== "terminal" &&
      message.kind !== "wait" &&
      message.kind !== "compaction"
  );
  const isTerminal = $derived(message.role === "tool" && message.kind === "terminal");
  const isWait = $derived(message.role === "tool" && message.kind === "wait");
  const isCompaction = $derived(message.role === "tool" && message.kind === "compaction");
  const showTokenCost = $derived(
    uiToggles.showTokenCosts &&
      message.role === "assistant" &&
      typeof message.tokenUsage?.totalTokens === "number"
  );

  /* ── Copy logic ── */
  async function copyMessage() {
    const fallbackCopy = (text: string) => {
      // Works on http:// origins where navigator.clipboard is unavailable.
      const ta = document.createElement("textarea");
      ta.value = text;
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
      const raw = message.text ?? "";
      // Default to copying "rendered text" so markdown UI doesn't pollute what you paste elsewhere.
      // Hold Shift while clicking copy to copy the raw markdown source instead.
      const wantRaw = (copyMessage as any).__wantRaw === true;
      (copyMessage as any).__wantRaw = false;

      let text = raw;
      if (!wantRaw) {
        try {
          // Convert markdown -> sanitized HTML -> plain text.
          // This preserves readable content while removing markdown syntax.
          const html = marked.parse(raw, {
            async: false,
            breaks: true,
          }) as string;
          const safe = DOMPurify.sanitize(html, { ALLOWED_TAGS: ["p", "br", "strong", "em", "code", "pre", "blockquote", "ul", "ol", "li", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "img", "a"], ALLOWED_ATTR: ["href", "title", "src", "alt"] });

          const div = document.createElement("div");
          div.innerHTML = safe;
          text = (div.textContent ?? "").trim() || raw;
        } catch {
          text = raw;
        }
      }

      // Clipboard is best-effort. If it fails, show a brief error state but don't crash the app.
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      copyState = "copied";
    } catch {
      copyState = "error";
    } finally {
      setTimeout(() => {
        copyState = "idle";
      }, copyState === "error" ? 1600 : 1200);
    }
  }

  function copyRawMarkdown() {
    (copyMessage as any).__wantRaw = true;
    copyMessage();
  }

  /* ── Prefix / background config by role + status ── */
  const prefixConfig = $derived.by(() => {
    if (message.status === "sending") {
      return { prefix: "◌", colorClass: "text-cli-text-muted", bgClass: "bg-cli-bg-user border-l-0 shadow-none pl-md sending" };
    }
    if (message.status === "error") {
      return { prefix: "!", colorClass: "text-cli-error", bgClass: "bg-cli-bg-user border-l-0 shadow-none pl-md error" };
    }
    if (message.role === "user") {
      return { prefix: ">", colorClass: "text-cli-prefix-agent", bgClass: "bg-cli-bg-user border-l-0 shadow-none pl-md" };
    }
    if (message.role === "assistant") {
      return { prefix: "•", colorClass: "text-cli-prefix-agent", bgClass: "" };
    }
    if (message.role === "tool") {
      return { prefix: "•", colorClass: "text-cli-prefix-tool", bgClass: "" };
    }
    return { prefix: "•", colorClass: "text-cli-text-dim", bgClass: "" };
  });
</script>

{#if isUser}
<div
  class="group relative flex justify-end px-md py-xs"
  role="button"
  aria-label="Copy message"
  tabindex="0"
  oncontextmenu={(e) => {
    e.preventDefault();
    copyMessage();
  }}
  onkeydown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      copyMessage();
    }
  }}
>
  <div class="user-bubble relative max-w-[85%] rounded-2xl bg-cli-bg-user px-md py-sm font-mono text-sm leading-relaxed message-block {prefixConfig.bgClass}">
  <MessageActions
    {message}
    {copyState}
    {menuOpen}
    onCopyMessage={copyMessage}
    onCopyRawMarkdown={copyRawMarkdown}
    {onCopyQuoted}
    {onCopyFromHere}
    onToggleMenu={() => menuOpen = !menuOpen}
    onShiftCopy={(e) => {
      (copyMessage as any).__wantRaw = e.shiftKey;
      copyMessage();
    }}
  />

  {#if uiToggles.showMessageCopyButton || uiToggles.showMessageCopyMarkdown || uiToggles.showMessageCopyQuoted}
    <div class="absolute top-xs right-md z-10 flex items-center gap-xs max-sm:right-sm" data-message-menu={message.id}>
      <button
        type="button"
        class="bg-transparent border-none text-cli-text-muted cursor-pointer px-1.5 py-0.5 rounded-md text-base leading-none hover:text-cli-text hover:bg-cli-bg-elevated"
        onclick={(e) => {
          e.stopPropagation();
          menuOpen = !menuOpen;
        }}
        title="Message actions"
        aria-label="Message actions"
      >
        ⋯
      </button>
      {#if menuOpen}
        <div class="absolute top-[22px] right-0 min-w-[160px] bg-cli-bg-elevated border border-white/10 rounded-xl p-1.5 shadow-popover z-20" role="menu" aria-label="Message actions">
          {#if uiToggles.showMessageCopyButton}
            <button type="button" class="w-full text-left bg-transparent border-none text-cli-text font-mono text-sm px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white/5" role="menuitem" onclick={() => { menuOpen = false; copyMessage(); }}>Copy</button>
          {/if}
          {#if uiToggles.showMessageCopyMarkdown}
            <button type="button" class="w-full text-left bg-transparent border-none text-cli-text font-mono text-sm px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white/5" role="menuitem" onclick={() => { menuOpen = false; copyRawMarkdown(); }}>Copy markdown</button>
          {/if}
          {#if uiToggles.showMessageCopyQuoted}
            <button
              type="button"
              class="w-full text-left bg-transparent border-none text-cli-text font-mono text-sm px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white/5 disabled:text-cli-text-muted disabled:cursor-not-allowed"
              role="menuitem"
              onclick={() => {
                menuOpen = false;
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
              menuOpen = false;
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
      class="absolute top-[6px] right-[10px] px-2.5 py-1 rounded-sm border border-cli-border bg-black/25 text-cli-text-muted font-mono text-2xs cursor-pointer opacity-0 transition-all duration-200 hover:text-cli-text max-[520px]:opacity-100 max-[520px]:px-3 max-[520px]:py-1.5 max-[520px]:text-xs group-hover:opacity-100 focus-within:opacity-100"
      class:opacity-100={copyState !== "idle"}
      class:border-cli-success={copyState === "copied"}
      class:text-cli-success={copyState === "copied"}
      class:border-cli-error={copyState === "error"}
      class:text-cli-error={copyState === "error"}
      onclick={(e) => {
        // Shift+click copies raw markdown source.
        (copyMessage as any).__wantRaw = (e as MouseEvent).shiftKey;
        copyMessage();
      }}
    />
  {/if}
    <MarkdownRenderer
      text={message.text}
      prefix=""
      colorClass=""
    />
  </div>
</div>
{:else}
<div
  class="group relative px-md py-xs font-mono text-sm leading-relaxed message-block {prefixConfig.bgClass}"
  role="button"
  aria-label="Copy message"
  tabindex="0"
  oncontextmenu={(e) => {
    e.preventDefault();
    copyMessage();
  }}
  onkeydown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      copyMessage();
    }
  }}
>
  <MessageActions
    {message}
    {copyState}
    {menuOpen}
    onCopyMessage={copyMessage}
    onCopyRawMarkdown={copyRawMarkdown}
    {onCopyQuoted}
    {onCopyFromHere}
    onToggleMenu={() => menuOpen = !menuOpen}
    onShiftCopy={(e) => {
      (copyMessage as any).__wantRaw = e.shiftKey;
      copyMessage();
    }}
  />

  {#if isReasoning}
    <Reasoning content={message.text} defaultOpen={isLatestReasoning} />
  {:else if isTool}
    <Tool {message} />
  {:else if isWait}
    <WaitMessage
      text={message.text}
      prefix={prefixConfig.prefix}
      colorClass={prefixConfig.colorClass}
    />
  {:else if isCompaction}
    <CompactionMessage />
  {:else if isTerminal}
    <TerminalMessage
      text={message.text}
      prefix={prefixConfig.prefix}
      colorClass={prefixConfig.colorClass}
    />
  {:else}
    <MarkdownRenderer
      text={message.text}
      prefix={prefixConfig.prefix}
      colorClass={prefixConfig.colorClass}
    />
  {/if}

  {#if showTokenCost}
    <TokenCost
      totalTokens={message.tokenUsage?.totalTokens ?? 0}
      estimatedCost={message.tokenUsage?.estimatedCost}
    />
  {/if}
</div>
{/if}

<style>
  .user-bubble {
    word-break: break-word;
    transition: box-shadow var(--transition-fast), transform var(--transition-fast);
  }

  .user-bubble:hover {
    box-shadow: var(--shadow-sm);
  }

  :global(.message-block.user-bg.sending .prefix) {
    animation: status-pulse 1.5s ease-in-out infinite;
  }

  @keyframes status-pulse {
    0%, 100% { opacity: 1.0; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.92); }
  }
</style>
