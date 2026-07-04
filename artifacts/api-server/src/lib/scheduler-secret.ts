// Shared in-process secret that allows the scheduler to call the publish
// endpoint without a Clerk session. Set SCHEDULER_SECRET in environment
// variables for production stability. Falls back to a random value generated
// once at startup — both scheduler.ts and the publish route import from here,
// so they always share the same value within a single server process.
export const SCHEDULER_SECRET =
  process.env.SCHEDULER_SECRET ??
  Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
