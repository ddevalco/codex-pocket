<script lang="ts">
  import { untrack } from "svelte";
  import { marked } from "marked";
  import DOMPurify from "dompurify";
  import ShimmerText from "./ShimmerText.svelte";

  interface Props {
    /** The reasoning text content */
    content: string;
    /** Whether the model is currently streaming reasoning */
    isStreaming?: boolean;
    /** Whether the collapsible starts open */
    defaultOpen?: boolean;
  }

  const {
    content,
    isStreaming = false,
    defaultOpen = true
  }: Props = $props();

  let isOpen = $state(untrack(() => defaultOpen));
  let hasAutoClosed = $state(false);
  let wasStreaming = $state(false);

  const AUTO_CLOSE_DELAY = 1000;

  // Track when streaming ends for auto-close
  $effect(() => {
    if (isStreaming) {
      wasStreaming = true;
    } else if (wasStreaming && isOpen && !hasAutoClosed) {
      const timer = setTimeout(() => {
        isOpen = false;
        hasAutoClosed = true;
      }, AUTO_CLOSE_DELAY);

      return () => clearTimeout(timer);
    }
  });

  function toggle() {
    isOpen = !isOpen;
  }

  const renderedHtml = $derived.by(() => {
    const raw = content ?? "";
    try {
      const html = marked.parse(raw, {
        async: false,
        breaks: true,
      }) as string;
      return DOMPurify.sanitize(html, {
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
        ],
        ALLOWED_ATTR: ["href", "title"],
      });
    } catch {
      return DOMPurify.sanitize(raw);
    }
  });
</script>

<div class="font-mono text-sm">
  <button class="flex w-full cursor-pointer items-center gap-sm border-none bg-transparent py-xs text-left font-inherit text-inherit text-cli-text-dim transition-colors hover:text-cli-text" onclick={toggle} type="button">
    <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
    <span class="min-w-0 flex-1 px-sm">
      {#if isStreaming}
        <span class="inline-block">
          <ShimmerText text="Thinking..." duration={1} />
        </span>
      {:else}
        Thought for a few seconds
      {/if}
    </span>
    <svg
      class="ml-auto h-4 w-4 shrink-0 transition-transform duration-200"
      class:rotate-180={isOpen}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="m6 9 6 6 6-6"/>
    </svg>
  </button>

  {#if isOpen}
    <div class="reasoning-content mt-sm" class:streaming={isStreaming} style:animation="slideIn var(--transition-fast, 0.2s) ease">
      <div class="markdown m-0 break-words leading-relaxed text-cli-text-dim">{@html renderedHtml}</div>
    </div>
  {/if}
</div>

<style>
  .reasoning-content {
    padding-left: calc(1rem + var(--space-sm));
    border-left: 2px solid transparent;
    transition: border-left-color var(--transition-fast, 0.2s) ease;
  }

  .reasoning-content.streaming {
    border-left-color: var(--color-cli-accent, oklch(0.7 0.15 250));
  }

  .markdown :global(p) {
    margin: 0;
  }

  .markdown :global(pre) {
    margin: 0;
    padding: var(--space-sm);
    background: color-mix(in oklch, black, transparent 65%);
    border: 1px solid color-mix(in oklch, white, transparent 92%);
    border-radius: var(--radius-sm);
    overflow: auto;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
