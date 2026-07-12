/**
 * Phase C6 — Run Progress Model
 *
 * Defines a canonical progress snapshot for operational visibility of discovery runs.
 *
 * Progress is derived from pipeline stage completion — not arbitrary UI percentages.
 * Stages map directly to DiscoveryPipeline stages 1–11.
 *
 * Persist progress at stage boundaries (not every loop iteration) to avoid
 * excessive writes. Fire-and-forget — progress write failures must not abort runs.
 *
 * No Math.random(). No credentials. No BB&B-specific values.
 */

// ── Pipeline stage definitions ────────────────────────────────────────────────

export type PipelineStage =
  | "seed_extraction"           // Stage 1: pure, always succeeds
  | "keyword_expansion"         // Stage 2: SearchDataProvider
  | "paa_extraction"            // Stage 3: PeopleAlsoAskProvider
  | "trend_overlay"             // Stage 4: TrendProvider
  | "competitor_gap"            // Stage 5: SearchDataProvider.fetchCompetitorKeywords
  | "ai_search_audit"           // Stage 6: AISearchProvider
  | "social_listening"          // Stage 7: SocialListeningProvider
  | "registry_gate"             // Stage 8: pure registry filter
  | "cluster_building"          // Stage 9: pure cluster grouping
  | "opportunity_scoring"       // Stage 10: pure opportunity scoring
  | "persistence";              // Stage 11: DB write

/** Ordered list of all pipeline stages. Index 0 = first to execute. */
export const PIPELINE_STAGES: PipelineStage[] = [
  "seed_extraction",
  "keyword_expansion",
  "paa_extraction",
  "trend_overlay",
  "competitor_gap",
  "ai_search_audit",
  "social_listening",
  "registry_gate",
  "cluster_building",
  "opportunity_scoring",
  "persistence",
];

export const TOTAL_PIPELINE_STAGES = PIPELINE_STAGES.length;

// ── Stage status ──────────────────────────────────────────────────────────────

export type StageStatus = "pending" | "running" | "complete" | "failed" | "skipped" | "cancelled";

export interface StageOutcome {
  stage:       PipelineStage;
  status:      StageStatus;
  provider:    string | null;
  capability:  string | null;
  startedAt:   Date | null;
  completedAt: Date | null;
  durationMs:  number | null;
  /** Safe error message — no stack traces, no credentials. */
  errorMessage: string | null;
}

// ── Progress snapshot ─────────────────────────────────────────────────────────

/**
 * Canonical progress snapshot persisted at stage boundaries.
 * Stored in discovery_snapshots.progress (JSONB) — not a separate table
 * to minimize write amplification.
 */
export interface ProgressSnapshot {
  /** Current stage being executed. null if not yet started or fully complete. */
  currentStage:     PipelineStage | null;
  completedStages:  PipelineStage[];
  failedStages:     PipelineStage[];
  skippedStages:    PipelineStage[];
  totalStages:      number;
  /** 0–100 integer. Derived from completed / total — never from arbitrary estimates. */
  percentComplete:  number;
  /** Provider name currently executing (null when not in a provider stage). */
  currentProvider:  string | null;
  /** Capability currently being exercised (null when not in a provider stage). */
  currentCapability: string | null;
  /** Count of signals collected so far. */
  signalsCollected: number;
  /** Count of clusters built so far. */
  clustersBuilt:    number;
  /** Count of opportunities created so far. */
  opportunitiesCreated: number;
  /** Count of provider calls attempted. */
  providerCallsAttempted: number;
  /** Count of provider calls that returned successfully. */
  providerCallsCompleted: number;
  /** Estimated cost in USD (from budget guard plan). null if no estimate. */
  estimatedCostUSD: number | null;
  /** Actual cost tracked by CostLedger. null if not yet recorded. */
  actualCostUSD:    number | null;
  /** Timestamp of last transition. */
  lastTransitionAt: Date | null;
  /** When this snapshot was written. */
  updatedAt:        Date;
  /** Ordered stage outcomes for detailed inspection. */
  stageOutcomes:    StageOutcome[];
}

// ── Progress calculation helpers ──────────────────────────────────────────────

/**
 * Calculates a ProgressSnapshot from the current pipeline state.
 *
 * percentComplete = floor((completedStages.length / totalStages) * 100)
 * Always 0–100 regardless of inputs — clamped.
 */
export function calculateProgress(params: {
  currentStage?:          PipelineStage | null;
  completedStages?:       PipelineStage[];
  failedStages?:          PipelineStage[];
  skippedStages?:         PipelineStage[];
  currentProvider?:       string | null;
  currentCapability?:     string | null;
  signalsCollected?:      number;
  clustersBuilt?:         number;
  opportunitiesCreated?:  number;
  providerCallsAttempted?: number;
  providerCallsCompleted?: number;
  estimatedCostUSD?:      number | null;
  actualCostUSD?:         number | null;
  lastTransitionAt?:      Date | null;
  stageOutcomes?:         StageOutcome[];
}): ProgressSnapshot {
  const completed  = params.completedStages  ?? [];
  const failed     = params.failedStages     ?? [];
  const skipped    = params.skippedStages    ?? [];
  const resolved   = completed.length + failed.length + skipped.length;
  const pct        = Math.max(0, Math.min(100, Math.floor((resolved / TOTAL_PIPELINE_STAGES) * 100)));

  return {
    currentStage:            params.currentStage     ?? null,
    completedStages:         completed,
    failedStages:            failed,
    skippedStages:           skipped,
    totalStages:             TOTAL_PIPELINE_STAGES,
    percentComplete:         pct,
    currentProvider:         params.currentProvider  ?? null,
    currentCapability:       params.currentCapability ?? null,
    signalsCollected:        params.signalsCollected  ?? 0,
    clustersBuilt:           params.clustersBuilt     ?? 0,
    opportunitiesCreated:    params.opportunitiesCreated ?? 0,
    providerCallsAttempted:  params.providerCallsAttempted ?? 0,
    providerCallsCompleted:  params.providerCallsCompleted ?? 0,
    estimatedCostUSD:        params.estimatedCostUSD  ?? null,
    actualCostUSD:           params.actualCostUSD     ?? null,
    lastTransitionAt:        params.lastTransitionAt  ?? null,
    updatedAt:               new Date(),
    stageOutcomes:           params.stageOutcomes     ?? [],
  };
}

/**
 * Returns the index of a stage in PIPELINE_STAGES (0-based).
 * Returns -1 if not found.
 */
export function stageIndex(stage: PipelineStage): number {
  return PIPELINE_STAGES.indexOf(stage);
}

/**
 * Returns true if stageA comes before stageB in the pipeline.
 */
export function stageIsBefore(stageA: PipelineStage, stageB: PipelineStage): boolean {
  return stageIndex(stageA) < stageIndex(stageB);
}

/**
 * Builds an initial ProgressSnapshot for a run that has just been queued.
 * All stages are pending; no work has started.
 */
export function buildInitialProgress(): ProgressSnapshot {
  return calculateProgress({});
}

/**
 * Returns a ProgressSnapshot Zod schema shape for JSONB validation.
 * Returns the schema as a plain object (no Zod import — keep this file pure).
 */
export function isValidProgressSnapshot(value: unknown): value is ProgressSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["totalStages"]      === "number" &&
    typeof v["percentComplete"]  === "number" &&
    Array.isArray(v["completedStages"]) &&
    Array.isArray(v["stageOutcomes"])
  );
}
