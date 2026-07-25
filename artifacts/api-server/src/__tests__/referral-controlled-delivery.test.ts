import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { referralDeliveryRequestSchema } from "../lib/referral-growth.js";
import {
  dispatchReferralDelivery,
  evaluateReferralDeliveryGate,
  normalizeReferralDeliveryAllowlistValue,
  resolveReferralDeliveryConfig,
  type ReferralDeliveryProviders,
} from "../lib/referral-delivery.js";

const routeSource = readFileSync(
  new URL("../routes/referrals.ts", import.meta.url),
  "utf8",
);
const compactRoute = routeSource.replace(/\s+/g, " ");
const deliveryRoutes = compactRoute.slice(
  compactRoute.indexOf("// ── RGE-3:"),
  compactRoute.indexOf("// ── GET /api/referrals/stats"),
);

function liveConfig() {
  return {
    enabled: true,
    mode: "live" as const,
    emergencyStop: false,
    allowlist: new Set(["2515550101", "safe@example.com"]),
    hourlyLimit: 5,
  };
}

describe("RGE-3 fail-closed configuration", () => {
  it("defaults to disabled dry-run mode with the emergency stop engaged", () => {
    const config = resolveReferralDeliveryConfig({});
    expect(config).toMatchObject({
      enabled: false,
      mode: "dry_run",
      emergencyStop: true,
      hourlyLimit: 5,
    });
    expect(config.allowlist.size).toBe(0);
  });

  it("requires every independent live-delivery gate", () => {
    const base = liveConfig();
    expect(
      evaluateReferralDeliveryGate(
        { ...base, enabled: false },
        "live",
        "2515550101",
      ),
    ).toEqual({ allowed: false, reason: "delivery_disabled" });
    expect(
      evaluateReferralDeliveryGate(
        { ...base, emergencyStop: true },
        "live",
        "2515550101",
      ),
    ).toEqual({ allowed: false, reason: "emergency_stop" });
    expect(
      evaluateReferralDeliveryGate(
        { ...base, mode: "dry_run" },
        "live",
        "2515550101",
      ),
    ).toEqual({ allowed: false, reason: "live_mode_not_enabled" });
    expect(
      evaluateReferralDeliveryGate(base, "live", "2515559999"),
    ).toEqual({ allowed: false, reason: "destination_not_allowlisted" });
  });

  it("normalizes exact allowlist destinations and caps rate limits", () => {
    expect(normalizeReferralDeliveryAllowlistValue("+1 (251) 555-0101")).toBe(
      "2515550101",
    );
    expect(normalizeReferralDeliveryAllowlistValue(" SAFE@Example.com ")).toBe(
      "safe@example.com",
    );
    const config = resolveReferralDeliveryConfig({
      REFERRAL_DELIVERY_ENABLED: "true",
      REFERRAL_DELIVERY_MODE: "live",
      REFERRAL_DELIVERY_EMERGENCY_STOP: "false",
      REFERRAL_DELIVERY_ALLOWLIST:
        "+1 (251) 555-0101, SAFE@Example.com",
      REFERRAL_DELIVERY_HOURLY_LIMIT: "999",
    });
    expect(config.hourlyLimit).toBe(100);
    expect(
      evaluateReferralDeliveryGate(config, "live", "(251) 555-0101"),
    ).toEqual({ allowed: true, mode: "live" });
  });

  it("permits dry runs without enabling any live-delivery setting", () => {
    expect(
      evaluateReferralDeliveryGate(
        resolveReferralDeliveryConfig({}),
        "dry_run",
        "not-allowlisted@example.com",
      ),
    ).toEqual({ allowed: true, mode: "dry_run" });
  });
});

describe("RGE-3 provider isolation", () => {
  const message = {
    channel: "sms" as const,
    destination: "2515550101",
    subject: null,
    body: "Referral invitation",
  };

  it("never invokes a provider in dry-run mode", async () => {
    const providers: ReferralDeliveryProviders = {
      sms: vi.fn(),
      email: vi.fn(),
    };
    await expect(
      dispatchReferralDelivery(providers, message, "dry_run"),
    ).resolves.toEqual({ ok: true, providerMessageId: null });
    expect(providers.sms).not.toHaveBeenCalled();
    expect(providers.email).not.toHaveBeenCalled();
  });

  it("routes live messages to the selected adapter and preserves failures", async () => {
    const providers: ReferralDeliveryProviders = {
      sms: vi
        .fn()
        .mockResolvedValue({ ok: false, errorCode: "provider_failed" }),
      email: vi
        .fn()
        .mockResolvedValue({ ok: true, providerMessageId: "email-1" }),
    };
    await expect(
      dispatchReferralDelivery(providers, message, "live"),
    ).resolves.toEqual({ ok: false, errorCode: "provider_failed" });
    await expect(
      dispatchReferralDelivery(
        providers,
        {
          ...message,
          channel: "email",
          destination: "safe@example.com",
          subject: "Referral",
        },
        "live",
      ),
    ).resolves.toEqual({ ok: true, providerMessageId: "email-1" });
  });
});

describe("RGE-3 explicit authorization and route controls", () => {
  it("requires literal human confirmation and a constrained idempotency key", () => {
    expect(
      referralDeliveryRequestSchema.safeParse({
        requestedMode: "dry_run",
        confirmDispatch: true,
        idempotencyKey: "delivery:valid-0001",
      }).success,
    ).toBe(true);
    expect(
      referralDeliveryRequestSchema.safeParse({
        requestedMode: "live",
        confirmDispatch: false,
        idempotencyKey: "delivery:valid-0001",
      }).success,
    ).toBe(false);
  });

  it("tenant-scopes reads, idempotency, invitations, receipts, and updates", () => {
    expect(deliveryRoutes).toContain("WHERE client_id = $1");
    expect(deliveryRoutes).toContain(
      "WHERE client_id = $1 AND idempotency_key = $2",
    );
    expect(deliveryRoutes).toContain(
      "WHERE ri.id = $1 AND ri.client_id = $2",
    );
    expect(deliveryRoutes).toContain(
      "WHERE id = $1 AND client_id = $2 AND status = 'dispatching'",
    );
    expect(deliveryRoutes).not.toContain("req.body.clientId");
  });

  it("enforces approval, consent, opt-out, rate, duplicate, and kill-switch gates", () => {
    expect(deliveryRoutes).toContain('invitation.status !== "approved"');
    expect(deliveryRoutes).toContain("!invitation.approvedByUserId");
    expect(deliveryRoutes).toContain(
      'invitation.contactStatus !== "opted_in"',
    );
    expect(deliveryRoutes).toContain("evaluateReferralDeliveryGate");
    expect(deliveryRoutes).toContain("config.hourlyLimit");
    expect(deliveryRoutes).toContain("delivery_already_attempted");
    expect(deliveryRoutes).toContain("duplicate_delivery_attempt");
    expect(deliveryRoutes).toContain("failure_code");
  });

  it("uses transaction locks and contains no scheduler", () => {
    expect(deliveryRoutes).toContain(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
    );
    expect(deliveryRoutes).not.toContain("setInterval");
    expect(deliveryRoutes).not.toContain("cron");
    expect(deliveryRoutes).not.toContain("scheduler.start");
  });
});
