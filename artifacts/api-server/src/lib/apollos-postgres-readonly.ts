import { pool } from "@workspace/db";
import { isApollosAdminUser } from "./apollos-admin-access-policy.js";

const QUERY_TIMEOUT_MS = 5_000;

function requireAdmin(userId: string): void {
  if (!isApollosAdminUser(userId)) {
    throw new Error("APOLLOS_MCP_POSTGRES_ADMIN_REQUIRED");
  }
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function safeText(value: unknown, max = 120): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

export async function getApollosPostgresHealth(
  actorUserId: string,
): Promise<Readonly<Record<string, unknown>>> {
  requireAdmin(actorUserId);

  const client = await pool.connect().catch(() => {
    throw new Error("APOLLOS_MCP_POSTGRES_UNAVAILABLE");
  });

  try {
    await client.query(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);
    const [identity, activity, stats] = await Promise.all([
      client.query<{
        database_name: string;
        server_version: string;
        database_size_bytes: string | number;
        in_recovery: boolean;
        observed_at: Date;
      }>(`
        SELECT current_database() AS database_name,
               current_setting('server_version') AS server_version,
               pg_database_size(current_database()) AS database_size_bytes,
               pg_is_in_recovery() AS in_recovery,
               now() AS observed_at
      `),
      client.query<{
        state: string | null;
        count: string | number;
      }>(`
        SELECT COALESCE(state, 'unknown') AS state,
               count(*) AS count
          FROM pg_stat_activity
         WHERE datname = current_database()
         GROUP BY COALESCE(state, 'unknown')
         ORDER BY COALESCE(state, 'unknown')
      `),
      client.query<{
        numbackends: string | number;
        xact_commit: string | number;
        xact_rollback: string | number;
        blks_read: string | number;
        blks_hit: string | number;
        temp_files: string | number;
        deadlocks: string | number;
      }>(`
        SELECT numbackends,
               xact_commit,
               xact_rollback,
               blks_read,
               blks_hit,
               temp_files,
               deadlocks
          FROM pg_stat_database
         WHERE datname = current_database()
      `),
    ]);

    const identityRow = identity.rows[0];
    const statsRow = stats.rows[0];
    if (!identityRow || !statsRow) {
      throw new Error("APOLLOS_MCP_POSTGRES_HEALTH_INCOMPLETE");
    }

    const activityByState = Object.freeze(Object.fromEntries(
      activity.rows.map((row) => [safeText(row.state, 60) ?? "unknown", finiteNumber(row.count) ?? 0]),
    ));
    const blksRead = finiteNumber(statsRow.blks_read) ?? 0;
    const blksHit = finiteNumber(statsRow.blks_hit) ?? 0;
    const cacheTotal = blksRead + blksHit;
    const cacheHitRatio = cacheTotal > 0 ? Math.round((blksHit / cacheTotal) * 10_000) / 100 : null;
    const commits = finiteNumber(statsRow.xact_commit) ?? 0;
    const rollbacks = finiteNumber(statsRow.xact_rollback) ?? 0;
    const transactionTotal = commits + rollbacks;
    const rollbackRatio = transactionTotal > 0
      ? Math.round((rollbacks / transactionTotal) * 10_000) / 100
      : null;

    return Object.freeze({
      database: Object.freeze({
        name: safeText(identityRow.database_name, 120),
        serverVersion: safeText(identityRow.server_version, 80),
        sizeBytes: finiteNumber(identityRow.database_size_bytes),
        inRecovery: identityRow.in_recovery === true,
        observedAt: identityRow.observed_at instanceof Date
          ? identityRow.observed_at.toISOString()
          : safeText(identityRow.observed_at, 80),
      }),
      connections: Object.freeze({
        numBackends: finiteNumber(statsRow.numbackends),
        activityByState,
        applicationPool: Object.freeze({
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        }),
      }),
      workload: Object.freeze({
        commits,
        rollbacks,
        rollbackRatioPercent: rollbackRatio,
        blocksRead: blksRead,
        blocksHit: blksHit,
        cacheHitRatioPercent: cacheHitRatio,
        tempFiles: finiteNumber(statsRow.temp_files),
        deadlocks: finiteNumber(statsRow.deadlocks),
      }),
      safety: Object.freeze({
        readOnlyInspection: true,
        customerRowsRead: false,
        queryTextReturned: false,
        credentialsReturned: false,
      }),
    });
  } catch (error) {
    if (error instanceof Error && /^APOLLOS_MCP_POSTGRES_/.test(error.message)) throw error;
    throw new Error("APOLLOS_MCP_POSTGRES_UNAVAILABLE");
  } finally {
    client.release();
  }
}
