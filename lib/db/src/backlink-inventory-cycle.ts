import type { BacklinkInventoryProvider } from "./backlink-inventory-provider";
import { buildBacklinkInventoryScanFromProviderResult } from "./backlink-inventory-provider";
import type {
  BacklinkInventoryRunReceipt,
  ObservedBacklinkRepository,
  PersistedBacklinkInventoryResult,
} from "./observed-backlink-repository";

export type BacklinkInventoryMeasurementResult =
  | {
      readonly written: true;
      readonly inventoryRunId: string;
    }
  | {
      readonly written: false;
      readonly reason: string;
    };

export interface BacklinkInventoryCycleDependencies {
  readonly provider: BacklinkInventoryProvider;
  readonly repository: ObservedBacklinkRepository;
  readonly recordMeasurement: (
    clientId: string,
    observedAt: Date,
  ) => Promise<BacklinkInventoryMeasurementResult>;
  readonly now?: () => Date;
}

export interface BacklinkInventoryCycleInput {
  readonly clientId: string;
  readonly clientDomain: string;
  readonly runId: string;
  readonly limit: number;
}

export interface BacklinkInventoryCycleResult {
  readonly clientId: string;
  readonly runId: string;
  readonly lifecycleOutcome: "applied" | "replayed";
  readonly providerCallMade: boolean;
  readonly providerRequestCount: number;
  readonly receipt: BacklinkInventoryRunReceipt;
  readonly measurement:
    | BacklinkInventoryMeasurementResult
    | {
        readonly written: false;
        readonly reason: "inventory_not_complete";
      };
}

function required(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function validDate(value: Date): Date {
  if (!Number.isFinite(value.getTime())) throw new Error("inventory_cycle_time_invalid");
  return value;
}

async function measurementForReceipt(
  receipt: BacklinkInventoryRunReceipt,
  dependencies: BacklinkInventoryCycleDependencies,
): Promise<BacklinkInventoryCycleResult["measurement"]> {
  if (receipt.status !== "succeeded" || receipt.completeness !== "complete") {
    return Object.freeze({
      written: false as const,
      reason: "inventory_not_complete" as const,
    });
  }

  return dependencies.recordMeasurement(
    receipt.clientId,
    validDate(new Date(receipt.completedAt)),
  );
}

/**
 * Provider-agnostic, restart-safe bridge from an own-site backlink inventory
 * provider into the canonical observed-link lifecycle and trusted Measurement.
 *
 * The run ledger is checked before any provider effect. Exact replay therefore
 * never repeats a paid/network provider call, even when a prior attempt failed
 * after persistence while writing Measurement.
 */
export async function runBacklinkInventoryMeasurementCycle(
  input: BacklinkInventoryCycleInput,
  dependencies: BacklinkInventoryCycleDependencies,
): Promise<BacklinkInventoryCycleResult> {
  const clientId = required(input.clientId, "client_id_required");
  const clientDomain = required(input.clientDomain, "client_domain_required");
  const runId = required(input.runId, "run_id_required");
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    throw new Error("inventory_limit_invalid");
  }

  const existing = await dependencies.repository.getInventoryRun(clientId, runId);
  if (existing) {
    const measurement = await measurementForReceipt(existing, dependencies);
    return Object.freeze({
      clientId,
      runId,
      lifecycleOutcome: "replayed" as const,
      providerCallMade: false,
      providerRequestCount: 0,
      receipt: existing,
      measurement,
    });
  }

  const providerResult = await dependencies.provider.scan({
    clientId,
    clientDomain,
    limit: input.limit,
  });
  const completedAt = validDate((dependencies.now ?? (() => new Date()))()).toISOString();
  const scan = buildBacklinkInventoryScanFromProviderResult({
    clientId,
    runId,
    completedAt,
    result: providerResult,
  });

  const persisted: PersistedBacklinkInventoryResult =
    await dependencies.repository.applyInventoryScan(scan);
  const measurement = await measurementForReceipt(persisted.receipt, dependencies);

  return Object.freeze({
    clientId,
    runId,
    lifecycleOutcome: persisted.outcome,
    providerCallMade: providerResult.requestCount > 0,
    providerRequestCount: providerResult.requestCount,
    receipt: persisted.receipt,
    measurement,
  });
}
