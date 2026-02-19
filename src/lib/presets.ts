import type { ModeKind, ReasoningEffort } from "./types";

export type AgentPreset = {
  id: string;
  name: string;
  mode: ModeKind;
  model: string;
  reasoningEffort: ReasoningEffort;
  developerInstructions: string;
  starterPrompt: string;
};

const OLD_AGENT_PRESETS_STORAGE_KEY = "codex_pocket_agent_presets_v1";
export const AGENT_PRESETS_STORAGE_KEY = "coderelay_agent_presets_v1";
const browser = typeof window !== "undefined";

if (browser && !localStorage.getItem(AGENT_PRESETS_STORAGE_KEY)) {
  const old = localStorage.getItem(OLD_AGENT_PRESETS_STORAGE_KEY);
  if (old) localStorage.setItem(AGENT_PRESETS_STORAGE_KEY, old);
}
export const MAX_AGENT_PRESETS = 24;

function generatePresetId(): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `preset_${Date.now().toString(36)}_${randomPart}`;
}

function normalizeMode(value: unknown): ModeKind {
  return value === "plan" ? "plan" : "code";
}

function normalizeReasoning(value: unknown): ReasoningEffort {
  if (value === "low" || value === "high" || value === "medium") {
    return value;
  }
  return "medium";
}

function normalizeText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000\r]/g, "").slice(0, maxLen).trim();
}

function normalizeMultilineText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").slice(0, maxLen).trim();
}

export function normalizeAgentPresets(raw: unknown): AgentPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentPreset[] = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = normalizeText(record.name, 64);
    const model = normalizeText(record.model, 120);
    if (!name) continue;

    let id = normalizeText(record.id, 80);
    if (!id || seenIds.has(id)) {
      id = generatePresetId();
    }
    seenIds.add(id);

    out.push({
      id,
      name,
      mode: normalizeMode(record.mode),
      model,
      reasoningEffort: normalizeReasoning(record.reasoningEffort),
      developerInstructions: normalizeMultilineText(record.developerInstructions, 4000),
      starterPrompt: normalizeMultilineText(record.starterPrompt, 4000),
    });

    if (out.length >= MAX_AGENT_PRESETS) break;
  }
  return out;
}

export function loadAgentPresets(): AgentPreset[] {
  try {
    const raw = localStorage.getItem(AGENT_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    return normalizeAgentPresets(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveAgentPresets(presets: AgentPreset[]): AgentPreset[] {
  const normalized = normalizeAgentPresets(presets);
  try {
    localStorage.setItem(AGENT_PRESETS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore localStorage write errors
  }
  return normalized;
}

export function exportAgentPresetsJson(presets: AgentPreset[]): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      presets: normalizeAgentPresets(presets),
    },
    null,
    2,
  );
}

export function importAgentPresetsJson(text: string): AgentPreset[] {
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) {
    return normalizeAgentPresets(parsed);
  }
  if (parsed && typeof parsed === "object") {
    const data = (parsed as { presets?: unknown }).presets;
    return normalizeAgentPresets(data);
  }
  return [];
}
