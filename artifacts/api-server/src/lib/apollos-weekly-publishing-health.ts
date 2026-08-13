import { db } from "@workspace/db";
import {
  agentTasksTable,
  platformDeliveriesTable,
  socialPostsTable,
} from "@workspace/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

import {
  resolveAuthorizedApollosClientTarget,
  type ApollosClientTargetResolver,
} from "./apollos-client-access.js";
import {
  APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
  APOLLOS_MCP_READ_ONLY_ANNOTATIONS,
} from "./apollos-client-mcp-auth.js";
import {
  assertWeeklyGenerationContract,
  type WeeklyCampaignPlatform,
  type WeeklyCampaignPlan,
  type WeeklyGenerationJob,
} from "./apollos-weekly-campaign.js";
import {
  buildWeeklyDeliverySummary,
  type WeeklyDeliveryAttemptInput,
  type WeeklyDeliveryChannelSummary,
  type WeeklyDeliveryPostInput,
  type WeeklyDeliverySummary,
} from "./apollos-weekly-delivery-status.js";

const CLIENT_ID_PROPERTY = Object.freeze({ type: "string", minLength: 1, maxLength: 100 });
const VERIFICATION_RULE = "external_post_id_or_url_required" as const;

export const APOLLOS_WEEKLY_PUBLISHING_HEALTH_MCP_TOOL = Object.freeze({
  securitySchemes: APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
  annotations: APOLLOS_MCP_READ_ONLY_ANNOTATIONS,
  name: "apollos_get_weekly_publishing_health" as const,
  description:
    "Read-only: inspect the newest authorized client's weekly campaign using receipt-verified delivery evidence. Returns verified, needs_attention, or unverified without publishing or retrying anything.",
  inputSchema: Object.freeze({
    type: "object",
    properties: Object.freeze({ clientId: CLIENT_ID_PROPERTY }),
    additionalProperties: false,
  }),
});

export type ApollosWeeklyPublishingHealthMcpToolName =
  typeof APOLLOS_WEEKLY_PUBLISHING_HEALTH_MCP_TOOL.name;
export type WeeklyPublishingHealthStatus =
  | "verified"
  | "needs_attention"
  | "unverified";

export interface WeeklyPublishingHealthChannel
  extends Omit<WeeklyDeliveryChannelSummary, "platform"> {
  readonly platform: WeeklyCampaignPlatform;
}

export interface WeeklyPublishingHealthData {
  readonly status: WeeklyPublishingHealthStatus;
  readonly reason:
    | "all_expected_deliveries_receipt_verified"
    | "delivery_attention_required"
    | "no_weekly_campaign"
    | "campaign_contract_unverified"
    | "missing_platform_lane_evidence"
    | "delivery_ledger_unavailable";
  readonly verificationRule: typeof VERIFICATION_RULE;
  readonly taskId: string | null;
  readonly taskStatus: string | null;
  readonly planStartDate: string | null;
  readonly planEndDate: string | null;
  readonly expectedPlatforms: readonly WeeklyCampaignPlatform[];
  readonly channels: readonly WeeklyPublishingHealthChannel[];
  readonly summary: WeeklyDeliverySummary | null;
}

export type WeeklyPublishingHealthReader = (
  ownerUserId: string,
) => Promise<WeeklyPublishingHealthData>;

function parseClientId(value: unknown): string | null {
  const input = value ?? {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "clientId")) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
  if (record.clientId === undefined) return null;
  if (
    typeof record.clientId !== "string" ||
    !record.clientId.trim() ||
    record.clientId.trim().length > 100
  ) {
    throw new Error("APOLLOS_MCP_CLIENT_ID_INVALID");
  }
  return record.clientId.trim();
}

function generatorPlatformFor(platform: WeeklyCampaignPlatform): string {
  return platform === "google_business" ? "google" : platform;
}

function channelForPlatform(
  platform: WeeklyCampaignPlatform,
  summary: WeeklyDeliverySummary,
): WeeklyPublishingHealthChannel | null {
  const channel = summary.channels.find(
    (candidate) => candidate.platform === generatorPlatformFor(platform),
  );
  if (!channel) return null;
  return Object.freeze({ ...channel, platform });
}

export function classifyWeeklyPublishingHealth(input: {
  readonly plan: WeeklyCampaignPlan;
  readonly summary: WeeklyDeliverySummary;
}): Pick<WeeklyPublishingHealthData, "status" | "reason" | "expectedPlatforms" | "channels"> {
  const channels = input.plan.platforms.map((platform) =>
    channelForPlatform(platform, input.summary),
  );
  if (channels.some((channel) => channel === null)) {
    return Object.freeze({
      status: "unverified",
      reason: "missing_platform_lane_evidence",
      expectedPlatforms: Object.freeze([...input.plan.platforms]),
      channels: Object.freeze(
        channels.filter(
          (channel): channel is WeeklyPublishingHealthChannel => channel !== null,
        ),
      ),
    });
  }

  const verified =
    input.summary.expectedDeliveries > 0 &&
    input.summary.publishedDeliveries === input.summary.expectedDeliveries &&
    input.summary.failedDeliveries === 0 &&
    input.summary.skippedDeliveries === 0 &&
    input.summary.receiptMissingDeliveries === 0 &&
    input.summary.unresolvedDeliveries === 0 &&
    channels.every((channel) => channel!.lifecycle === "published");

  return Object.freeze({
    status: verified ? "verified" : "needs_attention",
    reason: verified
      ? "all_expected_deliveries_receipt_verified"
      : "delivery_attention_required",
    expectedPlatforms: Object.freeze([...input.plan.platforms]),
    channels: Object.freeze(channels as readonly WeeklyPublishingHealthChannel[]),
  });
}

function unverified(
  reason: WeeklyPublishingHealthData["reason"],
): WeeklyPublishingHealthData {
  return Object.freeze({
    status: "unverified",
    reason,
    verificationRule: VERIFICATION_RULE,
    taskId: null,
    taskStatus: null,
    planStartDate: null,
    planEndDate: null,
    expectedPlatforms: Object.freeze([]),
    channels: Object.freeze([]),
    summary: null,
  });
}

export async function readLatestWeeklyPublishingHealth(
  ownerUserId: string,
): Promise<WeeklyPublishingHealthData> {
  const [task] = await db
    .select()
    .from(agentTasksTable)
    .where(
      and(
        eq(agentTasksTable.userId, ownerUserId),
        eq(agentTasksTable.taskType, "weekly_campaign"),
      ),
    )
    .orderBy(desc(agentTasksTable.createdAt))
    .limit(1);

  if (!task) return unverified("no_weekly_campaign");

  let plan: WeeklyCampaignPlan;
  let generationJobs: readonly WeeklyGenerationJob[];
  try {
    const payload =
      typeof task.payload === "string" ? JSON.parse(task.payload) : task.payload;
    const batchKey = payload?.batchKey;
    plan = payload?.plan as WeeklyCampaignPlan;
    generationJobs = payload?.generationJobs as readonly WeeklyGenerationJob[];
    if (
      typeof batchKey !== "string" ||
      !plan ||
      !Array.isArray(generationJobs)
    ) {
      return unverified("campaign_contract_unverified");
    }
    assertWeeklyGenerationContract(batchKey, plan, generationJobs);
  } catch {
    return unverified("campaign_contract_unverified");
  }

  const weeklyPlanIds = generationJobs.map((job) => job.weeklyPlanId);
  const posts: WeeklyDeliveryPostInput[] = await db
    .select({
      id: socialPostsTable.id,
      weeklyPlanId: socialPostsTable.weeklyPlanId,
      status: socialPostsTable.status,
      approvalStatus: socialPostsTable.approvalStatus,
      scheduledAt: socialPostsTable.scheduledAt,
      publishedAt: socialPostsTable.publishedAt,
    })
    .from(socialPostsTable)
    .where(
      and(
        eq(socialPostsTable.userId, ownerUserId),
        inArray(socialPostsTable.weeklyPlanId, weeklyPlanIds),
      ),
    );

  const postIds = posts.map((post) => post.id);
  let attempts: WeeklyDeliveryAttemptInput[] = [];
  if (postIds.length > 0) {
    attempts = await db
      .select({
        postId: platformDeliveriesTable.postId,
        platform: platformDeliveriesTable.platform,
        status: platformDeliveriesTable.status,
        attemptNumber: platformDeliveriesTable.attemptNumber,
        externalPostId: platformDeliveriesTable.externalPostId,
        externalPostUrl: platformDeliveriesTable.externalPostUrl,
        errorCode: platformDeliveriesTable.errorCode,
        errorMessage: platformDeliveriesTable.errorMessage,
        retryAllowed: platformDeliveriesTable.retryAllowed,
        publishedAt: platformDeliveriesTable.publishedAt,
        updatedAt: platformDeliveriesTable.updatedAt,
      })
      .from(platformDeliveriesTable)
      .where(
        and(
          eq(platformDeliveriesTable.userId, ownerUserId),
          inArray(platformDeliveriesTable.postId, postIds),
        ),
      );
  }

  const summary = buildWeeklyDeliverySummary({
    expectedDeliveries: plan.deliveryCount,
    jobs: generationJobs,
    posts,
    attempts,
  });
  const classified = classifyWeeklyPublishingHealth({ plan, summary });

  return Object.freeze({
    ...classified,
    verificationRule: VERIFICATION_RULE,
    taskId: task.id,
    taskStatus: task.status,
    planStartDate: plan.startDate,
    planEndDate: plan.endDate,
    summary,
  });
}

export function isApollosWeeklyPublishingHealthMcpToolName(
  value: unknown,
): value is ApollosWeeklyPublishingHealthMcpToolName {
  return value === APOLLOS_WEEKLY_PUBLISHING_HEALTH_MCP_TOOL.name;
}

export async function executeApollosWeeklyPublishingHealthMcpTool(input: {
  readonly arguments: unknown;
  readonly actorUserId: string;
  readonly actorReference: string;
  readonly resolveTarget?: ApollosClientTargetResolver;
  readonly readHealth?: WeeklyPublishingHealthReader;
}): Promise<Readonly<Record<string, unknown>>> {
  const actorUserId = input.actorUserId.trim();
  const actorReference = input.actorReference.trim();
  if (!actorUserId || !actorReference) {
    throw new Error("APOLLOS_MCP_IDENTITY_REQUIRED");
  }

  const requestedClientId = parseClientId(input.arguments);
  const resolveTarget = input.resolveTarget ?? resolveAuthorizedApollosClientTarget;
  const resolution = await resolveTarget(actorUserId, requestedClientId);
  if (!resolution.ok) {
    throw new Error(`APOLLOS_MCP_CLIENT_${resolution.reason.toUpperCase()}`);
  }

  let data: WeeklyPublishingHealthData;
  try {
    data = await (input.readHealth ?? readLatestWeeklyPublishingHealth)(
      resolution.target.ownerUserId,
    );
  } catch {
    data = unverified("delivery_ledger_unavailable");
  }

  return Object.freeze({
    tool: APOLLOS_WEEKLY_PUBLISHING_HEALTH_MCP_TOOL.name,
    actorReference,
    clientId: resolution.target.clientId,
    sideEffects: false,
    data,
  });
}
