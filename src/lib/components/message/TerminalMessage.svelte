<script lang="ts">
  interface Props {
    text: string;
    prefix: string;
    colorClass: string;
  }

  const { text, prefix, colorClass }: Props = $props();

  const terminalLines = $derived.by(() => {
    const lines = text.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
  });
</script>

<div class="flex items-start gap-sm">
  <span class="flex-shrink-0 font-semibold {colorClass}">{prefix}</span>
  <div class="flex flex-col gap-[0.1rem]">
    {#each terminalLines as line}
      <div class="flex gap-sm">
        <span class="text-cli-text min-w-0 break-words">{line}</span>
      </div>
    {/each}
  </div>
</div>
