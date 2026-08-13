export type ScheduledPublishingOwner =
  | "legacy_scheduler"
  | "dedicated_monitor"
  | "disabled";

export function resolveScheduledPublishingOwner(
  env: NodeJS.ProcessEnv = process.env,
): ScheduledPublishingOwner {
  if (env.SCHEDULER_ENABLED === "true") return "legacy_scheduler";
  if (env.SCHEDULED_PUBLISHING_ENABLED === "true") return "dedicated_monitor";
  return "disabled";
}
