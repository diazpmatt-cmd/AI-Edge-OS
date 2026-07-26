import type { ClientRecord } from "@workspace/db";

/**
 * Raw PostgreSQL row shape for the canonical clients table.
 *
 * The production client resolver intentionally uses this narrow parameterized
 * query instead of the ORM identity lookup. This keeps tenant matching exact
 * while avoiding a production-only ORM lookup discrepancy observed during
 * Referral Growth acceptance.
 */
export interface RawClientRecordRow {
  id: string;
  user_id: string;
  slug: string;
  client_name: string;
  industry: string;
  industry_label: string;
  region: string;
  service_areas: string;
  timezone: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export const SELECT_CLIENT_BY_USER_ID_SQL = `
  SELECT
    id,
    user_id,
    slug,
    client_name,
    industry,
    industry_label,
    region,
    service_areas,
    timezone,
    is_active,
    created_at,
    updated_at
  FROM clients
  WHERE user_id = $1
  LIMIT 1
`;

export type ClientRecordQuery = (
  text: string,
  values: string[],
) => Promise<{ rows: RawClientRecordRow[] }>;

export function mapRawClientRecord(row: RawClientRecordRow): ClientRecord {
  return {
    id: row.id,
    userId: row.user_id,
    slug: row.slug,
    clientName: row.client_name,
    industry: row.industry,
    industryLabel: row.industry_label,
    region: row.region,
    serviceAreas: row.service_areas,
    timezone: row.timezone,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function maskUserId(userId: string): string {
  if (userId.length <= 12) return "[masked]";
  return `${userId.slice(0, 8)}...${userId.slice(-4)}`;
}

/**
 * Resolve one client by its exact Clerk user ID.
 *
 * SAFETY:
 * - The authenticated ID is always passed as a PostgreSQL parameter.
 * - No slug fallback, default tenant, or cross-tenant substitution is allowed.
 * - Unknown users return null and remain fail-closed at the caller.
 * - Temporary acceptance diagnostics log only a masked user ID and lookup result.
 */
export async function selectClientRecordByUserId(
  query: ClientRecordQuery,
  userId: string,
): Promise<ClientRecord | null> {
  const result = await query(SELECT_CLIENT_BY_USER_ID_SQL, [userId]);
  const row = result.rows[0];

  console.info(
    `[CLIENT-LOOKUP] user=${maskUserId(userId)} found=${Boolean(row)}` +
      (row ? ` slug=${row.slug} active=${row.is_active}` : ""),
  );

  return row ? mapRawClientRecord(row) : null;
}
