import { isApollosAdminUser } from "./apollos-admin-access-policy.js";

const HETZNER_API_BASE = "https://api.hetzner.cloud/v1";
const DEFAULT_TIMEOUT_MS = 10_000;

function requireAdmin(userId: string): void {
  if (!isApollosAdminUser(userId)) {
    throw new Error("APOLLOS_MCP_HETZNER_ADMIN_REQUIRED");
  }
}

function requireToken(): string {
  const token = process.env.HETZNER_API_TOKEN?.trim();
  if (!token) throw new Error("APOLLOS_MCP_HETZNER_NOT_CONFIGURED");
  return token;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

async function hetznerGet(path: string): Promise<unknown> {
  const token = requireToken();
  let response: globalThis.Response;
  try {
    response = await fetch(`${HETZNER_API_BASE}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch {
    throw new Error("APOLLOS_MCP_HETZNER_UNAVAILABLE");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("APOLLOS_MCP_HETZNER_AUTH_FAILED");
    }
    throw new Error("APOLLOS_MCP_HETZNER_UNAVAILABLE");
  }

  return body;
}

function sanitizeServer(value: unknown): Readonly<Record<string, unknown>> {
  const server = record(value);
  const publicNet = record(server.public_net);
  const ipv4 = record(publicNet.ipv4);
  const ipv6 = record(publicNet.ipv6);
  const serverType = record(server.server_type);
  const location = record(server.location);

  return Object.freeze({
    id: server.id ?? null,
    name: server.name ?? null,
    status: server.status ?? null,
    locked: server.locked ?? null,
    rescueEnabled: server.rescue_enabled ?? null,
    created: server.created ?? null,
    serverType: Object.freeze({
      id: serverType.id ?? null,
      name: serverType.name ?? null,
      description: serverType.description ?? null,
      cores: serverType.cores ?? null,
      memory: serverType.memory ?? null,
      disk: serverType.disk ?? null,
    }),
    location: Object.freeze({
      id: location.id ?? null,
      name: location.name ?? null,
      city: location.city ?? null,
      country: location.country ?? null,
      networkZone: location.network_zone ?? null,
    }),
    publicNet: Object.freeze({
      ipv4: Object.freeze({
        ip: ipv4.ip ?? null,
        blocked: ipv4.blocked ?? null,
      }),
      ipv6: Object.freeze({
        ip: ipv6.ip ?? null,
        blocked: ipv6.blocked ?? null,
      }),
    }),
  });
}

function sanitizeFirewall(value: unknown): Readonly<Record<string, unknown>> {
  const firewall = record(value);
  return Object.freeze({
    id: firewall.id ?? null,
    name: firewall.name ?? null,
    labels: record(firewall.labels),
    appliedTo: Object.freeze(array(firewall.applied_to).map((item) => {
      const applied = record(item);
      const server = record(applied.server);
      const labelSelector = record(applied.label_selector);
      return Object.freeze({
        type: applied.type ?? null,
        serverId: server.id ?? null,
        labelSelector: labelSelector.selector ?? null,
      });
    })),
    rules: Object.freeze(array(firewall.rules).map((item) => {
      const rule = record(item);
      return Object.freeze({
        direction: rule.direction ?? null,
        protocol: rule.protocol ?? null,
        port: rule.port ?? null,
        sourceIps: Object.freeze(array(rule.source_ips).filter((entry): entry is string => typeof entry === "string")),
        destinationIps: Object.freeze(array(rule.destination_ips).filter((entry): entry is string => typeof entry === "string")),
        description: rule.description ?? null,
      });
    })),
  });
}

function sanitizePrimaryIp(value: unknown): Readonly<Record<string, unknown>> {
  const ip = record(value);
  return Object.freeze({
    id: ip.id ?? null,
    name: ip.name ?? null,
    type: ip.type ?? null,
    ip: ip.ip ?? null,
    blocked: ip.blocked ?? null,
    assigneeId: ip.assignee_id ?? null,
    assigneeType: ip.assignee_type ?? null,
    autoDelete: ip.auto_delete ?? null,
  });
}

export async function getApollosHetznerInfrastructure(
  actorUserId: string,
): Promise<Readonly<Record<string, unknown>>> {
  requireAdmin(actorUserId);

  const [serversBody, firewallsBody, primaryIpsBody] = await Promise.all([
    hetznerGet("/servers?per_page=50"),
    hetznerGet("/firewalls?per_page=50"),
    hetznerGet("/primary_ips?per_page=50"),
  ]);

  const serversPayload = record(serversBody);
  const firewallsPayload = record(firewallsBody);
  const primaryIpsPayload = record(primaryIpsBody);

  const servers = array(serversPayload.servers).map(sanitizeServer);
  const firewalls = array(firewallsPayload.firewalls).map(sanitizeFirewall);
  const primaryIps = array(primaryIpsPayload.primary_ips).map(sanitizePrimaryIp);

  return Object.freeze({
    servers: Object.freeze(servers),
    firewalls: Object.freeze(firewalls),
    primaryIps: Object.freeze(primaryIps),
    counts: Object.freeze({
      servers: servers.length,
      firewalls: firewalls.length,
      primaryIps: primaryIps.length,
    }),
  });
}
