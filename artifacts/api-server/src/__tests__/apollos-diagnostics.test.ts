import { describe, expect, it } from "vitest";
import { diagnoseApollosTask } from "../lib/apollos-diagnostics";

function diagnose(failureCode: string | null, detail: string | null = null) {
  return diagnoseApollosTask({
    taskId: "task-1",
    taskStatus: failureCode ? "failed" : "executing",
    taskFailureCode: failureCode,
    taskDetail: detail,
    taskUpdatedAt: "2026-08-06T18:00:00.000Z",
    steps: [],
  });
}

describe("diagnoseApollosTask", () => {
  it.each([
    ["insufficient_quota: You have no credits remaining", "APOLLOS_ROOT_PROVIDER_CREDITS_EXHAUSTED", "AI image/text provider"],
    ["Image generation not available: provider not configured", "APOLLOS_ROOT_PROVIDER_NOT_CONFIGURED", "AI provider configuration"],
    ["Provided certificate config path is invalid: certificate-config.json", "APOLLOS_ROOT_GOOGLE_CERTIFICATE_PATH_INVALID", "Google/YouTube client configuration"],
    ["ffmpeg_failed: aevalsrc Invalid argument", "APOLLOS_ROOT_VIDEO_RENDERER_FAILED", "Native video renderer"],
    ["storage_failure: Failed to store generated image", "APOLLOS_ROOT_MEDIA_STORAGE_FAILED", "Durable media storage"],
    ["APOLLOS_CHECKPOINT_BINDING_MISMATCH:youtube", "APOLLOS_ROOT_EXECUTION_BINDING_MISMATCH", "Execution integrity boundary"],
    ["APOLLOS_CHECKPOINT_RETRIES_EXHAUSTED:google", "APOLLOS_ROOT_RETRIES_EXHAUSTED", "Execution retry policy"],
    ["APOLLOS_CHECKPOINT_LEASE_EXPIRED:facebook", "APOLLOS_ROOT_EXECUTION_LEASE", "Execution lease"],
    ["401 Unauthorized token expired", "APOLLOS_ROOT_AUTHENTICATION_FAILED", "Authentication"],
    ["403 insufficient permission scope", "APOLLOS_ROOT_PERMISSION_DENIED", "Provider permissions"],
    ["429 quota cooldown active", "APOLLOS_ROOT_PROVIDER_RATE_LIMITED", "Provider rate limit"],
    ["502 Bad Gateway failed to fetch", "APOLLOS_ROOT_UPSTREAM_UNREACHABLE", "Network or upstream service"],
  ])("classifies %s", (code, expectedRoot, component) => {
    expect(diagnose(code)).toMatchObject({
      status: "failed",
      rootCauseCode: expectedRoot,
      component,
    });
  });

  it("prioritizes the earliest failed checkpoint evidence", () => {
    const result = diagnoseApollosTask({
      taskId: "task-2",
      taskStatus: "failed",
      taskFailureCode: "APOLLOS_WEEKLY_RETRIES_EXHAUSTED",
      taskDetail: "Batch stopped.",
      taskUpdatedAt: "2026-08-06T18:03:00.000Z",
      steps: [
        {
          stepKey: "generate:youtube",
          status: "failed",
          failureCode: "ffmpeg_failed: filter invalid argument",
          updatedAt: "2026-08-06T18:01:00.000Z",
        },
      ],
    });
    expect(result.rootCauseCode).toBe("APOLLOS_ROOT_VIDEO_RENDERER_FAILED");
    expect(result.evidence[0]).toMatchObject({
      source: "checkpoint",
      stepKey: "generate:youtube",
    });
  });

  it("does not invent a root cause for unknown evidence", () => {
    expect(diagnose("SOMETHING_NEW_AND_UNCLASSIFIED")).toMatchObject({
      status: "failed",
      confidence: "unknown",
      rootCauseCode: "APOLLOS_ROOT_CAUSE_UNCLASSIFIED",
      canApollosRepair: false,
    });
  });

  it("reports a completed package as healthy without failure evidence", () => {
    const result = diagnoseApollosTask({
      taskId: "task-3",
      taskStatus: "pending_review",
      taskFailureCode: null,
      taskDetail: null,
      taskUpdatedAt: "2026-08-06T18:00:00.000Z",
      steps: [
        {
          stepKey: "generate:facebook",
          status: "completed",
          failureCode: null,
          updatedAt: "2026-08-06T18:00:00.000Z",
        },
      ],
    });
    expect(result).toMatchObject({
      status: "healthy",
      confidence: "confirmed",
      rootCauseCode: "APOLLOS_NO_FAILURE_DETECTED",
    });
  });

  it("admits insufficient evidence while work is still running", () => {
    expect(diagnose(null)).toMatchObject({
      status: "incomplete",
      confidence: "unknown",
      rootCauseCode: "APOLLOS_INSUFFICIENT_FAILURE_EVIDENCE",
    });
  });

  it("redacts secrets from diagnostic evidence", () => {
    const result = diagnose(
      "provider error",
      "Bearer secret-token-value sk_abcdefghijklmnopqrstuvwxyz123456",
    );
    const serialized = JSON.stringify(result.evidence);
    expect(serialized).not.toContain("secret-token-value");
    expect(serialized).not.toContain("sk_abcdefghijklmnopqrstuvwxyz123456");
    expect(serialized).toContain("REDACTED");
  });

  it("produces a stable diagnosis id for the same evidence", () => {
    expect(diagnose("ffmpeg_failed").diagnosisId).toBe(
      diagnose("ffmpeg_failed").diagnosisId,
    );
  });

  it("accepts runtime and deployment evidence without changing tenant scope", () => {
    const result = diagnoseApollosTask({
      taskId: "task-4",
      taskStatus: "failed",
      taskFailureCode: null,
      taskDetail: null,
      taskUpdatedAt: null,
      steps: [],
      additionalEvidence: [
        {
          source: "deployment",
          code: "network not found",
          detail: "container failed to start",
          observedAt: "2026-08-06T18:00:00.000Z",
          stepKey: null,
        },
      ],
    });
    expect(result.rootCauseCode).toBe("APOLLOS_ROOT_UPSTREAM_UNREACHABLE");
    expect(result.evidence[0]?.source).toBe("deployment");
  });
});
