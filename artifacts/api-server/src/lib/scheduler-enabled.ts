export function isSchedulerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.SCHEDULER_ENABLED === "true";
}
