import { createHash } from "node:crypto";

export const DAB8A_PLATFORMS = ["facebook", "google"] as const;
export type Dab8aPlatform = typeof DAB8A_PLATFORMS[number];

export type PublishPayload = {
  postId: string;
  userId: string;
  clientName: string;
  platform: Dab8aPlatform;
  caption: string;
  imageUrl: string | null;
  ctaType: string;
  ctaValue: string | null;
  scheduledAt: string;
};

export function isDab8aPlatform(value: unknown): value is Dab8aPlatform {
  return typeof value === "string" && DAB8A_PLATFORMS.includes(value as Dab8aPlatform);
}

export function stablePublishPayloadHash(payload: PublishPayload): string {
  const ordered = {
    postId: payload.postId,
    userId: payload.userId,
    clientName: payload.clientName,
    platform: payload.platform,
    caption: payload.caption,
    imageUrl: payload.imageUrl,
    ctaType: payload.ctaType,
    ctaValue: payload.ctaValue,
    scheduledAt: payload.scheduledAt,
  };
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

export function validateBbbCaption(caption: unknown): { ok: true; value: string } | { ok: false; code: string } {
  if (typeof caption !== "string") return { ok: false, code: "CAPTION_REQUIRED" };
  const value = caption.trim();
  if (value.length < 10 || value.length > 5_000) return { ok: false, code: "CAPTION_LENGTH_INVALID" };
  const lower = value.toLowerCase();
  if (/\btermite(s)?\b/.test(lower)) return { ok: false, code: "TERMITE_CLAIM_BLOCKED" };
  if (/whole[- ]home.{0,30}heat|heat.{0,30}whole[- ]home/.test(lower)) return { ok: false, code: "WHOLE_HOME_HEAT_CLAIM_BLOCKED" };
  return { ok: true, value };
}

export function validateSchedule(value: unknown, now = new Date()): { ok: true; value: Date } | { ok: false; code: string } {
  if (typeof value !== "string") return { ok: false, code: "SCHEDULE_REQUIRED" };
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { ok: false, code: "SCHEDULE_INVALID" };
  if (date.getTime() < now.getTime() - 5 * 60_000) return { ok: false, code: "SCHEDULE_EXPIRED" };
  if (date.getTime() > now.getTime() + 30 * 24 * 60 * 60_000) return { ok: false, code: "SCHEDULE_TOO_FAR" };
  return { ok: true, value: date };
}

export function readPublishingWorkerConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    enabled: env.DAB_PUBLISHING_WORKER_ENABLED === "true",
    killSwitch: env.DAB_PUBLISHING_KILL_SWITCH !== "false",
    runtimeId: env.DAB_PUBLISHING_RUNTIME_ID ?? "dab-publishing-worker-1",
    intervalMs: Math.max(5_000, Number(env.DAB_PUBLISHING_INTERVAL_MS ?? 15_000)),
    leaseMs: Math.max(30_000, Number(env.DAB_PUBLISHING_LEASE_MS ?? 120_000)),
  };
}
