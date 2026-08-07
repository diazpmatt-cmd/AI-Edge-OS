import { pool } from "@workspace/db";

export interface StoredAuthorityProfile {
  readonly id: string;
  readonly clientId: string;
  readonly primaryDomain: string;
  readonly primaryWebsite: string | null;
  readonly geography: readonly string[];
  readonly serviceIds: readonly string[];
  readonly discoveryEnabled: boolean;
  readonly source: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const DDL = `
CREATE TABLE IF NOT EXISTS authority_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL UNIQUE,
  primary_domain TEXT NOT NULL,
  primary_website TEXT,
  geography_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  service_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  discovery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT authority_profiles_geography_array CHECK (jsonb_typeof(geography_json) = 'array'),
  CONSTRAINT authority_profiles_services_array CHECK (jsonb_typeof(service_ids_json) = 'array')
);
CREATE INDEX IF NOT EXISTS authority_profiles_domain_idx
  ON authority_profiles(primary_domain);
`;

let bootstrapPromise: Promise<void> | null = null;

export function ensureAuthorityProfilesReady(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = pool.query(DDL).then(() => undefined).catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? Object.freeze([...value])
    : Object.freeze([]);
}

function mapRow(row: any): StoredAuthorityProfile {
  return Object.freeze({
    id: row.id,
    clientId: row.client_id,
    primaryDomain: row.primary_domain,
    primaryWebsite: row.primary_website ?? null,
    geography: strings(row.geography_json),
    serviceIds: strings(row.service_ids_json),
    discoveryEnabled: row.discovery_enabled === true,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function getAuthorityProfile(
  clientId: string,
): Promise<StoredAuthorityProfile | null> {
  await ensureAuthorityProfilesReady();
  const result = await pool.query(
    `SELECT id, client_id, primary_domain, primary_website,
            geography_json, service_ids_json, discovery_enabled, source,
            created_at, updated_at
       FROM authority_profiles
      WHERE client_id = $1
      LIMIT 1`,
    [clientId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function upsertAuthorityProfile(input: {
  readonly clientId: string;
  readonly primaryDomain: string;
  readonly primaryWebsite: string | null;
  readonly geography: readonly string[];
  readonly serviceIds: readonly string[];
  readonly discoveryEnabled: boolean;
  readonly source?: string;
}): Promise<StoredAuthorityProfile> {
  await ensureAuthorityProfilesReady();
  const result = await pool.query(
    `INSERT INTO authority_profiles (
       client_id, primary_domain, primary_website, geography_json,
       service_ids_json, discovery_enabled, source, updated_at
     ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, NOW())
     ON CONFLICT (client_id) DO UPDATE SET
       primary_domain = EXCLUDED.primary_domain,
       primary_website = EXCLUDED.primary_website,
       geography_json = EXCLUDED.geography_json,
       service_ids_json = EXCLUDED.service_ids_json,
       discovery_enabled = EXCLUDED.discovery_enabled,
       source = EXCLUDED.source,
       updated_at = NOW()
     RETURNING id, client_id, primary_domain, primary_website,
               geography_json, service_ids_json, discovery_enabled, source,
               created_at, updated_at`,
    [
      input.clientId,
      input.primaryDomain,
      input.primaryWebsite,
      JSON.stringify(input.geography),
      JSON.stringify(input.serviceIds),
      input.discoveryEnabled,
      input.source ?? "manual",
    ],
  );
  return mapRow(result.rows[0]);
}
