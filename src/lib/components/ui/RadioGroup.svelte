<script lang="ts">
  type RadioOption = {
    value: string;
    label: string;
    description?: string;
    key?: string;
  };

  interface Props {
    options: RadioOption[];
    value?: string;
    disabled?: boolean;
    orientation?: "vertical" | "horizontal";
    onchange?: (value: string) => void;
    class?: string;
  }

  const {
    options,
    value = "",
    disabled = false,
    orientation = "vertical",
    onchange,
    class: className = "",
  }: Props = $props();

  let focusedIndex = $state(0);
  let hasFocus = $state(false);
  let groupEl: HTMLDivElement | undefined = $state(undefined);

  // Sync focusedIndex when value changes externally
  $effect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) {
      focusedIndex = idx;
    }
  });

  function select(optionValue: string) {
    if (disabled) return;
    onchange?.(optionValue);
  }

  function focusOption(index: number) {
    if (!groupEl) return;
    const buttons = groupEl.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
    buttons[index]?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (disabled || options.length === 0) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const key = e.key;
    const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    const prevKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";

    if (key === nextKey || key === "ArrowDown" || key === "j") {
      e.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, options.length - 1);
      focusOption(focusedIndex);
    } else if (key === prevKey || key === "ArrowUp" || key === "k") {
      e.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      focusOption(focusedIndex);
    } else if (key === "Enter" || key === " ") {
      e.preventDefault();
      if (options[focusedIndex]) {
        select(options[focusedIndex].value);
      }
    } else {
      // Check for hotkey match
      const opt = options.find((o) => o.key?.toLowerCase() === key.toLowerCase());
      if (opt) {
        e.preventDefault();
        select(opt.value);
      }
    }
  }
</script>

<div
  class="radio-group {className}"
  class:horizontal={orientation === "horizontal"}
  role="radiogroup"
  aria-orientation={orientation}
  tabindex="-1"
  onkeydown={handleKeydown}
  onfocusin={() => (hasFocus = true)}
  onfocusout={() => (hasFocus = false)}
  bind:this={groupEl}
>
  {#each options as option, i}
    {@const isSelected = value === option.value}
    {@const isFocused = !disabled && hasFocus && focusedIndex === i}
    <button
      type="button"
      class="radio-option"
      class:selected={isSelected}
      class:focused={isFocused}
      role="radio"
      aria-checked={isSelected}
      tabindex={focusedIndex === i ? 0 : -1}
      {disabled}
      onclick={() => {
        focusedIndex = i;
        select(option.value);
      }}
    >
      <span class="radio-indicator" class:selected={isSelected}>
        {isSelected ? "\u25CF" : "\u25CB"}
      </span>
      <span class="radio-content">
        {#if option.key}
          <span class="radio-key">{option.key}</span>
        {/if}
        <span class="radio-label" class:selected={isSelected}>{option.label}</span>
        {#if option.description}
          <span class="radio-description">{option.description}</span>
        {/if}
      </span>
    </button>
  {/each}
</div>

<style>
  .radio-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .radio-group.horizontal {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .radio-option {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--color-cli-text);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
    transition: all var(--transition-fast);
    width: 100%;
  }

  .horizontal .radio-option {
    width: auto;
  }

  .radio-option:hover:not(:disabled) {
    background: var(--color-cli-bg-hover);
  }

  .radio-option:disabled {
    cursor: default;
  }

  .radio-option.focused {
    border-color: var(--color-cli-border);
    background: var(--color-cli-bg-hover);
  }

  .radio-option.selected {
    border-color: var(--color-cli-prefix-agent);
    background: color-mix(in oklch, var(--color-cli-prefix-agent), transparent 92%);
  }

  .radio-indicator {
    flex-shrink: 0;
    line-height: 1.5;
    color: var(--color-cli-text-muted);
  }

  .radio-indicator.selected {
    color: var(--color-cli-prefix-agent);
  }

  .radio-content {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .radio-key {
    color: var(--color-cli-text-muted);
    font-size: var(--text-xs);
    min-width: 1.5ch;
    text-align: center;
  }

  .radio-label {
    color: var(--color-cli-text);
    white-space: normal;
    word-break: break-word;
  }

  .radio-label.selected {
    color: var(--color-cli-prefix-agent);
  }

  .radio-description {
    color: var(--color-cli-text-muted);
    font-size: var(--text-xs);
    white-space: normal;
    word-break: break-word;
  }
</style>
