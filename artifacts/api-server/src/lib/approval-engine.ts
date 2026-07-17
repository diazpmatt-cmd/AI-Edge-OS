/**
 * Bounded Autonomy Approval Engine — Rule Set v1
 *
 * Pure, deterministic function — no DB access, no AI, no side effects.
 * Given a taskType + payload, returns one of three decisions:
 *
 *   auto_approved   — within rule bounds; system may execute immediately
 *   requires_review — outside auto-approve bounds; human must decide
 *   rejected        — invalid payload or unknown task type; never execute
 *
 * Rules are intentionally narrow. Any known task type that does not match an
 * explicit auto-approve rule lands in requires_review, not auto_approved.
 * Unknown task types are rejected.
 */

export const RULE_SET_VERSION = "v1" as const;

export type TaskDecision = "auto_approved" | "requires_review" | "rejected";

export interface ApprovalResult {
  readonly decision:  TaskDecision;
  readonly ruleId:    string;
  readonly reason:    string;
}

// ── Bounded task-type registry ────────────────────────────────────────────────

export const KNOWN_TASK_TYPES = [
  "generate_content",
  "schedule_post",
  "publish_post",
  "update_auto_content_settings",
  "update_client_settings",
  "pause_autopilot",
  "resume_autopilot",
] as const;

export type KnownTaskType = (typeof KNOWN_TASK_TYPES)[number];

// ── Allowed values ────────────────────────────────────────────────────────────

export const ALLOWED_PLATFORMS = new Set([
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
  "google_business",
]);

/**
 * High-stakes task types that always require human review.
 * No rule can override this set — it is the primary safety boundary.
 */
export const ALWAYS_REVIEW_TYPES = new Set<string>([
  "publish_post",
  "update_auto_content_settings",
  "update_client_settings",
  "pause_autopilot",
  "resume_autopilot",
]);

// ── Internal helpers (exported for testing) ───────────────────────────────────

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function isAllowedPlatform(v: unknown): boolean {
  return typeof v === "string" && ALLOWED_PLATFORMS.has(v);
}

export function isFutureTimestamp(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const d = new Date(v);
  return !isNaN(d.getTime()) && d.getTime() > Date.now();
}

// ── Per-type evaluators ───────────────────────────────────────────────────────

function evaluateGenerateContent(
  payload: Record<string, unknown>,
): ApprovalResult {
  if (!isNonEmptyString(payload.topic)) {
    return {
      decision: "rejected",
      ruleId:   "GENERATE_CONTENT_MISSING_TOPIC",
      reason:   "generate_content requires a non-empty topic string",
    };
  }
  if (!isAllowedPlatform(payload.platform)) {
    return {
      decision: "rejected",
      ruleId:   "GENERATE_CONTENT_INVALID_PLATFORM",
      reason:   `platform must be one of: ${[...ALLOWED_PLATFORMS].join(", ")}`,
    };
  }
  return {
    decision: "auto_approved",
    ruleId:   "GENERATE_CONTENT_AUTO",
    reason:   "Content generation is low-risk — output lands as draft, not published",
  };
}

function evaluateSchedulePost(
  payload: Record<string, unknown>,
): ApprovalResult {
  if (!isNonEmptyString(payload.postId)) {
    return {
      decision: "rejected",
      ruleId:   "SCHEDULE_POST_MISSING_POST_ID",
      reason:   "schedule_post requires a non-empty postId",
    };
  }
  if (!isFutureTimestamp(payload.scheduledAt)) {
    return {
      decision: "rejected",
      ruleId:   "SCHEDULE_POST_INVALID_SCHEDULED_AT",
      reason:   "schedule_post requires scheduledAt to be a valid future ISO-8601 timestamp",
    };
  }
  if (!isAllowedPlatform(payload.platform)) {
    return {
      decision: "rejected",
      ruleId:   "SCHEDULE_POST_INVALID_PLATFORM",
      reason:   `platform must be one of: ${[...ALLOWED_PLATFORMS].join(", ")}`,
    };
  }
  return {
    decision: "auto_approved",
    ruleId:   "SCHEDULE_POST_AUTO",
    reason:   "Scheduling a draft post to a future time is within bounded autonomy limits",
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate a task submission and return a deterministic approval decision.
 *
 * @param taskType - The submitted task type string (caller-supplied, untrusted)
 * @param payload  - Parsed payload value (caller must JSON.parse before calling)
 */
export function evaluateTask(
  taskType: string,
  payload: unknown,
): ApprovalResult {
  if (!KNOWN_TASK_TYPES.includes(taskType as KnownTaskType)) {
    return {
      decision: "rejected",
      ruleId:   "UNKNOWN_TASK_TYPE",
      reason:   `Unknown task type "${taskType}". Known types: ${KNOWN_TASK_TYPES.join(", ")}`,
    };
  }

  if (ALWAYS_REVIEW_TYPES.has(taskType)) {
    return {
      decision: "requires_review",
      ruleId:   "HIGH_STAKES_REVIEW",
      reason:   `${taskType} always requires human review before execution`,
    };
  }

  const safePayload: Record<string, unknown> =
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  if (taskType === "generate_content") return evaluateGenerateContent(safePayload);
  if (taskType === "schedule_post")    return evaluateSchedulePost(safePayload);

  return {
    decision: "requires_review",
    ruleId:   "NO_AUTO_RULE",
    reason:   `No auto-approval rule defined for "${taskType}" — requires human review`,
  };
}
