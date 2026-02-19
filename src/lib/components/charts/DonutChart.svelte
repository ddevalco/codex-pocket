<script lang="ts">
  interface DataPoint {
    label: string;
    value: number;
    color?: string;
  }
  
  interface Props {
    data: DataPoint[];
    title?: string;
  }
  
  const { data, title }: Props = $props();
  
  const total = $derived(data.reduce((sum, d) => sum + d.value, 0));
  
  const segments = $derived.by(() => {
    let currentAngle = 0;
    return data.map((point, i) => {
      const percentage = total > 0 ? point.value / total : 0;
      const angle = percentage * 360;
      const startAngle = currentAngle;
      currentAngle += angle;
      
      return {
        ...point,
        percentage: Math.round(percentage * 100),
        startAngle,
        endAngle: currentAngle,
        color: point.color || `hsl(${i * 137.5}, 70%, 60%)`
      };
    });
  });
  
  function polarToCartesian(angle: number, radius: number = 40): {x: number, y: number} {
    const angleRad = (angle - 90) * Math.PI / 180;
    return {
      x: 50 + radius * Math.cos(angleRad),
      y: 50 + radius * Math.sin(angleRad)
    };
  }
  
  function getPath(start: number, end: number): string {
    const startPoint = polarToCartesian(start);
    const endPoint = polarToCartesian(end);
    const largeArc = end - start > 180 ? 1 : 0;
    
    // If it's a full circle, SVG arc path behaves weirdly, so check for that
    if (end - start >= 359.9) {
      return `M 50 10 
              A 40 40 0 1 1 50 90 
              A 40 40 0 1 1 50 10`;
    }

    return `
      M 50 50
      L ${startPoint.x} ${startPoint.y}
      A 40 40 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y}
      Z
    `;
  }
</script>

<div class="chart-container">
  {#if title}
    <h3 class="chart-title">{title}</h3>
  {/if}
  
  <div class="donut-chart">
    <svg viewBox="0 0 100 100" width="100%" height="200">
      {#each segments as segment}
        <path
          d={getPath(segment.startAngle, segment.endAngle)}
          fill={segment.color}
          opacity="0.8"
        />
      {/each}
      
      <!-- Center hole -->
      <circle cx="50" cy="50" r="25" fill="var(--bg-secondary)" />
    </svg>
    
    <div class="legend">
      {#each segments as segment}
        <div class="legend-item">
          <span class="legend-color" style="background-color: {segment.color}"></span>
          <span class="legend-label">{segment.label}</span>
          <span class="legend-value">{segment.percentage}%</span>
        </div>
      {/each}
    </div>
  </div>
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
  }
  
  .donut-chart {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 1rem;
    align-items: center;
  }
  
  @media (max-width: 640px) {
    .donut-chart {
      grid-template-columns: 1fr;
    }
  }
  
  .legend {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }
  
  .legend-color {
    width: 1rem;
    height: 1rem;
    border-radius: 0.25rem;
  }
  
  .legend-label {
    flex: 1;
  }
  
  .legend-value {
    font-weight: 600;
  }
</style>
