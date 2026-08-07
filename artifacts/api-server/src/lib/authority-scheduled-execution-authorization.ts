export interface AuthorityScheduledExecutionAuthorization {
  readonly authorized: boolean;
  readonly code: "AUTHORITY_SCHEDULED_EXECUTION_AUTHORIZED" | "AUTHORITY_SCHEDULED_EXECUTION_NOT_AUTHORIZED";
  readonly message: string;
}

/**
 * Separate business/spend authorization gate for scheduled Authority execution.
 *
 * Provider configuration is NOT authorization. This parser only recognizes the
 * exact explicit value "true"; every missing, malformed, or alternate value is
 * fail-closed. This module does not execute providers or mutate data.
 */
export function readAuthorityScheduledExecutionAuthorization(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): AuthorityScheduledExecutionAuthorization {
  const authorized = env["AUTHORITY_SCHEDULED_BACKLINK_EXECUTION_ENABLED"] === "true";
  return Object.freeze({
    authorized,
    code: authorized
      ? "AUTHORITY_SCHEDULED_EXECUTION_AUTHORIZED"
      : "AUTHORITY_SCHEDULED_EXECUTION_NOT_AUTHORIZED",
    message: authorized
      ? "Scheduled Authority backlink execution has been explicitly authorized by configuration, but this release still does not execute provider calls."
      : "Scheduled Authority backlink execution has not been explicitly authorized. Provider configuration alone never enables paid execution.",
  });
}
