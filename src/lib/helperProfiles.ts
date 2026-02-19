export type HelperProfile = {
  id: string;
  name: string;
  presetId: string;
  prompt: string;
};

const OLD_HELPER_PROFILES_STORAGE_KEY = "codex_pocket_helper_profiles_v1";
export const HELPER_PROFILES_STORAGE_KEY = "coderelay_helper_profiles_v1";
const browser = typeof window !== "undefined";

if (browser && !localStorage.getItem(HELPER_PROFILES_STORAGE_KEY)) {
  const old = localStorage.getItem(OLD_HELPER_PROFILES_STORAGE_KEY);
  if (old) localStorage.setItem(HELPER_PROFILES_STORAGE_KEY, old);
}
export const MAX_HELPER_PROFILES = 24;

function newProfileId(): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `helper_${Date.now().toString(36)}_${randomPart}`;
}

function normalizeText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000\r]/g, "").slice(0, maxLen).trim();
}

function normalizeMultilineText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").slice(0, maxLen).trim();
}

export function normalizeHelperProfiles(raw: unknown): HelperProfile[] {
  if (!Array.isArray(raw)) return [];
  const out: HelperProfile[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = normalizeText(record.name, 64);
    const presetId = normalizeText(record.presetId, 80);
    const prompt = normalizeMultilineText(record.prompt, 4000);
    if (!name || !presetId || !prompt) continue;

    let id = normalizeText(record.id, 80);
    if (!id || seen.has(id)) id = newProfileId();
    seen.add(id);

    out.push({ id, name, presetId, prompt });
    if (out.length >= MAX_HELPER_PROFILES) break;
  }
  return out;
}

export function loadHelperProfiles(): HelperProfile[] {
  try {
    const raw = localStorage.getItem(HELPER_PROFILES_STORAGE_KEY);
    if (!raw) return [];
    return normalizeHelperProfiles(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveHelperProfiles(profiles: HelperProfile[]): HelperProfile[] {
  const normalized = normalizeHelperProfiles(profiles);
  try {
    localStorage.setItem(HELPER_PROFILES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore local storage write issues
  }
  return normalized;
}
