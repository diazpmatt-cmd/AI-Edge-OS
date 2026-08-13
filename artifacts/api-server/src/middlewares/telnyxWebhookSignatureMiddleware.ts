import { createPublicKey, verify as verifySignature } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

function buildPublicKey(publicKey: string) {
  const trimmed = publicKey.trim();
  if (trimmed.startsWith("-----BEGIN PUBLIC KEY-----")) {
    return createPublicKey(trimmed);
  }

  const raw = Buffer.from(trimmed, "base64");
  if (raw.length !== 32) {
    throw new Error("TELNYX_PUBLIC_KEY must be a PEM key or a 32-byte base64 Ed25519 public key");
  }

  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

export function verifyTelnyxWebhookRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const publicKey = process.env.TELNYX_PUBLIC_KEY?.trim();

  // Preserve current production behavior until the verified Telnyx public key
  // is intentionally configured. Once configured, verification is fail-closed.
  if (!publicKey) {
    console.warn("[TELNYX] Webhook signature verification unavailable — TELNYX_PUBLIC_KEY not configured");
    next();
    return;
  }

  const signature = req.get("telnyx-signature-ed25519")?.trim();
  const timestamp = req.get("telnyx-timestamp")?.trim();
  if (!signature || !timestamp) {
    console.warn("[TELNYX] Rejected webhook with missing signature headers");
    res.status(403).json({ error: "invalid_webhook_signature" });
    return;
  }

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !Number.isFinite(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > MAX_TIMESTAMP_SKEW_SECONDS
  ) {
    console.warn("[TELNYX] Rejected webhook outside timestamp tolerance");
    res.status(403).json({ error: "invalid_webhook_timestamp" });
    return;
  }

  try {
    const payload = JSON.stringify(req.body ?? {});
    const signedPayload = Buffer.from(`${timestamp}|${payload}`, "utf8");
    const signatureBytes = Buffer.from(signature, "base64");
    const key = buildPublicKey(publicKey);

    const valid = verifySignature(null, signedPayload, key, signatureBytes);
    if (!valid) {
      console.warn("[TELNYX] Rejected webhook with invalid signature");
      res.status(403).json({ error: "invalid_webhook_signature" });
      return;
    }

    next();
  } catch (error) {
    console.error("[TELNYX] Webhook signature verification error:", error);
    res.status(403).json({ error: "invalid_webhook_signature" });
  }
}
