export type WeeklyExecutionStatus =
  | "approved"
  | "executing"
  | "executed"
  | "failed";

export interface WeeklyExecutionDecision {
  readonly nextStatus: WeeklyExecutionStatus;
  readonly attempts: number;
  readonly terminal: boolean;
  readonly reasonCode: string;
}

export function claimWeeklyExecution(input: {
  readonly status: string;
  readonly attempts: number;
  readonly maxAttempts: number;
}): WeeklyExecutionDecision {
  if (input.status !== "approved") {
    throw new Error("APOLLOS_WEEKLY_NOT_APPROVED");
  }
  if (
    !Number.isInteger(input.attempts) ||
    input.attempts < 0 ||
    !Number.isInteger(input.maxAttempts) ||
    input.maxAttempts < 1
  ) {
    throw new Error("APOLLOS_WEEKLY_RETRY_CONFIG_INVALID");
  }
  if (input.attempts >= input.maxAttempts) {
    return Object.freeze({
      nextStatus: "failed",
      attempts: input.attempts,
      terminal: true,
      reasonCode: "APOLLOS_WEEKLY_RETRIES_EXHAUSTED",
    });
  }
  return Object.freeze({
    nextStatus: "executing",
    attempts: input.attempts + 1,
    terminal: false,
    reasonCode: "APOLLOS_WEEKLY_EXECUTION_CLAIMED",
  });
}

export function completeWeeklyExecution(): WeeklyExecutionDecision {
  return Object.freeze({
    nextStatus: "executed",
    attempts: 0,
    terminal: true,
    reasonCode: "APOLLOS_WEEKLY_EXECUTION_COMPLETE",
  });
}

export function failWeeklyExecution(input: {
  readonly attempts: number;
  readonly maxAttempts: number;
}): WeeklyExecutionDecision {
  if (
    !Number.isInteger(input.attempts) ||
    input.attempts < 1 ||
    !Number.isInteger(input.maxAttempts) ||
    input.maxAttempts < 1
  ) {
    throw new Error("APOLLOS_WEEKLY_RETRY_CONFIG_INVALID");
  }
  const terminal = input.attempts >= input.maxAttempts;
  return Object.freeze({
    nextStatus: terminal ? "failed" : "approved",
    attempts: input.attempts,
    terminal,
    reasonCode: terminal
      ? "APOLLOS_WEEKLY_RETRIES_EXHAUSTED"
      : "APOLLOS_WEEKLY_RETRY_QUEUED",
  });
}
