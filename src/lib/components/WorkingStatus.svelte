<script lang="ts">
  import ShimmerDot from "./ShimmerDot.svelte";
  import type { PlanStep } from "../types";

  interface Props {
    detail?: string | null;
    plan?: PlanStep[];
    startTime?: number;
  }

  const { detail = null, plan = [], startTime }: Props = $props();

  let elapsed = $state(0);

  $effect(() => {
    if (!startTime) {
      elapsed = 0;
      return;
    }

    elapsed = Math.floor((Date.now() - startTime) / 1000);

    const interval = setInterval(() => {
      elapsed = Math.floor((Date.now() - startTime) / 1000);
    }, 1000);

    return () => clearInterval(interval);
  });

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const currentStep = $derived(plan.find(s => s.status === "InProgress")?.step || detail);
</script>

<div class="px-md py-sm font-mono text-sm">
  <div class="flex items-center gap-sm text-cli-text">
    <ShimmerDot color="var(--color-cli-prefix-agent)" />
    <span class="font-medium">Working</span>
    {#if currentStep}
      <span class="text-cli-text-dim flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{currentStep}</span>
    {/if}
    {#if startTime}
      <span class="text-cli-text-muted text-xs">(+{formatTime(elapsed)})</span>
    {/if}
  </div>

  {#if plan.length > 0}
    <div class="mt-sm ml-lg">
      {#each plan as step}
        <div class="flex items-center gap-sm py-xs text-cli-text-muted" class:text-cli-text-dim={step.status === "Completed"} class:text-cli-text={step.status === "InProgress"}>
          <span class="w-[1ch] text-center" class:text-cli-success={step.status === "Completed"} class:text-cli-prefix-agent={step.status === "InProgress"}>
            {#if step.status === "Completed"}
              ✓
            {:else if step.status === "InProgress"}
              ›
            {:else}
              ○
            {/if}
          </span>
          <span class="flex-1">{step.step}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
