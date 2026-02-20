<script lang="ts">
  import { untrack } from "svelte";
  import type { Message } from "../types";
  import { marked } from "marked";
  import DOMPurify from "dompurify";
  import { uiToggles } from "../uiToggles.svelte";
  import { fade } from "svelte/transition";

  interface Props {
    message: Message;
    defaultOpen?: boolean;
  }

  const { message, defaultOpen = false }: Props = $props();

  let isOpen = $state(untrack(() => defaultOpen));

  type CopyState = "idle" | "copied" | "error";
  let copyState = $state<CopyState>("idle");

  function toggle() {
    isOpen = !isOpen;
  }

  async function copyToolOutput() {
    const text = (toolInfo.content ?? "").trim();
    if (!text) return;

    const fallbackCopy = (t: string) => {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.left = "-1000px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    };

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      copyState = "copied";
    } catch {
      copyState = "error";
    } finally {
      setTimeout(() => {
        copyState = "idle";
      }, copyState === "error" ? 1600 : 1200);
    }
  }

  // Tool configuration based on kind
  const toolConfig = $derived.by(() => {
    const kind = message.kind;
    switch (kind) {
      case "command":
        return { icon: "terminal", label: "Command", colorClass: "text-cli-prefix-tool" };
      case "file":
        return { icon: "file", label: "File Change", colorClass: "text-cli-prefix-file" };
      case "mcp":
        return { icon: "plug", label: "MCP Tool", colorClass: "text-cli-prefix-mcp" };
      case "web":
        return { icon: "search", label: "Web Search", colorClass: "text-cli-prefix-web" };
      case "image":
        return { icon: "image", label: "Image", colorClass: "text-cli-prefix-image" };
      case "review":
        return { icon: "eye", label: "Review", colorClass: "text-cli-prefix-review" };
      case "plan":
        return { icon: "plan", label: "Plan", colorClass: "text-cli-prefix-agent" };
      case "collab":
        return { icon: "users", label: "Agent", colorClass: "text-cli-prefix-mcp" };
      default:
        return { icon: "wrench", label: "Tool", colorClass: "text-cli-prefix-tool" };
    }
  });

  // Parse tool-specific info
  const toolInfo = $derived.by(() => {
    const kind = message.kind;
    const text = message.text;

    if (kind === "command") {
      const lines = text.split("\n");
      const firstLine = lines[0] || "";
      if (firstLine.startsWith("$ ")) {
        return {
          title: firstLine.slice(2),
          content: lines.slice(1).join("\n"),
          exitCode: message.metadata?.exitCode
        };
      }
      return { title: "Command", content: text, exitCode: message.metadata?.exitCode };
    }

    if (kind === "file") {
      const lines = text.split("\n");
      const filePath = lines[0] || "File";
      return { title: filePath, content: lines.slice(1).join("\n") };
    }

    if (kind === "mcp") {
      const match = text.match(/^Tool:\s*(.+?)(?:\n|$)/);
      const toolName = match?.[1] || "MCP Tool";
      const content = match ? text.slice(match[0].length) : text;
      return { title: toolName, content };
    }

    if (kind === "web") {
      const match = text.match(/^Search:\s*(.+?)(?:\n|$)/);
      return { title: match?.[1] || "Web Search", content: "" };
    }

    if (kind === "image") {
      const match = text.match(/^Image:\s*(.+?)(?:\n|$)/);
      return { title: match?.[1] || "Image", content: match?.[1] || "" };
    }

    if (kind === "plan") {
      return { title: "Proposed Plan", content: text };
    }

    if (kind === "collab") {
      const lines = text.split("\n");
      return { title: lines[0] || "Agent", content: lines.slice(1).join("\n") };
    }

    return { title: text.slice(0, 50), content: text };
  });

  const renderMarkdown = $derived.by(() => {
    // Commands and file diffs are best shown verbatim.
    if (message.kind === "command" || message.kind === "file") return false;
    // These tool messages often contain markdown (e.g. **bold**, links, lists).
    return (
      message.kind === "plan" ||
      message.kind === "review" ||
      message.kind === "mcp" ||
      message.kind === "collab" ||
      message.kind === "web"
    );
  });

  const renderedToolHtml = $derived.by(() => {
    if (!renderMarkdown) return "";
    const raw = toolInfo.content ?? "";
    try {
      const html = marked.parse(raw, {
        async: false,
        breaks: true,
      }) as string;
      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          "a",
          "p",
          "br",
          "strong",
          "em",
          "code",
          "pre",
          "blockquote",
          "ul",
          "ol",
          "li",
          "hr",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
        ],
        ALLOWED_ATTR: ["href", "title"],
      });
    } catch {
      return DOMPurify.sanitize(raw);
    }
  });

  // Status based on exit code or content
  const status = $derived.by(() => {
    if (message.kind === "collab") {
      const match = message.text.match(/Status:\s*([^\n]+)/i);
      const value = (match?.[1] || "").trim().toLowerCase();
      if (value.includes("fail") || value.includes("error") || value.includes("cancel")) {
        return "error";
      }
      if (value.includes("progress") || value.includes("running") || value.includes("pending")) {
        return "running";
      }
      return "success";
    }
    if (message.kind === "command" && message.metadata?.exitCode !== undefined) {
      return message.metadata.exitCode === 0 ? "success" : "error";
    }
    return "success";
  });

  const statusConfig = $derived.by(() => {
    switch (status) {
      case "success":
        return { icon: "check", label: "Done", colorClass: "text-cli-success" };
      case "running":
        return { icon: "dot", label: "Running", colorClass: "text-cli-prefix-agent" };
      case "error":
        return {
          icon: "x",
          label: message.kind === "collab" ? "Failed" : `Exit ${message.metadata?.exitCode}`,
          colorClass: "text-cli-error",
        };
      default:
        return { icon: "check", label: "Done", colorClass: "text-cli-success" };
    }
  });

  const hasContent = $derived(toolInfo.content && toolInfo.content.trim().length > 0);
</script>

<div class="group overflow-hidden rounded-md border border-cli-border font-mono text-sm" class:open={isOpen}>
  <div class="relative flex w-full items-center gap-sm border-none bg-cli-bg-elevated px-md py-sm text-left font-inherit text-inherit text-cli-text transition-[background] duration-150 hover:bg-cli-bg-hover">
    <button class="flex min-w-0 flex-1 cursor-pointer items-center gap-sm border-none bg-transparent p-0 text-left font-inherit text-inherit" onclick={toggle} type="button">
    <span class="flex shrink-0 items-center justify-center gap-0 {toolConfig.colorClass}">
      {#if toolConfig.icon === "terminal"}
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 17 10 11 4 5"/>
          <line x1="12" x2="20" y1="19" y2="19"/>
        </svg>
      {:else if toolConfig.icon === "file"}
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
          <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
          <path d="M10 12h4"/>
          <path d="M10 16h4"/>
        </svg>
      {:else if toolConfig.icon === "plug"}
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22v-5"/>
          <path d="M9 8V2"/>
          <path d="M15 8V2"/>
          <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>
        </svg>
      {:else if toolConfig.icon === "search"}
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.3-4.3"/>
        </svg>
      {:else if toolConfig.icon === "image"}
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
          <circle cx="9" cy="9" r="2"/>
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
        </svg>
      {:else if toolConfig.icon === "eye"}
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      {:else if toolConfig.icon === "plan"}
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
          <path d="M9 14h6"/>
          <path d="M9 18h6"/>
        </svg>
      {:else if toolConfig.icon === "users"}
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      {:else}
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
      {/if}
    </span>

    <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-cli-text">{toolInfo.title}</span>

    <span class="flex shrink-0 items-center gap-xs text-xs {statusConfig.colorClass}">
      {#if statusConfig.icon === "check"}
        <svg class="h-[0.875rem] w-[0.875rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      {:else if statusConfig.icon === "dot"}
        <svg class="h-[0.875rem] w-[0.875rem]" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <circle cx="12" cy="12" r="4"/>
        </svg>
      {:else if statusConfig.icon === "x"}
        <svg class="h-[0.875rem] w-[0.875rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6 6 18"/>
          <path d="m6 6 12 12"/>
        </svg>
      {/if}
      <span class="opacity-90">{statusConfig.label}</span>
    </span>

    {#if hasContent}
      <svg
        class="h-4 w-4 shrink-0 text-cli-text-dim transition-transform duration-200"
        class:rotate-180={isOpen}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="m6 9 6 6 6-6"/>
      </svg>
    {/if}
    </button>

    {#if hasContent && uiToggles.showToolOutputCopy}
      <button
        type="button"
        class="absolute right-[10px] top-2 z-[1] cursor-pointer rounded-sm border border-cli-border bg-black/25 px-[10px] py-1 font-mono text-[11px] text-cli-text-muted opacity-0 shadow-none transition-all duration-150 hover:text-cli-text group-hover:opacity-100 group-focus-within:opacity-100 max-[520px]:px-[12px] max-[520px]:py-[6px] max-[520px]:text-[12px] max-[520px]:opacity-100 {copyState === 'copied' ? 'border-[#2c8a5a] text-[#9be3bf] !opacity-100' : ''} {copyState === 'error' ? 'border-cli-error text-cli-error !opacity-100' : ''}"
        onclick={(e) => {
          e.stopPropagation();
          copyToolOutput();
        }}
        title={copyState === "copied" ? "Copied" : "Copy output"}
        aria-label="Copy tool output"
      >
        {copyState === "copied" ? "copied" : "copy"}
      </button>
    {/if}
  </div>

  {#if isOpen && hasContent}
    <div class="border-t border-cli-border bg-cli-bg" transition:fade={{ duration: 200 }}>
      {#if renderMarkdown}
        <div class="m-0 max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words px-md py-sm text-xs leading-relaxed text-cli-text-dim markdown">{@html renderedToolHtml}</div>
      {:else}
        <pre class="m-0 max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words px-md py-sm text-xs leading-relaxed text-cli-text-dim">{toolInfo.content}</pre>
      {/if}
    </div>
  {/if}
</div>
