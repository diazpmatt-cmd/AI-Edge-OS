export type MetaResourceKind = "page" | "instagram_account" | "app" | "webhook";

export interface RegisteredMetaResource {
  readonly id: string;
  readonly kind: MetaResourceKind;
}

export interface MetaResourceRegistry {
  readonly resources: readonly RegisteredMetaResource[];
}

export type MetaAdapterErrorCode =
  | "RESOURCE_UNREGISTERED"
  | "RESULT_LIMIT_EXCEEDED"
  | "INVALID_RESPONSE"
  | "LINKAGE_MISMATCH";

export class MetaAdapterError extends Error {
  constructor(readonly code: MetaAdapterErrorCode, message: string) {
    super(message);
    this.name = "MetaAdapterError";
  }
}

function requireRegistered(registry: MetaResourceRegistry, id: string, kind: MetaResourceKind): void {
  if (!registry.resources.some((resource) => resource.id === id && resource.kind === kind)) {
    throw new MetaAdapterError("RESOURCE_UNREGISTERED", `Unregistered ${kind}: ${id}`);
  }
}

function safeString(value: unknown, field: string, max = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new MetaAdapterError("INVALID_RESPONSE", `Invalid ${field}`);
  }
  return value;
}

function optionalString(value: unknown, max = 512): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

function bounded<T>(items: readonly T[], maxResults: number): readonly T[] {
  if (!Number.isInteger(maxResults) || maxResults < 1 || items.length > maxResults) {
    throw new MetaAdapterError("RESULT_LIMIT_EXCEEDED", `Result count ${items.length} exceeds ${maxResults}`);
  }
  return Object.freeze([...items]);
}

function boundedStrings(items: unknown, maxResults: number, maxLength = 256): readonly string[] {
  if (!Array.isArray(items)) return Object.freeze([]);
  return Object.freeze(
    bounded(items, maxResults)
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.slice(0, maxLength))
      .sort(),
  );
}

export interface MetaPageReadClient {
  getPage(pageId: string): Promise<{
    id?: unknown;
    name?: unknown;
    category?: unknown;
    verificationStatus?: unknown;
    instagramBusinessAccountId?: unknown;
    [key: string]: unknown;
  }>;
}

export async function readPageMetadata(input: {
  readonly client: MetaPageReadClient;
  readonly registry: MetaResourceRegistry;
  readonly pageId: string;
}) {
  requireRegistered(input.registry, input.pageId, "page");
  const raw = await input.client.getPage(input.pageId);
  const id = safeString(raw.id, "page id", 128);
  if (id !== input.pageId) throw new MetaAdapterError("INVALID_RESPONSE", "Page id mismatch");
  return Object.freeze({
    id,
    name: optionalString(raw.name, 256),
    category: optionalString(raw.category, 128),
    verificationStatus: optionalString(raw.verificationStatus, 64),
    instagramBusinessAccountId: optionalString(raw.instagramBusinessAccountId, 128),
  });
}

export interface MetaInstagramReadClient {
  getInstagramAccount(accountId: string): Promise<{
    id?: unknown;
    username?: unknown;
    accountType?: unknown;
    pageId?: unknown;
    mediaCount?: unknown;
    [key: string]: unknown;
  }>;
}

export async function readInstagramAccountMetadata(input: {
  readonly client: MetaInstagramReadClient;
  readonly registry: MetaResourceRegistry;
  readonly accountId: string;
}) {
  requireRegistered(input.registry, input.accountId, "instagram_account");
  const raw = await input.client.getInstagramAccount(input.accountId);
  const id = safeString(raw.id, "Instagram account id", 128);
  if (id !== input.accountId) throw new MetaAdapterError("INVALID_RESPONSE", "Instagram account id mismatch");
  return Object.freeze({
    id,
    username: optionalString(raw.username, 128),
    accountType: optionalString(raw.accountType, 64),
    pageId: optionalString(raw.pageId, 128),
    mediaCount: typeof raw.mediaCount === "number" && Number.isSafeInteger(raw.mediaCount) && raw.mediaCount >= 0
      ? raw.mediaCount
      : null,
  });
}

export function diagnosePageInstagramLink(input: {
  readonly registry: MetaResourceRegistry;
  readonly pageId: string;
  readonly instagramAccountId: string;
  readonly observedPageInstagramAccountId: string | null;
  readonly observedInstagramPageId: string | null;
}) {
  requireRegistered(input.registry, input.pageId, "page");
  requireRegistered(input.registry, input.instagramAccountId, "instagram_account");
  const linked = input.observedPageInstagramAccountId === input.instagramAccountId
    && input.observedInstagramPageId === input.pageId;
  return Object.freeze({
    pageId: input.pageId,
    instagramAccountId: input.instagramAccountId,
    status: linked ? "linked" : "mismatch",
    reasonCodes: Object.freeze(linked ? ["LINKED"] : ["PAGE_LINK_MISMATCH", "INSTAGRAM_LINK_MISMATCH"]),
  });
}

export interface MetaCapabilityReadClient {
  getPageCapabilities(pageId: string): Promise<{
    permissions?: unknown;
    tasks?: unknown;
    features?: unknown;
    canPublish?: unknown;
    [key: string]: unknown;
  }>;
}

export async function readPageCapabilities(input: {
  readonly client: MetaCapabilityReadClient;
  readonly registry: MetaResourceRegistry;
  readonly pageId: string;
  readonly maxItems?: number;
}) {
  requireRegistered(input.registry, input.pageId, "page");
  const max = input.maxItems ?? 50;
  const raw = await input.client.getPageCapabilities(input.pageId);
  return Object.freeze({
    pageId: input.pageId,
    permissions: boundedStrings(raw.permissions, max),
    tasks: boundedStrings(raw.tasks, max),
    features: boundedStrings(raw.features, max),
    canPublish: raw.canPublish === true,
  });
}

export function diagnosePublishingEligibility(input: {
  readonly pageId: string;
  readonly instagramAccountId?: string;
  readonly permissions: readonly string[];
  readonly tasks: readonly string[];
  readonly canPublish: boolean;
}) {
  const reasons: string[] = [];
  if (!input.canPublish) reasons.push("PUBLISH_CAPABILITY_MISSING");
  if (!input.permissions.includes("pages_manage_posts")) reasons.push("PAGE_PUBLISH_PERMISSION_MISSING");
  if (input.instagramAccountId && !input.permissions.includes("instagram_content_publish")) {
    reasons.push("INSTAGRAM_PUBLISH_PERMISSION_MISSING");
  }
  if (!input.tasks.includes("CREATE_CONTENT") && !input.tasks.includes("MANAGE")) {
    reasons.push("PAGE_TASK_MISSING");
  }
  return Object.freeze({
    eligible: reasons.length === 0,
    reasonCodes: Object.freeze(reasons.length === 0 ? ["ELIGIBLE"] : reasons.sort()),
  });
}

export interface MetaTokenMetadataReadClient {
  inspectTokenMetadata(appId: string): Promise<{
    appId?: unknown;
    type?: unknown;
    expiresAt?: unknown;
    dataAccessExpiresAt?: unknown;
    scopes?: unknown;
    isValid?: unknown;
    [key: string]: unknown;
  }>;
}

export async function readTokenExpiryMetadata(input: {
  readonly client: MetaTokenMetadataReadClient;
  readonly registry: MetaResourceRegistry;
  readonly appId: string;
  readonly maxScopes?: number;
}) {
  requireRegistered(input.registry, input.appId, "app");
  const raw = await input.client.inspectTokenMetadata(input.appId);
  return Object.freeze({
    appId: safeString(raw.appId, "app id", 128),
    type: optionalString(raw.type, 64),
    expiresAt: optionalString(raw.expiresAt, 64),
    dataAccessExpiresAt: optionalString(raw.dataAccessExpiresAt, 64),
    scopes: boundedStrings(raw.scopes, input.maxScopes ?? 100),
    isValid: raw.isValid === true,
  });
}

export interface MetaWebhookReadClient {
  getWebhookConfiguration(webhookId: string): Promise<{
    id?: unknown;
    object?: unknown;
    fields?: unknown;
    callbackConfigured?: unknown;
    active?: unknown;
    [key: string]: unknown;
  }>;
}

export async function readWebhookConfiguration(input: {
  readonly client: MetaWebhookReadClient;
  readonly registry: MetaResourceRegistry;
  readonly webhookId: string;
  readonly maxFields?: number;
}) {
  requireRegistered(input.registry, input.webhookId, "webhook");
  const raw = await input.client.getWebhookConfiguration(input.webhookId);
  return Object.freeze({
    id: safeString(raw.id, "webhook id", 128),
    object: optionalString(raw.object, 64),
    fields: boundedStrings(raw.fields, input.maxFields ?? 100),
    callbackConfigured: raw.callbackConfigured === true,
    active: raw.active === true,
  });
}

export interface MetaContentReadClient {
  listRecentContent(resourceId: string, options: { readonly pageSize: number }): Promise<{
    items?: readonly {
      id?: unknown;
      type?: unknown;
      createdTime?: unknown;
      permalink?: unknown;
      status?: unknown;
      [key: string]: unknown;
    }[];
  }>;
}

export async function readRecentContentMetadata(input: {
  readonly client: MetaContentReadClient;
  readonly registry: MetaResourceRegistry;
  readonly resourceId: string;
  readonly resourceKind: "page" | "instagram_account";
  readonly maxResults?: number;
}) {
  requireRegistered(input.registry, input.resourceId, input.resourceKind);
  const max = input.maxResults ?? 25;
  const raw = await input.client.listRecentContent(input.resourceId, { pageSize: max });
  return Object.freeze(
    bounded(raw.items ?? [], max).map((item) => Object.freeze({
      id: safeString(item.id, "content id", 128),
      type: optionalString(item.type, 64),
      createdTime: optionalString(item.createdTime, 64),
      permalink: optionalString(item.permalink, 1024),
      status: optionalString(item.status, 64),
    })),
  );
}

export interface MetaDriftFinding {
  readonly code: "VALUE_MISMATCH";
  readonly path: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

export function findDeterministicMetaDrift(
  expected: Readonly<Record<string, unknown>>,
  actual: Readonly<Record<string, unknown>>,
): readonly MetaDriftFinding[] {
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  return Object.freeze(keys.flatMap((key) => (
    JSON.stringify(expected[key]) === JSON.stringify(actual[key])
      ? []
      : [Object.freeze({ code: "VALUE_MISMATCH" as const, path: key, expected: expected[key], actual: actual[key] })]
  )));
}
