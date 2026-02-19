<script lang="ts">
  export let tone: "neutral" | "success" | "warning" | "error" = "neutral";
</script>

<span
  class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-sans text-xs font-medium leading-snug"
  class:border-cli-border={tone === "neutral"}
  class:text-cli-text-dim={tone === "neutral"}
  class:bg-cli-bg-elevated={tone === "neutral"}
  class:border-cli-success-opacity={tone === "success"}
  class:text-cli-success={tone === "success"}
  class:bg-cli-success-low={tone === "success"}
  class:border-cli-warning-opacity={tone === "warning"}
  class:text-cli-warning={tone === "warning"}
  class:bg-cli-warning-low={tone === "warning"}
  class:border-cli-error-opacity={tone === "error"}
  class:text-cli-error={tone === "error"}
  class:bg-cli-error-low={tone === "error"}
>
  <slot />
</span>

<style>
  /* Custom utility-like classes for color-mix that Tailwind doesn't support natively cleanly yet */
  .border-cli-success-opacity {
    border-color: color-mix(in srgb, var(--color-cli-success) 50%, var(--color-cli-border));
  }
  .bg-cli-success-low {
    background: color-mix(in srgb, var(--color-cli-success) 10%, transparent);
  }
  
  .border-cli-warning-opacity {
    border-color: color-mix(in srgb, var(--color-cli-warning) 50%, var(--color-cli-border));
  }
  .bg-cli-warning-low {
    background: color-mix(in srgb, var(--color-cli-warning) 12%, transparent);
  }

  .border-cli-error-opacity {
    border-color: color-mix(in srgb, var(--color-cli-error) 50%, var(--color-cli-border));
  }
  .bg-cli-error-low {
    background: color-mix(in srgb, var(--color-cli-error) 12%, transparent);
  }
</style>
