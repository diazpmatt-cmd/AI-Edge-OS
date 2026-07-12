import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./bbb-services";
export * from "./client-context";
export * from "./db-service-registry-provider";
export * from "./registry-validator";
export * from "./scheduler-eligibility";

// ── Phase C2: Discovery Engine ────────────────────────────────────────────────
export * from "./discovery-types";
export * from "./discovery-providers";
export * from "./discovery-context";
export * from "./discovery-registry-gate";
export * from "./discovery-normalizer";
export * from "./discovery-cluster-builder";
export * from "./discovery-scorer";
export * from "./discovery-pipeline";

// ── Phase C4: DataForSEO Discovery Provider ────────────────────────────────────
export {
  parseDataForSEOConfig,
  getDataForSEOHealthState,
  buildBasicAuthHeader,
  estimateCostUSD,
  DataForSEOError,
} from "./dataforseo-config";
export type {
  DataForSEOConfig,
  DataForSEOHealthState,
  DataForSEOErrorKind,
} from "./dataforseo-config";

export {
  buildDataForSEOQueryPlan,
  buildLocationName,
  isQueryBlocked,
  isQueryEducationalOnly,
  inferQueryCategory,
} from "./dataforseo-query-planner";
export type {
  DataForSEOQueryPlan,
  PlannedSerpQuery,
  PlannedVolumeKeyword,
  QueryCategory,
} from "./dataforseo-query-planner";

export {
  DataForSEOAdapter,
  DataForSEOContextAdapter,
  extractCompetitorDomains,
  extractPAAQuestions,
} from "./dataforseo-adapter";

// ── Phase C3: Discovery Persistence ───────────────────────────────────────────
export {
  DrizzleDiscoveryRepository,
  InMemoryDiscoveryRepository,
  bootstrapDiscoveryTables,
  serializeSignal,
  deserializeSignal,
  serializeCluster,
  deserializeCluster,
  serializeOpportunity,
  deserializeOpportunity,
  serializeSnapshot,
  deserializeSnapshot,
  parseScoreCard,
  parseProviderFailures,
} from "./discovery-drizzle-repository";

// ── Phase C5: Capability + Orchestration + Coverage + Budget + Cost + Enrichment ──
export {
  DATAFORSEO_CAPABILITIES,
  ALL_CAPABILITIES,
  hasCapability,
  describeCapabilities,
} from "./discovery-capability";
export type {
  ProviderCapability,
  ProviderCapabilitySet,
  CapabilityDescription,
} from "./discovery-capability";

export {
  UnknownCoverageProvider,
} from "./discovery-coverage";
export type {
  CoverageResult,
  SiteCoverageProvider,
} from "./discovery-coverage";

export {
  MAX_RUN_CEILING_USD,
  DEFAULT_RUN_CEILING_USD,
  BudgetGuard,
} from "./discovery-budget-guard";
export type {
  BudgetPolicy,
  BudgetCheckResult,
  BudgetBlockReason,
  BudgetDiagnostic,
} from "./discovery-budget-guard";

export {
  bootstrapCostTable,
  saveCostRecords,
  deriveCostRecordId,
  CostLedger,
} from "./discovery-cost-ledger";
export type {
  ProviderCostRecord,
} from "./discovery-cost-ledger";

export {
  mergeSignals,
  mergeKeywordResults,
} from "./discovery-merger";

export {
  isRetryableError,
  SearchOrchestrator,
} from "./discovery-orchestrator";
export type {
  OrchestrationMode,
  OrchestrationProviderEntry,
  SearchOrchestratorConfig,
  ProviderExecutionRecord,
} from "./discovery-orchestrator";

export {
  extractEnrichmentFromSignals,
  enrichOpportunity,
} from "./discovery-enricher";

export { eq, and, or, sql } from "drizzle-orm";
