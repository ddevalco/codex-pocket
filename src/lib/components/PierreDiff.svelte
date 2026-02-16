<script lang="ts">
  import { onDestroy } from "svelte";
  import type { FileDiff as FileDiffInstance } from "@pierre/diffs";
  import { theme } from "../theme.svelte";

  interface Props {
    diff: string;
  }

  const { diff }: Props = $props();
  let container: HTMLDivElement | null = $state(null);
  let instances: FileDiffInstance[] = [];
  let FileDiffCtor: (new (...args: any[]) => FileDiffInstance) | null = null;
  let parsePatchFilesFn: ((input: string) => Array<{ files: unknown[] }>) | null = null;
  let loadError = false;

  async function ensurePierreLoaded() {
    if (FileDiffCtor && parsePatchFilesFn) return true;
    try {
      const mod = await import("@pierre/diffs");
      FileDiffCtor = mod.FileDiff as unknown as (new (...args: any[]) => FileDiffInstance);
      parsePatchFilesFn = mod.parsePatchFiles as unknown as (input: string) => Array<{ files: unknown[] }>;
      return true;
    } catch {
      loadError = true;
      return false;
    }
  }

  function cleanup() {
    for (const instance of instances) {
      instance.cleanUp();
    }
    instances = [];
    if (container) {
      container.innerHTML = "";
    }
  }

  function renderFallback() {
    if (!container) return;
    cleanup();
    const fallback = document.createElement("pre");
    fallback.className = "pierre-fallback";
    fallback.textContent = loadError
      ? `${diff}\n\n[Diff renderer unavailable — showing raw patch.]`
      : diff;
    container.appendChild(fallback);
  }

  async function renderDiff() {
    if (!container || !diff.trim()) return;
    cleanup();

    const ready = await ensurePierreLoaded();
    if (!ready || !container || !parsePatchFilesFn || !FileDiffCtor) {
      renderFallback();
      return;
    }

    let patches = [];
    try {
      patches = parsePatchFilesFn(diff);
    } catch {
      renderFallback();
      return;
    }
    const files = patches.flatMap((patch) => patch.files);
    if (files.length === 0) {
      renderFallback();
      return;
    }

    for (const fileDiff of files) {
      const instance = new FileDiffCtor(
        {
          theme: { light: "pierre-light", dark: "pierre-dark" },
          themeType: theme.current,
          diffStyle: "unified",
          diffIndicators: "classic",
          overflow: "wrap",
          lineDiffType: "word",
          disableFileHeader: true,
        },
        undefined,
        true,
      );
      try {
        instance.render({ fileDiff, containerWrapper: container });
      } catch {
        renderFallback();
        return;
      }
      instances.push(instance);
    }

    if (!container.querySelector("diffs-container")) {
      renderFallback();
    }
  }

  $effect(() => {
    if (!container) return;
    void renderDiff();
    return () => cleanup();
  });

  $effect(() => {
    for (const instance of instances) {
      instance.setThemeType(theme.current);
    }
  });

  onDestroy(() => cleanup());
</script>

<div class="pierre-diff stack" bind:this={container}></div>

<style>
  .pierre-diff {
    --stack-gap: var(--space-md);
  }

  :global(.pierre-fallback) {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
