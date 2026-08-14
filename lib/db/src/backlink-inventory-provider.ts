import type {
  BacklinkInventoryCompleteness,
  BacklinkInventoryObservation,
  BacklinkInventoryScan,
} from "./observed-backlink-lifecycle";

export interface BacklinkInventoryProviderInput {
  readonly clientId: string;
  readonly clientDomain: string;
  /** Provider response row ceiling. Must never exceed the provider's documented maximum. */
  readonly limit: number;
}

export type BacklinkInventoryProviderResult =
  | {
      readonly status: "succeeded";
      readonly providerId: string;
      readonly providerRevision: string;
      readonly completeness: BacklinkInventoryCompleteness;
      readonly links: readonly BacklinkInventoryObservation[];
      readonly requestCount: number;
      readonly providerTotalCount: number;
      readonly providerItemsCount: number;
      readonly reason: null | "provider_result_capped" | "provider_items_incomplete";
    }
  | {
      readonly status: "failed";
      readonly providerId: string;
      readonly providerRevision: string;
      readonly completeness: "incomplete";
      readonly links: readonly [];
      readonly requestCount: number;
      readonly providerTotalCount: null;
      readonly providerItemsCount: null;
      readonly reason: string;
    };

export interface BacklinkInventoryProvider {
  readonly name: string;
  readonly revision: string;
  scan(input: BacklinkInventoryProviderInput): Promise<BacklinkInventoryProviderResult>;
}

export function buildBacklinkInventoryScanFromProviderResult(input: {
  readonly clientId: string;
  readonly runId: string;
  readonly completedAt: string;
  readonly result: BacklinkInventoryProviderResult;
}): BacklinkInventoryScan {
  const clientId = input.clientId.trim();
  const runId = input.runId.trim();
  if (!clientId) throw new Error("client_id_required");
  if (!runId) throw new Error("run_id_required");
  if (!Number.isFinite(Date.parse(input.completedAt))) throw new Error("completed_at_invalid");

  return Object.freeze({
    clientId,
    runId,
    providerId: input.result.providerId,
    providerRevision: input.result.providerRevision,
    status: input.result.status,
    completeness: input.result.status === "succeeded"
      ? input.result.completeness
      : "incomplete",
    completedAt: new Date(input.completedAt).toISOString(),
    links: input.result.status === "succeeded"
      ? Object.freeze([...input.result.links])
      : Object.freeze([]),
  });
}
