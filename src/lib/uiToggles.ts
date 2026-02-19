const STORE_KEY = "__codex_pocket_ui_toggles__";
const STORAGE_KEY = "codex_pocket_ui_toggles";
const browser = typeof window !== "undefined";

export interface UITogglesState {
  showThreadListExports: boolean;
  showComposerQuickReplies: boolean;
  showComposerThumbnails: boolean;
  showMessageCopyButton: boolean;
  showMessageCopyMarkdown: boolean;
  showMessageCopyQuoted: boolean;
  showToolOutputCopy: boolean;
  showThreadHeaderActions: boolean;
}

export type UIToggleKey = keyof UITogglesState;

const DEFAULT_TOGGLES: UITogglesState = {
  showThreadListExports: true,
  showComposerQuickReplies: true,
  showComposerThumbnails: true,
  showMessageCopyButton: true,
  showMessageCopyMarkdown: true,
  showMessageCopyQuoted: true,
  showToolOutputCopy: true,
  showThreadHeaderActions: true,
};

function normalizeToggles(raw: unknown): UITogglesState {
  const base: UITogglesState = { ...DEFAULT_TOGGLES };
  if (!raw || typeof raw !== "object") return base;
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_TOGGLES) as UIToggleKey[]) {
    if (typeof record[key] === "boolean") {
      base[key] = record[key] as boolean;
    }
  }
  return base;
}

function loadToggles(): UITogglesState {
  if (!browser) return { ...DEFAULT_TOGGLES };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TOGGLES };
    return normalizeToggles(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TOGGLES };
  }
}

function saveToggles(state: UITogglesState) {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore localStorage failures
  }
}

type UIToggleStore = {
  get state(): UITogglesState;
  resetToggles: () => void;
  getToggleState: (key: UIToggleKey) => boolean;
  setToggleState: (key: UIToggleKey, value: boolean) => void;
};

function createUiToggleStore(): UIToggleStore {
  const state = $state<UITogglesState>(loadToggles());

  $effect.root(() => {
    $effect(() => saveToggles(state));
  });

  function resetToggles() {
    for (const key of Object.keys(DEFAULT_TOGGLES) as UIToggleKey[]) {
      state[key] = DEFAULT_TOGGLES[key];
    }
  }

  function getToggleState(key: UIToggleKey): boolean {
    return state[key];
  }

  function hasCopyActionEnabled(targetState: UITogglesState): boolean {
    return (
      targetState.showMessageCopyButton ||
      targetState.showMessageCopyMarkdown ||
      targetState.showMessageCopyQuoted
    );
  }

  function setToggleState(key: UIToggleKey, value: boolean) {
    // Safety guardrail: ensure at least one message copy path is always enabled.
    if (
      !value &&
      (key === "showMessageCopyButton" ||
        key === "showMessageCopyMarkdown" ||
        key === "showMessageCopyQuoted")
    ) {
      const nextState = { ...state, [key]: false };
      if (!hasCopyActionEnabled(nextState)) {
        // If everything would be disabled, force enable the primary button.
        state.showMessageCopyButton = true;
        return;
      }
    }
    state[key] = value;
  }

  return {
    get state() {
      return state;
    },
    resetToggles,
    getToggleState,
    setToggleState,
  };
}

function getStore(): UIToggleStore {
  const global = globalThis as Record<string, unknown>;
  if (!global[STORE_KEY]) {
    global[STORE_KEY] = createUiToggleStore();
  }
  return global[STORE_KEY] as UIToggleStore;
}

const uiToggleStore = getStore();

export const uiToggles = uiToggleStore.state;
export const resetToggles = uiToggleStore.resetToggles;
export const getToggleState = uiToggleStore.getToggleState;
export const setToggleState = uiToggleStore.setToggleState;
