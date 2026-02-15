const STORE_KEY = "__zane_config_store__";
const STORAGE_KEY = "zane_config";
const AUTH_BASE_URL = (import.meta.env.AUTH_URL ?? "").replace(/\/$/, "");
const LOCAL_MODE = import.meta.env.VITE_ZANE_LOCAL === "1" || AUTH_BASE_URL.length === 0;
const DEFAULT_LOCAL_DEV_ORBIT_WS = "ws://127.0.0.1:8790/ws";
interface SavedConfig {
  url: string;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function localDevOrbitFallbackUrl(): string {
  if (typeof window === "undefined") return "";
  if (!import.meta.env.DEV || !LOCAL_MODE) return "";
  if (!isLoopbackHost(window.location.hostname)) return "";

  const envValue = String(import.meta.env.VITE_LOCAL_ORBIT_WS ?? "").trim();
  return envValue || DEFAULT_LOCAL_DEV_ORBIT_WS;
}

function defaultWsUrlFromLocation(): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

function isWsTargetingCurrentLoopbackDevServer(value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") return false;
    if (!isLoopbackHost(parsed.hostname)) return false;
    return parsed.port === window.location.port;
  } catch {
    return false;
  }
}

class ConfigStore {
  #url = $state("");

  constructor() {
    this.#load();
    const localDevFallback = localDevOrbitFallbackUrl();
    // In local dev, defaulting to the Vite origin (localhost:5173) creates a dead WS target.
    // Prefer Orbit (localhost:8790) when URL is unset or still points at the current dev server.
    if (localDevFallback && (!this.#url || isWsTargetingCurrentLoopbackDevServer(this.#url))) {
      this.#url = localDevFallback;
      this.#save();
      return;
    }
    // Auto-default the WS URL to the current site origin when unset.
    // This is required for iPhone pairing UX: after scanning a pairing link, the user should not
    // have to manually set the Orbit URL.
    if (!this.#url) {
      const derived = defaultWsUrlFromLocation();
      if (derived) {
        this.#url = derived;
        this.#save();
      }
    }
  }

  get url() {
    return this.#url;
  }
  set url(value: string) {
    this.#url = value;
    this.#save();
  }

  #load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved) as SavedConfig;
        this.#url = data.url || this.#url;
      }
    } catch {
      // ignore
    }
  }

  #save() {
    try {
      const data: SavedConfig = {
        url: this.#url,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }
}

function getStore(): ConfigStore {
  const global = globalThis as Record<string, unknown>;
  if (!global[STORE_KEY]) {
    global[STORE_KEY] = new ConfigStore();
  }
  return global[STORE_KEY] as ConfigStore;
}

export const config = getStore();
