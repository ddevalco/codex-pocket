const browser = typeof window !== "undefined";
import type { ImageAttachment } from "./types";

const DRAFT_STORE_KEY = "codex_pocket_drafts";

export interface Draft {
  text: string;
  attachments: ImageAttachment[];
  timestamp: number;
}

class DraftStore {
  drafts = $state<Record<string, Draft>>({});
  #loaded = false;
  #saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.#load();
  }

  #load() {
    if (!browser) return;
    try {
      const stored = localStorage.getItem(DRAFT_STORE_KEY);
      if (stored) {
        this.drafts = JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    this.#loaded = true;
  }

  #save() {
    if (!browser || !this.#loaded) return;
    try {
      localStorage.setItem(DRAFT_STORE_KEY, JSON.stringify(this.drafts));
    } catch {
      // ignore
    }
  }

  #debouncedSave() {
    if (!browser) return;
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      this.#save();
    }, 500);
  }

  get(threadId: string): Draft | undefined {
    return this.drafts[threadId];
  }

  set(threadId: string, text: string, attachments: ImageAttachment[]) {
    // If empty, remove the draft
    if (!text.trim() && attachments.length === 0) {
      this.deleteDraft(threadId);
      return;
    }

    this.drafts[threadId] = {
      text,
      attachments,
      timestamp: Date.now(),
    };
    this.#debouncedSave();
  }

  deleteDraft(threadId: string) {
    if (this.drafts[threadId]) {
      const newDrafts = { ...this.drafts };
      delete newDrafts[threadId];
      this.drafts = newDrafts;
      this.#debouncedSave();
    }
  }

  clearAll() {
    this.drafts = {};
    this.#save();
  }
}

export const drafts = new DraftStore();
