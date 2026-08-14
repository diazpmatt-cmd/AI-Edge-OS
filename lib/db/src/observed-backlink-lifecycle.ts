export type ObservedBacklinkStatus = "active" | "lost";
export type BacklinkInventoryRunStatus = "succeeded" | "failed";
export type BacklinkInventoryCompleteness = "complete" | "incomplete";

export interface ObservedBacklinkIdentity {
  readonly sourceUrl: string;
  readonly sourceDomain: string;
  readonly targetUrl: string;
}

export interface ObservedBacklinkState extends ObservedBacklinkIdentity {
  readonly clientId: string;
  readonly status: ObservedBacklinkStatus;
  readonly firstSeenAt: string;
  readonly firstSeenRunId: string;
  readonly firstSeenProviderId: string;
  readonly lastSeenAt: string;
  readonly lastSeenRunId: string;
  readonly lastSeenProviderId: string;
  readonly consecutiveSuccessfulMisses: number;
  /** Most recent confirmed loss, retained after reacquisition for auditability. */
  readonly lastLostAt: string | null;
  readonly lastLostRunId: string | null;
  readonly reacquiredCount: number;
  readonly lastReacquiredAt: string | null;
  /** Most recent successful complete run that evaluated this link for absence. */
  readonly lastEvaluatedRunId: string | null;
  readonly lastEvaluatedAt: string | null;
}

export interface BacklinkInventoryObservation extends ObservedBacklinkIdentity {}

export interface BacklinkInventoryScan {
  readonly clientId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly providerRevision: string;
  readonly status: BacklinkInventoryRunStatus;
  readonly completeness: BacklinkInventoryCompleteness;
  readonly completedAt: string;
  readonly links: readonly BacklinkInventoryObservation[];
}

export type ObservedBacklinkTransitionType =
  | "new"
  | "still_observed"
  | "possibly_missing"
  | "lost"
  | "restored";

export interface ObservedBacklinkTransition {
  readonly type: ObservedBacklinkTransitionType;
  readonly clientId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly sourceUrl: string;
  readonly sourceDomain: string;
  readonly targetUrl: string;
  readonly at: string;
  readonly consecutiveSuccessfulMisses: number;
}

export interface ObservedBacklinkMetrics {
  readonly activeBacklinkCount: number;
  readonly referringDomainCount: number;
  readonly newCount: number;
  readonly lostCount: number;
  readonly restoredCount: number;
}

export interface ApplyBacklinkInventoryScanResult {
  readonly states: readonly ObservedBacklinkState[];
  readonly transitions: readonly ObservedBacklinkTransition[];
  readonly metrics: ObservedBacklinkMetrics;
  /** Failed scans are ignored entirely. Incomplete scans record positive observations but never absences. */
  readonly absenceEvaluationApplied: boolean;
}

export interface ApplyBacklinkInventoryScanOptions {
  /** Fail-closed default: a link must be absent from two successful complete scans before loss. */
  readonly confirmedLossAfterMisses?: number;
}

function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} must be non-empty`);
  return trimmed;
}

function assertIsoTimestamp(value: string, field: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(timestamp).toISOString();
}

function canonicalizeUrl(value: string, field: string): string {
  const raw = assertNonEmpty(value, field);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${field} must be an absolute URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${field} must use http or https`);
  }
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = "";
  }
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.searchParams.sort();
  return parsed.toString();
}

function canonicalizeDomain(value: string): string {
  const domain = assertNonEmpty(value, "sourceDomain").toLowerCase().replace(/\.$/, "");
  if (domain.includes("://") || domain.includes("/") || /\s/.test(domain)) {
    throw new Error("sourceDomain must be a canonical domain, not a URL");
  }
  return domain.startsWith("www.") ? domain.slice(4) : domain;
}

export function canonicalizeObservedBacklink(
  observation: ObservedBacklinkIdentity,
): ObservedBacklinkIdentity {
  return {
    sourceUrl: canonicalizeUrl(observation.sourceUrl, "sourceUrl"),
    sourceDomain: canonicalizeDomain(observation.sourceDomain),
    targetUrl: canonicalizeUrl(observation.targetUrl, "targetUrl"),
  };
}

export function observedBacklinkIdentityKey(identity: ObservedBacklinkIdentity): string {
  const canonical = canonicalizeObservedBacklink(identity);
  return `${canonical.sourceUrl}\u0000${canonical.targetUrl}`;
}

function normalizeState(state: ObservedBacklinkState): ObservedBacklinkState {
  const identity = canonicalizeObservedBacklink(state);
  if (state.consecutiveSuccessfulMisses < 0 || !Number.isInteger(state.consecutiveSuccessfulMisses)) {
    throw new Error("consecutiveSuccessfulMisses must be a non-negative integer");
  }
  if (state.reacquiredCount < 0 || !Number.isInteger(state.reacquiredCount)) {
    throw new Error("reacquiredCount must be a non-negative integer");
  }
  return {
    ...state,
    ...identity,
    clientId: assertNonEmpty(state.clientId, "state.clientId"),
    firstSeenAt: assertIsoTimestamp(state.firstSeenAt, "firstSeenAt"),
    lastSeenAt: assertIsoTimestamp(state.lastSeenAt, "lastSeenAt"),
    lastLostAt: state.lastLostAt ? assertIsoTimestamp(state.lastLostAt, "lastLostAt") : null,
    lastReacquiredAt: state.lastReacquiredAt ? assertIsoTimestamp(state.lastReacquiredAt, "lastReacquiredAt") : null,
    lastEvaluatedAt: state.lastEvaluatedAt ? assertIsoTimestamp(state.lastEvaluatedAt, "lastEvaluatedAt") : null,
  };
}

function transition(
  type: ObservedBacklinkTransitionType,
  state: ObservedBacklinkState,
  scan: BacklinkInventoryScan,
): ObservedBacklinkTransition {
  return {
    type,
    clientId: scan.clientId,
    runId: scan.runId,
    providerId: scan.providerId,
    sourceUrl: state.sourceUrl,
    sourceDomain: state.sourceDomain,
    targetUrl: state.targetUrl,
    at: scan.completedAt,
    consecutiveSuccessfulMisses: state.consecutiveSuccessfulMisses,
  };
}

export function summarizeObservedBacklinks(
  states: readonly ObservedBacklinkState[],
  transitions: readonly ObservedBacklinkTransition[] = [],
): ObservedBacklinkMetrics {
  const active = states.filter((state) => state.status === "active");
  return {
    activeBacklinkCount: active.length,
    referringDomainCount: new Set(active.map((state) => canonicalizeDomain(state.sourceDomain))).size,
    newCount: transitions.filter((entry) => entry.type === "new").length,
    lostCount: transitions.filter((entry) => entry.type === "lost").length,
    restoredCount: transitions.filter((entry) => entry.type === "restored").length,
  };
}

export function applyBacklinkInventoryScan(
  currentStates: readonly ObservedBacklinkState[],
  inputScan: BacklinkInventoryScan,
  options: ApplyBacklinkInventoryScanOptions = {},
): ApplyBacklinkInventoryScanResult {
  const confirmedLossAfterMisses = options.confirmedLossAfterMisses ?? 2;
  if (!Number.isInteger(confirmedLossAfterMisses) || confirmedLossAfterMisses < 2) {
    throw new Error("confirmedLossAfterMisses must be an integer >= 2");
  }

  const scan: BacklinkInventoryScan = {
    ...inputScan,
    clientId: assertNonEmpty(inputScan.clientId, "scan.clientId"),
    runId: assertNonEmpty(inputScan.runId, "scan.runId"),
    providerId: assertNonEmpty(inputScan.providerId, "scan.providerId"),
    providerRevision: assertNonEmpty(inputScan.providerRevision, "scan.providerRevision"),
    completedAt: assertIsoTimestamp(inputScan.completedAt, "scan.completedAt"),
    links: inputScan.links.map(canonicalizeObservedBacklink),
  };

  const normalizedStates = currentStates.map(normalizeState);
  for (const state of normalizedStates) {
    if (state.clientId !== scan.clientId) {
      throw new Error("tenant_mismatch: observed backlink state does not belong to scan client");
    }
  }

  if (scan.status === "failed") {
    return {
      states: normalizedStates,
      transitions: [],
      metrics: summarizeObservedBacklinks(normalizedStates),
      absenceEvaluationApplied: false,
    };
  }

  const scanTime = Date.parse(scan.completedAt);
  for (const state of normalizedStates) {
    if (state.lastEvaluatedAt && Date.parse(state.lastEvaluatedAt) > scanTime) {
      throw new Error("out_of_order_scan: scan predates already-evaluated backlink state");
    }
  }

  const observedByKey = new Map<string, ObservedBacklinkIdentity>();
  for (const link of scan.links) observedByKey.set(observedBacklinkIdentityKey(link), link);

  const existingByKey = new Map(normalizedStates.map((state) => [observedBacklinkIdentityKey(state), state]));
  const nextByKey = new Map(existingByKey);
  const transitions: ObservedBacklinkTransition[] = [];

  for (const [key, observed] of observedByKey) {
    const existing = existingByKey.get(key);
    if (!existing) {
      const created: ObservedBacklinkState = {
        ...observed,
        clientId: scan.clientId,
        status: "active",
        firstSeenAt: scan.completedAt,
        firstSeenRunId: scan.runId,
        firstSeenProviderId: scan.providerId,
        lastSeenAt: scan.completedAt,
        lastSeenRunId: scan.runId,
        lastSeenProviderId: scan.providerId,
        consecutiveSuccessfulMisses: 0,
        lastLostAt: null,
        lastLostRunId: null,
        reacquiredCount: 0,
        lastReacquiredAt: null,
        lastEvaluatedRunId: scan.completeness === "complete" ? scan.runId : null,
        lastEvaluatedAt: scan.completeness === "complete" ? scan.completedAt : null,
      };
      nextByKey.set(key, created);
      transitions.push(transition("new", created, scan));
      continue;
    }

    const alreadySeenInRun = existing.lastSeenRunId === scan.runId;
    const wasLost = existing.status === "lost";
    const updated: ObservedBacklinkState = {
      ...existing,
      ...observed,
      status: "active",
      lastSeenAt: alreadySeenInRun ? existing.lastSeenAt : scan.completedAt,
      lastSeenRunId: scan.runId,
      lastSeenProviderId: scan.providerId,
      consecutiveSuccessfulMisses: 0,
      reacquiredCount: wasLost && !alreadySeenInRun ? existing.reacquiredCount + 1 : existing.reacquiredCount,
      lastReacquiredAt: wasLost && !alreadySeenInRun ? scan.completedAt : existing.lastReacquiredAt,
      lastEvaluatedRunId: scan.completeness === "complete" ? scan.runId : existing.lastEvaluatedRunId,
      lastEvaluatedAt: scan.completeness === "complete" ? scan.completedAt : existing.lastEvaluatedAt,
    };
    nextByKey.set(key, updated);
    if (!alreadySeenInRun) transitions.push(transition(wasLost ? "restored" : "still_observed", updated, scan));
  }

  if (scan.completeness === "complete") {
    for (const [key, existing] of existingByKey) {
      if (observedByKey.has(key)) continue;
      if (existing.lastEvaluatedRunId === scan.runId) continue;

      const misses = existing.consecutiveSuccessfulMisses + 1;
      const becomesLost = existing.status === "active" && misses >= confirmedLossAfterMisses;
      const updated: ObservedBacklinkState = {
        ...existing,
        status: becomesLost ? "lost" : existing.status,
        consecutiveSuccessfulMisses: misses,
        lastLostAt: becomesLost ? scan.completedAt : existing.lastLostAt,
        lastLostRunId: becomesLost ? scan.runId : existing.lastLostRunId,
        lastEvaluatedRunId: scan.runId,
        lastEvaluatedAt: scan.completedAt,
      };
      nextByKey.set(key, updated);
      if (existing.status === "active") {
        transitions.push(transition(becomesLost ? "lost" : "possibly_missing", updated, scan));
      }
    }
  }

  const states = [...nextByKey.values()].sort((a, b) => observedBacklinkIdentityKey(a).localeCompare(observedBacklinkIdentityKey(b)));
  return {
    states,
    transitions,
    metrics: summarizeObservedBacklinks(states, transitions),
    absenceEvaluationApplied: scan.completeness === "complete",
  };
}
