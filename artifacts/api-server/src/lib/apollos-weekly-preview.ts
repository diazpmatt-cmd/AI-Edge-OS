import {
  buildWeeklyCampaignPlan,
  fingerprintWeeklyCampaignPlan,
  parseWeeklyCampaignPlatforms,
  type WeeklyCampaignPlan,
  type WeeklyCampaignPlatform,
} from "./apollos-weekly-campaign";

const WEEK_PATTERN = /\b(?:week(?:'s|s|ly)?|seven[- ]day|7[- ]day)\b/;
const CAMPAIGN_OBJECT =
  /\b(?:posts?|content|campaign|calendar|plan|package|captions?|reels?|videos?)\b/;
const PREVIEW_REQUEST = new RegExp(
  "^(?:apollos\\s*[,;:\\-]?\\s*)?(?:" +
    "(?:please\\s+)?preview\\b|" +
    "(?:please\\s+)?show\\s+me\\b|" +
    "let\\s+me\\s+see\\b|" +
    "(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?(?:preview|show\\s+me)\\b|" +
    "i\\s+(?:want|need)\\s+to\\s+(?:preview|see)\\b|" +
    "i\\s+(?:want|need)\\s+you\\s+to\\s+(?:preview|show\\s+me)\\b" +
  ")",
);
const EXECUTION_ACTION =
  /\b(?:create|generate|build|prepare|schedule|publish|send|post\s+live|go\s+live)\b/;
const NEGATED_OR_EXCLUDED =
  /\b(?:do\s+not|don't|dont|never|stop|cancel|pause|hold|avoid|except|excluding|without|but\s+not)\b/;

export interface WeeklyCampaignDateRange {
  readonly earliestStartDate: string;
  readonly latestStartDate: string;
}

export interface WeeklyCampaignPreviewPlatform {
  readonly platform: WeeklyCampaignPlatform;
  readonly deliveryCount: number;
  readonly dates: readonly string[];
  readonly mediaTypes: readonly ("image" | "video")[];
}

export interface WeeklyCampaignPreview {
  readonly status: "preview";
  readonly previewOnly: true;
  readonly command: string;
  readonly plan: WeeklyCampaignPlan;
  readonly planFingerprint: string;
  readonly platforms: readonly WeeklyCampaignPreviewPlatform[];
  readonly executionContract: {
    readonly generation: "not_started";
    readonly approval: "not_requested";
    readonly scheduling: "not_started";
    readonly publishing: "not_started";
    readonly verification: "external_provider_receipt_required_on_execution";
  };
  readonly sideEffects: {
    readonly taskCreated: false;
    readonly draftsGenerated: false;
    readonly mediaGenerated: false;
    readonly postsScheduled: false;
    readonly providersCalled: false;
  };
  readonly nextAction: string;
}

function normalizeCommand(command: string): string {
  return command.trim().toLowerCase().replace(/[’]/g, "'");
}

export function isWeeklyCampaignPreviewCommand(command: string): boolean {
  const normalized = normalizeCommand(command);
  if (!normalized) return false;
  if (NEGATED_OR_EXCLUDED.test(normalized)) return false;
  if (EXECUTION_ACTION.test(normalized)) return false;
  if (!PREVIEW_REQUEST.test(normalized)) return false;

  return (
    WEEK_PATTERN.test(normalized) &&
    CAMPAIGN_OBJECT.test(normalized) &&
    parseWeeklyCampaignPlatforms(normalized).length > 0
  );
}

export function getWeeklyCampaignDateRange(
  now = new Date(),
): WeeklyCampaignDateRange {
  const todayTime = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const latestTime = todayTime + 180 * 24 * 60 * 60 * 1000;
  return Object.freeze({
    earliestStartDate: new Date(todayTime).toISOString().slice(0, 10),
    latestStartDate: new Date(latestTime).toISOString().slice(0, 10),
  });
}

export function nextWeeklyCampaignMonday(now = new Date()): string {
  const day = now.getUTCDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilMonday,
  ));
  return next.toISOString().slice(0, 10);
}

function assertStartDateInRange(startDate: string, now: Date): void {
  const range = getWeeklyCampaignDateRange(now);
  const startTime = Date.parse(`${startDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    Number.isNaN(startTime) ||
    new Date(startTime).toISOString().slice(0, 10) !== startDate ||
    startDate < range.earliestStartDate ||
    startDate > range.latestStartDate
  ) {
    throw new Error("APOLLOS_WEEKLY_START_DATE_OUT_OF_RANGE");
  }
}

export function buildWeeklyCampaignPreview(input: {
  readonly command: string;
  readonly startDate?: string;
  readonly now?: Date;
}): WeeklyCampaignPreview {
  const command = input.command.trim();
  if (command.length > 1_000) {
    throw new Error("APOLLOS_WEEKLY_COMMAND_TOO_LARGE");
  }
  if (!isWeeklyCampaignPreviewCommand(command)) {
    throw new Error("APOLLOS_WEEKLY_PREVIEW_NOT_RECOGNIZED");
  }

  const now = input.now ?? new Date();
  const startDate = input.startDate?.trim() || nextWeeklyCampaignMonday(now);
  assertStartDateInRange(startDate, now);

  const plan = buildWeeklyCampaignPlan({
    startDate,
    platforms: parseWeeklyCampaignPlatforms(command),
  });
  const platforms = plan.platforms.map((platform) => {
    const slots = plan.slots.filter((slot) => slot.platform === platform);
    return Object.freeze({
      platform,
      deliveryCount: slots.length,
      dates: Object.freeze(slots.map((slot) => slot.date)),
      mediaTypes: Object.freeze(slots.map((slot) => slot.mediaType)),
    });
  });

  return Object.freeze({
    status: "preview" as const,
    previewOnly: true as const,
    command,
    plan,
    planFingerprint: fingerprintWeeklyCampaignPlan(plan),
    platforms: Object.freeze(platforms),
    executionContract: Object.freeze({
      generation: "not_started" as const,
      approval: "not_requested" as const,
      scheduling: "not_started" as const,
      publishing: "not_started" as const,
      verification: "external_provider_receipt_required_on_execution" as const,
    }),
    sideEffects: Object.freeze({
      taskCreated: false as const,
      draftsGenerated: false as const,
      mediaGenerated: false as const,
      postsScheduled: false as const,
      providersCalled: false as const,
    }),
    nextAction:
      "Review the exact dates, platforms, delivery count, and media requirements. Use the guarded execution command only when you are ready to create the package.",
  });
}
