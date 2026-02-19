export type QuickReply = {
  label: string;
  text: string;
};

const OLD_QUICK_REPLIES_STORAGE_KEY = "codex_pocket_quick_replies_v1";
export const QUICK_REPLIES_STORAGE_KEY = "coderelay_quick_replies_v1";
const browser = typeof window !== "undefined";

if (browser && !localStorage.getItem(QUICK_REPLIES_STORAGE_KEY)) {
  const old = localStorage.getItem(OLD_QUICK_REPLIES_STORAGE_KEY);
  if (old) localStorage.setItem(QUICK_REPLIES_STORAGE_KEY, old);
}
export const MAX_QUICK_REPLIES = 5;

export const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  { label: "Proceed", text: "Proceed." },
  { label: "Elaborate", text: "Please elaborate." },
];

export function normalizeQuickReplies(raw: unknown): QuickReply[] {
  if (!Array.isArray(raw)) return DEFAULT_QUICK_REPLIES;
  const next: QuickReply[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const label = typeof (item as Record<string, unknown>).label === "string"
      ? (item as Record<string, string>).label.trim()
      : "";
    const text = typeof (item as Record<string, unknown>).text === "string"
      ? (item as Record<string, string>).text.trim()
      : "";
    if (!label || !text) continue;
    next.push({ label: label.slice(0, 24), text: text.slice(0, 280) });
    if (next.length >= MAX_QUICK_REPLIES) break;
  }
  return next.length ? next : DEFAULT_QUICK_REPLIES;
}

export function loadQuickReplies(): QuickReply[] {
  try {
    const raw = localStorage.getItem(QUICK_REPLIES_STORAGE_KEY);
    if (!raw) return DEFAULT_QUICK_REPLIES;
    return normalizeQuickReplies(JSON.parse(raw));
  } catch {
    return DEFAULT_QUICK_REPLIES;
  }
}

export function saveQuickReplies(items: QuickReply[]): QuickReply[] {
  const next = normalizeQuickReplies(items);
  try {
    localStorage.setItem(QUICK_REPLIES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore localStorage failures
  }
  return next;
}
