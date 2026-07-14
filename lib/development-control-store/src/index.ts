import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { DevelopmentAuthorityPolicy } from "@workspace/development-control";
import {
  createDevelopmentControlDatabaseConfig,
  type DevelopmentControlDatabaseConfig,
} from "./config";
import { PostgresDevelopmentCoordinationStore } from "./postgres-coordination-store";
import * as schema from "./schema";

const { Pool } = pg;

export interface DevelopmentControlStoreRuntime {
  readonly store: PostgresDevelopmentCoordinationStore;
  close(): Promise<void>;
}

/**
 * Creates a runtime only from explicit caller input. Importing this package
 * never reads environment variables or opens a connection.
 */
export function createDevelopmentControlStoreRuntime(input: {
  readonly database: DevelopmentControlDatabaseConfig;
  readonly authorityPolicy?: DevelopmentAuthorityPolicy;
}): DevelopmentControlStoreRuntime {
  const pool = new Pool({
    connectionString: input.database.connectionString,
    application_name: input.database.applicationName,
    max: input.database.maxConnections,
  });
  const database = drizzle(pool, { schema });
  return Object.freeze({
    store: new PostgresDevelopmentCoordinationStore(
      database,
      input.authorityPolicy,
    ),
    close: () => pool.end(),
  });
}

export { createDevelopmentControlDatabaseConfig };
export type { DevelopmentControlDatabaseConfig };
export * from "./schema";
export * from "./mappers";
export * from "./postgres-coordination-store";
export * from "./github-reconciliation-repository";
export * from "./bridge-runtime-repository";
