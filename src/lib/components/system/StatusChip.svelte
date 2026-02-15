<script lang="ts">
  export let tone: "neutral" | "success" | "warning" | "error" = "neutral";
</script>

<span class="chip" data-tone={tone}><slot /></span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: var(--text-xs);
    line-height: 1.4;
    border: 1px solid var(--cli-border);
    color: var(--cli-text-dim);
    background: var(--cli-bg-elevated);
    font-family: var(--font-sans);
    font-weight: 500;
  }

  .chip[data-tone="success"] {
    border-color: color-mix(in srgb, var(--cli-success) 50%, var(--cli-border));
    color: var(--cli-success);
    background: color-mix(in srgb, var(--cli-success) 10%, transparent);
  }

  .chip[data-tone="warning"] {
    border-color: color-mix(in srgb, var(--cli-warning) 50%, var(--cli-border));
    color: var(--cli-warning);
    background: color-mix(in srgb, var(--cli-warning) 12%, transparent);
  }

  .chip[data-tone="error"] {
    border-color: color-mix(in srgb, var(--cli-error) 50%, var(--cli-border));
    color: var(--cli-error);
    background: color-mix(in srgb, var(--cli-error) 12%, transparent);
  }
</style>
