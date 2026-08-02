export type HetznerResourceKind =
  | "project"
  | "server"
  | "network"
  | "firewall"
  | "volume"
  | "load_balancer"
  | "primary_ip"
  | "floating_ip"
  | "dns_zone";

export interface RegisteredHetznerResource {
  readonly id: string;
  readonly kind: HetznerResourceKind;
}

export interface HetznerResourceRegistry {
  readonly resources: readonly RegisteredHetznerResource[];
}

export class HetznerAdapterError extends Error {
  constructor(
    readonly code: "RESOURCE_UNREGISTERED" | "RESULT_LIMIT_EXCEEDED" | "INVALID_RESPONSE",
    message: string,
  ) {
    super(message);
    this.name = "HetznerAdapterError";
  }
}

function requireRegistered(registry: HetznerResourceRegistry, id: string, kind: HetznerResourceKind): void {
  if (!registry.resources.some((resource) => resource.id === id && resource.kind === kind)) {
    throw new HetznerAdapterError("RESOURCE_UNREGISTERED", `Unregistered ${kind}: ${id}`);
  }
}

function safeString(value: unknown, field: string, max = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new HetznerAdapterError("INVALID_RESPONSE", `Invalid ${field}`);
  }
  return value;
}

function optionalString(value: unknown, max = 512): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function bounded<T>(items: readonly T[], max: number): readonly T[] {
  if (!Number.isInteger(max) || max < 1 || items.length > max) {
    throw new HetznerAdapterError("RESULT_LIMIT_EXCEEDED", `Result count ${items.length} exceeds ${max}`);
  }
  return Object.freeze([...items]);
}

export interface HetznerCloudReadClient {
  getProject(id: string): Promise<Record<string, unknown>>;
  getServer(id: string): Promise<Record<string, unknown>>;
  getNetwork(id: string): Promise<Record<string, unknown>>;
  getFirewall(id: string): Promise<Record<string, unknown>>;
  getVolume(id: string): Promise<Record<string, unknown>>;
  getLoadBalancer(id: string): Promise<Record<string, unknown>>;
  getPrimaryIp(id: string): Promise<Record<string, unknown>>;
  getFloatingIp(id: string): Promise<Record<string, unknown>>;
}

export interface HetznerDnsReadClient {
  getZone(id: string): Promise<Record<string, unknown>>;
  listRecords(zoneId: string, limit: number): Promise<{ records?: readonly Record<string, unknown>[] }>;
}

export async function readProjectMetadata(input: {
  readonly client: HetznerCloudReadClient;
  readonly registry: HetznerResourceRegistry;
  readonly projectId: string;
}) {
  requireRegistered(input.registry, input.projectId, "project");
  const raw = await input.client.getProject(input.projectId);
  return Object.freeze({
    id: safeString(raw.id ?? input.projectId, "project id"),
    name: optionalString(raw.name, 256),
    description: optionalString(raw.description, 512),
  });
}

export async function readServerMetadata(input: {
  readonly client: HetznerCloudReadClient;
  readonly registry: HetznerResourceRegistry;
  readonly serverId: string;
}) {
  requireRegistered(input.registry, input.serverId, "server");
  const raw = await input.client.getServer(input.serverId);
  const publicNet = typeof raw.public_net === "object" && raw.public_net !== null ? raw.public_net as Record<string, unknown> : {};
  const privateNet = Array.isArray(raw.private_net) ? raw.private_net : [];
  return Object.freeze({
    id: safeString(raw.id ?? input.serverId, "server id"),
    name: optionalString(raw.name, 256),
    status: optionalString(raw.status, 64),
    serverType: optionalString(raw.server_type, 128),
    datacenter: optionalString(raw.datacenter, 128),
    publicIpv4: optionalString(publicNet.ipv4, 64),
    publicIpv6: optionalString(publicNet.ipv6, 128),
    privateNetworks: Object.freeze(privateNet.slice(0, 50).map((entry) => {
      const item = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
      return Object.freeze({ network: optionalString(item.network, 128), ip: optionalString(item.ip, 64) });
    })),
  });
}

export async function readNetworkMetadata(input: { client: HetznerCloudReadClient; registry: HetznerResourceRegistry; networkId: string; maxSubnets?: number }) {
  requireRegistered(input.registry, input.networkId, "network");
  const raw = await input.client.getNetwork(input.networkId);
  const subnets = bounded(Array.isArray(raw.subnets) ? raw.subnets : [], input.maxSubnets ?? 50);
  return Object.freeze({ id: safeString(raw.id ?? input.networkId, "network id"), name: optionalString(raw.name, 256), ipRange: optionalString(raw.ip_range, 128), subnets: Object.freeze(subnets.map((value) => Object.freeze(value))) });
}

export async function readFirewallMetadata(input: { client: HetznerCloudReadClient; registry: HetznerResourceRegistry; firewallId: string; maxRules?: number }) {
  requireRegistered(input.registry, input.firewallId, "firewall");
  const raw = await input.client.getFirewall(input.firewallId);
  const rules = bounded(Array.isArray(raw.rules) ? raw.rules : [], input.maxRules ?? 100);
  return Object.freeze({ id: safeString(raw.id ?? input.firewallId, "firewall id"), name: optionalString(raw.name, 256), rules: Object.freeze(rules.map((value) => Object.freeze(value))), appliedToCount: Array.isArray(raw.applied_to) ? raw.applied_to.length : 0 });
}

export async function readVolumeMetadata(input: { client: HetznerCloudReadClient; registry: HetznerResourceRegistry; volumeId: string }) {
  requireRegistered(input.registry, input.volumeId, "volume");
  const raw = await input.client.getVolume(input.volumeId);
  return Object.freeze({ id: safeString(raw.id ?? input.volumeId, "volume id"), name: optionalString(raw.name, 256), sizeGb: typeof raw.size === "number" ? raw.size : null, location: optionalString(raw.location, 128), server: optionalString(raw.server, 128), linuxDevice: optionalString(raw.linux_device, 256) });
}

export async function readLoadBalancerMetadata(input: { client: HetznerCloudReadClient; registry: HetznerResourceRegistry; loadBalancerId: string; maxServices?: number; maxTargets?: number }) {
  requireRegistered(input.registry, input.loadBalancerId, "load_balancer");
  const raw = await input.client.getLoadBalancer(input.loadBalancerId);
  const services = bounded(Array.isArray(raw.services) ? raw.services : [], input.maxServices ?? 50);
  const targets = bounded(Array.isArray(raw.targets) ? raw.targets : [], input.maxTargets ?? 100);
  return Object.freeze({ id: safeString(raw.id ?? input.loadBalancerId, "load balancer id"), name: optionalString(raw.name, 256), publicNetEnabled: raw.public_net_enabled === true, services: Object.freeze(services.map((value) => Object.freeze(value))), targets: Object.freeze(targets.map((value) => Object.freeze(value))) });
}

async function readIpMetadata(input: { client: HetznerCloudReadClient; registry: HetznerResourceRegistry; id: string; kind: "primary_ip" | "floating_ip" }) {
  requireRegistered(input.registry, input.id, input.kind);
  const raw = input.kind === "primary_ip" ? await input.client.getPrimaryIp(input.id) : await input.client.getFloatingIp(input.id);
  return Object.freeze({ id: safeString(raw.id ?? input.id, `${input.kind} id`), name: optionalString(raw.name, 256), ip: optionalString(raw.ip, 128), type: optionalString(raw.type, 32), location: optionalString(raw.location, 128), assigneeId: optionalString(raw.assignee_id ?? raw.server, 128), blocked: raw.blocked === true });
}

export function readPrimaryIpMetadata(input: { client: HetznerCloudReadClient; registry: HetznerResourceRegistry; primaryIpId: string }) {
  return readIpMetadata({ client: input.client, registry: input.registry, id: input.primaryIpId, kind: "primary_ip" });
}

export function readFloatingIpMetadata(input: { client: HetznerCloudReadClient; registry: HetznerResourceRegistry; floatingIpId: string }) {
  return readIpMetadata({ client: input.client, registry: input.registry, id: input.floatingIpId, kind: "floating_ip" });
}

export async function readDnsZoneMetadata(input: { client: HetznerDnsReadClient; registry: HetznerResourceRegistry; zoneId: string; maxRecords?: number }) {
  requireRegistered(input.registry, input.zoneId, "dns_zone");
  const maxRecords = input.maxRecords ?? 100;
  const [zone, listed] = await Promise.all([input.client.getZone(input.zoneId), input.client.listRecords(input.zoneId, maxRecords)]);
  const records = bounded(listed.records ?? [], maxRecords).map((record) => Object.freeze({
    id: optionalString(record.id, 128),
    name: optionalString(record.name, 256),
    type: optionalString(record.type, 32),
    value: optionalString(record.value, 1024),
    ttl: typeof record.ttl === "number" ? record.ttl : null,
  }));
  return Object.freeze({ id: safeString(zone.id ?? input.zoneId, "zone id"), name: optionalString(zone.name, 256), ttl: typeof zone.ttl === "number" ? zone.ttl : null, status: optionalString(zone.status, 64), records: Object.freeze(records) });
}

export interface DriftFinding {
  readonly code: "VALUE_MISMATCH";
  readonly path: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

export function findDeterministicDrift(expected: Readonly<Record<string, unknown>>, actual: Readonly<Record<string, unknown>>): readonly DriftFinding[] {
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  return Object.freeze(keys.flatMap((key) => JSON.stringify(expected[key]) === JSON.stringify(actual[key]) ? [] : [Object.freeze({ code: "VALUE_MISMATCH" as const, path: key, expected: expected[key], actual: actual[key] })]));
}
