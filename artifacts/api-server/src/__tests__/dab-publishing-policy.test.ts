import { describe, expect, it } from "vitest";
import { isDab8aPlatform, readPublishingWorkerConfig, stablePublishPayloadHash, validateBbbCaption, validateSchedule } from "../lib/dab-publishing-policy.js";

const payload = {
  postId: "post-1",
  userId: "user-1",
  clientName: "Bed Bugs & Beyond",
  platform: "facebook" as const,
  caption: "We treat bed bug affected furniture and belongings with a targeted plan.",
  imageUrl: null,
  ctaType: "call",
  ctaValue: "2515551212",
  scheduledAt: "2026-08-03T14:00:00.000Z",
};

describe("DAB-8A publishing policy", () => {
  it("allows only the first bounded platforms", () => {
    expect(isDab8aPlatform("facebook")).toBe(true);
    expect(isDab8aPlatform("google")).toBe(true);
    expect(isDab8aPlatform("instagram")).toBe(false);
  });

  it("hashes the exact payload deterministically", () => {
    expect(stablePublishPayloadHash(payload)).toBe(stablePublishPayloadHash({ ...payload }));
    expect(stablePublishPayloadHash(payload)).not.toBe(stablePublishPayloadHash({ ...payload, caption: payload.caption + " Updated." }));
  });

  it("blocks unsupported service claims", () => {
    expect(validateBbbCaption("We provide termite treatment today.")).toEqual({ ok: false, code: "TERMITE_CLAIM_BLOCKED" });
    expect(validateBbbCaption("Ask about our whole-home heat treatment for bed bugs.")).toEqual({ ok: false, code: "WHOLE_HOME_HEAT_CLAIM_BLOCKED" });
    expect(validateBbbCaption(payload.caption).ok).toBe(true);
  });

  it("rejects stale and distant schedules", () => {
    const now = new Date("2026-08-03T01:00:00.000Z");
    expect(validateSchedule("2026-08-02T23:00:00.000Z", now)).toEqual({ ok: false, code: "SCHEDULE_EXPIRED" });
    expect(validateSchedule("2026-10-03T01:00:00.000Z", now)).toEqual({ ok: false, code: "SCHEDULE_TOO_FAR" });
    expect(validateSchedule("2026-08-03T01:01:00.000Z", now).ok).toBe(true);
  });

  it("defaults the worker to disabled and killed", () => {
    expect(readPublishingWorkerConfig({})).toMatchObject({ enabled: false, killSwitch: true });
    expect(readPublishingWorkerConfig({ DAB_PUBLISHING_WORKER_ENABLED: "true", DAB_PUBLISHING_KILL_SWITCH: "false" })).toMatchObject({ enabled: true, killSwitch: false });
  });
});
