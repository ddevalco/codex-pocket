<script lang="ts">
  import type { HelperAgentOutcome } from '../types';
  import Button from './ui/Button.svelte';
  
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
      <Button onclick={handleContinue}>
        Continue with: {outcome.suggestedNextStep}
      </Button>
    </div>
  {/if}
</div>

<style>
  .outcome-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-md);
    margin: var(--space-md) 0;
    background: var(--color-cli-bg-elevated);
    color: var(--color-cli-text);
  }
  
  .status-success {
    border-left: 4px solid var(--color-cli-success);
  }
  
  .status-failure {
    border-left: 4px solid var(--color-cli-error);
  }
  
  .status-partial {
    border-left: 4px solid var(--color-cli-warning);
  }
  
  .outcome-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  
  .status-icon {
    font-size: 1.5rem;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--color-cli-bg-hover);
  }
  
  /* Use direct style instead of computed class context just in case */
  :global(.status-success) .status-icon {
    color: var(--color-cli-success);
  }
  
  :global(.status-failure) .status-icon {
    color: var(--color-cli-error);
  }
  
  :global(.status-partial) .status-icon {
    color: var(--color-cli-warning);
  }
  
  .outcome-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  
  .agent-name {
    font-size: var(--text-base);
    font-weight: var(--font-weight-semibold);
  }
  
  .status-label {
    font-size: var(--text-sm);
    color: var(--color-cli-text-muted);
    text-transform: capitalize;
  }
  
  .outcome-summary {
    color: var(--color-cli-text);
    margin-bottom: var(--space-md);
    line-height: 1.5;
  }
  
  .touched-files {
    margin-bottom: var(--space-md);
  }
  
  .touched-files h4 {
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--space-sm);
    color: var(--color-cli-text-muted);
  }
  
  .touched-files ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .touched-files li {
    margin-bottom: var(--space-xs);
  }
  
  .file-link {
    background: none;
    border: none;
    color: var(--color-cli-prefix-agent);
    cursor: pointer;
    text-align: left;
    padding: var(--space-xs);
    font-size: var(--text-sm);
    font-family: 'SF Mono', 'Monaco', monospace;
  }
  
  .file-link:hover {
    text-decoration: underline;
  }
  
  .expand-files {
    background: none;
    border: none;
    color: var(--color-cli-prefix-agent);
    cursor: pointer;
    font-size: var(--text-sm);
    padding: var(--space-xs);
    margin-top: var(--space-xs);
  }
  
  .expand-files:hover {
    text-decoration: underline;
  }
  
  .outcome-actions {
    display: flex;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
  }
  
  .continue-button {
    background: var(--color-cli-prefix-agent);
    color: white;
    border: none;
    padding: var(--space-3) var(--space-md);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
  }
  
  .continue-button:hover {
    opacity: 0.9;
  }
</style>
