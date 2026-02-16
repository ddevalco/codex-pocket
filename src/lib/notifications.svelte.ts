import type { RpcMessage } from "./types";
import { socket } from "./socket.svelte";

const STORE_KEY = "__zane_notifications_store__";
const STORAGE_KEY = "zane_notifications_prefs";
const VAPID_PUBLIC_KEY = (import.meta.env.VAPID_PUBLIC_KEY as string) || "";

interface Prefs {
  pushEnabled: boolean;
  blockedTurnEnabled: boolean;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

class NotificationsStore {
  #pushSubscribed = $state(false);
  #pushSubscription: PushSubscription | null = null;
  #blockedTurnEnabled = $state(true);
  #lastBlockedAtByThread = new Map<string, number>();

  constructor() {
    this.#loadPrefs();

    if (this.#pushSubscribed) {
      this.#checkExistingPushSubscription();
    }
  }

  get pushSubscribed(): boolean {
    return this.#pushSubscribed;
  }

  get pushAvailable(): boolean {
    return !!(VAPID_PUBLIC_KEY && "serviceWorker" in navigator && "PushManager" in window);
  }

  get blockedTurnEnabled(): boolean {
    return this.#blockedTurnEnabled;
  }

  setBlockedTurnEnabled(enabled: boolean) {
    this.#blockedTurnEnabled = enabled;
    this.#savePrefs();
  }

  async subscribePush(): Promise<boolean> {
    if (!this.pushAvailable) return false;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      });

      this.#pushSubscription = sub;
      this.#pushSubscribed = true;
      this.#savePrefs();
      this.#sendPushSubscriptionToOrbit(sub);
      return true;
    } catch (err) {
      console.warn("Push subscription failed:", err);
      return false;
    }
  }

  async unsubscribePush(): Promise<void> {
    if (this.#pushSubscription) {
      const endpoint = this.#pushSubscription.endpoint;
      try {
        await this.#pushSubscription.unsubscribe();
      } catch {
        // ignore
      }
      if (socket.isHealthy) {
        socket.send({ type: "orbit.push-unsubscribe", endpoint } as unknown as RpcMessage);
      }
    }

    this.#pushSubscription = null;
    this.#pushSubscribed = false;
    this.#savePrefs();
  }

  resendPushSubscription() {
    if (this.#pushSubscribed && this.#pushSubscription) {
      this.#sendPushSubscriptionToOrbit(this.#pushSubscription);
    }
  }

  async sendTestPush(): Promise<void> {
    if (socket.isHealthy) {
      socket.send({ type: "orbit.push-test" } as unknown as RpcMessage);
    }
  }

  async notifyBlockedTurn(threadId: string, body: string): Promise<boolean> {
    if (!this.#blockedTurnEnabled) return false;
    if (typeof window === "undefined") return false;
    if (typeof Notification === "undefined") return false;
    if (!threadId.trim()) return false;

    const away = document.visibilityState === "hidden" || !document.hasFocus();
    if (!away) return false;

    const now = Date.now();
    const last = this.#lastBlockedAtByThread.get(threadId) ?? 0;
    if (now - last < 45_000) return false;

    let perm = Notification.permission;
    if (perm === "default") {
      try {
        perm = await Notification.requestPermission();
      } catch {
        perm = Notification.permission;
      }
    }
    if (perm !== "granted") return false;

    const title = "Codex Pocket: action needed";
    const actionUrl = `/thread/${encodeURIComponent(threadId)}`;
    const tag = `zane-blocked-${threadId}`;

    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, {
          body,
          tag,
          data: { actionUrl },
        });
      } else {
        new Notification(title, { body, tag });
      }
      this.#lastBlockedAtByThread.set(threadId, now);
      return true;
    } catch {
      return false;
    }
  }

  async #checkExistingPushSubscription(): Promise<void> {
    if (!("serviceWorker" in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        this.#pushSubscription = sub;
        this.#pushSubscribed = true;
      } else {
        this.#pushSubscribed = false;
        this.#savePrefs();
      }
    } catch {
      this.#pushSubscribed = false;
    }
  }

  #sendPushSubscriptionToOrbit(sub: PushSubscription) {
    const key = sub.getKey("p256dh");
    const auth = sub.getKey("auth");
    if (!key || !auth) return;

    const p256dh = btoa(String.fromCharCode(...new Uint8Array(key)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const authB64 = btoa(String.fromCharCode(...new Uint8Array(auth)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    socket.send({
      type: "orbit.push-subscribe",
      endpoint: sub.endpoint,
      p256dh,
      auth: authB64,
    } as unknown as RpcMessage);
  }

  #loadPrefs() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved) as Prefs;
        this.#pushSubscribed = data.pushEnabled ?? false;
        this.#blockedTurnEnabled = data.blockedTurnEnabled ?? true;
      }
    } catch {
      // ignore
    }
  }

  #savePrefs() {
    try {
      const data: Prefs = {
        pushEnabled: this.#pushSubscribed,
        blockedTurnEnabled: this.#blockedTurnEnabled,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }
}

function getStore(): NotificationsStore {
  const global = globalThis as Record<string, unknown>;
  if (!global[STORE_KEY]) {
    const store = new NotificationsStore();
    global[STORE_KEY] = store;
    // Re-send push subscription on every reconnect
    socket.onConnect(() => store.resendPushSubscription());
  }
  return global[STORE_KEY] as NotificationsStore;
}

export const notifications = getStore();
