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
export * from "./gbp-audit-engine";
export * from "./gbp-optimization-engine";
export * from "./local-presence-providers";
export * from "./local-presence-adapters";

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

// ── Phase C6: Lifecycle Governance ────────────────────────────────────────────

// Schema additions (C6 tables + DiscoverySnapshotRow with new columns)
export {
  discoveryRunTransitionsTable,
  discoveryRunLeasesTable,
  discoveryIdempotencyTable,
  discoveryDiagnosticsTable,
  discoveryAuditTable,
} from "./schema/discovery";
export type {
  DiscoveryRunTransitionRow,
  DiscoveryRunLeaseRow,
  DiscoveryIdempotencyRow,
  DiscoveryDiagnosticRow,
  DiscoveryAuditRow,
} from "./schema/discovery";

// FSM + transitions
export {
  validateTransition,
  allowedNextStates,
  isTerminalState,
  isActiveState,
  isCancellable,
  normalizeRunState,
  deriveTransitionId,
  buildTransitionRecord,
  deriveTransitionFingerprint,
  assertTransition,
  InvalidTransitionError,
} from "./discovery-lifecycle";
export type {
  RunState,
  TransitionActorType,
  TransitionReasonCode,
  RunTransitionRecord,
} from "./discovery-lifecycle";

// Execution lease
export {
  LEASE_DURATION_MS,
  LEASE_MAX_DURATION_MS,
  LEASE_RECOVERY_GRACE_MS,
  DEFAULT_MAX_ACTIVE_RUNS_PER_CLIENT,
  isLeaseExpired,
  isLeaseRecoverable,
  isLeaseOwner,
  deriveLeasExpiry,
  deriveLeaseOwnerId,
} from "./discovery-lease";
export type {
  LeaseRecord,
  LeaseAcquireResult,
  LeaseAcquireFailureReason,
  LeaseRenewResult,
  LeaseReleaseResult,
  LeaseRecoveryResult,
} from "./discovery-lease";

// Idempotency
export {
  IDEMPOTENCY_TTL_MS,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_PATTERN,
  deriveIdempotencyId,
  deriveRequestFingerprint,
  validateIdempotencyKey,
  isIdempotencyExpired,
  fingerprintMatches,
  deriveIdempotencyExpiry,
} from "./discovery-idempotency";
export type {
  IdempotencyOperation,
  IdempotencyRecord,
  IdempotencyCheckResult,
} from "./discovery-idempotency";

// Progress
export {
  PIPELINE_STAGES,
  TOTAL_PIPELINE_STAGES,
  calculateProgress,
  stageIndex,
  stageIsBefore,
  buildInitialProgress,
  isValidProgressSnapshot,
} from "./discovery-progress";
export type {
  PipelineStage,
  StageStatus,
  StageOutcome,
  ProgressSnapshot,
} from "./discovery-progress";

// Diagnostics
export {
  sanitizeMetadata,
  redactSecrets,
  deriveDiagnosticId,
  createDiagnosticEvent,
} from "./discovery-diagnostics";
export type {
  DiagnosticSeverity,
  DiagnosticCode,
  DiagnosticEvent,
} from "./discovery-diagnostics";

// Governance
export {
  DEFAULT_GOVERNANCE_POLICY,
  evaluateGovernance,
  evaluateProviderOpLimit,
  evaluateMergeConcurrency,
} from "./discovery-governance";
export type {
  GovernancePolicy,
  GovernanceDenyReason,
  GovernanceResult,
} from "./discovery-governance";

// Cancellation
export {
  NullCancellationToken,
  CancellationSignal,
  shouldCancel,
} from "./discovery-cancellation";
export type {
  CancellationObservationPoint,
  CancellationReasonCode,
  CancellationToken,
} from "./discovery-cancellation";

// Audit
export {
  deriveAuditId,
  createAuditEvent,
} from "./discovery-audit";
export type {
  AuditAction,
  AuditActorType,
  AuditEvent,
} from "./discovery-audit";

// Rate limiter (pure in-memory, no Express dependency)
export {
  DiscoveryRateLimiter,
  discoveryRateLimiter,
  DEFAULT_RATE_LIMIT_POLICIES,
} from "./discovery-rate-limiter";
export type {
  RateLimitOperation,
  RateLimitPolicy,
  RateLimitResult,
} from "./discovery-rate-limiter";

// C6 repository (persistence)
export {
  bootstrapC6Tables,
  appendTransition,
  getTransitionHistory,
  nextTransitionSeq,
  updateRunState,
  acquireLease,
  releaseLease,
  renewLease,
  recoverLease,
  getActiveRunCount,
  checkIdempotency,
  saveIdempotency,
  pruneExpiredIdempotency,
  appendDiagnostic,
  getDiagnosticEvents,
  appendAudit,
  getAuditEvents,
  getRunInspection,
  findStaleRuns,
} from "./discovery-c6-repository";
export type {
  RunInspectionResult,
  StaleRunInfo,
} from "./discovery-c6-repository";

export { eq, and, or, ne, sql } from "drizzle-orm";

// ── Phase C7: Discovery Scheduling ────────────────────────────────────────────

// Schedule model (pure logic)
export {
  validateScheduleTransition,
  allowedScheduleNextStates,
  isScheduleTerminal,
  isScheduleEligibleForDispatch,
  isCountableFailure,
  isValidScheduleTimezone,
  validateCronExpression,
  calculateNextRun,
  enumerateCronOccurrences,
  resolveCatchUp,
  validateScheduleInput,
  deriveScheduleId,
  deriveOccurrenceId,
  deriveOccurrenceIdempotencyKey,
  deriveSchedulerOwnerId,
  SCHEDULER_LEADER_ID,
} from "./discovery-schedule";
export type {
  ScheduleStatus,
  OccurrenceStatus,
  OverlapPolicy,
  CatchUpPolicy,
  FailureCategory,
  DiscoverySchedule,
  ScheduleOccurrence,
  SchedulerLeadershipRecord,
  LeadershipAcquireResult,
  CatchUpResolution,
  ScheduleValidationError,
  ScheduleValidationResult,
} from "./discovery-schedule";

// Schedule policy (pure logic)
export {
  DEFAULT_SCHEDULE_FAILURE_POLICY,
  evaluateFailurePolicy,
  resetFailureCount,
  evaluateScheduleBudget,
  resolveOverlap,
  evaluateCatchUpBudget,
  makeEmptyTickSummary,
} from "./discovery-schedule-policy";
export type {
  ScheduleFailurePolicy,
  FailurePolicyAction,
  FailurePolicyResult,
  ScheduleBudgetPolicy,
  ScheduleBudgetDenyReason,
  ScheduleBudgetCheckResult,
  OverlapDecision,
  OverlapResolutionResult,
  SchedulerTickOutcome,
  SchedulerTickSummary,
} from "./discovery-schedule-policy";

// C7 schema tables
export {
  discoverySchedulesTable,
  discoveryScheduleOccurrencesTable,
  discoverySchedulerLeadershipTable,
} from "./schema/discovery-schedules";
export type {
  DiscoveryScheduleRow,
  DiscoveryScheduleInsert,
  DiscoveryScheduleOccurrenceRow,
  DiscoveryScheduleOccurrenceInsert,
  DiscoverySchedulerLeadershipRow,
  DiscoverySchedulerLeadershipInsert,
} from "./schema/discovery-schedules";

// Phase C8R-1: provider-agnostic backlink foundation (pure; no persistence)
export * from "./backlink-types";
export * from "./backlink-providers";
export * from "./backlink-normalizer";
export * from "./backlink-scorer";
export * from "./backlink-fixtures";
export * from "./backlink-persistence-types";
export * from "./backlink-lifecycle";
export * from "./backlink-repository";
export * from "./schema/backlinks";
export * from "./backlink-provider-fixtures";
export * from "./backlink-fixture-provider";
export * from "./backlink-ingestion";
export * from "./backlink-ingestion-run";

// Competitor Intelligence Engine — canonical entity layer
export * from "./competitor-types";
export * from "./competitor-extractor";
export { DrizzleCompetitorRepository } from "./competitor-repository";

// Phase 5: Provider Intelligence Foundation — observation types + provider interface
export * from "./competitor-observation-types";
export * from "./competitor-enrichment-provider";

// Phase C8R-5: tenant-safe, pure AI Visibility read model (legacy audits remain noncanonical)
export * from "./ai-visibility-read-model-types";
export * from "./ai-visibility-prioritizer";
export * from "./ai-visibility-read-model-adapters";
export * from "./ai-visibility-read-model";
export * from "./ai-visibility-fixtures";

// C7 repository (schedule CRUD + leadership + claiming)
export {
  bootstrapC7Tables,
  insertSchedule,
  getSchedule,
  listSchedules,
  updateScheduleStatus,
  updateScheduleAfterRun,
  updateScheduleNextRun,
  atomicAdvanceScheduleNextRun,
  findDueSchedules,
  insertOccurrence,
  updateOccurrenceStatus,
  getOccurrenceByScheduleAndTime,
  listRecentOccurrences,
  countActiveOccurrences,
  countPendingOccurrences,
  findStaleClaimedOccurrences,
  releaseStaleOccurrenceClaim,
  acquireSchedulerLeadership,
  releaseSchedulerLeadership,
  getSchedulerLeadership,
} from "./discovery-c7-repository";
