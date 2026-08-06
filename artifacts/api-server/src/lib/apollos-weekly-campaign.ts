export type WeeklyCampaignPlatform =
  | "facebook"
  | "instagram"
  | "google_business"
  | "youtube";

export interface WeeklyCampaignSlot {
  readonly slotId: string;
  readonly date: string;
  readonly platform: WeeklyCampaignPlatform;
  readonly mediaType: "image" | "video";
  readonly creativeGroup: string;
  readonly requiresApproval: true;
}

export interface WeeklyCampaignPlan {
  readonly version: 1;
  readonly startDate: string;
  readonly endDate: string;
  readonly platforms: readonly WeeklyCampaignPlatform[];
  readonly slots: readonly WeeklyCampaignSlot[];
  readonly deliveryCount: number;
  readonly approvalMode: "weekly_batch";
  readonly publishMode: "schedule_after_approval";
  readonly safeguards: readonly string[];
}

const ALL_PLATFORMS: readonly WeeklyCampaignPlatform[] = Object.freeze([
  "facebook",
  "instagram",
  "google_business",
  "youtube",
]);

const CADENCE: Readonly<Record<WeeklyCampaignPlatform, readonly number[]>> =
  Object.freeze({
    facebook: Object.freeze([0, 1, 2, 3, 4]),
    instagram: Object.freeze([0, 1, 2, 3, 4]),
    google_business: Object.freeze([1, 4]),
    youtube: Object.freeze([3]),
  });

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function uniquePlatforms(
  platforms: readonly WeeklyCampaignPlatform[],
): readonly WeeklyCampaignPlatform[] {
  return Object.freeze(
    ALL_PLATFORMS.filter((platform) => platforms.includes(platform)),
  );
}

export function parseWeeklyCampaignPlatforms(
  command: string,
): readonly WeeklyCampaignPlatform[] {
  const normalized = command.toLowerCase();
  if (
    /all (four|4)/.test(normalized) ||
    /all (connected )?(social )?(media )?(accounts|platforms|channels)/.test(
      normalized,
    )
  ) {
    return ALL_PLATFORMS;
  }

  const selected: WeeklyCampaignPlatform[] = [];
  if (/facebook|\bfb\b/.test(normalized)) selected.push("facebook");
  if (/instagram|\binsta\b|\big\b/.test(normalized)) selected.push("instagram");
  if (
    /google business|google business profile|\bgbp\b|local search/.test(
      normalized,
    )
  ) {
    selected.push("google_business");
  }
  if (/youtube|\byt\b/.test(normalized)) selected.push("youtube");
  return uniquePlatforms(selected);
}

export function isWeeklyCampaignCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return (
    /\b(create|generate|build|prepare|schedule)\b/.test(normalized) &&
    /\bweek(?:'s|s|ly)?\b|seven[- ]day|7[- ]day/.test(normalized) &&
    parseWeeklyCampaignPlatforms(command).length > 0
  );
}

export function buildWeeklyCampaignPlan(input: {
  readonly startDate: string;
  readonly platforms: readonly WeeklyCampaignPlatform[];
}): WeeklyCampaignPlan {
  if (!validDate(input.startDate)) {
    throw new Error("APOLLOS_WEEKLY_START_DATE_INVALID");
  }

  const platforms = uniquePlatforms(input.platforms);
  if (platforms.length === 0) {
    throw new Error("APOLLOS_WEEKLY_PLATFORMS_REQUIRED");
  }

  const slots = platforms.flatMap((platform) =>
    CADENCE[platform].map((dayOffset) => {
      const date = addDays(input.startDate, dayOffset);
      const socialCreative =
        platform === "facebook" || platform === "instagram";
      return Object.freeze({
        slotId: `${date}:${platform}`,
        date,
        platform,
        mediaType: platform === "youtube" ? "video" as const : "image" as const,
        creativeGroup: socialCreative
          ? `${date}:meta-social`
          : `${date}:${platform}`,
        requiresApproval: true as const,
      });
    }),
  );

  return Object.freeze({
    version: 1 as const,
    startDate: input.startDate,
    endDate: addDays(input.startDate, 6),
    platforms,
    slots: Object.freeze(slots),
    deliveryCount: slots.length,
    approvalMode: "weekly_batch" as const,
    publishMode: "schedule_after_approval" as const,
    safeguards: Object.freeze([
      "canonical_service_registry",
      "prohibited_service_filter",
      "platform_specific_copy",
      "branded_platform_sized_media",
      "duplicate_delivery_prevention",
      "human_batch_approval",
      "independent_platform_delivery",
      "post_publish_verification",
    ]),
  });
}


export interface WeeklyGenerationJob {
  readonly jobKey: string;
  readonly platform: WeeklyCampaignPlatform;
  readonly generatorPlatform: "facebook" | "instagram" | "google" | "youtube";
  readonly count: number;
  readonly weeklyPlanId: string;
  readonly schedulerMode: "weekly_plan";
  readonly approvalMode: "approval_required";
}

export function buildWeeklyGenerationJobs(
  batchKey: string,
  plan: WeeklyCampaignPlan,
): readonly WeeklyGenerationJob[] {
  if (typeof batchKey !== "string" || batchKey.trim().length < 8) {
    throw new Error("APOLLOS_WEEKLY_BATCH_KEY_INVALID");
  }

  const jobs = plan.platforms.map((platform) => {
    const count = plan.slots.filter(
      (slot) => slot.platform === platform,
    ).length;
    if (count < 1) {
      throw new Error("APOLLOS_WEEKLY_PLATFORM_WITHOUT_SLOTS");
    }
    const generatorPlatform =
      platform === "google_business" ? "google" : platform;
    const stablePlatformKey = `${batchKey}:${platform}`;
    return Object.freeze({
      jobKey: stablePlatformKey,
      platform,
      generatorPlatform,
      count,
      weeklyPlanId: stablePlatformKey,
      schedulerMode: "weekly_plan" as const,
      approvalMode: "approval_required" as const,
    });
  });

  return Object.freeze(jobs);
}
