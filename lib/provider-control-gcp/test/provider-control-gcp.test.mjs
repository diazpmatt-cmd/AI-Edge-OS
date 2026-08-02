import test from "node:test";
import assert from "node:assert/strict";
import {
  GcpAdapterError,
  findDeterministicDrift,
  parsePublicCertificateMetadata,
  readLogEntries,
  readProjectMetadata,
  readServiceAccountIam,
} from "../.test-dist/index.js";

const registry = {
  resources: [
    { id: "project/example", kind: "project" },
    { id: "serviceAccounts/reader@example.iam.gserviceaccount.com", kind: "service_account" },
    { id: "projects/example", kind: "log_scope" },
    { id: "certificate/public", kind: "certificate" },
  ],
};

test("rejects unregistered resources before client invocation", async () => {
  let calls = 0;
  const client = { async getProject() { calls += 1; return { projectId: "never" }; } };
  await assert.rejects(
    () => readProjectMetadata({ client, registry, projectId: "project/unregistered" }),
    (error) => error instanceof GcpAdapterError && error.code === "RESOURCE_UNREGISTERED",
  );
  assert.equal(calls, 0);
});

test("normalizes project metadata without returning unknown sensitive fields", async () => {
  const result = await readProjectMetadata({
    registry,
    projectId: "project/example",
    client: { async getProject() { return { projectId: "project/example", displayName: "Example", state: "ACTIVE", token: "secret", privateKey: "secret" }; } },
  });
  assert.deepEqual(result, { projectId: "project/example", displayName: "Example", state: "ACTIVE", labels: {} });
  assert.equal("token" in result, false);
  assert.equal("privateKey" in result, false);
});

test("enforces bounded log results", async () => {
  await assert.rejects(
    () => readLogEntries({
      registry,
      scope: "projects/example",
      maxResults: 1,
      client: { async listEntries() { return { entries: [{ severity: "INFO" }, { severity: "ERROR" }] }; } },
    }),
    (error) => error instanceof GcpAdapterError && error.code === "RESULT_LIMIT_EXCEEDED",
  );
});

test("service-account adapter exposes read methods only and normalized policy data", async () => {
  const calls = [];
  const result = await readServiceAccountIam({
    registry,
    resource: "serviceAccounts/reader@example.iam.gserviceaccount.com",
    permissions: ["iam.serviceAccounts.get"],
    client: {
      async getIamPolicy(resource) { calls.push(["policy", resource]); return { bindings: [{ role: "roles/viewer", members: ["user:reader@example.com"] }], accessToken: "secret" }; },
      async testIamPermissions(resource, permissions) { calls.push(["test", resource, permissions]); return { permissions }; },
    },
  });
  assert.equal(result.bindings.length, 1);
  assert.deepEqual(result.grantedPermissions, ["iam.serviceAccounts.get"]);
  assert.equal("accessToken" in result, false);
  assert.equal(calls.length, 2);
});

test("certificate parsing returns public metadata only", () => {
  const result = parsePublicCertificateMetadata({
    registry,
    certificateId: "certificate/public",
    pem: "-----BEGIN CERTIFICATE-----\nQUJDRA==\n-----END CERTIFICATE-----",
  });
  assert.deepEqual(result, { certificateId: "certificate/public", format: "pem", encodedLength: 8 });
});

test("drift findings are deterministic and sorted", () => {
  const findings = findDeterministicDrift({ z: 1, a: 2 }, { z: 3, a: 4 });
  assert.deepEqual(findings.map((finding) => finding.path), ["a", "z"]);
});
