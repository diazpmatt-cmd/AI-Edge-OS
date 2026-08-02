import assert from "node:assert/strict";
import test from "node:test";
import {
  HetznerAdapterError,
  findDeterministicDrift,
  readDnsZoneMetadata,
  readFirewallMetadata,
  readLoadBalancerMetadata,
  readNetworkMetadata,
  readServerMetadata,
  readVolumeMetadata,
} from "../.test-dist/index.js";

const registry = {
  resources: [
    { id: "srv-1", kind: "server" },
    { id: "net-1", kind: "network" },
    { id: "fw-1", kind: "firewall" },
    { id: "vol-1", kind: "volume" },
    { id: "lb-1", kind: "load_balancer" },
    { id: "zone-1", kind: "dns_zone" },
  ],
};

const cloud = {
  async getProject(id) { return { id }; },
  async getServer(id) { return { id, name: "edge", status: "running", public_net: { ipv4: "192.0.2.1" }, private_net: [{ network: "net-1", ip: "10.0.0.2" }], user_data: "secret", rescue_password: "secret" }; },
  async getNetwork(id) { return { id, name: "private", ip_range: "10.0.0.0/16", subnets: [{ type: "cloud", ip_range: "10.0.1.0/24" }] }; },
  async getFirewall(id) { return { id, rules: [{ direction: "in", protocol: "tcp", port: "443" }], applied_to: [{ type: "server" }] }; },
  async getVolume(id) { return { id, name: "data", size: 20, server: "srv-1" }; },
  async getLoadBalancer(id) { return { id, services: [{ protocol: "https", listen_port: 443 }], targets: [{ type: "server", server: { id: "srv-1" } }] }; },
  async getPrimaryIp(id) { return { id }; },
  async getFloatingIp(id) { return { id }; },
};

test("rejects unregistered resources before client invocation", async () => {
  let calls = 0;
  await assert.rejects(
    readServerMetadata({ client: { ...cloud, async getServer() { calls += 1; return {}; } }, registry, serverId: "srv-x" }),
    (error) => error instanceof HetznerAdapterError && error.code === "RESOURCE_UNREGISTERED",
  );
  assert.equal(calls, 0);
});

test("normalizes server metadata without sensitive fields", async () => {
  const result = await readServerMetadata({ client: cloud, registry, serverId: "srv-1" });
  assert.equal(result.name, "edge");
  assert.equal(result.publicIpv4, "192.0.2.1");
  assert.equal("user_data" in result, false);
  assert.equal("rescue_password" in result, false);
});

test("reads bounded infrastructure metadata", async () => {
  assert.equal((await readNetworkMetadata({ client: cloud, registry, networkId: "net-1" })).subnets.length, 1);
  assert.equal((await readFirewallMetadata({ client: cloud, registry, firewallId: "fw-1" })).rules.length, 1);
  assert.equal((await readVolumeMetadata({ client: cloud, registry, volumeId: "vol-1" })).sizeGb, 20);
  assert.equal((await readLoadBalancerMetadata({ client: cloud, registry, loadBalancerId: "lb-1" })).targets.length, 1);
});

test("enforces DNS record bounds and sanitizes responses", async () => {
  const dns = {
    async getZone(id) { return { id, name: "example.com", status: "verified", token: "secret" }; },
    async listRecords() { return { records: [{ id: "r1", name: "@", type: "A", value: "192.0.2.1", ttl: 300, authorization: "secret" }] }; },
  };
  const result = await readDnsZoneMetadata({ client: dns, registry, zoneId: "zone-1", maxRecords: 1 });
  assert.equal(result.records[0].value, "192.0.2.1");
  assert.equal("token" in result, false);
  await assert.rejects(readDnsZoneMetadata({ client: dns, registry, zoneId: "zone-1", maxRecords: 0 }), /exceeds/);
});

test("drift findings are deterministic", () => {
  assert.deepEqual(findDeterministicDrift({ z: 1, a: 1 }, { z: 2, a: 2 }).map((item) => item.path), ["a", "z"]);
});
