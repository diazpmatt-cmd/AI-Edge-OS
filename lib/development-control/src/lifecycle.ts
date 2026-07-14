import { DevelopmentControlError, type TaskState } from "./types.js";

export const TASK_TRANSITIONS = Object.freeze({
  proposed: Object.freeze(["approved", "rejected", "cancelled"]),
  approved: Object.freeze(["claimed", "blocked", "rejected", "cancelled"]),
  claimed: Object.freeze(["approved", "in_progress", "blocked", "cancelled"]),
  in_progress: Object.freeze(["review_requested", "blocked", "cancelled"]),
  review_requested: Object.freeze([
    "in_progress",
    "verified",
    "blocked",
    "cancelled",
  ]),
  verified: Object.freeze(["in_progress", "completed", "blocked", "cancelled"]),
  blocked: Object.freeze(["approved", "in_progress", "cancelled"]),
  completed: Object.freeze([]),
  rejected: Object.freeze([]),
  cancelled: Object.freeze([]),
} as const satisfies Readonly<Record<TaskState, readonly TaskState[]>>);

export function assertValidTransition(prior: TaskState, next: TaskState): void {
  const allowed: readonly TaskState[] = TASK_TRANSITIONS[prior];
  if (!allowed.includes(next)) {
    throw new DevelopmentControlError(
      "INVALID_TASK_TRANSITION",
      `transition ${prior} -> ${next} is not allowed`,
    );
  }
}
