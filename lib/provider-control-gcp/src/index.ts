export type GcpResourceKind =
  | "project"
  | "workload_identity_pool"
  | "workload_identity_provider"
  | "service_account"
  | "bucket"
  | "log_scope"
  | "service"
  | "quota"
  | "certificate";

export interface RegisteredGcpResource {
  readonly id: string;
  readonly kind: GcpResourceKind;
}

export interface GcpResourceRegistry {
  readonly resources: readonly RegisteredGcpResource[];
}

export class GcpAdapterError extends Error {
  constructor(readonly code: "RESOURCE_UNREGISTERED" | "RESULT_LIMIT_EXCEEDED" | "INVALID_RESPONSE", message: string) {
    super(message);
    this.name = "GcpAdapterError";
  }
}

function requireRegistered(registry: GcpResourceRegistry, id: string, kind: GcpResourceKind): void {
  if (!registry.resources.some((resource) => resource.id === id && resource.kind === kind)) {
    throw new GcpAdapterError("RESOURCE_UNREGISTERED", `Unregistered ${kind}: ${id}`);
  }
}

function bounded<T>(items: readonly T[], maxResults: number): readonly T[] {
  if (!Number.isInteger(maxResults) || maxResults < 1 || items.length > maxResults) {
    throw new GcpAdapterError("RESULT_LIMIT_EXCEEDED", `Result count ${items.length} exceeds ${maxResults}`);
  }
  return Object.freeze([...items]);
}

function safeString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) {
    throw new GcpAdapterError("INVALID_RESPONSE", `Invalid ${field}`);
  }
  return value;
}

export interface ProjectClient {
  getProject(projectId: string): Promise<{ projectId: string; displayName?: string; state?: string; labels?: Record<string, string>; [key: string]: unknown }>;
}

export async function readProjectMetadata(input: {
  readonly client: ProjectClient;
  readonly registry: GcpResourceRegistry;
  readonly projectId: string;
}) {
  requireRegistered(input.registry, input.projectId, "project");
  const raw = await input.client.getProject(input.projectId);
  return Object.freeze({
    projectId: safeString(raw.projectId, "projectId"),
    displayName: typeof raw.displayName === "string" ? raw.displayName.slice(0, 256) : null,
    state: typeof raw.state === "string" ? raw.state.slice(0, 64) : null,
    labels: Object.freeze({ ...(raw.labels ?? {}) }),
  });
}

export interface WorkloadIdentityClient {
  getPool(name: string): Promise<Record<string, unknown>>;
  getProvider(name: string): Promise<Record<string, unknown>>;
}

export async function readWorkloadIdentityPool(input: { client: WorkloadIdentityClient; registry: GcpResourceRegistry; name: string }) {
  requireRegistered(input.registry, input.name, "workload_identity_pool");
  const raw = await input.client.getPool(input.name);
  return Object.freeze({ name: safeString(raw.name, "pool name"), state: typeof raw.state === "string" ? raw.state : null, disabled: raw.disabled === true });
}

export async function readWorkloadIdentityProvider(input: { client: WorkloadIdentityClient; registry: GcpResourceRegistry; name: string }) {
  requireRegistered(input.registry, input.name, "workload_identity_provider");
  const raw = await input.client.getProvider(input.name);
  return Object.freeze({ name: safeString(raw.name, "provider name"), state: typeof raw.state === "string" ? raw.state : null, disabled: raw.disabled === true });
}

export interface IamReadClient {
  getIamPolicy(resource: string): Promise<{ bindings?: readonly { role?: string; members?: readonly string[] }[]; [key: string]: unknown }>;
  testIamPermissions(resource: string, permissions: readonly string[]): Promise<{ permissions?: readonly string[]; [key: string]: unknown }>;
}

export async function readServiceAccountIam(input: { client: IamReadClient; registry: GcpResourceRegistry; resource: string; permissions: readonly string[]; maxBindings?: number }) {
  requireRegistered(input.registry, input.resource, "service_account");
  const [policy, tested] = await Promise.all([
    input.client.getIamPolicy(input.resource),
    input.client.testIamPermissions(input.resource, input.permissions),
  ]);
  const bindings = bounded(policy.bindings ?? [], input.maxBindings ?? 100).map((binding) => Object.freeze({
    role: typeof binding.role === "string" ? binding.role : "",
    members: Object.freeze([...(binding.members ?? [])].slice(0, 500)),
  }));
  return Object.freeze({ resource: input.resource, bindings: Object.freeze(bindings), grantedPermissions: Object.freeze([...(tested.permissions ?? [])]) });
}

export interface StorageReadClient {
  getBucket(name: string): Promise<Record<string, unknown>>;
  getBucketIamPolicy(name: string): Promise<{ bindings?: readonly { role?: string; members?: readonly string[] }[] }>;
  testBucketPermissions(name: string, permissions: readonly string[]): Promise<{ permissions?: readonly string[] }>;
}

export async function readBucketMetadata(input: { client: StorageReadClient; registry: GcpResourceRegistry; name: string; permissions?: readonly string[] }) {
  requireRegistered(input.registry, input.name, "bucket");
  const [bucket, policy, tested] = await Promise.all([
    input.client.getBucket(input.name),
    input.client.getBucketIamPolicy(input.name),
    input.client.testBucketPermissions(input.name, input.permissions ?? []),
  ]);
  return Object.freeze({
    name: safeString(bucket.name, "bucket name"),
    location: typeof bucket.location === "string" ? bucket.location : null,
    storageClass: typeof bucket.storageClass === "string" ? bucket.storageClass : null,
    cors: Object.freeze(Array.isArray(bucket.cors) ? bucket.cors.slice(0, 100) : []),
    lifecycle: Object.freeze(Array.isArray(bucket.lifecycle) ? bucket.lifecycle.slice(0, 100) : []),
    iamBindings: Object.freeze([...(policy.bindings ?? [])].slice(0, 100)),
    grantedPermissions: Object.freeze([...(tested.permissions ?? [])]),
  });
}

export interface LoggingReadClient {
  listEntries(scope: string, options: { readonly filter?: string; readonly pageSize: number }): Promise<{ entries?: readonly Record<string, unknown>[] }>;
}

export async function readLogEntries(input: { client: LoggingReadClient; registry: GcpResourceRegistry; scope: string; filter?: string; maxResults?: number }) {
  requireRegistered(input.registry, input.scope, "log_scope");
  const maxResults = input.maxResults ?? 50;
  const raw = await input.client.listEntries(input.scope, { filter: input.filter, pageSize: maxResults });
  const entries = bounded(raw.entries ?? [], maxResults).map((entry) => Object.freeze({
    timestamp: typeof entry.timestamp === "string" ? entry.timestamp : null,
    severity: typeof entry.severity === "string" ? entry.severity : null,
    logName: typeof entry.logName === "string" ? entry.logName : null,
    resourceType: typeof entry.resourceType === "string" ? entry.resourceType : null,
  }));
  return Object.freeze(entries);
}

export interface ServiceUsageReadClient {
  getService(name: string): Promise<Record<string, unknown>>;
  listQuotaMetrics(name: string, pageSize: number): Promise<{ metrics?: readonly Record<string, unknown>[] }>;
}

export async function readServiceUsage(input: { client: ServiceUsageReadClient; registry: GcpResourceRegistry; service: string; maxQuotaMetrics?: number }) {
  requireRegistered(input.registry, input.service, "service");
  const max = input.maxQuotaMetrics ?? 50;
  const [service, quota] = await Promise.all([input.client.getService(input.service), input.client.listQuotaMetrics(input.service, max)]);
  return Object.freeze({
    name: safeString(service.name, "service name"),
    state: typeof service.state === "string" ? service.state : null,
    quotaMetrics: bounded(quota.metrics ?? [], max).map((metric) => Object.freeze({
      metric: typeof metric.metric === "string" ? metric.metric : null,
      displayName: typeof metric.displayName === "string" ? metric.displayName : null,
    })),
  });
}

export function parsePublicCertificateMetadata(input: { registry: GcpResourceRegistry; certificateId: string; pem: string }) {
  requireRegistered(input.registry, input.certificateId, "certificate");
  const pem = input.pem.trim();
  if (!pem.includes("BEGIN CERTIFICATE") || pem.length > 100_000) {
    throw new GcpAdapterError("INVALID_RESPONSE", "Invalid public certificate text");
  }
  const body = pem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, "");
  return Object.freeze({ certificateId: input.certificateId, format: "pem", encodedLength: body.length });
}

export interface DriftFinding {
  readonly code: string;
  readonly path: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

export function findDeterministicDrift(expected: Readonly<Record<string, unknown>>, actual: Readonly<Record<string, unknown>>): readonly DriftFinding[] {
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  return Object.freeze(keys.flatMap((key) => {
    const expectedValue = expected[key];
    const actualValue = actual[key];
    return JSON.stringify(expectedValue) === JSON.stringify(actualValue)
      ? []
      : [Object.freeze({ code: "VALUE_MISMATCH", path: key, expected: expectedValue, actual: actualValue })];
  }));
}
