<script lang="ts">
  interface DataPoint {
    label: string;
    value: number;
  }
  
  interface Props {
    data: DataPoint[];
    title?: string;
    height?: number;
  }
  
  const { data, title, height = 200 }: Props = $props();
  
  const maxValue = $derived(Math.max(...data.map(d => d.value), 1));
</script>

<div class="chart-container">
  {#if title}
    <h3 class="chart-title">{title}</h3>
  {/if}
  
  <svg width="100%" {height} viewBox="0 0 100 {height}">
    {#each data as point, i}
      {@const barHeight = (point.value / maxValue) * (height - 30)}
      {@const barX = (i * 100) / data.length}
      {@const barWidth = 100 / data.length - 2}
      
      <rect
        x={barX}
        y={height - barHeight - 20}
        width={barWidth}
        height={barHeight}
        fill="var(--accent-color, var(--color-assistant, oklch(0.6 0.18 145)))"
        opacity="0.8"
      />
      
      <text
        x={barX + barWidth / 2}
        y={height - 5}
        text-anchor="middle"
        font-size="8"
        fill="var(--text-secondary)"
      >
        {point.label}
      </text>
    {/each}
  </svg>
</div>

<style>
  .chart-container {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    padding: 1rem;
  }
  
  .chart-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 1rem 0;
    color: var(--text-primary);
  }
</style>
