import nodemailer from "nodemailer";

export type ReferralDeliveryChannel = "sms" | "email";
export type ReferralDeliveryMode = "dry_run" | "live";

export interface ReferralDeliveryConfig {
  enabled: boolean;
  mode: ReferralDeliveryMode;
  emergencyStop: boolean;
  allowlist: Set<string>;
  hourlyLimit: number;
}

export interface ReferralDeliveryMessage {
  channel: ReferralDeliveryChannel;
  destination: string;
  subject: string | null;
  body: string;
}

export type ReferralProviderResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; errorCode: string };

export interface ReferralDeliveryProviders {
  sms(message: ReferralDeliveryMessage): Promise<ReferralProviderResult>;
  email(message: ReferralDeliveryMessage): Promise<ReferralProviderResult>;
}

export type ReferralDeliveryGate =
  | { allowed: true; mode: ReferralDeliveryMode }
  | {
      allowed: false;
      reason:
        | "delivery_disabled"
        | "emergency_stop"
        | "live_mode_not_enabled"
        | "destination_not_allowlisted";
    };

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function normalizeReferralDeliveryAllowlistValue(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;
}

export function resolveReferralDeliveryConfig(
  env: NodeJS.ProcessEnv = process.env,
): ReferralDeliveryConfig {
  const allowlist = new Set(
    (env.REFERRAL_DELIVERY_ALLOWLIST ?? "")
      .split(",")
      .map(normalizeReferralDeliveryAllowlistValue)
      .filter(Boolean),
  );
  return {
    enabled: env.REFERRAL_DELIVERY_ENABLED === "true",
    mode: env.REFERRAL_DELIVERY_MODE === "live" ? "live" : "dry_run",
    // Fail closed: live provider calls require an explicit false value.
    emergencyStop: env.REFERRAL_DELIVERY_EMERGENCY_STOP !== "false",
    allowlist,
    hourlyLimit: parsePositiveInteger(
      env.REFERRAL_DELIVERY_HOURLY_LIMIT,
      5,
      100,
    ),
  };
}

export function evaluateReferralDeliveryGate(
  config: ReferralDeliveryConfig,
  requestedMode: ReferralDeliveryMode,
  destination: string,
): ReferralDeliveryGate {
  if (requestedMode === "dry_run") {
    return { allowed: true, mode: "dry_run" };
  }
  if (!config.enabled) {
    return { allowed: false, reason: "delivery_disabled" };
  }
  if (config.emergencyStop) {
    return { allowed: false, reason: "emergency_stop" };
  }
  if (config.mode !== "live") {
    return { allowed: false, reason: "live_mode_not_enabled" };
  }
  if (
    !config.allowlist.has(
      normalizeReferralDeliveryAllowlistValue(destination),
    )
  ) {
    return { allowed: false, reason: "destination_not_allowlisted" };
  }
  return { allowed: true, mode: "live" };
}

export async function dispatchReferralDelivery(
  providers: ReferralDeliveryProviders,
  message: ReferralDeliveryMessage,
  mode: ReferralDeliveryMode,
): Promise<ReferralProviderResult> {
  if (mode === "dry_run") {
    return { ok: true, providerMessageId: null };
  }
  return message.channel === "sms"
    ? providers.sms(message)
    : providers.email(message);
}

export function createReferralDeliveryProviders(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): ReferralDeliveryProviders {
  return {
    async sms(message) {
      const apiKey = env.TELNYX_API_KEY;
      const from = env.TELNYX_FROM_NUMBER;
      if (!apiKey || !from) {
        return { ok: false, errorCode: "telnyx_not_configured" };
      }
      try {
        const response = await fetchImpl("https://api.telnyx.com/v2/messages", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: `+1${message.destination}`,
            text: message.body,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          return {
            ok: false,
            errorCode: `telnyx_http_${response.status}`,
          };
        }
        const payload = (await response.json().catch(() => ({}))) as {
          data?: { id?: string };
        };
        return {
          ok: true,
          providerMessageId: payload.data?.id ?? null,
        };
      } catch (error) {
        return {
          ok: false,
          errorCode:
            error instanceof Error && error.name === "TimeoutError"
              ? "telnyx_timeout"
              : "telnyx_request_failed",
        };
      }
    },

    async email(message) {
      const host = env.SMTP_HOST;
      const port = Number(env.SMTP_PORT ?? "587");
      const user = env.SMTP_USER;
      const pass = env.SMTP_PASS;
      const from = env.SMTP_FROM ?? user;
      if (!host || !user || !pass || !from || !message.subject) {
        return { ok: false, errorCode: "smtp_not_configured" };
      }
      try {
        const transporter = nodemailer.createTransport({
          host,
          port: Number.isFinite(port) ? port : 587,
          secure: port === 465,
          auth: { user, pass },
          connectionTimeout: 15_000,
          socketTimeout: 15_000,
        });
        const result = await transporter.sendMail({
          from,
          to: message.destination,
          subject: message.subject,
          text: message.body,
        });
        return {
          ok: true,
          providerMessageId: result.messageId ?? null,
        };
      } catch {
        return { ok: false, errorCode: "smtp_request_failed" };
      }
    },
  };
}
