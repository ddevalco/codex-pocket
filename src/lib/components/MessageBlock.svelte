<script lang="ts">
  import { marked } from "marked";
  import DOMPurify from "dompurify";
  import type { Message } from "../types";
  import { uiToggles } from "../uiToggles.svelte";
  import ShimmerDot from "./ShimmerDot.svelte";
  import Reasoning from "./Reasoning.svelte";
  import Tool from "./Tool.svelte";

  interface Props {
    message: Message;
    onCopyQuoted?: (message: Message) => void;
    onCopyFromHere?: (messageId: string) => void;
  }

  const { message, onCopyQuoted, onCopyFromHere }: Props = $props();

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

  function formatTokenCount(totalTokens: number): string {
    if (totalTokens >= 1000) {
      const compact = (totalTokens / 1000).toFixed(1);
      return `${compact.replace(/\.0$/, "")}K`;
    }
    return totalTokens.toLocaleString();
  }

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
      // Default to copying "rendered text" so markdown UI doesn’t pollute what you paste elsewhere.
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

  const terminalLines = $derived.by(() => {
    if (!isTerminal) return [];
    const lines = message.text.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
  });

  const renderedHtml = $derived.by(() => {
    if (isReasoning || isTool || isTerminal || isWait || isCompaction) return "";

    // For normal messages, render markdown (sanitized). This enables inline images for uploads.
    const raw = message.text ?? "";
    try {
      const html = marked.parse(raw, {
        async: false,
        breaks: true,
      }) as string;

      return DOMPurify.sanitize(html, {
        // Keep the sanitizer fairly strict, but allow images + links.
        // Upload URLs are capability tokens (e.g. /u/<token>) so they can render without auth headers.
        ALLOWED_TAGS: [
          "a",
          "p",
          "br",
          "strong",
          "em",
          "code",
          "pre",
          "blockquote",
          "ul",
          "ol",
          "li",
          "hr",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "img",
        ],
        ALLOWED_ATTR: ["href", "title", "src", "alt"],
      });
    } catch {
      // If markdown parsing fails for any reason, fall back to plain text.
      return DOMPurify.sanitize(raw);
    }
  });
</script>

<div
  class="group relative px-md py-xs font-mono text-sm leading-relaxed message-block {prefixConfig.bgClass}"
  role="button"
  aria-label="Copy message"
  tabindex="0"
  oncontextmenu={(e) => {
    // Mobile long-press often triggers contextmenu; treat it as "copy".
    // Prevent the browser from selecting text or opening a native menu.
    e.preventDefault();
    copyMessage();
  }}
  onkeydown={(e) => {
    // Accessibility: allow keyboard users to copy.
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      copyMessage();
    }
  }}
>
  {#if uiToggles.showMessageCopyButton || uiToggles.showMessageCopyMarkdown || uiToggles.showMessageCopyQuoted}
    <div class="absolute top-xs right-md z-10 flex items-center gap-xs max-sm:right-sm" data-message-menu={message.id}>
      <button
        type="button"
        class="bg-transparent border-none text-cli-text-muted cursor-pointer px-1.5 py-0.5 rounded-[6px] text-base leading-none hover:text-cli-text hover:bg-cli-bg-elevated"
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
        <div class="absolute top-[22px] right-0 min-w-[160px] bg-cli-bg-elevated border border-white/10 rounded-[10px] p-1.5 shadow-popover z-20" role="menu" aria-label="Message actions">
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
      class="absolute top-[6px] right-[10px] px-2.5 py-1 rounded-sm border border-cli-border bg-black/25 text-cli-text-muted font-mono text-[11px] cursor-pointer opacity-0 transition-all duration-200 hover:text-cli-text max-[520px]:opacity-100 max-[520px]:px-3 max-[520px]:py-1.5 max-[520px]:text-xs group-hover:opacity-100 focus-within:opacity-100"
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
  {#if isReasoning}
    <Reasoning content={message.text} defaultOpen={false} />
  {:else if isTool}
    <Tool {message} />
  {:else if isWait}
    <div class="flex items-center gap-sm">
      <span class="flex-shrink-0 font-semibold {prefixConfig.colorClass}">{prefixConfig.prefix}</span>
      <div class="flex items-center gap-sm">
        <ShimmerDot color="--color-cli-prefix-tool" />
        <span class="text-cli-text-dim italic min-w-0 break-words">{message.text}</span>
      </div>
    </div>
  {:else if isCompaction}
    <div class="flex items-center justify-center gap-sm">
      <span class="text-cli-text-muted text-xs">↕</span>
      <span class="text-cli-text-dim italic min-w-0 break-words">Context compacted</span>
    </div>
  {:else if isTerminal}
    <div class="flex items-start gap-sm">
      <span class="flex-shrink-0 font-semibold {prefixConfig.colorClass}">{prefixConfig.prefix}</span>
      <div class="flex flex-col gap-[0.1rem]">
        {#each terminalLines as line}
          <div class="flex gap-sm">
            <span class="text-cli-text min-w-0 break-words">{line}</span>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="flex items-start gap-sm">
      <span class="flex-shrink-0 font-semibold {prefixConfig.colorClass}">{prefixConfig.prefix}</span>
      <div class="text-cli-text min-w-0 break-words markdown">{@html renderedHtml}</div>
    </div>
  {/if}
  {#if showTokenCost}
    <div class="ml-[calc(var(--spacing-md)+12px)] mt-xs text-[0.8em] text-cli-text-muted flex gap-xs items-center" aria-live="polite">
      <span>{formatTokenCount(message.tokenUsage?.totalTokens ?? 0)} tokens</span>
      {#if typeof message.tokenUsage?.estimatedCost === "number"}
        <span class="opacity-60">·</span>
        <span>${message.tokenUsage.estimatedCost.toFixed(4)}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Status animation */
  :global(.message-block.user-bg.sending .prefix) {
    animation: status-pulse 1.5s ease-in-out infinite;
  }

  @keyframes status-pulse {
    0%, 100% { opacity: 1.0; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.92); }
  }

  /* Markdown rendering */
  .markdown :global(p) {
    margin: 0;
  }

  .markdown :global(pre) {
    margin: 0;
    padding: var(--spacing-sm);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-sm);
    overflow: auto;
  }

  .markdown :global(code) {
    font-family: var(--font-mono);
  }

  .markdown :global(img) {
    max-width: min(520px, 100%);
    height: auto;
    display: block;
    margin-top: var(--spacing-xs);
    border-radius: var(--radius-sm);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .markdown :global(a) {
    color: var(--color-cli-prefix-user);
    text-decoration: underline;
  }
  .markdown :global(a:hover) {
    opacity: 0.8;
  }
</style>
