import { DevelopmentControlError } from "@workspace/development-control";

export interface DevelopmentControlDatabaseConfig {
  readonly connectionString: string;
  readonly applicationName: "ai-edge-development-control";
  readonly maxConnections: number;
}

/** Caller-supplied only: this module never reads environment variables. */
export function createDevelopmentControlDatabaseConfig(input: {
  readonly connectionString: string | undefined;
  readonly maxConnections?: number;
}): DevelopmentControlDatabaseConfig {
  const connectionString = input.connectionString?.trim();
  if (!connectionString) {
    throw new DevelopmentControlError(
      "DEVELOPMENT_CONTROL_DATABASE_CONFIG_REQUIRED",
      "a caller-supplied development-control database connection is required",
    );
  }
  let protocol: string;
  try {
    protocol = new URL(connectionString).protocol;
  } catch {
    throw new DevelopmentControlError(
      "INVALID_DEVELOPMENT_CONTROL_DATABASE_CONFIG",
      "the caller-supplied development-control database connection is invalid",
    );
  }
  if (protocol !== "postgres:" && protocol !== "postgresql:") {
    throw new DevelopmentControlError(
      "INVALID_DEVELOPMENT_CONTROL_DATABASE_CONFIG",
      "the development-control store requires PostgreSQL",
    );
  }
  const maxConnections = input.maxConnections ?? 5;
  if (
    !Number.isInteger(maxConnections) ||
    maxConnections < 1 ||
    maxConnections > 20
  ) {
    throw new DevelopmentControlError(
      "INVALID_DEVELOPMENT_CONTROL_DATABASE_CONFIG",
      "maxConnections must be an integer between 1 and 20",
    );
  }
  return Object.freeze({
    connectionString,
    applicationName: "ai-edge-development-control" as const,
    maxConnections,
  });
}
