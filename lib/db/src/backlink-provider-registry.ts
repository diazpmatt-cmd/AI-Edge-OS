/**
 * C8R-8 — Backlink Provider Registry
 *
 * Central registration and resolution layer for all backlink data providers.
 * Providers declare their capabilities at registration time.  The registry
 * selects the highest-priority configured provider that satisfies a discovery
 * request's capability requirements.
 *
 * Design invariants:
 *   - A provider name may only be registered once per registry instance.
 *   - Health is computed at query time (never stale-cached).
 *   - Health reports never expose credentials.
 *   - `resolve()` never returns a disabled or unconfigured provider.
 *   - The fixture provider (priority 1) is always registered as a fallback in dev/test.
 *   - The DataForSEO provider (priority 10) is registered only when configured.
 */

import type { BacklinkCapability } from "./backlink-types";
import type { BacklinkDataProvider } from "./backlink-providers";
import type { BacklinkProviderHealthState } from "./backlink-provider-config";

// ── Registration record ───────────────────────────────────────────────────────

/**
 * A provider plus its health function and dispatch priority.
 * Higher priority values are preferred when multiple configured providers
 * could satisfy a request.
 */
export interface BacklinkProviderRegistration {
  readonly provider:   BacklinkDataProvider;
  /** Returns the current health state.  Called fresh on every health query. */
  readonly getHealth:  () => BacklinkProviderHealthState;
  /**
   * Dispatch priority.  Higher = preferred.
   * Recommended values: 1 (fixture/fallback), 10 (live provider).
   */
  readonly priority:   number;
}

// ── Health report ─────────────────────────────────────────────────────────────

/**
 * Aggregate health report for all registered providers.
 * Safe to surface in API responses — no credentials included.
 */
export interface BacklinkProviderHealthReport {
  readonly providers:                readonly BacklinkProviderHealthState[];
  readonly total:                    number;
  readonly configured:               number;
  readonly disabled:                 number;
  readonly unconfigured:             number;
  /** "ready" = ≥1 configured provider; "degraded" = none configured but ≥1 disabled;
   *  "unavailable" = all unconfigured */
  readonly overallStatus:            "ready" | "degraded" | "unavailable";
  /** Activation instructions when no configured provider exists.  Null when ready. */
  readonly activationInstructions:   string | null;
}

// ── Registry ─────────────────────────────────────────────────────────────────

export class BacklinkProviderRegistry {
  private readonly _registrations: BacklinkProviderRegistration[] = [];

  /**
   * Register a provider with its health function and dispatch priority.
   * Throws if a provider with the same name is already registered.
   */
  register(registration: BacklinkProviderRegistration): void {
    const duplicate = this._registrations.find(
      (r) => r.provider.name === registration.provider.name,
    );
    if (duplicate) {
      throw new Error(
        `BacklinkProviderRegistry: provider "${registration.provider.name}" is already registered.`,
      );
    }
    this._registrations.push(registration);
  }

  /** Returns the names of all registered providers in registration order. */
  list(): readonly string[] {
    return this._registrations.map((r) => r.provider.name);
  }

  /**
   * Returns the current health state for a named provider.
   * Returns null if no provider with that name is registered.
   */
  getHealth(name: string): BacklinkProviderHealthState | null {
    const reg = this._registrations.find((r) => r.provider.name === name);
    return reg ? reg.getHealth() : null;
  }

  /**
   * Resolve the best available provider for a given set of required capabilities.
   *
   * Selection criteria (in order):
   *   1. Status must be "configured" (disabled and unconfigured providers are excluded).
   *   2. Provider must declare all capabilities in requiredCapabilities (if provided).
   *   3. Among eligible providers, the one with the highest priority wins.
   *
   * Returns null when no configured provider satisfies the requirements.
   */
  resolve(requiredCapabilities?: ReadonlySet<BacklinkCapability>): BacklinkDataProvider | null {
    const sorted = [...this._registrations].sort((a, b) => b.priority - a.priority);
    for (const reg of sorted) {
      if (reg.getHealth().status !== "configured") continue;
      if (requiredCapabilities && requiredCapabilities.size > 0) {
        const hasAll = [...requiredCapabilities].every((cap) =>
          reg.provider.capabilities.has(cap),
        );
        if (!hasAll) continue;
      }
      return reg.provider;
    }
    return null;
  }

  /**
   * Produce an aggregate health report for all registered providers.
   * Health state is computed fresh for each provider on every call.
   * The returned report is safe for API exposure — no credentials included.
   */
  healthReport(): BacklinkProviderHealthReport {
    const providers    = this._registrations.map((r) => r.getHealth());
    const configured   = providers.filter((p) => p.status === "configured").length;
    const disabled     = providers.filter((p) => p.status === "disabled").length;
    const unconfigured = providers.filter((p) => p.status === "unconfigured").length;

    const overallStatus: BacklinkProviderHealthReport["overallStatus"] =
      configured > 0 ? "ready" :
      disabled   > 0 ? "degraded" :
                       "unavailable";

    const activationInstructions =
      configured === 0
        ? "Set DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD, and BACKLINK_DATAFORSEO_ENABLED=true " +
          "to activate live backlink discovery. The fixture provider remains available for " +
          "development and demonstration."
        : null;

    return {
      providers,
      total:        providers.length,
      configured,
      disabled,
      unconfigured,
      overallStatus,
      activationInstructions,
    };
  }

  /** Number of registered providers (for monitoring / assertions). */
  get size(): number {
    return this._registrations.length;
  }
}
