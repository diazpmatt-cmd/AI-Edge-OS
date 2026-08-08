import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { DevelopmentAuthorityPolicy } from "@workspace/development-control";
import {
  createDevelopmentControlDatabaseConfig,
  type DevelopmentControlDatabaseConfig,
} from "./config.js";
import { PostgresDevelopmentCoordinationStore } from "./postgres-coordination-store.js";
import { PostgresBridgeRuntimeRepository } from "./bridge-runtime-repository.js";
import { PostgresBridgeRateLimitRepository } from "./bridge-rate-limit-repository.js";
import { PostgresDevelopmentGitReceiptRepository } from "./development-git-receipt-repository.js";
import * as schema from "./schema.js";

const { Pool } = pg;

export interface DevelopmentControlStoreRuntime {
  readonly store: PostgresDevelopmentCoordinationStore;
  readonly gitReceipts: PostgresDevelopmentGitReceiptRepository;
  close(): Promise<void>;
}

export interface DevelopmentControlBridgeStoreRuntime
  extends DevelopmentControlStoreRuntime {
  readonly bridge: PostgresBridgeRuntimeRepository;
  readonly rateLimits: PostgresBridgeRateLimitRepository;
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
    gitReceipts: new PostgresDevelopmentGitReceiptRepository(database),
    close: () => pool.end(),
  });
}

/**
 * Creates the isolated bridge composition from one caller-supplied control-plane
 * database. Importing this package still performs no environment or network IO.
 */
export function createDevelopmentControlBridgeStoreRuntime(input: {
  readonly database: DevelopmentControlDatabaseConfig;
  readonly authorityPolicy?: DevelopmentAuthorityPolicy;
}): DevelopmentControlBridgeStoreRuntime {
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
    gitReceipts: new PostgresDevelopmentGitReceiptRepository(database),
    bridge: new PostgresBridgeRuntimeRepository(database),
    rateLimits: new PostgresBridgeRateLimitRepository(database),
    close: () => pool.end(),
  });
}

export { createDevelopmentControlDatabaseConfig };
export type { DevelopmentControlDatabaseConfig };
export * from "./schema.js";
export * from "./mappers.js";
export * from "./postgres-coordination-store.js";
export * from "./github-reconciliation-repository.js";
export * from "./bridge-runtime-repository.js";
export * from "./bridge-rate-limit-repository.js";
export * from "./development-git-receipt-repository.js";
