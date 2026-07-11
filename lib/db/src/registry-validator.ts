/**
 * Registry Validator — Phase B2.1.
 *
 * Pure validation logic for DbServiceRecord arrays loaded from the DB.
 * Kept in lib/db so it can be imported by tests without pulling in the
 * service-registry-loader IIFE or any DB connection.
 *
 * SAFETY: these checks run BEFORE createDbServiceRegistryProvider is called.
 * If any check fails the caller must return registry_invalid (HTTP 422) and
 * must NOT construct a provider from the bad records.
 */

import type { DbServiceRecord } from "./db-service-registry-provider.js";

/**
 * All valid ServiceStatus values (mirrors ServiceStatus in bbb-services.ts).
 * Kept as a plain Set so this module has zero runtime imports.
 */
export const VALID_SERVICE_STATUSES = new Set<string>([
  "active",
  "seasonal",
  "limited",
  "coming_soon",
  "disabled",
]);

/**
 * Validate a loaded set of service records for structural soundness.
 *
 * Returns a short details string describing the first failing check, or null
 * when all records pass.
 *
 * Checks (smallest necessary to prevent an unsafe provider):
 *   1. Missing serviceId or displayName (required identity fields)
 *   2. Duplicate service_key within the same registry
 *   3. Invalid status value (not in the known ServiceStatus set)
 */
export function validateRegistryRows(services: DbServiceRecord[]): string | null {
  const seen = new Set<string>();
  for (const svc of services) {
    if (!svc.serviceId)    return "missing_service_id";
    if (!svc.displayName)  return `missing_display_name:${svc.serviceId}`;
    if (seen.has(svc.serviceId)) return `duplicate_service_key:${svc.serviceId}`;
    seen.add(svc.serviceId);
    if (!VALID_SERVICE_STATUSES.has(svc.status)) {
      return `invalid_status_value:${svc.serviceId}:${svc.status}`;
    }
  }
  return null;
}
