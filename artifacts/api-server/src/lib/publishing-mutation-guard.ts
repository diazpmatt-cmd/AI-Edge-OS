export const PUBLISHING_STATE_LOCKED_CODE = "PUBLISHING_STATE_LOCKED";

export const PUBLISHING_RESULT_STATUSES = [
  "publishing",
  "published",
  "published_with_warning",
  "failed",
] as const;

export type PublishingResultStatus =
  (typeof PUBLISHING_RESULT_STATUSES)[number];

export const PUBLISHING_MUTATION_ALLOWED_COLUMNS = [
  "status",
  "published_at",
  "error_message",
  "youtube_video_id",
  "impressions",
  "reach",
  "clicks",
  "likes",
  "comments",
  "shares",
  "engagement_score",
  "updated_at",
] as const;

export const SCHEDULER_AGGREGATE_RECOVERY_PREFIXES = [
  "Scheduler recovered aggregate state from",
  "Scheduler error after",
  "Scheduler publish error before",
] as const;

export function isPublishingResultStatus(
  status: string,
): status is PublishingResultStatus {
  return PUBLISHING_RESULT_STATUSES.includes(status as PublishingResultStatus);
}

export function isSchedulerAggregateRecoveryMessage(
  value: string | null | undefined,
): boolean {
  const normalized = value?.trimStart() ?? "";
  return SCHEDULER_AGGREGATE_RECOVERY_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

export function shouldDeferAdapterAggregateTransition(input: {
  readonly nextStatus: string;
  readonly expectedPlatformCount: number;
  readonly latestDeliveryCount: number;
  readonly latestUnresolvedCount: number;
  readonly publishedBy?: string | null;
  readonly errorMessage?: string | null;
}): boolean {
  const schedulerRecoveryAuthorized =
    input.publishedBy === "scheduler" &&
    isSchedulerAggregateRecoveryMessage(input.errorMessage);

  return (
    input.nextStatus !== "publishing" &&
    !schedulerRecoveryAuthorized &&
    (
      input.expectedPlatformCount === 0 ||
      input.latestDeliveryCount !== input.expectedPlatformCount ||
      input.latestUnresolvedCount > 0
    )
  );
}

const allowedColumnsSql = PUBLISHING_MUTATION_ALLOWED_COLUMNS
  .map((column) => `'${column}'`)
  .join(", ");

const allowedStatusesSql = PUBLISHING_RESULT_STATUSES
  .map((status) => `'${status}'`)
  .join(", ");

const schedulerRecoverySql = SCHEDULER_AGGREGATE_RECOVERY_PREFIXES
  .map((prefix) => `COALESCE(NEW.error_message, '') LIKE '${prefix}%'`)
  .join(" OR ");

/**
 * PostgreSQL remains the final authority for the in-flight mutation freeze.
 * The API middleware provides friendly 409 responses, but this trigger closes
 * the check-then-write race and protects writes from every process and route.
 *
 * The legacy provider adapter computes an aggregate result before the canonical
 * PublishingService finalizes the post. Its premature transition is held at
 * `publishing` until the latest tenant-scoped attempt for every expected
 * platform is terminal in the durable delivery ledger. Scheduler exception
 * reconciliation retains a narrow actor-and-message-bound bypass.
 */
export const PUBLISHING_MUTATION_GUARD_DDL = `
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('ai_edge_publishing_mutation_guard_v1'));

CREATE OR REPLACE FUNCTION ai_edge_guard_publishing_post_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  expected_platforms text[] := ARRAY[]::text[];
  expected_platform_count integer := 0;
  latest_delivery_count integer := 0;
  latest_unresolved_count integer := 0;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'publishing' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = '${PUBLISHING_STATE_LOCKED_CODE}',
        DETAIL = 'A post cannot be deleted while provider delivery is in flight.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'publishing' THEN
    IF NEW.status NOT IN (${allowedStatusesSql}) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = '${PUBLISHING_STATE_LOCKED_CODE}',
        DETAIL = 'Only canonical provider-result states may replace publishing.';
    END IF;

    IF (
      to_jsonb(NEW) - ARRAY[${allowedColumnsSql}]::text[]
    ) IS DISTINCT FROM (
      to_jsonb(OLD) - ARRAY[${allowedColumnsSql}]::text[]
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = '${PUBLISHING_STATE_LOCKED_CODE}',
        DETAIL = 'Approved payload, platform, media, schedule, approval, and ownership fields are immutable while provider delivery is in flight.';
    END IF;

    IF NEW.status <> 'publishing' THEN
      BEGIN
        SELECT COALESCE(
          array_agg(DISTINCT btrim(value))
            FILTER (WHERE btrim(value) <> ''),
          ARRAY[]::text[]
        )
          INTO expected_platforms
          FROM jsonb_array_elements_text(
            COALESCE(NULLIF(OLD.platforms, ''), '[]')::jsonb
          );
      EXCEPTION WHEN OTHERS THEN
        expected_platforms := ARRAY[]::text[];
      END;

      expected_platform_count := cardinality(expected_platforms);

      SELECT
        count(*)::integer,
        count(*) FILTER (
          WHERE NOT (
            latest.status IN ('failed', 'skipped', 'cancelled')
            OR (
              latest.status IN ('published', 'published_with_warning', 'idempotency_hit')
              AND (
                latest.external_post_id IS NOT NULL
                OR latest.external_post_url IS NOT NULL
              )
            )
          )
        )::integer
      INTO latest_delivery_count, latest_unresolved_count
      FROM (
        SELECT DISTINCT ON (platform)
          platform,
          status,
          external_post_id,
          external_post_url,
          attempt_number,
          updated_at
        FROM platform_deliveries
        WHERE post_id = OLD.id
          AND user_id = OLD.user_id
          AND platform = ANY(expected_platforms)
        ORDER BY platform, attempt_number DESC, updated_at DESC
      ) AS latest;

      IF (
        expected_platform_count = 0
        OR latest_delivery_count <> expected_platform_count
        OR latest_unresolved_count > 0
      ) AND NOT (
        COALESCE(OLD.published_by, '') = 'scheduler'
        AND (${schedulerRecoverySql})
      ) THEN
        NEW.status := OLD.status;
        NEW.published_at := OLD.published_at;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DO $trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgname = 'trg_ai_edge_guard_publishing_post_mutation'
       AND tgrelid = 'social_posts'::regclass
       AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_ai_edge_guard_publishing_post_mutation
      BEFORE UPDATE OR DELETE ON social_posts
      FOR EACH ROW
      EXECUTE FUNCTION ai_edge_guard_publishing_post_mutation()';
  END IF;
END;
$trigger$;
COMMIT;
`;

export async function bootstrapPublishingMutationGuard(): Promise<void> {
  const { pool } = await import("@workspace/db");
  await pool.query(PUBLISHING_MUTATION_GUARD_DDL);
}
