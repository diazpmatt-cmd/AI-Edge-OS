import test from "node:test";
import assert from "node:assert/strict";
import {
  MetaAdapterError,
  diagnosePageInstagramLink,
  diagnosePublishingEligibility,
  findDeterministicMetaDrift,
  readInstagramAccountMetadata,
  readPageCapabilities,
  readPageMetadata,
  readRecentContentMetadata,
  readTokenExpiryMetadata,
  readWebhookConfiguration,
} from "../.test-dist/index.js";

const registry = {
  resources: [
    { id: "page-1", kind: "page" },
    { id: "ig-1", kind: "instagram_account" },
    { id: "app-1", kind: "app" },
    { id: "webhook-1", kind: "webhook" },
  ],
};

test("normalizes Page metadata and omits unknown sensitive fields", async () => {
  const result = await readPageMetadata({
    registry,
    pageId: "page-1",
    client: { getPage: async () => ({ id: "page-1", name: "Example", category: "Local business", accessToken: "secret", personalProfile: { id: "person" } }) },
  });
  assert.deepEqual(result, {
    id: "page-1",
    name: "Example",
    category: "Local business",
    verificationStatus: null,
    instagramBusinessAccountId: null,
  });
  assert.equal("accessToken" in result, false);
  assert.equal("personalProfile" in result, false);
});

test("rejects an unregistered Page before client invocation", async () => {
  let calls = 0;
  await assert.rejects(
    readPageMetadata({ registry, pageId: "page-x", client: { getPage: async () => { calls += 1; return { id: "page-x" }; } } }),
    (error) => error instanceof MetaAdapterError && error.code === "RESOURCE_UNREGISTERED",
  );
  assert.equal(calls, 0);
});

test("normalizes Instagram metadata and linkage diagnostics", async () => {
  const account = await readInstagramAccountMetadata({
    registry,
    accountId: "ig-1",
    client: { getInstagramAccount: async () => ({ id: "ig-1", username: "example", accountType: "BUSINESS", pageId: "page-1", mediaCount: 12, token: "secret" }) },
  });
  assert.equal(account.username, "example");
  assert.equal("token" in account, false);
  assert.equal(diagnosePageInstagramLink({ registry, pageId: "page-1", instagramAccountId: "ig-1", observedPageInstagramAccountId: "ig-1", observedInstagramPageId: "page-1" }).status, "linked");
});

test("normalizes capabilities and evaluates publishing eligibility without publishing", async () => {
  const result = await readPageCapabilities({
    registry,
    pageId: "page-1",
    client: { getPageCapabilities: async () => ({ permissions: ["pages_manage_posts", "instagram_content_publish"], tasks: ["CREATE_CONTENT"], features: ["PUBLISHING"], canPublish: true, appSecret: "secret" }) },
  });
  assert.deepEqual(result.permissions, ["instagram_content_publish", "pages_manage_posts"]);
  assert.equal(diagnosePublishingEligibility({ pageId: "page-1", instagramAccountId: "ig-1", permissions: result.permissions, tasks: result.tasks, canPublish: result.canPublish }).eligible, true);
});

test("returns token expiry metadata without token values", async () => {
  const result = await readTokenExpiryMetadata({
    registry,
    appId: "app-1",
    client: { inspectTokenMetadata: async () => ({ appId: "app-1", type: "PAGE", expiresAt: "2026-09-01T00:00:00Z", scopes: ["pages_read_engagement"], isValid: true, accessToken: "secret", appSecret: "secret" }) },
  });
  assert.equal(result.isValid, true);
  assert.equal("accessToken" in result, false);
  assert.equal("appSecret" in result, false);
});

test("inspects webhook configuration without mutation surface", async () => {
  const result = await readWebhookConfiguration({
    registry,
    webhookId: "webhook-1",
    client: { getWebhookConfiguration: async () => ({ id: "webhook-1", object: "page", fields: ["feed", "mention"], callbackConfigured: true, active: true, verifyToken: "secret" }) },
  });
  assert.deepEqual(result.fields, ["feed", "mention"]);
  assert.equal("verifyToken" in result, false);
});

test("bounds recent content and omits bodies, comments, messages, and raw payloads", async () => {
  const result = await readRecentContentMetadata({
    registry,
    resourceId: "page-1",
    resourceKind: "page",
    maxResults: 2,
    client: { listRecentContent: async (_id, options) => ({ items: [{ id: "post-1", type: "PHOTO", createdTime: "2026-08-01", permalink: "https://example.test/post-1", status: "PUBLISHED", message: "private", comments: ["private"], raw: { secret: true }, requestedPageSize: options.pageSize }] }) },
  });
  assert.equal(result.length, 1);
  assert.deepEqual(Object.keys(result[0]).sort(), ["createdTime", "id", "permalink", "status", "type"]);
  await assert.rejects(
    readRecentContentMetadata({ registry, resourceId: "page-1", resourceKind: "page", maxResults: 1, client: { listRecentContent: async () => ({ items: [{ id: "1" }, { id: "2" }] }) } }),
    (error) => error instanceof MetaAdapterError && error.code === "RESULT_LIMIT_EXCEEDED",
  );
});

test("produces deterministic sorted drift findings", () => {
  const findings = findDeterministicMetaDrift({ z: 1, a: true }, { z: 2, a: false });
  assert.deepEqual(findings.map((finding) => finding.path), ["a", "z"]);
});
