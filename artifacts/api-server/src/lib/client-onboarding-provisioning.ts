import { pool } from "@workspace/db";
import { buildStagingRowPreflight, type ClientOnboardingStagingRow } from "./client-onboarding-staging-preflight.js";
import { clientBootstrapReady } from "./client-resolver.js";
import { registryBootstrapReady } from "./service-registry-loader.js";

export type ProvisioningErrorCode =
  | "CLIENT_PROVISIONING_UNAVAILABLE"
  | "ONBOARDING_NOT_FOUND"
  | "TRUSTED_TARGET_IDENTITY_REQUIRED"
  | "ONBOARDING_PREFLIGHT_FAILED"
  | "CANONICAL_GEOGRAPHY_REQUIRED"
  | "SERVICE_KEY_COLLISION"
  | "TARGET_TENANT_CONFLICT"
  | "CLIENT_SLUG_CONFLICT"
  | "ONBOARDING_ALREADY_PROVISIONED";

export class CanonicalProvisioningError extends Error {
  constructor(
    public readonly code: ProvisioningErrorCode,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "CanonicalProvisioningError";
  }
}

export interface CanonicalProvisioningStagingRow extends ClientOnboardingStagingRow {
  id: string;
  createdByUserId?: string | null;
  status?: string | null;
  provisionedClientId?: string | null;
  provisionedAt?: Date | string | null;
}

export interface CanonicalProvisioningPlan {
  targetUserId: string;
  client: {
    slug: string;
    clientName: string;
    industry: string;
    industryLabel: string;
    region: string;
    serviceAreas: string[];
    timezone: string;
  };
  services: Array<{
    serviceKey: string;
    displayName: string;
    sortOrder: number;
  }>;
  registryRules: string;
  autoContent: {
    topics: string[];
    frequency: string;
    postingTimes: string[];
    platforms: string[];
    approvalMode: "approval_required";
    ctaText: string;
    ctaPreference: "call_now";
    toneStyle: string[];
    postAngles: string[];
    enginePaused: "true";
    autopilotEnabled: "false";
    autoMediaEnabled: "false";
  };
  receptionist: null | {
    businessName: string;
    transferPhone: string;
    greetingScript: string;
    callbackMessage: string;
    voicemailMessage: string;
    textRoutingMessage: string;
  };
  localPresence: null | {
    businessName: string;
    phone: string;
    website: string | null;
    city: string;
    state: string;
    zip: string | null;
    serviceAreas: string[];
  };
  preflight: ReturnType<typeof buildStagingRowPreflight>;
}

const TRUSTED_TARGET_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function keyify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function industryLabel(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

export function assertTrustedTargetUserId(value: unknown): string {
  const targetUserId = typeof value === "string" ? value.trim() : "";
  if (!TRUSTED_TARGET_PATTERN.test(targetUserId)) {
    throw new CanonicalProvisioningError(
      "TRUSTED_TARGET_IDENTITY_REQUIRED",
      400,
      "An explicit trusted Clerk target user ID is required.",
    );
  }
  return targetUserId;
}

export function buildCanonicalProvisioningPlan(
  row: CanonicalProvisioningStagingRow,
  targetIdentity: unknown,
): CanonicalProvisioningPlan {
  const targetUserId = assertTrustedTargetUserId(targetIdentity);
  const preflight = buildStagingRowPreflight(row);

  if (!preflight.valid) {
    throw new CanonicalProvisioningError(
      "ONBOARDING_PREFLIGHT_FAILED",
      422,
      "The onboarding draft must pass preflight before canonical provisioning.",
      preflight.errors,
    );
  }

  const normalized = preflight.normalized;
  if (!normalized.city || !normalized.state) {
    throw new CanonicalProvisioningError(
      "CANONICAL_GEOGRAPHY_REQUIRED",
      422,
      "Canonical provisioning requires an explicit city and state; geography is never inherited from another tenant.",
    );
  }

  const slug = slugify(normalized.businessName);
  if (!slug) {
    throw new CanonicalProvisioningError(
      "ONBOARDING_PREFLIGHT_FAILED",
      422,
      "Business name cannot be converted to a canonical client slug.",
    );
  }

  const industry = keyify(normalized.industry) || "local_service";
  const area = `${normalized.city}, ${normalized.state}`;
  const serviceKeys = new Set<string>();
  const services = normalized.services.map((displayName, index) => {
    const serviceKey = keyify(displayName);
    if (!serviceKey || serviceKeys.has(serviceKey)) {
      throw new CanonicalProvisioningError(
        "SERVICE_KEY_COLLISION",
        422,
        `Service names must normalize to unique stable keys; conflict at ${displayName}.`,
      );
    }
    serviceKeys.add(serviceKey);
    return { serviceKey, displayName, sortOrder: index };
  });

  const website = normalized.website;
  const mainPhone = normalized.mainPhone!;
  const modules = new Set(normalized.modulesEnabled);
  const textDestination = website ?? mainPhone;

  return {
    targetUserId,
    client: {
      slug,
      clientName: normalized.businessName,
      industry,
      industryLabel: industryLabel(normalized.industry) || "local service",
      region: area,
      serviceAreas: [area],
      timezone: "America/Chicago",
    },
    services,
    registryRules: [
      "BUSINESS RULES (MUST FOLLOW):",
      `- Only discuss services explicitly configured for ${normalized.businessName}.`,
      "- Do NOT invent pricing, guarantees, licenses, availability, procedures, or regulatory claims.",
      "- Do NOT claim a service is offered unless it appears in this tenant's service registry.",
    ].join("\n"),
    autoContent: {
      topics: normalized.services,
      frequency: "every_other_day",
      postingTimes: ["08:00", "12:00", "17:00"],
      platforms: ["facebook"],
      approvalMode: "approval_required",
      ctaText: `Call Now — ${mainPhone}`,
      ctaPreference: "call_now",
      toneStyle: ["professional", "friendly"],
      postAngles: ["educational", "warning", "promotional", "seasonal", "faq", "testimonial", "prevention", "emergency"],
      enginePaused: "true",
      autopilotEnabled: "false",
      autoMediaEnabled: "false",
    },
    receptionist: modules.has("receptionist")
      ? {
          businessName: normalized.businessName,
          transferPhone: normalized.forwardingPhone!,
          greetingScript: `Hi, thank you for calling ${normalized.businessName}. To speak directly with us, press 1. To request a callback, press 2. To leave a voicemail, press 3. To receive our contact information by text, press 4.`,
          callbackMessage: `Thank you. ${normalized.businessName} received your callback request and will follow up as soon as possible.`,
          voicemailMessage: `Please leave your name, phone number, and a brief description of how ${normalized.businessName} can help after the beep.`,
          textRoutingMessage: `Hi! This is ${normalized.businessName}. You requested our contact information. ${textDestination}`,
        }
      : null,
    localPresence: modules.has("local")
      ? {
          businessName: normalized.businessName,
          phone: mainPhone,
          website,
          city: normalized.city,
          state: normalized.state,
          zip: normalized.zip,
          serviceAreas: [area],
        }
      : null,
    preflight,
  };
}

function mapStagingRow(raw: any): CanonicalProvisioningStagingRow {
  return {
    id: raw.id,
    createdByUserId: raw.created_by_user_id,
    status: raw.status,
    provisionedClientId: raw.provisioned_client_id,
    provisionedAt: raw.provisioned_at,
    businessName: raw.business_name,
    industry: raw.industry,
    website: raw.website,
    mainPhone: raw.main_phone,
    forwardingPhone: raw.forwarding_phone,
    email: raw.email,
    city: raw.city,
    state: raw.state,
    zip: raw.zip,
    serviceRadius: raw.service_radius,
    businessHours: raw.business_hours,
    services: raw.services,
    modulesEnabled: raw.modules_enabled,
  };
}

export async function provisionCanonicalClient(input: {
  stagingId: string;
  actorUserId: string;
  targetUserId: unknown;
}) {
  const targetUserId = assertTrustedTargetUserId(input.targetUserId);
  if (!(await clientBootstrapReady)) {
    throw new CanonicalProvisioningError(
      "CLIENT_PROVISIONING_UNAVAILABLE",
      503,
      "Canonical client storage is not ready.",
    );
  }
  await registryBootstrapReady;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stagingResult = await client.query(
      `SELECT * FROM client_onboarding
       WHERE id = $1 AND created_by_user_id = $2
       FOR UPDATE`,
      [input.stagingId, input.actorUserId],
    );
    const rawStaging = stagingResult.rows[0];
    if (!rawStaging) {
      throw new CanonicalProvisioningError("ONBOARDING_NOT_FOUND", 404, "Onboarding draft not found.");
    }

    const stagingRow = mapStagingRow(rawStaging);
    const plan = buildCanonicalProvisioningPlan(stagingRow, targetUserId);

    let canonicalClientId: string | null = null;
    let idempotent = false;

    if (stagingRow.provisionedClientId) {
      const linked = await client.query(
        "SELECT id, user_id, slug, client_name FROM clients WHERE id = $1 FOR UPDATE",
        [stagingRow.provisionedClientId],
      );
      const existing = linked.rows[0];
      if (!existing || existing.user_id !== targetUserId || existing.slug !== plan.client.slug) {
        throw new CanonicalProvisioningError(
          "ONBOARDING_ALREADY_PROVISIONED",
          409,
          "This onboarding draft is already linked to a different canonical tenant identity.",
        );
      }
      canonicalClientId = existing.id;
      idempotent = true;
    } else {
      const conflicts = await client.query(
        "SELECT id, user_id, slug, client_name FROM clients WHERE user_id = $1 OR slug = $2 FOR UPDATE",
        [targetUserId, plan.client.slug],
      );
      for (const existing of conflicts.rows) {
        if (existing.user_id !== targetUserId) {
          throw new CanonicalProvisioningError(
            "CLIENT_SLUG_CONFLICT",
            409,
            "The canonical client slug is already owned by another tenant.",
          );
        }
        if (existing.slug !== plan.client.slug || existing.client_name !== plan.client.clientName) {
          throw new CanonicalProvisioningError(
            "TARGET_TENANT_CONFLICT",
            409,
            "The trusted target tenant is already linked to a different canonical client.",
          );
        }
        canonicalClientId = existing.id;
        idempotent = true;
      }

      if (!canonicalClientId) {
        const inserted = await client.query(
          `INSERT INTO clients (
             user_id, slug, client_name, industry, industry_label,
             region, service_areas, timezone, is_active
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
           RETURNING id`,
          [
            targetUserId,
            plan.client.slug,
            plan.client.clientName,
            plan.client.industry,
            plan.client.industryLabel,
            plan.client.region,
            JSON.stringify(plan.client.serviceAreas),
            plan.client.timezone,
          ],
        );
        canonicalClientId = inserted.rows[0]?.id ?? null;
      }
    }

    if (!canonicalClientId) {
      throw new CanonicalProvisioningError(
        "CLIENT_PROVISIONING_UNAVAILABLE",
        503,
        "Canonical client identity could not be created.",
      );
    }

    const prohibitedClaims = JSON.stringify([
      "unverified pricing",
      "guaranteed outcomes",
      "unverified licensing or regulatory claims",
    ]);
    const allowedAngles = JSON.stringify(plan.autoContent.postAngles);
    for (const service of plan.services) {
      await client.query(
        `INSERT INTO client_services (
           client_id, service_key, display_name, category, description, status,
           allow_ai_generation, allow_booking, allow_cta, allow_publishing, allow_recommendation,
           supported_audiences, campaign_goals, allowed_content_angles, prohibited_claims,
           differentiators, priority, revenue_weight, content_frequency_weight,
           urgency, notes, sort_order, is_active
         ) VALUES ($1,$2,$3,'specialty','', 'active', TRUE,TRUE,TRUE,TRUE,TRUE,
                   '[]','["awareness","lead_generation"]',$4,$5,'[]',5,5,5,'medium','',$6,TRUE)
         ON CONFLICT (client_id, service_key) DO NOTHING`,
        [canonicalClientId, service.serviceKey, service.displayName, allowedAngles, prohibitedClaims, service.sortOrder],
      );
    }

    await client.query(
      `INSERT INTO client_registry_rules (client_id, system_business_rules, registry_version)
       VALUES ($1,$2,1)
       ON CONFLICT (client_id) DO NOTHING`,
      [canonicalClientId, plan.registryRules],
    );

    await client.query(
      `INSERT INTO auto_content_settings (
         user_id, client_name, industry, service_areas, topics, frequency,
         posting_times, platforms, approval_mode, cta_text, cta_preference,
         tone_style, post_angles, auto_generate_enabled, engine_paused,
         autopilot_enabled, auto_media_enabled
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'false',$14,$15,$16)
       ON CONFLICT (user_id) DO NOTHING`,
      [
        targetUserId,
        plan.client.clientName,
        plan.client.industry,
        JSON.stringify(plan.client.serviceAreas),
        JSON.stringify(plan.autoContent.topics),
        plan.autoContent.frequency,
        JSON.stringify(plan.autoContent.postingTimes),
        JSON.stringify(plan.autoContent.platforms),
        plan.autoContent.approvalMode,
        plan.autoContent.ctaText,
        plan.autoContent.ctaPreference,
        JSON.stringify(plan.autoContent.toneStyle),
        JSON.stringify(plan.autoContent.postAngles),
        plan.autoContent.enginePaused,
        plan.autoContent.autopilotEnabled,
        plan.autoContent.autoMediaEnabled,
      ],
    );

    if (plan.receptionist) {
      await client.query(
        `INSERT INTO ai_receptionist_settings (
           client_id, business_name, transfer_phone, greeting_script,
           callback_message, voicemail_message, text_routing_message,
           business_hours_json, after_hours_mode
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,'voicemail')
         ON CONFLICT (client_id) DO NOTHING`,
        [
          canonicalClientId,
          plan.receptionist.businessName,
          plan.receptionist.transferPhone,
          plan.receptionist.greetingScript,
          plan.receptionist.callbackMessage,
          plan.receptionist.voicemailMessage,
          plan.receptionist.textRoutingMessage,
        ],
      );
    }

    if (plan.localPresence) {
      await client.query(
        `INSERT INTO local_presence_profiles (
           client_id, business_name, phone, website, city, state, zip, service_areas_json
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (client_id) DO NOTHING`,
        [
          plan.client.slug,
          plan.localPresence.businessName,
          plan.localPresence.phone,
          plan.localPresence.website,
          plan.localPresence.city,
          plan.localPresence.state,
          plan.localPresence.zip,
          JSON.stringify(plan.localPresence.serviceAreas),
        ],
      );
    }

    await client.query(
      `UPDATE client_onboarding
       SET status = 'provisioned', provisioned_client_id = $1, provisioned_at = COALESCE(provisioned_at, NOW()), updated_at = NOW()
       WHERE id = $2 AND created_by_user_id = $3`,
      [canonicalClientId, input.stagingId, input.actorUserId],
    );

    await client.query("COMMIT");

    return {
      provisioningStatus: "provisioned" as const,
      idempotent,
      targetIdentity: {
        source: "clerk_user_id" as const,
        userId: targetUserId,
        trustedBy: "apollos_admin_allowlist" as const,
      },
      canonicalClient: {
        id: canonicalClientId,
        userId: targetUserId,
        slug: plan.client.slug,
        clientName: plan.client.clientName,
      },
      prepared: {
        canonicalClient: true,
        serviceRegistry: true,
        safeContentSettings: true,
        receptionistSettings: Boolean(plan.receptionist),
        localPresenceProfile: Boolean(plan.localPresence),
      },
      providerReadinessPlan: plan.preflight.modulePlan,
      preflight: plan.preflight,
      safety: {
        externalProviderCalled: false,
        phoneNumberOrdered: false,
        customerMessagingExecuted: false,
        publishingExecuted: false,
        billingExecuted: false,
        autopilotEnabled: false,
        automaticMediaEnabled: false,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof CanonicalProvisioningError) throw error;
    console.error("[client-onboarding] canonical provisioning transaction failed:", error);
    throw new CanonicalProvisioningError(
      "CLIENT_PROVISIONING_UNAVAILABLE",
      503,
      "Canonical client provisioning failed closed.",
    );
  } finally {
    client.release();
  }
}
