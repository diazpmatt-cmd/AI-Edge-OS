import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./bbb-services";
export * from "./client-context";
export * from "./db-service-registry-provider";
export * from "./registry-validator";
export * from "./scheduler-eligibility";

// ── Phase C2: Discovery Engine ────────────────────────────────────────────────
export * from "./discovery-types";
export * from "./discovery-providers";
export * from "./discovery-context";
export * from "./discovery-registry-gate";
export * from "./discovery-normalizer";
export * from "./discovery-cluster-builder";
export * from "./discovery-scorer";
export * from "./discovery-pipeline";

export { eq, and, or, sql } from "drizzle-orm";
