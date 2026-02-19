<script lang="ts">
  import StatCard from '../lib/components/charts/StatCard.svelte';
  import BarChart from '../lib/components/charts/BarChart.svelte';
  import DonutChart from '../lib/components/charts/DonutChart.svelte';
  
  interface MetricsData {
    range: string;
    totals: {
      tokens: number;
      cost: number;
      threads: number;
    };
    byProvider: Array<{
      provider: string;
      tokens: number;
      cost: number;
      threads: number;
    }>;
    dailyUsage: Array<{
      day: string;
      provider: string;
      tokens: number;
    }>;
  }
  
  let selectedRange = $state('7d');
  let metricsData = $state<MetricsData | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  
  async function fetchMetrics() {
    loading = true;
    error = null;
    
    try {
      const res = await fetch(`/api/metrics?range=${selectedRange}`);
      if (!res.ok) throw new Error('Failed to fetch metrics');
      
      metricsData = await res.json();
    } catch (err: any) {
      error = err.message;
      console.error('Metrics fetch error:', err);
    } finally {
      loading = false;
    }
  }
  
  $effect(() => {
    fetchMetrics();
  });
  
  function formatCost(cost: number): string {
    return `$${cost.toFixed(4)}`;
  }
  
  function formatNumber(num: number): string {
    return num.toLocaleString();
  }
  
  const dailyChartData = $derived.by(() => {
    if (!metricsData) return [];
    
    // Aggregate by day across providers
    const byDay = metricsData.dailyUsage.reduce((acc, row) => {
      if (!acc[row.day]) acc[row.day] = 0;
      acc[row.day] += row.tokens;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(byDay).map(([day, tokens]) => ({
      label: day.split('-').slice(1).join('/'), // MM/DD format
      value: tokens
    }));
  });
  
  const providerChartData = $derived.by(() => {
    if (!metricsData) return [];
    
    return metricsData.byProvider.map(p => ({
      label: p.provider || 'Unknown',
      value: p.tokens,
      color: undefined // Auto-generate colors
    }));
  });
</script>

<div class="metrics-container">
  <header class="metrics-header">
    <h1>Metrics Dashboard</h1>
    
    <div class="filter-chips">
      {#each ['24h', '7d', '30d', 'all'] as range}
        <button
          class="filter-chip"
          class:active={selectedRange === range}
          onclick={() => { selectedRange = range; }}
        >
          {range === 'all' ? 'All Time' : range}
        </button>
      {/each}
    </div>
  </header>
  
  {#if loading && !metricsData}
    <p>Loading metrics...</p>
  {:else if error}
    <p class="error">Error: {error}</p>
  {:else if !metricsData}
    <p>No data available</p>
  {:else if metricsData.totals.tokens === 0}
    <div class="empty-state">
      <StatCard
        title="Total Tokens"
        value="0"
        subtitle="Across all providers"
        icon="📊"
      />
      <p style="margin-top: 2rem">No activity yet. Start a thread to see metrics.</p>
    </div>
  {:else}
    <div class="stats-grid">
      <StatCard
        title="Total Tokens"
        value={formatNumber(metricsData.totals.tokens)}
        subtitle="Across all providers"
        icon="📊"
      />
      
      <StatCard
        title="Estimated Cost"
        value={formatCost(metricsData.totals.cost)}
        subtitle="Based on provider pricing"
        icon="💰"
      />
      
      <StatCard
        title="Active Threads"
        value={formatNumber(metricsData.totals.threads)}
        subtitle="Total conversations"
        icon="💬"
      />
    </div>
    
    <div class="charts-grid">
      <BarChart
        data={dailyChartData}
        title="Daily Token Usage"
      />
      
      <DonutChart
        data={providerChartData}
        title="Token Usage by Provider"
      />
    </div>
  {/if}
</div>

<style>
  .metrics-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  .metrics-header {
    margin-bottom: 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }
  
  .metrics-header h1 {
    font-size: 2rem;
    font-weight: 700;
    margin: 0;
  }
  
  .filter-chips {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  
  .filter-chip {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
    border-radius: 1.5rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s;
    color: var(--text-primary);
  }
  
  .filter-chip:hover {
    background: var(--bg-tertiary);
  }
  
  .filter-chip.active {
    background: var(--accent-color);
    color: white;
    border-color: var(--accent-color);
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  
  .charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 1rem;
  }
  
  @media (max-width: 640px) {
    .metrics-container {
      padding: 1rem;
    }
    
    .stats-grid {
      grid-template-columns: 1fr;
    }
    
    .charts-grid {
      grid-template-columns: 1fr;
    }
  }
  
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-secondary);
  }
  
  .error {
    color: var(--error-color);
    padding: 1rem;
    border: 1px solid var(--error-color);
    border-radius: 0.5rem;
  }
</style>
