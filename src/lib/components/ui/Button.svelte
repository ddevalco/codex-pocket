<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  type ButtonVariant = "default" | "destructive" | "outline" | "ghost" | "success";
  type ButtonSize = "sm" | "md" | "lg";

  interface Props extends HTMLButtonAttributes {
    variant?: ButtonVariant;
    size?: ButtonSize;
    children: Snippet;
  }

  const {
    variant = "default",
    size = "md",
    children,
    class: className = "",
    disabled = false,
    ...rest
  }: Props = $props();

  const variantClass = $derived.by(() => {
    switch (variant) {
      case "default":
        return "btn-default";
      case "destructive":
        return "btn-destructive";
      case "outline":
        return "btn-outline";
      case "ghost":
        return "btn-ghost";
      case "success":
        return "btn-success";
      default:
        return "btn-default";
    }
  });

  const sizeClass = $derived.by(() => {
    switch (size) {
      case "sm":
        return "btn-sm";
      case "md":
        return "btn-md";
      case "lg":
        return "btn-lg";
      default:
        return "btn-md";
    }
  });
</script>

<button
  class="btn {variantClass} {sizeClass} {className}"
  {disabled}
  {...rest}
>
  {@render children()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    border: none;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-weight: 500;
    cursor: pointer;
    transition: opacity var(--transition-fast), background var(--transition-fast);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Sizes */
  .btn-sm {
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--text-xs);
    line-height: 1;
  }

  .btn-md {
    padding: var(--space-xs) var(--space-md);
    font-size: var(--text-xs);
    line-height: 1.4;
  }

  .btn-lg {
    padding: var(--space-sm) var(--space-lg);
    font-size: var(--text-sm);
    line-height: 1.4;
  }

  /* Variants */
  .btn-default {
    background: var(--color-cli-prefix-agent);
    color: var(--color-cli-bg);
  }

  .btn-default:hover:not(:disabled) {
    opacity: 0.85;
  }

  .btn-destructive {
    background: var(--color-btn-danger-bg);
    color: var(--color-btn-danger-text);
  }

  .btn-destructive:hover:not(:disabled) {
    opacity: 0.85;
  }

  .btn-outline {
    background: transparent;
    color: var(--color-cli-text);
    border: 1px solid var(--color-cli-border);
  }

  .btn-outline:hover:not(:disabled) {
    border-color: var(--color-cli-text-muted);
    background: var(--color-cli-bg-hover);
  }

  .btn-ghost {
    background: transparent;
    color: var(--color-cli-text);
    border: 1px solid transparent;
  }

  .btn-ghost:hover:not(:disabled) {
    background: var(--color-cli-bg-hover);
  }

  .btn-success {
    background: var(--color-btn-success-bg);
    color: var(--color-btn-success-text);
  }

  .btn-success:hover:not(:disabled) {
    opacity: 0.85;
  }
</style>
