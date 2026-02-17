import { describe, it, expect, beforeEach } from "bun:test";
import { ProviderRegistry } from "../registry";
import type { ProviderAdapter } from "../contracts";
import type { 
  ProviderHealthStatus, 
  ProviderCapabilities, 
  SessionListResult,
  NormalizedSession,
  NormalizedEvent,
  EventSubscription
} from "../provider-types";

// Mock capacities matching ProviderCapabilities interface
const mockCapabilities: ProviderCapabilities = {
  listSessions: true,
  openSession: true,
  sendPrompt: true,
  streaming: true,
  attachments: true,
  approvals: true,
  multiTurn: true,
  filtering: true,
  pagination: true
};

// Mock adapter implementation
class MockAdapter implements ProviderAdapter {
  readonly providerId: string;
  readonly providerName: string;
  readonly capabilities: ProviderCapabilities = mockCapabilities;
  
  started = false;
  shouldFailStart = false;
  shouldFailHealth = false;

  constructor(name: string, opts?: { failStart?: boolean; failHealth?: boolean }) {
    this.providerId = name;
    this.providerName = name.charAt(0).toUpperCase() + name.slice(1);
    this.shouldFailStart = opts?.failStart || false;
    this.shouldFailHealth = opts?.failHealth || false;
  }

  async start(): Promise<void> {
    if (this.shouldFailStart) throw new Error(`${this.providerId} start failed`);
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  async health(): Promise<ProviderHealthStatus> {
    if (this.shouldFailHealth) {
      return { 
        status: "unhealthy", 
        message: "Mock health fail",
        lastCheck: new Date().toISOString()
      };
    }
    return { 
      status: this.started ? "healthy" : "unhealthy", 
      message: this.started ? "OK" : "Not started",
      lastCheck: new Date().toISOString()
    };
  }

  async listSessions(): Promise<SessionListResult> {
    return { sessions: [], hasMore: false };
  }

  async openSession(): Promise<NormalizedSession> {
    throw new Error("Not implemented");
  }

  async sendPrompt(): Promise<{ turnId?: string; requestId?: string }> {
    throw new Error("Not implemented");
  }

  async subscribe(): Promise<EventSubscription> {
    throw new Error("Not implemented");
  }

  async unsubscribe(): Promise<void> {
    throw new Error("Not implemented");
  }

  async normalizeEvent(): Promise<NormalizedEvent | null> {
    throw new Error("Not implemented");
  }
}

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it("registers an adapter via factory", async () => {
    const adapter = new MockAdapter("test");
    registry.register("test", () => adapter, { enabled: true });
    
    // Adapter is only created after startAll
    await registry.startAll();
    expect(registry.get("test")).toBe(adapter);
  });

  it("returns undefined for unknown adapter", () => {
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("lists all adapter names", () => {
    registry.register("one", () => new MockAdapter("one"), { enabled: true });
    registry.register("two", () => new MockAdapter("two"), { enabled: true });
    const names = registry.list();
    expect(names).toContain("one");
    expect(names).toContain("two");
    expect(names.length).toBe(2);
  });

  it("starts all enabled adapters", async () => {
    const a1 = new MockAdapter("a1");
    const a2 = new MockAdapter("a2");
    registry.register("a1", () => a1, { enabled: true });
    registry.register("a2", () => a2, { enabled: true });
    
    await registry.startAll();
    
    expect(a1.started).toBe(true);
    expect(a2.started).toBe(true);
  });

  it("skips disabled adapters", async () => {
    const a1 = new MockAdapter("a1");
    registry.register("a1", () => a1, { enabled: false });
    
    // startAll might throw if NO adapters start, depending on implementation
    try {
      await registry.startAll();
    } catch {
      // Expected if no adapters started
    }
    
    expect(a1.started).toBe(false);
    expect(registry.get("a1")).toBeUndefined();
  });

  it("isolates start errors", async () => {
    const good = new MockAdapter("good");
    const bad = new MockAdapter("bad", { failStart: true });
    registry.register("good", () => good, { enabled: true });
    registry.register("bad", () => bad, { enabled: true });
    
    await registry.startAll();
    
    expect(good.started).toBe(true);
    expect(bad.started).toBe(false);
  });

  it("stops all adapters", async () => {
    const a1 = new MockAdapter("a1");
    const a2 = new MockAdapter("a2");
    registry.register("a1", () => a1, { enabled: true });
    registry.register("a2", () => a2, { enabled: true });
    
    await registry.startAll();
    await registry.stopAll();
    
    expect(a1.started).toBe(false);
    expect(a2.started).toBe(false);
  });

  it("aggregates health from all adapters", async () => {
    const healthy = new MockAdapter("healthy");
    const unhealthy = new MockAdapter("unhealthy", { failHealth: true });
    registry.register("healthy", () => healthy, { enabled: true });
    registry.register("unhealthy", () => unhealthy, { enabled: true });
    
    await registry.startAll();
    const health = await registry.healthAll();
    
    expect(health["healthy"]?.status).toBe("healthy");
    expect(health["unhealthy"]?.status).toBe("unhealthy");
  });
});

