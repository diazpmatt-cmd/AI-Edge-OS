import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema";
import {
  backlinkInventoryRunsTable,
  observedBacklinksTable,
  observedBacklinkTransitionsTable,
  type BacklinkInventoryRunRow,
  type ObservedBacklinkRow,
  type ObservedBacklinkTransitionRow,
} from "./schema/observed-backlinks";
import {
  applyBacklinkInventoryScan,
  canonicalizeObservedBacklink,
  observedBacklinkIdentityKey,
  type BacklinkInventoryScan,
  type ObservedBacklinkMetrics,
  type ObservedBacklinkState,
  type ObservedBacklinkTransition,
} from "./observed-backlink-lifecycle";

type Db = NodePgDatabase<typeof schema>;

export interface BacklinkInventoryRunReceipt {
  readonly id: string;
  readonly clientId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly providerRevision: string;
  readonly status: "succeeded" | "failed";
  readonly completeness: "complete" | "incomplete";
  readonly completedAt: string;
  readonly inputFingerprint: string;
  readonly observedCount: number;
  readonly absenceEvaluationApplied: boolean;
  readonly metrics: ObservedBacklinkMetrics;
}

export interface PersistedBacklinkInventoryResult {
  readonly outcome: "applied" | "replayed";
  readonly receipt: BacklinkInventoryRunReceipt;
  readonly transitions: readonly ObservedBacklinkTransition[];
}

export interface ObservedBacklinkRepository {
  applyInventoryScan(scan: BacklinkInventoryScan): Promise<PersistedBacklinkInventoryResult>;
  getInventoryRun(clientId: string, runId: string): Promise<BacklinkInventoryRunReceipt | null>;
  listStates(clientId: string): Promise<readonly ObservedBacklinkState[]>;
  listTransitions(clientId: string, limit?: number): Promise<readonly ObservedBacklinkTransition[]>;
}

function nonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  return normalized;
}

function iso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeScan(input: BacklinkInventoryScan): BacklinkInventoryScan {
  const clientId = nonEmpty(input.clientId, "scan.clientId");
  const runId = nonEmpty(input.runId, "scan.runId");
  const providerId = nonEmpty(input.providerId, "scan.providerId");
  const providerRevision = nonEmpty(input.providerRevision, "scan.providerRevision");
  if (providerId.length > 100 || providerRevision.length > 100) throw new Error("provider identity exceeds persistence limit");
  if (input.status !== "succeeded" && input.status !== "failed") throw new Error("invalid inventory run status");
  if (input.completeness !== "complete" && input.completeness !== "incomplete") throw new Error("invalid inventory completeness");

  const byKey = new Map<string, ReturnType<typeof canonicalizeObservedBacklink>>();
  for (const raw of input.links) {
    const link = canonicalizeObservedBacklink(raw);
    byKey.set(observedBacklinkIdentityKey(link), link);
  }

  return Object.freeze({
    clientId,
    runId,
    providerId,
    providerRevision,
    status: input.status,
    completeness: input.completeness,
    completedAt: iso(input.completedAt, "scan.completedAt"),
    links: Object.freeze([...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, link]) => Object.freeze(link))),
  });
}

export function deriveBacklinkInventoryFingerprint(input: BacklinkInventoryScan): string {
  const scan = normalizeScan(input);
  return sha256(JSON.stringify(scan));
}

export function deriveBacklinkInventoryRunRecordId(clientId: string, runId: string): string {
  return `blir::${sha256(`${nonEmpty(clientId, "clientId")}\u0000${nonEmpty(runId, "runId")}`).slice(0, 32)}`;
}

export function deriveObservedBacklinkRecordId(clientId: string, state: Pick<ObservedBacklinkState, "sourceUrl" | "sourceDomain" | "targetUrl">): string {
  const identity = observedBacklinkIdentityKey(canonicalizeObservedBacklink(state));
  return `blob::${sha256(`${nonEmpty(clientId, "clientId")}\u0000${identity}`).slice(0, 32)}`;
}

export function deriveObservedBacklinkTransitionId(transition: ObservedBacklinkTransition): string {
  const identity = observedBacklinkIdentityKey(transition);
  return `blot::${sha256(`${transition.clientId}\u0000${transition.runId}\u0000${transition.type}\u0000${identity}`).slice(0, 32)}`;
}

function fingerprintForNormalizedScan(scan: BacklinkInventoryScan): string {
  return sha256(JSON.stringify(scan));
}

function receiptFromScan(
  scan: BacklinkInventoryScan,
  fingerprint: string,
  result: ReturnType<typeof applyBacklinkInventoryScan>,
): BacklinkInventoryRunReceipt {
  return Object.freeze({
    id: deriveBacklinkInventoryRunRecordId(scan.clientId, scan.runId),
    clientId: scan.clientId,
    runId: scan.runId,
    providerId: scan.providerId,
    providerRevision: scan.providerRevision,
    status: scan.status,
    completeness: scan.completeness,
    completedAt: scan.completedAt,
    inputFingerprint: fingerprint,
    observedCount: scan.status === "succeeded" ? scan.links.length : 0,
    absenceEvaluationApplied: result.absenceEvaluationApplied,
    metrics: Object.freeze({ ...result.metrics }),
  });
}

function receiptFromRow(row: BacklinkInventoryRunRow): BacklinkInventoryRunReceipt {
  return Object.freeze({
    id: row.id,
    clientId: row.clientId,
    runId: row.runId,
    providerId: row.providerId,
    providerRevision: row.providerRevision,
    status: row.status as BacklinkInventoryRunReceipt["status"],
    completeness: row.completeness as BacklinkInventoryRunReceipt["completeness"],
    completedAt: row.completedAt.toISOString(),
    inputFingerprint: row.inputFingerprint,
    observedCount: row.observedCount,
    absenceEvaluationApplied: row.absenceEvaluationApplied,
    metrics: Object.freeze({
      activeBacklinkCount: row.activeBacklinkCount,
      referringDomainCount: row.referringDomainCount,
      newCount: row.newCount,
      lostCount: row.lostCount,
      restoredCount: row.restoredCount,
    }),
  });
}

function stateFromRow(row: ObservedBacklinkRow): ObservedBacklinkState {
  return Object.freeze({
    clientId: row.clientId,
    sourceUrl: row.sourceUrl,
    sourceDomain: row.sourceDomain,
    targetUrl: row.targetUrl,
    status: row.status as ObservedBacklinkState["status"],
    firstSeenAt: row.firstSeenAt.toISOString(),
    firstSeenRunId: row.firstSeenRunId,
    firstSeenProviderId: row.firstSeenProviderId,
    lastSeenAt: row.lastSeenAt.toISOString(),
    lastSeenRunId: row.lastSeenRunId,
    lastSeenProviderId: row.lastSeenProviderId,
    consecutiveSuccessfulMisses: row.consecutiveSuccessfulMisses,
    lastLostAt: row.lastLostAt?.toISOString() ?? null,
    lastLostRunId: row.lastLostRunId,
    reacquiredCount: row.reacquiredCount,
    lastReacquiredAt: row.lastReacquiredAt?.toISOString() ?? null,
    lastEvaluatedRunId: row.lastEvaluatedRunId,
    lastEvaluatedAt: row.lastEvaluatedAt?.toISOString() ?? null,
  });
}

function transitionFromRow(row: ObservedBacklinkTransitionRow): ObservedBacklinkTransition {
  return Object.freeze({
    type: row.type as ObservedBacklinkTransition["type"],
    clientId: row.clientId,
    runId: row.runId,
    providerId: row.providerId,
    sourceUrl: row.sourceUrl,
    sourceDomain: row.sourceDomain,
    targetUrl: row.targetUrl,
    at: row.at.toISOString(),
    consecutiveSuccessfulMisses: row.consecutiveSuccessfulMisses,
  });
}

function receiptValues(receipt: BacklinkInventoryRunReceipt) {
  return {
    id: receipt.id,
    clientId: receipt.clientId,
    runId: receipt.runId,
    providerId: receipt.providerId,
    providerRevision: receipt.providerRevision,
    status: receipt.status,
    completeness: receipt.completeness,
    completedAt: new Date(receipt.completedAt),
    inputFingerprint: receipt.inputFingerprint,
    observedCount: receipt.observedCount,
    absenceEvaluationApplied: receipt.absenceEvaluationApplied,
    activeBacklinkCount: receipt.metrics.activeBacklinkCount,
    referringDomainCount: receipt.metrics.referringDomainCount,
    newCount: receipt.metrics.newCount,
    lostCount: receipt.metrics.lostCount,
    restoredCount: receipt.metrics.restoredCount,
  };
}

function stateValues(state: ObservedBacklinkState) {
  return {
    id: deriveObservedBacklinkRecordId(state.clientId, state),
    clientId: state.clientId,
    sourceUrl: state.sourceUrl,
    sourceDomain: state.sourceDomain,
    targetUrl: state.targetUrl,
    status: state.status,
    firstSeenAt: new Date(state.firstSeenAt),
    firstSeenRunId: state.firstSeenRunId,
    firstSeenProviderId: state.firstSeenProviderId,
    lastSeenAt: new Date(state.lastSeenAt),
    lastSeenRunId: state.lastSeenRunId,
    lastSeenProviderId: state.lastSeenProviderId,
    consecutiveSuccessfulMisses: state.consecutiveSuccessfulMisses,
    lastLostAt: state.lastLostAt ? new Date(state.lastLostAt) : null,
    lastLostRunId: state.lastLostRunId,
    reacquiredCount: state.reacquiredCount,
    lastReacquiredAt: state.lastReacquiredAt ? new Date(state.lastReacquiredAt) : null,
    lastEvaluatedRunId: state.lastEvaluatedRunId,
    lastEvaluatedAt: state.lastEvaluatedAt ? new Date(state.lastEvaluatedAt) : null,
    updatedAt: new Date(),
  };
}

function transitionValues(entry: ObservedBacklinkTransition) {
  return {
    id: deriveObservedBacklinkTransitionId(entry),
    clientId: entry.clientId,
    runId: entry.runId,
    providerId: entry.providerId,
    type: entry.type,
    sourceUrl: entry.sourceUrl,
    sourceDomain: entry.sourceDomain,
    targetUrl: entry.targetUrl,
    at: new Date(entry.at),
    consecutiveSuccessfulMisses: entry.consecutiveSuccessfulMisses,
  };
}

/** Credential-free reference implementation used by lifecycle persistence tests. */
export class InMemoryObservedBacklinkRepository implements ObservedBacklinkRepository {
  private readonly statesByClient = new Map<string, ObservedBacklinkState[]>();
  private readonly receipts = new Map<string, BacklinkInventoryRunReceipt>();
  private readonly transitionsByClient = new Map<string, ObservedBacklinkTransition[]>();

  async applyInventoryScan(input: BacklinkInventoryScan): Promise<PersistedBacklinkInventoryResult> {
    const scan = normalizeScan(input);
    const fingerprint = fingerprintForNormalizedScan(scan);
    const receiptKey = `${scan.clientId}\u0000${scan.runId}`;
    const existing = this.receipts.get(receiptKey);
    if (existing) {
      if (existing.inputFingerprint !== fingerprint) throw new Error("inventory_run_conflict: same client/runId has different input");
      const transitions = (this.transitionsByClient.get(scan.clientId) ?? []).filter(entry => entry.runId === scan.runId);
      return Object.freeze({ outcome: "replayed", receipt: structuredClone(existing), transitions: structuredClone(transitions) });
    }

    const current = this.statesByClient.get(scan.clientId) ?? [];
    const applied = applyBacklinkInventoryScan(current, scan);
    const receipt = receiptFromScan(scan, fingerprint, applied);
    this.statesByClient.set(scan.clientId, structuredClone([...applied.states]));
    this.receipts.set(receiptKey, structuredClone(receipt));
    const transitions = [...(this.transitionsByClient.get(scan.clientId) ?? []), ...applied.transitions];
    this.transitionsByClient.set(scan.clientId, structuredClone(transitions));
    return Object.freeze({ outcome: "applied", receipt: structuredClone(receipt), transitions: structuredClone([...applied.transitions]) });
  }

  async getInventoryRun(clientId: string, runId: string) {
    return structuredClone(this.receipts.get(`${nonEmpty(clientId, "clientId")}\u0000${nonEmpty(runId, "runId")}`) ?? null);
  }

  async listStates(clientId: string) {
    const states = structuredClone(this.statesByClient.get(nonEmpty(clientId, "clientId")) ?? []);
    return states.sort((a, b) => observedBacklinkIdentityKey(a).localeCompare(observedBacklinkIdentityKey(b)));
  }

  async listTransitions(clientId: string, limit = 100) {
    const boundedLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
    return structuredClone(this.transitionsByClient.get(nonEmpty(clientId, "clientId")) ?? [])
      .sort((a, b) => a.at.localeCompare(b.at) || deriveObservedBacklinkTransitionId(a).localeCompare(deriveObservedBacklinkTransitionId(b)))
      .slice(-boundedLimit);
  }
}

/** Production implementation. Inventory application is serialized per tenant and committed atomically. */
export class DrizzleObservedBacklinkRepository implements ObservedBacklinkRepository {
  constructor(private readonly db: Db) {}

  async applyInventoryScan(input: BacklinkInventoryScan): Promise<PersistedBacklinkInventoryResult> {
    const scan = normalizeScan(input);
    const fingerprint = fingerprintForNormalizedScan(scan);

    return this.db.transaction(async tx => {
      // Serialize inventory state transitions for one tenant without blocking other tenants.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${scan.clientId}))`);

      const [existing] = await tx.select().from(backlinkInventoryRunsTable)
        .where(and(eq(backlinkInventoryRunsTable.clientId, scan.clientId), eq(backlinkInventoryRunsTable.runId, scan.runId)))
        .limit(1);
      if (existing) {
        if (existing.inputFingerprint !== fingerprint) throw new Error("inventory_run_conflict: same client/runId has different input");
        const transitionRows = await tx.select().from(observedBacklinkTransitionsTable)
          .where(and(eq(observedBacklinkTransitionsTable.clientId, scan.clientId), eq(observedBacklinkTransitionsTable.runId, scan.runId)))
          .orderBy(asc(observedBacklinkTransitionsTable.at), asc(observedBacklinkTransitionsTable.id));
        return Object.freeze({ outcome: "replayed" as const, receipt: receiptFromRow(existing), transitions: Object.freeze(transitionRows.map(transitionFromRow)) });
      }

      const currentRows = await tx.select().from(observedBacklinksTable)
        .where(eq(observedBacklinksTable.clientId, scan.clientId))
        .orderBy(asc(observedBacklinksTable.id));
      const applied = applyBacklinkInventoryScan(currentRows.map(stateFromRow), scan);
      const receipt = receiptFromScan(scan, fingerprint, applied);

      await tx.insert(backlinkInventoryRunsTable).values(receiptValues(receipt));

      for (const state of applied.states) {
        const value = stateValues(state);
        await tx.insert(observedBacklinksTable).values(value).onConflictDoUpdate({
          target: observedBacklinksTable.id,
          set: {
            sourceUrl: value.sourceUrl,
            sourceDomain: value.sourceDomain,
            targetUrl: value.targetUrl,
            status: value.status,
            firstSeenAt: value.firstSeenAt,
            firstSeenRunId: value.firstSeenRunId,
            firstSeenProviderId: value.firstSeenProviderId,
            lastSeenAt: value.lastSeenAt,
            lastSeenRunId: value.lastSeenRunId,
            lastSeenProviderId: value.lastSeenProviderId,
            consecutiveSuccessfulMisses: value.consecutiveSuccessfulMisses,
            lastLostAt: value.lastLostAt,
            lastLostRunId: value.lastLostRunId,
            reacquiredCount: value.reacquiredCount,
            lastReacquiredAt: value.lastReacquiredAt,
            lastEvaluatedRunId: value.lastEvaluatedRunId,
            lastEvaluatedAt: value.lastEvaluatedAt,
            updatedAt: value.updatedAt,
          },
        });
      }

      for (const entry of applied.transitions) {
        await tx.insert(observedBacklinkTransitionsTable).values(transitionValues(entry)).onConflictDoNothing({ target: observedBacklinkTransitionsTable.id });
      }

      return Object.freeze({ outcome: "applied" as const, receipt, transitions: Object.freeze([...applied.transitions]) });
    });
  }

  async getInventoryRun(clientId: string, runId: string) {
    const [row] = await this.db.select().from(backlinkInventoryRunsTable)
      .where(and(eq(backlinkInventoryRunsTable.clientId, nonEmpty(clientId, "clientId")), eq(backlinkInventoryRunsTable.runId, nonEmpty(runId, "runId"))))
      .limit(1);
    return row ? receiptFromRow(row) : null;
  }

  async listStates(clientId: string) {
    const rows = await this.db.select().from(observedBacklinksTable)
      .where(eq(observedBacklinksTable.clientId, nonEmpty(clientId, "clientId")))
      .orderBy(asc(observedBacklinksTable.sourceDomain), asc(observedBacklinksTable.sourceUrl), asc(observedBacklinksTable.targetUrl));
    return Object.freeze(rows.map(stateFromRow));
  }

  async listTransitions(clientId: string, limit = 100) {
    const boundedLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
    const rows = await this.db.select().from(observedBacklinkTransitionsTable)
      .where(eq(observedBacklinkTransitionsTable.clientId, nonEmpty(clientId, "clientId")))
      .orderBy(asc(observedBacklinkTransitionsTable.at), asc(observedBacklinkTransitionsTable.id));
    return Object.freeze(rows.slice(-boundedLimit).map(transitionFromRow));
  }
}
