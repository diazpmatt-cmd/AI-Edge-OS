import { pool } from "@workspace/db";

import {
  normalizeApollosDelegatedAccessLevel,
  selectAuthorizedApollosClient,
  type ApollosClientSelectionResult,
} from "./apollos-client-access-policy.js";

export type ApollosClientAccessLevel = "viewer" | "operator" | "owner";
export type ApollosDelegatedAccessLevel = Exclude<ApollosClientAccessLevel, "owner">;

export interface ApollosAuthorizedClient {
  readonly clientId: string;
  readonly slug: string;
  readonly clientName: string;
  readonly industry: string;
  readonly industryLabel: string;
  readonly region: string;
  readonly accessLevel: ApollosClientAccessLevel;
  readonly ownership: "self" | "delegated";
}

export interface ApollosAuthorizedClientTarget extends ApollosAuthorizedClient {
  readonly ownerUserId: string;
}

export type ApollosClientTargetResolution = ApollosClientSelectionResult<ApollosAuthorizedClientTarget>;

export type ApollosClientAccessMutationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "client_not_found" | "self_owned" | "grant_not_found" };

let bootstrapPromise: Promise<void> | null = null;

export function ensureApollosClientAccessTable(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS apollos_client_access (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id  TEXT        NOT NULL,
        client_id      UUID        NOT NULL,
        access_level   TEXT        NOT NULL DEFAULT 'operator',
        is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (actor_user_id, client_id)
      );
      CREATE INDEX IF NOT EXISTS idx_apollos_client_access_actor
        ON apollos_client_access(actor_user_id)
        WHERE is_active = TRUE;
      CREATE INDEX IF NOT EXISTS idx_apollos_client_access_client
        ON apollos_client_access(client_id)
        WHERE is_active = TRUE;
    `).then(() => undefined).catch((error) => {
      bootstrapPromise = null;
      console.error("[APOLLOS-CLIENT-ACCESS] bootstrap failed", error);
      throw error;
    });
  }
  return bootstrapPromise;
}

export async function listAuthorizedApollosClientTargets(
  actorUserId: string,
): Promise<readonly ApollosAuthorizedClientTarget[]> {
  const actor = actorUserId.trim();
  if (!actor) return Object.freeze([]);

  await ensureApollosClientAccessTable();

  const result = await pool.query<{
    id: string;
    user_id: string;
    slug: string;
    client_name: string;
    industry: string;
    industry_label: string;
    region: string;
    ownership: "self" | "delegated";
    access_level: string;
  }>(
    `SELECT DISTINCT ON (c.id)
       c.id,
       c.user_id,
       c.slug,
       c.client_name,
       c.industry,
       c.industry_label,
       c.region,
       CASE WHEN c.user_id = $1 THEN 'self' ELSE 'delegated' END AS ownership,
       CASE
         WHEN c.user_id = $1 THEN 'owner'
         ELSE COALESCE(aca.access_level, 'viewer')
       END AS access_level
     FROM clients c
     LEFT JOIN apollos_client_access aca
       ON aca.client_id = c.id
      AND aca.actor_user_id = $1
      AND aca.is_active = TRUE
     WHERE c.is_active = TRUE
       AND (c.user_id = $1 OR aca.id IS NOT NULL)
     ORDER BY c.id, CASE WHEN c.user_id = $1 THEN 0 ELSE 1 END, aca.updated_at DESC NULLS LAST`,
    [actor],
  );

  return Object.freeze(result.rows.map((row) => Object.freeze({
    clientId: row.id,
    ownerUserId: row.user_id,
    slug: row.slug,
    clientName: row.client_name,
    industry: row.industry,
    industryLabel: row.industry_label,
    region: row.region,
    accessLevel: row.ownership === "self"
      ? "owner"
      : normalizeApollosDelegatedAccessLevel(row.access_level),
    ownership: row.ownership,
  })));
}

export async function listAuthorizedApollosClients(
  actorUserId: string,
): Promise<readonly ApollosAuthorizedClient[]> {
  const targets = await listAuthorizedApollosClientTargets(actorUserId);
  return Object.freeze(targets.map(({ ownerUserId: _ownerUserId, ...client }) => Object.freeze(client)));
}

export async function resolveAuthorizedApollosClientTarget(
  actorUserId: string,
  requestedClientId?: string | null,
): Promise<ApollosClientTargetResolution> {
  const targets = await listAuthorizedApollosClientTargets(actorUserId);
  return selectAuthorizedApollosClient(targets, requestedClientId);
}

export async function grantDelegatedApollosClientAccess(input: {
  readonly actorUserId: string;
  readonly clientId: string;
  readonly accessLevel: ApollosDelegatedAccessLevel;
}): Promise<ApollosClientAccessMutationResult> {
  const actorUserId = input.actorUserId.trim();
  const clientId = input.clientId.trim();
  if (!actorUserId || !clientId) {
    return Object.freeze({ ok: false as const, reason: "client_not_found" as const });
  }

  await ensureApollosClientAccessTable();

  const client = await pool.query<{ user_id: string }>(
    `SELECT user_id
       FROM clients
      WHERE id = $1
        AND is_active = TRUE
      LIMIT 1`,
    [clientId],
  );
  const ownerUserId = client.rows[0]?.user_id;
  if (!ownerUserId) {
    return Object.freeze({ ok: false as const, reason: "client_not_found" as const });
  }
  if (ownerUserId === actorUserId) {
    return Object.freeze({ ok: false as const, reason: "self_owned" as const });
  }

  await pool.query(
    `INSERT INTO apollos_client_access (
       actor_user_id, client_id, access_level, is_active, updated_at
     ) VALUES ($1, $2, $3, TRUE, NOW())
     ON CONFLICT (actor_user_id, client_id)
     DO UPDATE SET
       access_level = EXCLUDED.access_level,
       is_active = TRUE,
       updated_at = NOW()`,
    [actorUserId, clientId, input.accessLevel],
  );

  return Object.freeze({ ok: true as const });
}

export async function revokeDelegatedApollosClientAccess(input: {
  readonly actorUserId: string;
  readonly clientId: string;
}): Promise<ApollosClientAccessMutationResult> {
  const actorUserId = input.actorUserId.trim();
  const clientId = input.clientId.trim();
  if (!actorUserId || !clientId) {
    return Object.freeze({ ok: false as const, reason: "grant_not_found" as const });
  }

  await ensureApollosClientAccessTable();
  const result = await pool.query(
    `UPDATE apollos_client_access
        SET is_active = FALSE,
            updated_at = NOW()
      WHERE actor_user_id = $1
        AND client_id = $2
        AND is_active = TRUE`,
    [actorUserId, clientId],
  );

  return result.rowCount && result.rowCount > 0
    ? Object.freeze({ ok: true as const })
    : Object.freeze({ ok: false as const, reason: "grant_not_found" as const });
}
