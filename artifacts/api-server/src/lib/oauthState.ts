import { createHmac, randomBytes, timingSafeEqual } from "crypto";

function getSecret(): string {
  const s = process.env.OAUTH_STATE_SECRET ?? process.env.CLERK_SECRET_KEY;
  if (!s) throw new Error("OAUTH_STATE_SECRET or CLERK_SECRET_KEY must be set");
  return s;
}

export function generateState(userId: string, provider: string): string {
  const nonce = randomBytes(16).toString("hex");
  const exp = Date.now() + 10 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ userId, provider, nonce, exp })).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyState(
  state: string,
  allowedProviders: string[],
): { userId: string; provider: string } | null {
  const dotIdx = state.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const payload = state.slice(0, dotIdx);
  const sig = state.slice(dotIdx + 1);
  if (!payload || !sig) return null;

  const expected = createHmac("sha256", getSecret()).update(payload).digest("hex");
  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;

  let parsed: { userId?: string; provider?: string; nonce?: string; exp?: number };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }

  if (!parsed.userId || !parsed.provider || !parsed.nonce || !parsed.exp) return null;
  if (Date.now() > parsed.exp) return null;
  if (!allowedProviders.includes(parsed.provider)) return null;

  return { userId: parsed.userId, provider: parsed.provider };
}
