/**
 * Pure scheduler eligibility evaluator — Phase B4.
 *
 * No DB imports. Evaluates a merged settings + client record and returns
 * whether a client is eligible for an autonomous scheduler run.
 * Exported so unit tests can import without pulling in DB/HTTP deps.
 *
 * Used by:
 *   - artifacts/api-server/src/lib/scheduler.ts (runtime)
 *   - artifacts/ai-edge-solutions/src/lib/__tests__/scheduler-eligibility-b4.test.ts (tests)
 */

/** All reasons a client may be skipped during a scheduler cycle. */
export type SkipReason =
  | "client_inactive"
  | "autopilot_disabled"
  | "engine_paused"
  | "missing_next_generation_at"
  | "not_due"
  | "invalid_timezone"
  | "missing_service_areas"
  | "missing_topics";

/** Merged input drawn from clients + auto_content_settings rows. */
export interface EligibilityInput {
  settings: {
    autopilotEnabled?: string | null;
    enginePaused?: string | null;
    nextGenerationAt?: Date | null;
    serviceAreas?: string | null;
    topics?: string | null;
  };
  client: {
    isActive: boolean;
    timezone?: string | null;
  };
  now: Date;
}

export interface EligibilityResult {
  eligible: boolean;
  skipReason?: SkipReason;
}

function safeParseStringArray(raw: string | null | undefined): string[] {
  try { return JSON.parse(raw ?? "") as string[]; } catch { return []; }
}

export function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Pure eligibility check for a single client.
 * Evaluates all scheduler preconditions without touching the DB.
 *
 * A client is eligible only when ALL of:
 *   1. clients.is_active = true
 *   2. autopilot_enabled = 'true'
 *   3. engine_paused != 'true'
 *   4. clients.timezone is a valid IANA identifier
 *   5. next_generation_at is set and <= now
 *   6. service_areas parses to a non-empty array
 *   7. topics parses to a non-empty array
 *
 * Returns { eligible: false, skipReason } for each precondition violation.
 * Preconditions are evaluated in a fixed order so the first failure is surfaced.
 */
export function evaluateClientEligibility({
  settings,
  client,
  now,
}: EligibilityInput): EligibilityResult {
  if (!client.isActive) {
    return { eligible: false, skipReason: "client_inactive" };
  }
  if (settings.autopilotEnabled !== "true") {
    return { eligible: false, skipReason: "autopilot_disabled" };
  }
  if (settings.enginePaused === "true") {
    return { eligible: false, skipReason: "engine_paused" };
  }
  const tz = client.timezone ?? "";
  if (!tz || !isValidIanaTimezone(tz)) {
    return { eligible: false, skipReason: "invalid_timezone" };
  }
  if (!settings.nextGenerationAt) {
    return { eligible: false, skipReason: "missing_next_generation_at" };
  }
  if (settings.nextGenerationAt > now) {
    return { eligible: false, skipReason: "not_due" };
  }
  const serviceAreas = safeParseStringArray(settings.serviceAreas);
  if (!serviceAreas.length) {
    return { eligible: false, skipReason: "missing_service_areas" };
  }
  const topics = safeParseStringArray(settings.topics);
  if (!topics.length) {
    return { eligible: false, skipReason: "missing_topics" };
  }
  return { eligible: true };
}
