import { createHmac, timingSafeEqual, randomBytes } from "crypto";

const SCOPES = {
  // NOTE: business.manage temporarily removed — requires Google Business Profile API
  // access + verified/published OAuth consent screen. Re-add once approved.
  google: ["openid", "email", "profile"].join(" "),
};

export const GOOGLE_SCOPES = SCOPES.google;

function b64url(buf: Buffer | string) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

export function signState(payload: Record<string, unknown>) {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) throw new Error("OAUTH_STATE_SECRET not configured");
  const body = b64url(
    JSON.stringify({ ...payload, n: randomBytes(8).toString("hex"), exp: Date.now() + 10 * 60_000 }),
  );
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyState<T = Record<string, unknown>>(state: string): T {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) throw new Error("OAUTH_STATE_SECRET not configured");
  const [body, sig] = state.split(".");
  if (!body || !sig) throw new Error("Malformed state");
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = b64urlDecode(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new Error("Invalid state signature");
  }
  const payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
    throw new Error("State expired");
  }
  return payload as T;
}
