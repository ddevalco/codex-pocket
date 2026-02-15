<script lang="ts">
  export let title = "";
  export let subtitle = "";
</script>

<section class="section stack">
  <div class="section-header">
    <div class="section-title">{title}</div>
    {#if subtitle}
      <div class="section-subtitle">{subtitle}</div>
    {/if}
  </div>
  <div class="section-body stack">
    <slot />
  </div>
</section>

<style>
  .section {
    --stack-gap: 0;
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--cli-bg);
  }

  .section-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-sm) var(--space-md);
    background: var(--cli-bg-elevated);
    border-bottom: 1px solid var(--cli-border);
  }

  .section-title {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--cli-text-dim);
    font-family: var(--font-sans);
    font-weight: 600;
  }

  .section-subtitle {
    font-size: var(--text-xs);
    color: var(--cli-text-muted);
    font-family: var(--font-sans);
  }

  .section-body {
    --stack-gap: var(--space-md);
    padding: var(--space-md);
  }
</style>
