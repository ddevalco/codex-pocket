<script lang="ts">
  import { marked } from "marked";
  import DOMPurify from "dompurify";
  import type { Message } from "../types";
  import ShimmerDot from "./ShimmerDot.svelte";
  import Reasoning from "./Reasoning.svelte";
  import Tool from "./Tool.svelte";

  interface Props {
    message: Message;
  }

  const { message }: Props = $props();

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

  const prefixConfig = $derived.by(() => {
    if (message.role === "user") {
      return { prefix: ">", color: "var(--cli-prefix-agent)", bgClass: "user-bg" };
    }
    if (message.role === "assistant") {
      return { prefix: "•", color: "var(--cli-prefix-agent)", bgClass: "" };
    }
    if (message.role === "tool") {
      return { prefix: "•", color: "var(--cli-prefix-tool)", bgClass: "" };
    }
    return { prefix: "•", color: "var(--cli-text-dim)", bgClass: "" };
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
        headerIds: false,
        mangle: false,
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

<div class="message-block {prefixConfig.bgClass}">
  <button
    type="button"
    class="copy-btn"
    class:copied={copyState === "copied"}
    class:error={copyState === "error"}
    onclick={copyMessage}
    title={copyState === "copied" ? "Copied" : "Copy message"}
    aria-label="Copy message"
  >
    {copyState === "copied" ? "copied" : "copy"}
  </button>
  {#if isReasoning}
    <Reasoning content={message.text} defaultOpen={false} />
  {:else if isTool}
    <Tool {message} />
  {:else if isWait}
    <div class="message-line wait row">
      <span class="prefix" style:color={prefixConfig.color}>{prefixConfig.prefix}</span>
      <div class="wait-line row">
        <ShimmerDot color="var(--cli-prefix-tool)" />
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
      <span class="prefix" style:color={prefixConfig.color}>{prefixConfig.prefix}</span>
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
      <span class="prefix" style:color={prefixConfig.color}>{prefixConfig.prefix}</span>
      <div class="text markdown">{@html renderedHtml}</div>
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

  .message-block.user-bg {
    background: var(--cli-bg-user);
    border-left: 0;
    box-shadow: none;
    padding-left: var(--space-md);
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
    color: var(--cli-text-muted);
    font-size: var(--text-xs);
  }

  .prefix {
    flex-shrink: 0;
    font-weight: 600;
  }

  .text {
    color: var(--cli-text);
    word-break: break-word;
    min-width: 0;
  }

  .text.dim {
    color: var(--cli-text-dim);
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
    color: var(--cli-link);
  }

  .copy-btn {
    position: absolute;
    top: 6px;
    right: 10px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--cli-border);
    background: rgba(0, 0, 0, 0.25);
    color: var(--cli-text-muted);
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
    color: var(--cli-text);
  }

  .copy-btn.copied {
    opacity: 1;
    border-color: #2c8a5a;
    color: #9be3bf;
  }

  .copy-btn.error {
    opacity: 1;
    border-color: var(--cli-error);
    color: var(--cli-error);
  }

  @media (max-width: 520px) {
    .copy-btn {
      opacity: 1;
    }
  }

</style>
