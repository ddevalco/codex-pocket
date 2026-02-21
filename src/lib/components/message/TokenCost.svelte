<script lang="ts">
  interface Props {
    totalTokens: number;
    estimatedCost?: number;
  }

  const { totalTokens, estimatedCost }: Props = $props();

  function formatTokenCount(tokens: number): string {
    if (!Number.isFinite(tokens)) return '—';
    if (tokens >= 1000) {
      const compact = (tokens / 1000).toFixed(1);
      return `${compact.replace(/\.0$/, "")}K`;
    }
    return tokens.toLocaleString();
  }
</script>

<div class="ml-[calc(var(--space-md)+12px)] mt-xs text-[0.8em] text-cli-text-muted flex gap-xs items-center" aria-live="polite">
  <span>{formatTokenCount(totalTokens)} tokens</span>
  {#if typeof estimatedCost === "number"}
    <span class="opacity-60">·</span>
    <span>${estimatedCost.toFixed(4)}</span>
  {/if}
</div>
