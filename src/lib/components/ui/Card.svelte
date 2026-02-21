<script lang="ts">
  import type { Snippet } from "svelte";

  type CardVariant = "default" | "muted" | "tool";

  interface Props {
    variant?: CardVariant;
    class?: string;
    children: Snippet;
    header?: Snippet;
    footer?: Snippet;
  }

  const {
    variant = "default",
    class: className = "",
    children,
    header,
    footer,
  }: Props = $props();

  const variantClass = $derived.by(() => {
    switch (variant) {
      case "default":
        return "card-default";
      case "muted":
        return "card-muted";
      case "tool":
        return "card-tool";
      default:
        return "card-default";
    }
  });
</script>

<div class="card {variantClass} {className}">
  {#if header}
    <div class="card-header">
      {@render header()}
    </div>
  {/if}

  <div class="card-body">
    {@render children()}
  </div>

  {#if footer}
    <div class="card-footer">
      {@render footer()}
    </div>
  {/if}
</div>

<style>
  .card {
    border: 1px solid var(--color-cli-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  /* Variants */
  .card-default {
    background: var(--color-cli-bg-elevated);
  }

  .card-muted {
    background: var(--color-cli-bg);
  }

  .card-tool {
    background: var(--color-cli-bg-elevated);
  }

  /* Header */
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--color-cli-border);
  }

  .card-muted > .card-header {
    background: var(--color-cli-bg-elevated);
  }

  .card-tool > .card-header {
    transition: background var(--transition-fast);
  }

  .card-tool > .card-header:hover {
    background: var(--color-cli-bg-hover);
  }

  /* Body */
  .card-body {
    padding: var(--space-sm) var(--space-md);
  }

  /* Footer */
  .card-footer {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-top: 1px solid var(--color-cli-border);
  }
</style>
