<script lang="ts">
  interface Props {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: string;
  }
  
  const { title, value, subtitle, icon }: Props = $props();
</script>

<div class="stat-card">
  {#if icon}
    <div class="stat-icon">{icon}</div>
  {/if}
  <div class="stat-content">
    <h3 class="stat-title">{title}</h3>
    <p class="stat-value">{value}</p>
    {#if subtitle}
      <p class="stat-subtitle">{subtitle}</p>
    {/if}
  </div>
</div>

<style>
  .stat-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    padding: 1.5rem;
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  
  .stat-icon {
    font-size: 2rem;
    opacity: 0.7;
  }
  
  .stat-content {
    flex: 1;
  }
  
  .stat-title {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0 0 0.5rem 0;
    font-weight: 500;
  }
  
  .stat-value {
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0;
    color: var(--text-primary);
  }
  
  .stat-subtitle {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin: 0.25rem 0 0 0;
  }
</style>
