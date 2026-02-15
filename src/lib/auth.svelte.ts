const STORE_KEY = "__zane_auth_store__";
const STORAGE_KEY = "zane_auth_token";
const LOCAL_MODE = true;

type AuthStatus = "loading" | "signed_out" | "signed_in" | "needs_setup";

interface AuthUser {
  id: string;
  name: string;
}

class AuthStore {
  localMode = LOCAL_MODE;
  status = $state<AuthStatus>("loading");
  hasPasskey = $state(false);
  token = $state<string | null>(null);
  user = $state<AuthUser | null>(null);
  busy = $state(false);
  error = $state<string | null>(null);

  constructor() {
    this.#loadToken();
    void this.initialize();
  }

  async initialize() {
    this.status = "loading";
    this.error = null;
    this.status = this.token ? "signed_in" : "signed_out";
    this.user = this.token ? { id: "local", name: "local" } : null;
    this.hasPasskey = false;
  }

  async signIn(tokenInput: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = null;

    const token = tokenInput.trim();
    if (!token) {
      this.error = "Token is required.";
      this.busy = false;
      return;
    }

    this.token = token;
    this.user = { id: "local", name: "local" };
    this.status = "signed_in";
    this.hasPasskey = false;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, token);
    }
    this.busy = false;
  }

  async register(_name: string, _displayName?: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = null;

    this.error = "Account registration is not supported. Use an access token.";
    this.busy = false;
  }

  async signOut(): Promise<void> {
    this.token = null;
    this.user = null;
    this.status = "signed_out";
    this.error = null;
    this.#clearToken();
  }

  #loadToken(): void {
    if (typeof localStorage === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      this.token = stored;
    }
  }

  #clearToken(): void {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
  }

  async tryRefresh(): Promise<boolean> {
    return false;
  }
}

function getStore(): AuthStore {
  const global = globalThis as Record<string, unknown>;
  if (!global[STORE_KEY]) {
    global[STORE_KEY] = new AuthStore();
  }
  return global[STORE_KEY] as AuthStore;
}

export const auth = getStore();
