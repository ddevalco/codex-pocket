<script lang="ts">
  import ShimmerDot from "../ShimmerDot.svelte";

  interface Props {
    text: string;
    prefix: string;
    colorClass: string;
  }

  const { text, prefix, colorClass }: Props = $props();
</script>

<div class="flex items-center gap-sm">
  <span class="flex-shrink-0 font-semibold {colorClass}">{prefix}</span>
  <div class="flex items-center gap-sm">
    <ShimmerDot color="--color-cli-prefix-tool" />
    <span class="text-cli-text-dim italic min-w-0 break-words">{text}</span>
  </div>
</div>
