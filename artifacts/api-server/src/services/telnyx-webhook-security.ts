import { createPublicKey, verify } from "node:crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export type TelnyxVerificationInput = {
  payload: string;
  signature: string | undefined;
  timestamp: string | undefined;
  publicKey: string | undefined;
  now?: Date;
  toleranceSeconds?: number;
};

function parsePublicKey(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    return createPublicKey(trimmed);
  }

  const raw = /^[0-9a-f]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");

  if (raw.length !== 32) {
    throw new Error("TELNYX_PUBLIC_KEY must be a PEM key or a 32-byte Ed25519 key");
  }

  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

export function verifyTelnyxWebhook(input: TelnyxVerificationInput): boolean {
  if (!input.signature || !input.timestamp || !input.publicKey) return false;

  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) return false;

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestamp) > tolerance) return false;

  try {
    const signedPayload = Buffer.from(`${input.timestamp}|${input.payload}`, "utf8");
    const signature = Buffer.from(input.signature, "base64");
    return verify(null, signedPayload, parsePublicKey(input.publicKey), signature);
  } catch {
    return false;
  }
}

export function isTelnyxVerificationRequired(env = process.env): boolean {
  if (env.TELNYX_WEBHOOK_VERIFY === "false") return false;
  return env.NODE_ENV === "production" || env.TELNYX_WEBHOOK_VERIFY === "true";
}
