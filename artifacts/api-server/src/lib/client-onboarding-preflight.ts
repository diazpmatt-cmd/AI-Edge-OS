export const ONBOARDING_MODULE_IDS = [
  "workspace",
  "receptionist",
  "leads",
  "media",
  "reviews",
  "local",
  "publishing",
  "revenue",
  "apollos",
] as const;

export type OnboardingModuleId = (typeof ONBOARDING_MODULE_IDS)[number];

export interface ClientOnboardingPreflightInput {
  businessName?: unknown;
  industry?: unknown;
  website?: unknown;
  mainPhone?: unknown;
  forwardingPhone?: unknown;
  email?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
  serviceRadius?: unknown;
  businessHours?: unknown;
  services?: unknown;
  modulesEnabled?: unknown;
}

export interface OnboardingValidationIssue {
  field: string;
  code: string;
  message: string;
}

export interface OnboardingModulePlan {
  moduleId: OnboardingModuleId;
  provisioningClass: "internal" | "external_connection" | "provider_required";
  canPrepareWithoutExternalSideEffects: boolean;
  requirements: string[];
  blockers: string[];
}

export interface ClientOnboardingPreflight {
  valid: boolean;
  normalized: {
    businessName: string;
    industry: string;
    website: string | null;
    mainPhone: string | null;
    forwardingPhone: string | null;
    email: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    serviceRadius: string | null;
    businessHours: string | null;
    services: string[];
    modulesEnabled: OnboardingModuleId[];
  };
  errors: OnboardingValidationIssue[];
  warnings: OnboardingValidationIssue[];
  modulePlan: OnboardingModulePlan[];
  safety: {
    canonicalClientCreated: false;
    providerProvisioningExecuted: false;
    phoneNumberOrdered: false;
    customerMessagingExecuted: false;
    publishingExecuted: false;
    billingExecuted: false;
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

function normalizeWebsite(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeServices(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of rawValues) {
    const service = text(item);
    if (!service) continue;
    const key = service.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(service);
  }
  return result;
}

function normalizeModules(value: unknown): { modules: OnboardingModuleId[]; unknown: string[] } {
  const rawValues = Array.isArray(value) ? value : [];
  const allowed = new Set<string>(ONBOARDING_MODULE_IDS);
  const modules: OnboardingModuleId[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const item of rawValues) {
    const id = text(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (allowed.has(id)) modules.push(id as OnboardingModuleId);
    else unknown.push(id);
  }
  return { modules, unknown };
}

function modulePlan(
  moduleId: OnboardingModuleId,
  context: {
    mainPhone: string | null;
    forwardingPhone: string | null;
    city: string | null;
    state: string | null;
    website: string | null;
  },
): OnboardingModulePlan {
  switch (moduleId) {
    case "workspace":
      return {
        moduleId,
        provisioningClass: "internal",
        canPrepareWithoutExternalSideEffects: true,
        requirements: ["canonical_client_identity", "tenant_service_registry"],
        blockers: [],
      };
    case "receptionist": {
      const blockers = [
        !context.mainPhone ? "main_phone_required" : null,
        !context.forwardingPhone ? "human_transfer_destination_required" : null,
      ].filter((item): item is string => Boolean(item));
      return {
        moduleId,
        provisioningClass: "external_connection",
        canPrepareWithoutExternalSideEffects: blockers.length === 0,
        requirements: [
          "telnyx_voice_sms_endpoint",
          "verified_webhook_configuration",
          "non_looping_human_transfer_destination",
        ],
        blockers,
      };
    }
    case "leads":
      return {
        moduleId,
        provisioningClass: "external_connection",
        canPrepareWithoutExternalSideEffects: Boolean(context.mainPhone),
        requirements: ["main_phone", "telnyx_or_supported_messaging_endpoint", "lead_recovery_policy"],
        blockers: context.mainPhone ? [] : ["main_phone_required"],
      };
    case "media":
      return {
        moduleId,
        provisioningClass: "provider_required",
        canPrepareWithoutExternalSideEffects: true,
        requirements: ["media_generation_provider_readiness", "durable_object_storage", "asset_library"],
        blockers: ["media_generation_provider_activation_required"],
      };
    case "reviews":
      return {
        moduleId,
        provisioningClass: "external_connection",
        canPrepareWithoutExternalSideEffects: true,
        requirements: ["review_platform_connection", "owner_confirmed_review_url", "completed_paid_job_evidence"],
        blockers: ["review_platform_connection_required"],
      };
    case "local": {
      const blockers = [
        !context.city ? "city_required" : null,
        !context.state ? "state_required" : null,
      ].filter((item): item is string => Boolean(item));
      return {
        moduleId,
        provisioningClass: "external_connection",
        canPrepareWithoutExternalSideEffects: blockers.length === 0,
        requirements: ["service_geography", "google_business_or_local_presence_connection"],
        blockers,
      };
    }
    case "publishing":
      return {
        moduleId,
        provisioningClass: "external_connection",
        canPrepareWithoutExternalSideEffects: true,
        requirements: ["at_least_one_authorized_publishing_connection", "human_or_policy_approval_mode"],
        blockers: ["publishing_connection_required"],
      };
    case "revenue":
      return {
        moduleId,
        provisioningClass: "internal",
        canPrepareWithoutExternalSideEffects: true,
        requirements: ["lead_or_job_source_data", "tenant_attribution_rules"],
        blockers: [],
      };
    case "apollos":
      return {
        moduleId,
        provisioningClass: "internal",
        canPrepareWithoutExternalSideEffects: true,
        requirements: ["canonical_client_context", "tenant_scoped_growth_evidence"],
        blockers: [],
      };
  }
}

export function buildClientOnboardingPreflight(
  input: ClientOnboardingPreflightInput,
): ClientOnboardingPreflight {
  const businessName = text(input.businessName);
  const industry = text(input.industry);
  const rawWebsite = text(input.website);
  const website = normalizeWebsite(input.website);
  const rawMainPhone = text(input.mainPhone);
  const mainPhone = normalizePhone(input.mainPhone);
  const rawForwardingPhone = text(input.forwardingPhone);
  const forwardingPhone = normalizePhone(input.forwardingPhone);
  const email = text(input.email) || null;
  const city = text(input.city) || null;
  const state = text(input.state) || null;
  const zip = text(input.zip) || null;
  const serviceRadius = text(input.serviceRadius) || null;
  const businessHours = text(input.businessHours) || null;
  const services = normalizeServices(input.services);
  const { modules, unknown } = normalizeModules(input.modulesEnabled);

  const errors: OnboardingValidationIssue[] = [];
  const warnings: OnboardingValidationIssue[] = [];

  if (businessName.length < 2) {
    errors.push({ field: "businessName", code: "required", message: "Business name is required." });
  }
  if (industry.length < 2) {
    errors.push({ field: "industry", code: "required", message: "Industry is required." });
  }
  if (!rawMainPhone) {
    errors.push({ field: "mainPhone", code: "required", message: "Main business phone is required." });
  } else if (!mainPhone) {
    errors.push({ field: "mainPhone", code: "invalid_phone", message: "Main phone must be a valid international/US phone number." });
  }
  if (rawForwardingPhone && !forwardingPhone) {
    errors.push({ field: "forwardingPhone", code: "invalid_phone", message: "Forwarding phone must be a valid international/US phone number." });
  }
  if (rawWebsite && !website) {
    errors.push({ field: "website", code: "invalid_url", message: "Website must be a valid public URL/hostname." });
  }
  if (services.length === 0) {
    errors.push({ field: "services", code: "required", message: "At least one explicit service is required." });
  }
  if (modules.length === 0) {
    warnings.push({ field: "modulesEnabled", code: "none_selected", message: "No AI Edge modules were selected." });
  }
  if (unknown.length > 0) {
    errors.push({
      field: "modulesEnabled",
      code: "unknown_module",
      message: `Unsupported module IDs: ${unknown.join(", ")}`,
    });
  }
  if (mainPhone && forwardingPhone && mainPhone === forwardingPhone) {
    warnings.push({
      field: "forwardingPhone",
      code: "same_as_main_phone",
      message: "Forwarding/transfer phone matches the main phone; verify routing cannot loop before activation.",
    });
  }
  if (modules.includes("local") && (!city || !state)) {
    errors.push({
      field: "city/state",
      code: "local_geography_required",
      message: "Local Presence requires an explicit city and state; geography is never inferred from another tenant.",
    });
  }
  if (modules.includes("receptionist") && !forwardingPhone) {
    errors.push({
      field: "forwardingPhone",
      code: "receptionist_transfer_required",
      message: "AI Receptionist requires an explicit human transfer destination before activation.",
    });
  }

  const planContext = { mainPhone, forwardingPhone, city, state, website };

  return {
    valid: errors.length === 0,
    normalized: {
      businessName,
      industry,
      website,
      mainPhone,
      forwardingPhone,
      email,
      city,
      state,
      zip,
      serviceRadius,
      businessHours,
      services,
      modulesEnabled: modules,
    },
    errors,
    warnings,
    modulePlan: modules.map((moduleId) => modulePlan(moduleId, planContext)),
    safety: {
      canonicalClientCreated: false,
      providerProvisioningExecuted: false,
      phoneNumberOrdered: false,
      customerMessagingExecuted: false,
      publishingExecuted: false,
      billingExecuted: false,
    },
  };
}
