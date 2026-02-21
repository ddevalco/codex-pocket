<script lang="ts">
  import type { PlanStep } from "../types";
  import ShimmerDot from "./ShimmerDot.svelte";

  interface Props {
    steps: PlanStep[];
    explanation?: string | null;
    collapsed?: boolean;
    onToggle?: () => void;
  }

  const {
    steps,
    explanation = null,
    collapsed = false,
    onToggle,
  }: Props = $props();

  const completed = $derived(steps.filter(s => s.status === "Completed").length);
  const total = $derived(steps.length);
  const progress = $derived(total > 0 ? (completed / total) * 100 : 0);
  const currentStep = $derived(steps.find(s => s.status === "InProgress"));
  const allDone = $derived(total > 0 && completed === total);
</script>

<div class="plan-progress" class:collapsed class:all-done={allDone}>
  <!-- Progress header — always visible -->
  <button class="progress-header" type="button" onclick={onToggle}>
    <span class="header-left">
      {#if allDone}
        <svg class="header-icon done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      {:else}
        <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
        </svg>
      {/if}
      <span class="header-label">{allDone ? "Plan Complete" : "Plan"}</span>
      <span class="step-count">{completed}/{total}</span>
    </span>
    <span class="header-right">
      {#if collapsed && currentStep}
        <span class="current-step-hint">{currentStep.step}</span>
      {/if}
      <svg
        class="chevron"
        class:open={!collapsed}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="m6 9 6 6 6-6"/>
      </svg>
    </span>
  </button>

  <!-- Progress bar -->
  <div class="progress-bar-track">
    <div
      class="progress-bar-fill"
      class:complete={allDone}
      style="width: {progress}%"
    ></div>
  </div>

  <!-- Expanded content -->
  {#if !collapsed}
    <div class="progress-body">
      {#if explanation}
        <p class="plan-explanation">{explanation}</p>
      {/if}

      <ol class="step-list">
        {#each steps as step, idx (step.step)}
          <li
            class="step-item"
            class:completed={step.status === "Completed"}
            class:active={step.status === "InProgress"}
            class:pending={step.status === "Pending"}
          >
            <span class="step-marker">
              {#if step.status === "Completed"}
                <svg class="marker-icon check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              {:else if step.status === "InProgress"}
                <ShimmerDot color="var(--color-cli-prefix-agent)" />
              {:else}
                <span class="marker-dot"></span>
              {/if}
              {#if idx < steps.length - 1}
                <span
                  class="connector"
                  class:filled={step.status === "Completed"}
                ></span>
              {/if}
            </span>
            <span class="step-text">{step.step}</span>
          </li>
        {/each}
      </ol>
    </div>
  {/if}
</div>

<style>
  /* Container */
  .plan-progress {
    margin: var(--space-xs) var(--space-md);
    border: 1px solid var(--color-cli-border);
    border-radius: var(--radius-md);
    background: var(--color-cli-bg-elevated);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    overflow: hidden;
    transition: border-color var(--transition-normal);
  }

  .plan-progress.all-done {
    border-color: color-mix(in oklch, var(--color-cli-success) 40%, var(--color-cli-border));
  }

  /* Header */
  .progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: transparent;
    color: var(--color-cli-text);
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .progress-header:hover {
    background: var(--color-cli-bg-hover);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .header-icon {
    width: 1rem;
    height: 1rem;
    color: var(--color-cli-prefix-agent);
    flex-shrink: 0;
  }

  .header-icon.done {
    color: var(--color-cli-success);
  }

  .header-label {
    color: var(--color-cli-prefix-agent);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .all-done .header-label {
    color: var(--color-cli-success);
  }

  .step-count {
    color: var(--color-cli-text-muted);
    font-size: var(--text-xs);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-width: 0;
  }

  .current-step-hint {
    color: var(--color-cli-text-dim);
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .chevron {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    color: var(--color-cli-text-dim);
    transition: transform 0.2s ease;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  /* Progress bar */
  .progress-bar-track {
    height: 2px;
    background: var(--color-cli-border);
  }

  .progress-bar-fill {
    height: 100%;
    background: var(--color-cli-prefix-agent);
    transition: width 0.4s ease;
  }

  .progress-bar-fill.complete {
    background: var(--color-cli-success);
  }

  /* Body */
  .progress-body {
    padding: var(--space-sm) var(--space-md) var(--space-md);
  }

  .plan-explanation {
    margin: 0 0 var(--space-sm);
    color: var(--color-cli-text-dim);
    font-size: var(--text-xs);
    line-height: 1.5;
  }

  /* Step list */
  .step-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .step-item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    min-height: 1.75rem;
  }

  /* Step marker column */
  .step-marker {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 1rem;
    flex-shrink: 0;
    padding-top: 0.125rem;
  }

  .marker-icon {
    width: 0.875rem;
    height: 0.875rem;
  }

  .marker-icon.check {
    color: var(--color-cli-success);
  }

  .marker-dot {
    display: block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: var(--radius-full);
    border: 1.5px solid var(--color-cli-text-muted);
    margin: 0.1875rem 0;
  }

  .connector {
    flex: 1;
    width: 1.5px;
    min-height: 0.5rem;
    background: var(--color-cli-border);
    transition: background var(--transition-normal);
  }

  .connector.filled {
    background: var(--color-cli-success);
  }

  /* Step text */
  .step-text {
    color: var(--color-cli-text-muted);
    font-size: var(--text-xs);
    line-height: 1.5;
    padding-top: 0.0625rem;
  }

  .step-item.completed .step-text {
    color: var(--color-cli-text-dim);
  }

  .step-item.active .step-text {
    color: var(--color-cli-text);
    font-weight: 500;
  }
</style>
