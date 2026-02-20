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
      return { prefix: "◌", colorVar: "--color-cli-text-muted", bgClass: "user-bg sending" };
    }
    if (message.status === "error") {
      return { prefix: "!", colorVar: "--color-cli-error", bgClass: "user-bg error" };
    }
    if (message.role === "user") {
      return { prefix: ">", colorVar: "--color-cli-prefix-agent", bgClass: "user-bg" };
    }
    if (message.role === "assistant") {
      return { prefix: "•", colorVar: "--color-cli-prefix-agent", bgClass: "" };
    }
    if (message.role === "tool") {
      return { prefix: "•", colorVar: "--color-cli-prefix-tool", bgClass: "" };
    }
    return { prefix: "•", colorVar: "--color-cli-text-dim", bgClass: "" };
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
  class="message-block {prefixConfig.bgClass}"
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
    <div class="message-actions" data-message-menu={message.id}>
      <button
        type="button"
        class="menu-btn"
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
        <div class="menu" role="menu" aria-label="Message actions">
          {#if uiToggles.showMessageCopyButton}
            <button type="button" role="menuitem" onclick={() => { menuOpen = false; copyMessage(); }}>Copy</button>
          {/if}
          {#if uiToggles.showMessageCopyMarkdown}
            <button type="button" role="menuitem" onclick={() => { menuOpen = false; copyRawMarkdown(); }}>Copy markdown</button>
          {/if}
          {#if uiToggles.showMessageCopyQuoted}
            <button
              type="button"
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
      class="copy-btn"
      class:copied={copyState === "copied"}
      class:error={copyState === "error"}
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
    <div class="message-line wait row">
      <span class="prefix" style:color={`oklch(var(${prefixConfig.colorVar}))`}>{prefixConfig.prefix}</span>
      <div class="wait-line row">
        <ShimmerDot color="--color-cli-prefix-tool" />
        <span class="text dim">{message.text}</span>
      </div>
    </div>
  {:else if isCompaction}
    <div class="message-line compaction row">
      <span class="compaction-icon">↕</span>
      <span class="text dim">Context compacted</span>
    </div>
  {:else if isTerminal}
    <div class="message-line terminal row">
      <span class="prefix" style:color={`oklch(var(${prefixConfig.colorVar}))`}>{prefixConfig.prefix}</span>
      <div class="terminal-lines stack">
        {#each terminalLines as line}
          <div class="terminal-line row">
            <span class="text">{line}</span>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="message-line row">
      <span class="prefix" style:color={`oklch(var(${prefixConfig.colorVar}))`}>{prefixConfig.prefix}</span>
      <div class="text markdown">{@html renderedHtml}</div>
    </div>
  {/if}
  {#if showTokenCost}
    <div class="token-cost" aria-live="polite">
      <span>{formatTokenCount(message.tokenUsage?.totalTokens ?? 0)} tokens</span>
      {#if typeof message.tokenUsage?.estimatedCost === "number"}
        <span class="token-cost-sep">·</span>
        <span>${message.tokenUsage.estimatedCost.toFixed(4)}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .message-block {
    position: relative;
    padding: var(--space-xs) var(--space-md);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1.6;
  }

  .message-actions {
    position: absolute;
    top: var(--space-xs);
    right: var(--space-md);
    display: flex;
    gap: var(--space-xs);
    align-items: center;
    z-index: 2;
  }

  .menu-btn {
    background: transparent;
    border: none;
    color: oklch(var(--color-cli-text-muted));
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 6px;
    font-size: var(--text-base);
    line-height: 1;
  }

  .menu-btn:hover {
    color: oklch(var(--color-cli-text));
    background: oklch(var(--color-cli-bg-elevated));
  }

  .menu {
    position: absolute;
    top: 22px;
    right: 0;
    min-width: 160px;
    background: oklch(var(--color-cli-bg-elevated));
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  }

  .menu button {
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: oklch(var(--color-cli-text));
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
  }

  .menu button:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .menu button:disabled {
    color: oklch(var(--color-cli-text-muted));
    cursor: not-allowed;
  }

  /* Keep the actions visible on mobile where hover doesn't exist. */
  @media (max-width: 640px) {
    .message-actions {
      right: var(--space-sm);
    }
  }

  .message-block.user-bg {
    background: oklch(var(--color-cli-bg-user));
    border-left: 0;
    box-shadow: none;
    padding-left: var(--space-md);
  }

  .token-cost {
    margin-left: calc(var(--space-md) + 12px);
    margin-top: var(--space-xs);
    font-size: 0.8em;
    color: oklch(var(--color-cli-text-muted));
    display: flex;
    gap: var(--space-xs);
    align-items: center;
  }

  .token-cost-sep {
    opacity: 0.6;
  }

  .message-line {
    --row-gap: var(--space-sm);
    align-items: flex-start;
  }

  .message-line.terminal {
    align-items: flex-start;
  }

  .message-line.wait {
    align-items: center;
  }

  .terminal-lines {
    --stack-gap: 0.1rem;
  }

  .terminal-line {
    --row-gap: var(--space-sm);
  }

  .wait-line {
    --row-gap: var(--space-sm);
  }

  .message-line.compaction {
    --row-gap: var(--space-sm);
    justify-content: center;
  }

  .compaction-icon {
    color: oklch(var(--color-cli-text-muted));
    font-size: var(--text-xs);
  }

  .prefix {
    flex-shrink: 0;
    font-weight: 600;
  }

  /* Status animation */
  :global(.message-block.user-bg.sending .prefix) {
    animation: status-pulse 1.5s ease-in-out infinite;
  }

  @keyframes status-pulse {
    0%, 100% { opacity: 1.0; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.92); }
  }

  .text {
    color: oklch(var(--color-cli-text));
    word-break: break-word;
    min-width: 0;
  }

  .text.dim {
    color: oklch(var(--color-cli-text-dim));
    font-style: italic;
  }

  /* Markdown rendering */
  .markdown :global(p) {
    margin: 0;
  }

  .markdown :global(pre) {
    margin: 0;
    padding: var(--space-sm);
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
    margin-top: var(--space-xs);
    border-radius: var(--radius-sm);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .markdown :global(a) {
    color: oklch(var(--color-cli-link));
  }

  .copy-btn {
    position: absolute;
    top: 6px;
    right: 10px;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid oklch(var(--color-cli-border));
    background: rgba(0, 0, 0, 0.25);
    color: oklch(var(--color-cli-text-muted));
    font-family: var(--font-mono);
    font-size: 11px;
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
  }

  .message-block:hover .copy-btn,
  .message-block:focus-within .copy-btn {
    opacity: 1;
  }

  .copy-btn:hover {
    color: oklch(var(--color-cli-text));
  }

  .copy-btn.copied {
    opacity: 1;
    border-color: oklch(var(--color-cli-success));
    color: oklch(var(--color-cli-success));
  }

  .copy-btn.error {
    opacity: 1;
    border-color: oklch(var(--color-cli-error));
    color: oklch(var(--color-cli-error));
  }

  @media (max-width: 520px) {
    .copy-btn {
      opacity: 1;
      padding: 6px 12px;
      font-size: 12px;
    }
  }

</style>
