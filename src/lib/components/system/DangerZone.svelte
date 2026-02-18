<script lang="ts">
  const { children } = $props();
</script>

<div class="danger-zone stack">
  {@render children()}
</div>

<style>
  .danger-zone {
    --stack-gap: var(--space-sm);
    border: 1px solid color-mix(in srgb, var(--cli-error) 40%, var(--cli-border));
    border-radius: var(--radius-sm);
    padding: var(--space-sm);
    background: var(--cli-error-bg);
  }
</style>
