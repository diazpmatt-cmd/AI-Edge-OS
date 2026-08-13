import {
  buildClientOnboardingPreflight,
  type ClientOnboardingPreflight,
} from "./client-onboarding-preflight.js";

export interface ClientOnboardingStagingRow {
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

function parseModulesEnabled(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function buildStagingRowPreflight(
  row: ClientOnboardingStagingRow,
): ClientOnboardingPreflight {
  return buildClientOnboardingPreflight({
    businessName: row.businessName,
    industry: row.industry,
    website: row.website,
    mainPhone: row.mainPhone,
    forwardingPhone: row.forwardingPhone,
    email: row.email,
    city: row.city,
    state: row.state,
    zip: row.zip,
    serviceRadius: row.serviceRadius,
    businessHours: row.businessHours,
    services: row.services,
    modulesEnabled: parseModulesEnabled(row.modulesEnabled),
  });
}
