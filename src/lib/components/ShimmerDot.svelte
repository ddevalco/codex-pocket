<script lang="ts">
  interface Props {
    color?: string;
  }

  const { color = "var(--color-cli-prefix-agent)" }: Props = $props();
</script>

<span class="shimmer-dot" style:color={color}>●</span>

<style>
  .shimmer-dot {
    display: inline-block;
    animation: shimmer 2s ease-in-out infinite;
  }

  @keyframes shimmer {
    0%, 100% {
      opacity: 1;
      filter: brightness(1);
    }
    50% {
      opacity: 0.6;
      filter: brightness(1.5);
    }
  }
</style>
