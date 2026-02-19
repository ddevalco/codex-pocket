<script lang="ts">
  export let title = "";
  export let subtitle = "";
</script>

<section class="flex flex-col gap-0 overflow-hidden rounded-md border border-cli-border bg-cli-bg">
  <div class="flex flex-col gap-0.5 border-b border-cli-border bg-cli-bg-elevated px-md py-sm">
    <div class="font-sans text-xs font-semibold uppercase tracking-wide text-cli-text-dim">{title}</div>
    {#if subtitle}
      <div class="font-sans text-xs text-cli-text-muted">{subtitle}</div>
    {/if}
  </div>
  <div class="flex flex-col gap-md p-md">
    <slot />
  </div>
</section>
