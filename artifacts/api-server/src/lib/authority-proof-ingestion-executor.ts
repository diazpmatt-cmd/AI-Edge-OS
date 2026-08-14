import {
  DataForSEOBacklinkAdapter,
  ingestBacklinks,
  type BacklinkDataProvider,
  type BacklinkDiscoveryInput,
  type BacklinkRepository,
  type DataForSEOBacklinkConfig,
} from "@workspace/db";
import { buildAuthorityProofDataForSEOConfig } from "./authority-proof-cost-estimate.js";
import type { AuthorityProofExecutionDependencies } from "./authority-proof-execution.js";
import type { AuthorityScheduledExecutionPlan } from "./authority-scheduled-execution-plan.js";

export class AuthorityProofFailedRunRequiresReviewError extends Error {
  constructor(readonly runId: string) {
    super(`Authority proof run ${runId} previously failed; a second provider attempt is blocked pending a separately reviewed proof plan.`);
    this.name = "AuthorityProofFailedRunRequiresReviewError";
  }
}

function sameCapabilities(provider: BacklinkDataProvider, plan: AuthorityScheduledExecutionPlan): boolean {
  const providerCapabilities = [...provider.capabilities].sort();
  const planCapabilities = [...plan.capabilities].sort();
  return providerCapabilities.length === planCapabilities.length &&
    providerCapabilities.every((value, index) => value === planCapabilities[index]);
}

/**
 * Builds the only provider-facing dependency intended for the first Authority
 * proof. It remains unmounted: callers must still pass this dependency through
 * executeAuthorityProofOnce(), whose spend + arm gates run before this method.
 *
 * Safety properties:
 * - reuses canonical ingestBacklinks() and its tenant-scoped ingestion ledger;
 * - forces one logical provider request and one HTTP attempt via proof config;
 * - enables strict DataForSEO failure propagation;
 * - refuses to reclaim a failed proof run, preventing a second billable attempt
 *   from the same deterministic proof plan;
 * - reports provider-call and replay truth from an instrumented provider wrapper.
 */
export function createAuthorityProofIngestionExecutor(input: {
  readonly baseConfig: DataForSEOBacklinkConfig;
  readonly repository: BacklinkRepository;
  readonly fetchFn?: typeof globalThis.fetch;
}): AuthorityProofExecutionDependencies {
  const proofConfig = buildAuthorityProofDataForSEOConfig(input.baseConfig);

  return Object.freeze({
    async executeIngestion(
      { plan, now }: { readonly plan: AuthorityScheduledExecutionPlan; readonly now: Date },
    ) {
      if (plan.providerId !== "dataforseo_backlinks") {
        throw new Error("Authority proof executor only supports the canonical DataForSEO backlinks provider.");
      }
      if (proofConfig.maxRequestsPerRun !== 1 || proofConfig.retry.maxAttempts !== 1) {
        throw new Error("Authority proof executor requires exactly one provider request and one HTTP attempt.");
      }

      const strictProvider = new DataForSEOBacklinkAdapter(
        proofConfig,
        input.fetchFn ?? globalThis.fetch,
        { strictFailures: true },
      );
      if (strictProvider.name !== plan.providerId || !sameCapabilities(strictProvider, plan)) {
        throw new Error("Authority proof provider identity/capabilities do not match the canonical plan.");
      }

      const priorRun = await input.repository.getIngestionRun(plan.runId, plan.clientId);
      if (priorRun?.status === "failed") {
        throw new AuthorityProofFailedRunRequiresReviewError(plan.runId);
      }

      let providerCallMade = false;
      const instrumentedProvider: BacklinkDataProvider = Object.freeze({
        name: strictProvider.name,
        capabilities: strictProvider.capabilities,
        async discover(discovery: BacklinkDiscoveryInput) {
          providerCallMade = true;
          return strictProvider.discover(discovery);
        },
      });

      const result = await ingestBacklinks({
        trustedClientId: plan.clientId,
        provider: instrumentedProvider,
        discovery: plan.discovery,
        normalizationPolicy: {
          allowedServiceIds: new Set(plan.allowedServiceIds),
          now,
        },
        repository: input.repository,
        now,
        mode: "scheduled",
        providerRevision: plan.providerRevision,
      });

      return Object.freeze({
        providerCallMade,
        replayed: !providerCallMade && !("outcome" in result),
        result,
      });
    },
  });
}
