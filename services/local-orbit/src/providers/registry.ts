/**
 * Provider Runtime Registry
 *
 * Manages the lifecycle and coordination of multiple provider adapters.
 * Provides thread-safe registration, lookup, and lifecycle operations.
 *
 * Design principles:
 * - Error isolation: one provider failure doesn't crash others
 * - Idempotent operations: safe to call start/stop multiple times
 * - Graceful degradation: healthAll() accumulates results even if some fail
 * - Clear logging: lifecycle events logged for debugging
 */

import type {
  ProviderAdapter,
  ProviderFactory,
  ProviderConfig,
  ProviderRegistry as IProviderRegistry,
} from "./contracts.js";
import type { ProviderHealthStatus } from "./provider-types.js";

/**
 * Registry entry holding factory, config, and initialized adapter
 */
interface RegistryEntry {
  factory: ProviderFactory;
  config: ProviderConfig;
  adapter?: ProviderAdapter;
}

/**
 * Concrete implementation of the ProviderRegistry interface.
 *
 * Usage:
 *   const registry = new ProviderRegistry();
 *   registry.register('codex', codexFactory, codexConfig);
 *   await registry.startAll();
 *   const adapter = registry.get('codex');
 */
export class ProviderRegistry implements IProviderRegistry {
  private readonly entries: Map<string, RegistryEntry> = new Map();
  private readonly logger: Console;

  constructor(logger: Console = console) {
    this.logger = logger;
  }

  /**
   * Register a provider factory with configuration.
   * The provider is not instantiated or started until startAll() is called.
   *
   * @param providerId - Unique provider identifier
   * @param factory - Factory function to create the provider adapter
   * @param config - Provider configuration
   * @throws Error if providerId is already registered
   */
  register(providerId: string, factory: ProviderFactory, config: ProviderConfig): void {
    if (this.entries.has(providerId)) {
      throw new Error(`Provider '${providerId}' is already registered`);
    }

    this.entries.set(providerId, { factory, config });
    this.logger.info(`[ProviderRegistry] Registered provider: ${providerId}`);
  }

  /**
   * Get an initialized provider adapter by ID.
   *
   * @param providerId - Provider identifier
   * @returns The provider adapter, or undefined if not registered or not started
   */
  get(providerId: string): ProviderAdapter | undefined {
    const entry = this.entries.get(providerId);
    return entry?.adapter;
  }

  /**
   * List all registered provider IDs.
   *
   * @returns Array of provider IDs (includes both started and not-yet-started)
   */
  list(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Start all enabled providers.
   * Already-started providers are skipped (idempotent).
   * If a provider fails to start, the error is logged but other providers continue.
   *
   * @throws Error only if all providers fail to start
   */
  async startAll(): Promise<void> {
    this.logger.info("[ProviderRegistry] Starting all enabled providers...");

    const startPromises: Promise<void>[] = [];
    const providerIds: string[] = [];

    for (const [providerId, entry] of this.entries) {
      if (!entry.config.enabled) {
        this.logger.info(`[ProviderRegistry] Skipping disabled provider: ${providerId}`);
        continue;
      }

      providerIds.push(providerId);
      startPromises.push(this.startProvider(providerId, entry));
    }

    if (startPromises.length === 0) {
      this.logger.warn("[ProviderRegistry] No enabled providers to start");
      return;
    }

    // Wait for all providers to attempt start (errors are caught and logged)
    await Promise.all(startPromises);

    const startedCount = Array.from(this.entries.values()).filter((e) => e.adapter).length;
    this.logger.info(
      `[ProviderRegistry] Started ${startedCount}/${providerIds.length} providers`,
    );

    if (startedCount === 0) {
      throw new Error("Failed to start any providers");
    }
  }

  /**
   * Internal helper to start a single provider with error isolation.
   */
  private async startProvider(providerId: string, entry: RegistryEntry): Promise<void> {
    try {
      // Skip if already started
      if (entry.adapter) {
        this.logger.info(`[ProviderRegistry] Provider already started: ${providerId}`);
        return;
      }

      this.logger.info(`[ProviderRegistry] Starting provider: ${providerId}`);
      const adapter = entry.factory(entry.config);
      await adapter.start();
      entry.adapter = adapter;
      this.logger.info(`[ProviderRegistry] Successfully started: ${providerId}`);
    } catch (error) {
      this.logger.error(
        `[ProviderRegistry] Failed to start provider '${providerId}':`,
        error,
      );
      // Don't rethrow - allow other providers to start
    }
  }

  /**
   * Stop all providers and clean up resources.
   * Errors during stop are logged but do not prevent other providers from stopping.
   * Safe to call even if providers were never started.
   */
  async stopAll(): Promise<void> {
    this.logger.info("[ProviderRegistry] Stopping all providers...");

    const stopPromises: Promise<void>[] = [];

    for (const [providerId, entry] of this.entries) {
      if (entry.adapter) {
        stopPromises.push(this.stopProvider(providerId, entry));
      }
    }

    if (stopPromises.length === 0) {
      this.logger.info("[ProviderRegistry] No active providers to stop");
      return;
    }

    // Wait for all providers to attempt stop (errors are caught and logged)
    await Promise.all(stopPromises);

    this.logger.info("[ProviderRegistry] All providers stopped");
  }

  /**
   * Internal helper to stop a single provider with error isolation.
   */
  private async stopProvider(providerId: string, entry: RegistryEntry): Promise<void> {
    try {
      if (!entry.adapter) {
        return;
      }

      this.logger.info(`[ProviderRegistry] Stopping provider: ${providerId}`);
      await entry.adapter.stop();
      entry.adapter = undefined;
      this.logger.info(`[ProviderRegistry] Successfully stopped: ${providerId}`);
    } catch (error) {
      // Log but don't rethrow - clean stop policy
      this.logger.error(`[ProviderRegistry] Error stopping provider '${providerId}':`, error);
      // Clear the adapter reference even if stop failed
      entry.adapter = undefined;
    }
  }

  /**
   * Get health status for all active providers.
   * If a provider's health check fails, it's marked as unhealthy but other checks continue.
   *
   * @returns Map of provider IDs to health status (only includes started providers)
   */
  async healthAll(): Promise<Record<string, ProviderHealthStatus>> {
    this.logger.info("[ProviderRegistry] Checking health of all providers...");

    const healthPromises: Array<{ id: string; promise: Promise<ProviderHealthStatus> }> = [];

    // Seed the map with 'disabled' status for all registered-but-not-started providers
    // so the UI never receives undefined and shows "Unknown"
    const healthMap: Record<string, ProviderHealthStatus> = {};
    for (const [providerId, entry] of this.entries) {
      if (!entry.adapter) {
        healthMap[providerId] = {
          status: "disabled",
          message: "Provider is disabled",
          lastCheck: new Date().toISOString(),
        };
      }
    }

    for (const [providerId, entry] of this.entries) {
      if (entry.adapter) {
        healthPromises.push({
          id: providerId,
          promise: this.checkProviderHealth(providerId, entry.adapter),
        });
      }
    }

    if (healthPromises.length === 0) {
      this.logger.info("[ProviderRegistry] No active providers to check");
      return healthMap;
    }

    // Wait for all health checks (errors are caught and converted to unhealthy status)
    const results = await Promise.all(
      healthPromises.map(async ({ id, promise }) => ({
        id,
        status: await promise,
      })),
    );

    for (const { id, status } of results) {
      healthMap[id] = status;
    }

    const healthySummary = results.filter((r) => r.status.status === "healthy").length;
    this.logger.info(
      `[ProviderRegistry] Health check complete: ${healthySummary}/${results.length} healthy`,
    );

    return healthMap;
  }

  /**
   * Internal helper to check a single provider's health with error handling.
   */
  private async checkProviderHealth(
    providerId: string,
    adapter: ProviderAdapter,
  ): Promise<ProviderHealthStatus> {
    const startTime = Date.now();
    try {
      const status = await adapter.health();
      const elapsed = Date.now() - startTime;
      
      // Log slow health checks for monitoring
      if (elapsed > 3000) {
        this.logger.warn(
          `[ProviderRegistry] Slow health check for '${providerId}': ${elapsed}ms (degraded performance)`
        );
      } else if (elapsed > 1000) {
        this.logger.log(
          `[ProviderRegistry] Provider '${providerId}' health check took ${elapsed}ms`
        );
      }
      
      this.logger.debug(
        `[ProviderRegistry] Provider '${providerId}' health: ${status.status}`,
      );
      return status;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      this.logger.error(
        `[ProviderRegistry] Health check failed for '${providerId}' after ${elapsed}ms:`,
        error,
      );
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Health check failed",
        details: { 
          error: String(error),
          checkDuration: elapsed,
        },
        lastCheck: new Date().toISOString(),
      };
    }
  }
}

/**
 * Convenience factory function to create a new registry instance.
 *
 * @param logger - Optional custom logger (defaults to console)
 * @returns New ProviderRegistry instance
 */
export function createRegistry(logger?: Console): ProviderRegistry {
  return new ProviderRegistry(logger);
}
