export type ActivationEnvironment = "development" | "staging" | "production";

export type ReadinessBlockerCode =
  | "INVALID_MANIFEST"
  | "STALE_EVIDENCE"
  | "STORE_NOT_READY"
  | "MIGRATIONS_NOT_READY"
  | "SCHEDULER_NOT_READY"
  | "HEARTBEAT_NOT_READY"
  | "KILL_SWITCH_NOT_READY"
  | "POLICY_VERSION_UNSUPPORTED"
  | "OPERATION_SET_EXCESSIVE"
  | "CREDENTIALS_ENABLED"
  | "GIT_WRITES_ENABLED"
  | "DEPLOYMENT_ENABLED"
  | "PROVIDER_WRITES_ENABLED"
  | "PAID_PROVIDERS_ENABLED"
  | "EXTERNAL_ACTIONS_ENABLED"
  | "PRODUCTION_AUTHORIZATION_MISSING"
  | "CONTRADICTORY_STATE";

export interface ReadinessEvidence {
  readonly ready: boolean;
  readonly evidenceRef: string;
  readonly observedAt: string;
}

export interface ActivationCapabilities {
  readonly credentialsEnabled: boolean;
  readonly gitWritesEnabled: boolean;
  readonly deploymentEnabled: boolean;
  readonly providerWritesEnabled: boolean;
  readonly paidProvidersEnabled: boolean;
  readonly externalActionsEnabled: boolean;
}

export interface ActivationReadinessManifest {
  readonly runtimeId: string;
  readonly environment: ActivationEnvironment;
  readonly evaluatedAt: string;
  readonly evidenceMaxAgeSeconds: number;
  readonly durableStore: ReadinessEvidence;
  readonly migrations: ReadinessEvidence;
  readonly schedulerHost: ReadinessEvidence;
  readonly heartbeatPersistence: ReadinessEvidence;
  readonly killSwitch: ReadinessEvidence;
  readonly policyVersion: string;
  readonly supportedPolicyVersions: readonly string[];
  readonly allowedOperations: readonly string[];
  readonly capabilities: ActivationCapabilities;
  readonly activationAuthorizationRef?: string | null;
}

export interface ActivationReadinessDecision {
  readonly status: "ready" | "blocked";
  readonly blockers: readonly ReadinessBlockerCode[];
  readonly fingerprint: string;
}

const INITIAL_OPERATIONS = Object.freeze([
  "claim_approved_task",
  "renew_claim",
  "transition_to_in_progress",
  "request_review",
  "submit_completion_report",
  "verify_task",
  "complete_task",
  "release_claim",
  "stop",
] as const);

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function hash(input: string): string {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return `readiness_${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function validId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function validEvidenceRef(value: string): boolean {
  return value.length > 0 && value.length <= 256 && !/\s/.test(value);
}

function parseTime(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function evidenceBlocker(
  evidence: ReadinessEvidence,
  blocker: ReadinessBlockerCode,
  evaluatedAtMs: number,
  maxAgeMs: number,
): ReadinessBlockerCode | null {
  if (!evidence.ready) return blocker;
  if (!validEvidenceRef(evidence.evidenceRef)) return "INVALID_MANIFEST";
  const observedAtMs = parseTime(evidence.observedAt);
  if (observedAtMs === null || observedAtMs > evaluatedAtMs) return "INVALID_MANIFEST";
  if (evaluatedAtMs - observedAtMs > maxAgeMs) return "STALE_EVIDENCE";
  return null;
}

export function evaluateActivationReadiness(manifest: ActivationReadinessManifest): ActivationReadinessDecision {
  const blockers = new Set<ReadinessBlockerCode>();
  const evaluatedAtMs = parseTime(manifest.evaluatedAt);
  if (
    !validId(manifest.runtimeId) ||
    evaluatedAtMs === null ||
    !Number.isInteger(manifest.evidenceMaxAgeSeconds) ||
    manifest.evidenceMaxAgeSeconds < 60 ||
    manifest.evidenceMaxAgeSeconds > 86_400 ||
    manifest.supportedPolicyVersions.length < 1 ||
    manifest.supportedPolicyVersions.length > 20
  ) {
    blockers.add("INVALID_MANIFEST");
  }

  const maxAgeMs = manifest.evidenceMaxAgeSeconds * 1000;
  if (evaluatedAtMs !== null) {
    const checks: readonly [ReadinessEvidence, ReadinessBlockerCode][] = [
      [manifest.durableStore, "STORE_NOT_READY"],
      [manifest.migrations, "MIGRATIONS_NOT_READY"],
      [manifest.schedulerHost, "SCHEDULER_NOT_READY"],
      [manifest.heartbeatPersistence, "HEARTBEAT_NOT_READY"],
      [manifest.killSwitch, "KILL_SWITCH_NOT_READY"],
    ];
    for (const [evidence, blocker] of checks) {
      const result = evidenceBlocker(evidence, blocker, evaluatedAtMs, maxAgeMs);
      if (result) blockers.add(result);
    }
  }

  if (!manifest.supportedPolicyVersions.includes(manifest.policyVersion)) {
    blockers.add("POLICY_VERSION_UNSUPPORTED");
  }

  const operations = [...new Set(manifest.allowedOperations)].sort();
  const allowlist = new Set<string>(INITIAL_OPERATIONS);
  if (
    operations.length === 0 ||
    operations.length !== manifest.allowedOperations.length ||
    operations.some((operation) => !allowlist.has(operation))
  ) {
    blockers.add("OPERATION_SET_EXCESSIVE");
  }

  const capabilityBlockers: readonly [boolean, ReadinessBlockerCode][] = [
    [manifest.capabilities.credentialsEnabled, "CREDENTIALS_ENABLED"],
    [manifest.capabilities.gitWritesEnabled, "GIT_WRITES_ENABLED"],
    [manifest.capabilities.deploymentEnabled, "DEPLOYMENT_ENABLED"],
    [manifest.capabilities.providerWritesEnabled, "PROVIDER_WRITES_ENABLED"],
    [manifest.capabilities.paidProvidersEnabled, "PAID_PROVIDERS_ENABLED"],
    [manifest.capabilities.externalActionsEnabled, "EXTERNAL_ACTIONS_ENABLED"],
  ];
  for (const [enabled, blocker] of capabilityBlockers) {
    if (enabled) blockers.add(blocker);
  }

  if (manifest.environment === "production" && !manifest.activationAuthorizationRef?.trim()) {
    blockers.add("PRODUCTION_AUTHORIZATION_MISSING");
  }

  if (
    manifest.capabilities.providerWritesEnabled && !manifest.capabilities.credentialsEnabled ||
    manifest.capabilities.gitWritesEnabled && manifest.allowedOperations.length === 0
  ) {
    blockers.add("CONTRADICTORY_STATE");
  }

  const body = {
    runtimeId: manifest.runtimeId,
    environment: manifest.environment,
    evaluatedAt: manifest.evaluatedAt,
    evidenceMaxAgeSeconds: manifest.evidenceMaxAgeSeconds,
    durableStore: manifest.durableStore,
    migrations: manifest.migrations,
    schedulerHost: manifest.schedulerHost,
    heartbeatPersistence: manifest.heartbeatPersistence,
    killSwitch: manifest.killSwitch,
    policyVersion: manifest.policyVersion,
    supportedPolicyVersions: [...manifest.supportedPolicyVersions].sort(),
    allowedOperations: operations,
    capabilities: manifest.capabilities,
    activationAuthorizationRef: manifest.activationAuthorizationRef?.trim() || null,
    blockers: [...blockers].sort(),
  };

  return Object.freeze({
    status: blockers.size === 0 ? "ready" : "blocked",
    blockers: Object.freeze([...blockers].sort()),
    fingerprint: hash(canonical(body)),
  });
}

export const INITIAL_PLANNER_RUNTIME_OPERATIONS = INITIAL_OPERATIONS;
