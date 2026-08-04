import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isTelnyxVerificationRequired, verifyTelnyxWebhook } from "../services/telnyx-webhook-security";

describe("Telnyx webhook verification", () => {
  const payload = JSON.stringify({ data: { event_type: "message.delivered" } });
  const timestamp = "1785812400";
  const now = new Date(Number(timestamp) * 1000);
  const keys = generateKeyPairSync("ed25519");
  const publicDer = keys.publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const rawPublicKey = publicDer.subarray(publicDer.length - 32).toString("base64");
  const signature = sign(null, Buffer.from(`${timestamp}|${payload}`), keys.privateKey).toString("base64");

  it("accepts a valid Ed25519 signature", () => {
    expect(verifyTelnyxWebhook({ payload, timestamp, signature, publicKey: rawPublicKey, now })).toBe(true);
  });

  it("rejects a changed payload", () => {
    expect(verifyTelnyxWebhook({ payload: `${payload} `, timestamp, signature, publicKey: rawPublicKey, now })).toBe(false);
  });

  it("rejects timestamps outside the replay window", () => {
    const late = new Date(now.getTime() + 6 * 60 * 1000);
    expect(verifyTelnyxWebhook({ payload, timestamp, signature, publicKey: rawPublicKey, now: late })).toBe(false);
  });

  it("requires verification in production", () => {
    expect(isTelnyxVerificationRequired({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isTelnyxVerificationRequired({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(false);
    expect(isTelnyxVerificationRequired({ NODE_ENV: "test", TELNYX_WEBHOOK_VERIFY: "true" } as NodeJS.ProcessEnv)).toBe(true);
  });
});
