<script lang="ts">
  import type { HelperAgentOutcome } from '../types';
  
  interface Props {
    outcome: HelperAgentOutcome;
    onContinue?: (text: string) => void;
    onFileClick?: (filePath: string) => void;
  }
  
  const { outcome, onContinue, onFileClick }: Props = $props();
  
  let expanded = $state(false);
  
  const statusIcon = $derived(() => {
    switch (outcome.status) {
      case 'success': return '✓';
      case 'failure': return '✗';
      case 'partial': return '⚠';
      default: return '•';
    }
  });
  
  const statusClass = $derived(() => {
    switch (outcome.status) {
      case 'success': return 'status-success';
      case 'failure': return 'status-failure';
      case 'partial': return 'status-partial';
      default: return '';
    }
  });
  
  const visibleFiles = $derived(() => {
    return expanded ? outcome.touchedFiles : outcome.touchedFiles.slice(0, 5);
  });
  
  const remainingCount = $derived(() => {
    return Math.max(0, outcome.touchedFiles.length - 5);
  });
  
  function handleContinue() {
    if (outcome.suggestedNextStep && onContinue) {
      onContinue(outcome.suggestedNextStep);
    }
  }
  
  function handleFileClick(filePath: string) {
    if (onFileClick) {
      onFileClick(filePath);
    }
  }
</script>

<div class="outcome-card {statusClass()}">
  <div class="outcome-header">
    <span class="status-icon">{statusIcon()}</span>
    <div class="outcome-info">
      <strong class="agent-name">{outcome.agentName}</strong>
      <span class="status-label">{outcome.status}</span>
    </div>
  </div>
  
  <div class="outcome-summary">
    {outcome.summary}
  </div>
  
  {#if outcome.touchedFiles.length > 0}
    <div class="touched-files">
      <h4>Touched Files:</h4>
      <ul>
        {#each visibleFiles() as file}
          <li>
            <button
              class="file-link"
              onclick={() => handleFileClick(file)}
            >
              {file}
            </button>
          </li>
        {/each}
      </ul>
      
      {#if !expanded && remainingCount() > 0}
        <button
          class="expand-files"
          onclick={() => expanded = true}
        >
          +{remainingCount()} more
        </button>
      {/if}
    </div>
  {/if}
  
  {#if outcome.suggestedNextStep}
    <div class="outcome-actions">
      <button
        class="continue-button"
        onclick={handleContinue}
      >
        Continue with: {outcome.suggestedNextStep}
      </button>
    </div>
  {/if}
</div>

<style>
  .outcome-card {
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    padding: 1rem;
    margin: 1rem 0;
    background: var(--bg-secondary, #2a2a2a);
    color: var(--text-primary, #fff);
  }
  
  .status-success {
    border-left: 4px solid var(--success-color, #22c55e);
  }
  
  .status-failure {
    border-left: 4px solid var(--error-color, #ef4444);
  }
  
  .status-partial {
    border-left: 4px solid var(--warning-color, #f59e0b);
  }
  
  .outcome-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  
  .status-icon {
    font-size: 1.5rem;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--bg-tertiary, #3a3a3a);
  }
  
  /* Use direct style instead of computed class context just in case */
  :global(.status-success) .status-icon {
    color: var(--success-color, #22c55e);
  }
  
  :global(.status-failure) .status-icon {
    color: var(--error-color, #ef4444);
  }
  
  :global(.status-partial) .status-icon {
    color: var(--warning-color, #f59e0b);
  }
  
  .outcome-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .agent-name {
    font-size: 1rem;
    font-weight: 600;
  }
  
  .status-label {
    font-size: 0.875rem;
    color: var(--text-secondary, #aaa);
    text-transform: capitalize;
  }
  
  .outcome-summary {
    color: var(--text-primary, #fff);
    margin-bottom: 1rem;
    line-height: 1.5;
  }
  
  .touched-files {
    margin-bottom: 1rem;
  }
  
  .touched-files h4 {
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: var(--text-secondary, #aaa);
  }
  
  .touched-files ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .touched-files li {
    margin-bottom: 0.25rem;
  }
  
  .file-link {
    background: none;
    border: none;
    color: var(--link-color, #3b82f6);
    cursor: pointer;
    text-align: left;
    padding: 0.25rem;
    font-size: 0.875rem;
    font-family: 'SF Mono', 'Monaco', monospace;
  }
  
  .file-link:hover {
    text-decoration: underline;
  }
  
  .expand-files {
    background: none;
    border: none;
    color: var(--link-color, #3b82f6);
    cursor: pointer;
    font-size: 0.875rem;
    padding: 0.25rem;
    margin-top: 0.25rem;
  }
  
  .expand-files:hover {
    text-decoration: underline;
  }
  
  .outcome-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  
  .continue-button {
    background: var(--accent-color, #3b82f6);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .continue-button:hover {
    opacity: 0.9;
  }
</style>
