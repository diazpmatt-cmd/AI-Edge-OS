import { pool as defaultPool } from "@workspace/db";

export interface MarketplaceEmailWorkerState {
  readonly checkpointInternalDateMs: number | null;
  readonly lastAttemptAt: Date | null;
  readonly lastSuccessfulPollAt: Date | null;
  readonly consecutiveFailures: number;
  readonly lastErrorCode: string | null;
}

type PoolLike = Pick<typeof defaultPool, "query">;

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("401") || message.includes("403")) return "GMAIL_AUTHORIZATION_FAILED";
  if (message.includes("429")) return "GMAIL_RATE_LIMITED";
  if (message.includes("timed out") || message.includes("timeout")) return "GMAIL_TIMEOUT";
  if (message.includes("gmail api")) return "GMAIL_API_FAILED";
  return "MARKETPLACE_EMAIL_POLL_FAILED";
}

export function createMarketplaceEmailWorkerStateStore(database: PoolLike = defaultPool) {
  return {
    async bootstrap(): Promise<void> {
      await database.query(`
        CREATE TABLE IF NOT EXISTS marketplace_email_worker_state (
          client_id uuid NOT NULL,
          mailbox_key text NOT NULL,
          checkpoint_internal_date_ms bigint,
          last_attempt_at timestamptz,
          last_successful_poll_at timestamptz,
          last_failure_at timestamptz,
          consecutive_failures integer NOT NULL DEFAULT 0,
          last_error_code text,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (client_id, mailbox_key)
        )
      `);
    },

    async ensure(clientId: string, mailboxKey: string): Promise<void> {
      await database.query(
        `INSERT INTO marketplace_email_worker_state(client_id, mailbox_key)
         VALUES ($1, $2)
         ON CONFLICT(client_id, mailbox_key) DO NOTHING`,
        [clientId, mailboxKey],
      );
    },

    async read(clientId: string, mailboxKey: string): Promise<MarketplaceEmailWorkerState> {
      const { rows } = await database.query<{
        checkpoint_internal_date_ms: string | null;
        last_attempt_at: Date | null;
        last_successful_poll_at: Date | null;
        consecutive_failures: number;
        last_error_code: string | null;
      }>(
        `SELECT checkpoint_internal_date_ms, last_attempt_at, last_successful_poll_at,
                consecutive_failures, last_error_code
         FROM marketplace_email_worker_state
         WHERE client_id = $1 AND mailbox_key = $2`,
        [clientId, mailboxKey],
      );
      const row = rows[0];
      const rawCheckpoint = row?.checkpoint_internal_date_ms;
      const checkpoint = rawCheckpoint == null ? null : Number(rawCheckpoint);
      return Object.freeze({
        checkpointInternalDateMs: Number.isFinite(checkpoint) && checkpoint! >= 0 ? checkpoint : null,
        lastAttemptAt: row?.last_attempt_at ?? null,
        lastSuccessfulPollAt: row?.last_successful_poll_at ?? null,
        consecutiveFailures: Number(row?.consecutive_failures ?? 0),
        lastErrorCode: row?.last_error_code ?? null,
      });
    },

    async markAttempt(clientId: string, mailboxKey: string): Promise<void> {
      await database.query(
        `UPDATE marketplace_email_worker_state
         SET last_attempt_at = now(), updated_at = now()
         WHERE client_id = $1 AND mailbox_key = $2`,
        [clientId, mailboxKey],
      );
    },

    async markSuccess(input: {
      clientId: string;
      mailboxKey: string;
      checkpointInternalDateMs: number | null;
    }): Promise<void> {
      await database.query(
        `UPDATE marketplace_email_worker_state
         SET checkpoint_internal_date_ms = $3,
             last_successful_poll_at = now(),
             consecutive_failures = 0,
             last_error_code = NULL,
             updated_at = now()
         WHERE client_id = $1 AND mailbox_key = $2`,
        [input.clientId, input.mailboxKey, input.checkpointInternalDateMs],
      );
    },

    async markFailure(clientId: string, mailboxKey: string, error: unknown): Promise<void> {
      await database.query(
        `UPDATE marketplace_email_worker_state
         SET last_failure_at = now(),
             consecutive_failures = consecutive_failures + 1,
             last_error_code = $3,
             updated_at = now()
         WHERE client_id = $1 AND mailbox_key = $2`,
        [clientId, mailboxKey, safeErrorCode(error)],
      );
    },
  };
}

export function buildCheckpointedMarketplaceQuery(
  baseQuery: string,
  checkpointInternalDateMs: number | null,
  overlapMs = 6 * 60 * 60 * 1_000,
): string {
  const query = baseQuery.trim();
  if (!query) throw new Error("Gmail marketplace query is required");
  if (checkpointInternalDateMs == null) return query;
  if (!Number.isFinite(checkpointInternalDateMs) || checkpointInternalDateMs < 0) {
    throw new Error("checkpointInternalDateMs must be non-negative");
  }
  if (!Number.isFinite(overlapMs) || overlapMs < 0 || overlapMs > 7 * 24 * 60 * 60 * 1_000) {
    throw new Error("checkpoint overlap must be between 0 and 7 days");
  }
  const afterSeconds = Math.max(0, Math.floor((checkpointInternalDateMs - overlapMs) / 1_000));
  return `(${query}) after:${afterSeconds}`;
}

export function advanceMarketplaceCheckpoint(
  current: number | null,
  processedInternalDates: readonly number[],
): number | null {
  const valid = processedInternalDates.filter(value => Number.isFinite(value) && value >= 0);
  if (!valid.length) return current;
  const candidate = Math.max(...valid);
  return current == null ? candidate : Math.max(current, candidate);
}
