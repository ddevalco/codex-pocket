<script lang="ts">
  import { marked } from "marked";
  import DOMPurify from "dompurify";

  interface Props {
    text: string;
    prefix: string;
    colorClass: string;
  }

  const { text, prefix, colorClass }: Props = $props();

  const renderedHtml = $derived.by(() => {
    const raw = text ?? "";
    try {
      const html = marked.parse(raw, {
        async: false,
        breaks: true,
      }) as string;

      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          "a", "p", "br", "strong", "em", "code", "pre", "blockquote",
          "ul", "ol", "li", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "img",
        ],
        ALLOWED_ATTR: ["href", "title", "src", "alt"],
      });
    } catch {
      return DOMPurify.sanitize(raw);
    }
  });
</script>

<div class="flex items-start gap-sm">
  <span class="flex-shrink-0 font-semibold {colorClass}">{prefix}</span>
  <div class="text-cli-text min-w-0 break-words markdown">{@html renderedHtml}</div>
</div>

<style>
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
