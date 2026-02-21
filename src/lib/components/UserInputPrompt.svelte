<script lang="ts">
  import type { UserInputRequest } from "../types";
  import Button from "./ui/Button.svelte";

  interface Props {
    request: UserInputRequest;
    onSubmit: (answers: Record<string, string[]>) => void;
  }

  const { request, onSubmit }: Props = $props();

  let selections = $state<Record<string, string[]>>({});
  const textInputs = $state<Record<string, string>>({});
  let focusedQuestion = $state(0);
  let focusedOption = $state(0);

  const questions = $derived(request.questions);

  const canSubmit = $derived.by(() => {
    if (request.status !== "pending") return false;
    for (const q of questions) {
      if (q.options && q.options.length > 0) {
        if (!selections[q.id] || selections[q.id].length === 0) return false;
      } else {
        if (!textInputs[q.id]?.trim()) return false;
      }
    }
    return true;
  });

  function selectOption(questionId: string, label: string) {
    if (request.status !== "pending") return;
    selections = { ...selections, [questionId]: [label] };
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const answers: Record<string, string[]> = {};
    for (const q of questions) {
      if (q.options && q.options.length > 0) {
        answers[q.id] = selections[q.id] || [];
      } else {
        answers[q.id] = [textInputs[q.id]?.trim() || ""];
      }
    }
    onSubmit(answers);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (request.status !== "pending") return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const q = questions[focusedQuestion];
    if (!q?.options?.length) return;

    const key = e.key;
    if (key === "ArrowDown" || key === "j") {
      e.preventDefault();
      if (focusedOption < q.options.length - 1) {
        focusedOption++;
      } else if (focusedQuestion < questions.length - 1) {
        focusedQuestion++;
        focusedOption = 0;
      }
    } else if (key === "ArrowUp" || key === "k") {
      e.preventDefault();
      if (focusedOption > 0) {
        focusedOption--;
      } else if (focusedQuestion > 0) {
        focusedQuestion--;
        const prevQ = questions[focusedQuestion];
        focusedOption = (prevQ.options?.length ?? 1) - 1;
      }
    } else if (key === "Enter" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (q.options[focusedOption]) {
        selectOption(q.id, q.options[focusedOption].label);
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="my-xs mx-md border border-cli-border rounded-md bg-cli-bg-elevated font-mono text-sm overflow-hidden" class:opacity-60={request.status !== "pending"}>
  <div class="py-sm px-md border-b border-cli-border">
    <span class="text-cli-prefix-agent text-xs font-semibold uppercase tracking-wider">Questions</span>
  </div>

  {#each questions as question, qi}
    <div class="flex flex-col gap-xs py-sm px-md" class:border-t={qi > 0} class:border-cli-border={qi > 0}>
      <div class="text-cli-text font-medium">{question.header || question.question}</div>

      {#if question.header && question.question !== question.header}
        <div class="text-cli-text-dim text-xs">{question.question}</div>
      {/if}

      {#if question.options && question.options.length > 0}
        <div class="flex flex-col gap-[2px] mt-xs">
          {#each question.options as option, oi}
            {@const isSelected = selections[question.id]?.includes(option.label)}
            {@const isFocused = request.status === "pending" && focusedQuestion === qi && focusedOption === oi}
            <button
              type="button"
              class="flex items-start gap-sm py-xs px-sm bg-transparent border border-transparent rounded-sm text-cli-text font-mono text-sm text-left cursor-pointer transition-all duration-200 w-full hover:bg-cli-bg-hover disabled:cursor-default"
              class:border-cli-border={isFocused}
              class:bg-cli-bg-hover={isFocused}
              class:border-cli-prefix-agent={isSelected}
              style:background-color={isSelected ? "color-mix(in oklch, var(--cli-prefix-agent), transparent 92%)" : ""}
              onclick={() => {
                focusedQuestion = qi;
                focusedOption = oi;
                selectOption(question.id, option.label);
              }}
              disabled={request.status !== "pending"}
            >
              <span class="flex-shrink-0 leading-relaxed text-cli-text-muted" class:text-cli-prefix-agent={isSelected}>{isSelected ? "●" : "○"}</span>
              <span class="flex flex-col gap-[1px] min-w-0">
                <span class="text-cli-text whitespace-normal break-words" class:text-cli-prefix-agent={isSelected}>{option.label}</span>
                {#if option.description}
                  <span class="text-cli-text-muted text-xs whitespace-normal break-words">{option.description}</span>
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="mt-xs">
          <input
            type={question.isSecret ? "password" : "text"}
            class="w-full py-xs px-sm bg-cli-bg border border-cli-border rounded-sm text-cli-text font-mono text-sm box-border focus:outline-none focus:border-cli-prefix-agent disabled:opacity-50"
            placeholder="Type your answer..."
            bind:value={textInputs[question.id]}
            disabled={request.status !== "pending"}
          />
        </div>
      {/if}
    </div>
  {/each}

  <div class="py-sm px-md border-t border-cli-border flex items-center">
    {#if request.status === "pending"}
      <Button size="sm" disabled={!canSubmit} onclick={handleSubmit}>Submit</Button>
    {:else}
      <span class="text-cli-success text-xs font-semibold">Answered</span>
    {/if}
  </div>
</div>

<style>
</style>
