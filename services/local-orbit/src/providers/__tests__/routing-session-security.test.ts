import { describe, it, expect } from "bun:test";
import { ProviderRegistry } from "../registry";
import {
  createNormalizedSession,
  sessionMatchesFilters,
  validateNormalizedSession,
  mergeSessionUpdate,
} from "../normalized-session";
import type { ProviderAdapter } from "../contracts";
import type {
  EventSubscription,
  NormalizedEvent,
  NormalizedSession,
  ProviderCapabilities,
  ProviderHealthStatus,
  SessionListResult,
} from "../provider-types";

const capabilities: ProviderCapabilities = {
  listSessions: true,
  openSession: true,
  sendPrompt: true,
  streaming: true,
  attachments: false,
  approvals: false,
  multiTurn: true,
  filtering: true,
  pagination: true,
};

class TestAdapter implements ProviderAdapter {
  readonly providerId: string;
  readonly providerName: string;
  readonly capabilities = capabilities;

  constructor(providerId: string) {
    this.providerId = providerId;
    this.providerName = providerId;
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async health(): Promise<ProviderHealthStatus> {
    return { status: "healthy", message: "ok", lastCheck: new Date().toISOString() };
  }
  async listSessions(): Promise<SessionListResult> {
    return { sessions: [], hasMore: false };
  }
  async openSession(sessionId: string): Promise<NormalizedSession> {
    return createNormalizedSession({ provider: this.providerId, sessionId });
  }
  async sendPrompt(): Promise<{ turnId?: string }> {
    return { turnId: "t-1" };
  }
  async subscribe(): Promise<EventSubscription> {
    return {
      id: `${this.providerId}-sub`,
      provider: this.providerId,
      sessionId: "s-1",
      unsubscribe: async () => {},
    };
  }
  async unsubscribe(): Promise<void> {}
  async normalizeEvent(): Promise<NormalizedEvent | null> {
    return null;
  }
}

describe("Provider routing security", () => {
  it("rejects duplicate provider registration to prevent provider shadowing", () => {
    const registry = new ProviderRegistry();
    registry.register("copilot-acp", () => new TestAdapter("copilot-acp"), { enabled: true });

    expect(() =>
      registry.register("copilot-acp", () => new TestAdapter("copilot-acp"), { enabled: true }),
    ).toThrow("already registered");
  });

  it("does not instantiate disabled providers during startAll", async () => {
    const registry = new ProviderRegistry();
    let factoryCalls = 0;

    registry.register(
      "disabled",
      () => {
        factoryCalls += 1;
        return new TestAdapter("disabled");
      },
      { enabled: false },
    );

    await registry.startAll();

    expect(factoryCalls).toBe(0);
    expect(registry.get("disabled")).toBeUndefined();
  });
});

describe("Session routing and lifecycle guards", () => {
  it("routes sessions through combined filters", () => {
    const session = createNormalizedSession({
      provider: "copilot-acp",
      sessionId: "sess-1",
      title: "Security audit",
      project: "coderelay",
      repo: "ddevalco/coderelay",
      preview: "approval workflow follow-up",
      status: "active",
      createdAt: "2026-02-21T12:00:00.000Z",
      updatedAt: "2026-02-21T12:00:00.000Z",
    });

    expect(
      sessionMatchesFilters(session, {
        project: "coderelay",
        repo: "ddevalco/coderelay",
        status: "active",
        query: "APPROVAL",
        createdAfter: "2026-02-21T11:59:59.000Z",
        createdBefore: "2026-02-21T12:00:01.000Z",
      }),
    ).toBe(true);

    expect(sessionMatchesFilters(session, { repo: "wrong/repo" })).toBe(false);
  });

  it("rejects non-plain metadata objects in session validation", () => {
    const withNullProto = {
      ...createNormalizedSession({ provider: "codex", sessionId: "sess-2" }),
      metadata: Object.create(null),
    };

    const withDateMetadata = {
      ...createNormalizedSession({ provider: "codex", sessionId: "sess-3" }),
      metadata: new Date(),
    };

    const nullProtoErrors = validateNormalizedSession(withNullProto);
    const dateErrors = validateNormalizedSession(withDateMetadata);

    expect(nullProtoErrors.some(e => e.includes("metadata must be a plain object"))).toBe(true);
    expect(dateErrors.some(e => e.includes("metadata must be a plain object"))).toBe(true);
  });

  it("preserves existing metadata keys when merging session updates", () => {
    const base = createNormalizedSession({
      provider: "copilot-acp",
      sessionId: "sess-4",
      metadata: { source: "ui", trust: "high" },
    });

    const merged = mergeSessionUpdate(base, {
      metadata: { trust: "updated", risk: "low" },
    });

    expect(merged.metadata).toEqual({ source: "ui", trust: "updated", risk: "low" });
  });
});
