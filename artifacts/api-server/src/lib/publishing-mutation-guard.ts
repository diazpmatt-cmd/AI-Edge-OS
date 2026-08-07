export const PUBLISHING_STATE_LOCKED_CODE = "PUBLISHING_STATE_LOCKED";
export const VERIFIED_DELIVERY_RECEIPT_LOCKED_CODE =
  "VERIFIED_DELIVERY_RECEIPT_LOCKED";
export const VERIFIED_DELIVERY_DELETE_OVERRIDE_SETTING =
  "ai_edge.allow_verified_receipt_delete";

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
 * PostgreSQL is the final authority for immutable in-flight payloads, monotonic
 * provider receipts, and aggregate status derived from the completed ledger.
 */
export const PUBLISHING_MUTATION_GUARD_DDL = `
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('ai_edge_publishing_mutation_guard_v1'));

CREATE OR REPLACE FUNCTION ai_edge_preserve_verified_delivery_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $delivery_function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN (
      'published',
      'published_with_warning',
      'idempotency_hit'
    ) AND (
      OLD.external_post_id IS NOT NULL
      OR OLD.external_post_url IS NOT NULL
    ) AND COALESCE(
      current_setting('${VERIFIED_DELIVERY_DELETE_OVERRIDE_SETTING}', true),
      'off'
    ) <> 'on' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = '${VERIFIED_DELIVERY_RECEIPT_LOCKED_CODE}',
        DETAIL = 'A verified provider receipt cannot be deleted without the explicit transaction-local maintenance override.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN (
    'published',
    'published_with_warning',
    'idempotency_hit'
  ) AND (
    OLD.external_post_id IS NOT NULL
    OR OLD.external_post_url IS NOT NULL
  ) THEN
    IF NEW.post_id IS DISTINCT FROM OLD.post_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.platform IS DISTINCT FROM OLD.platform
       OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
       OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = '${VERIFIED_DELIVERY_RECEIPT_LOCKED_CODE}',
        DETAIL = 'A verified provider receipt cannot be reassigned to another delivery identity.';
    END IF;

    NEW.status := OLD.status;
    NEW.external_post_id := COALESCE(OLD.external_post_id, NEW.external_post_id);
    NEW.external_post_url := COALESCE(OLD.external_post_url, NEW.external_post_url);
    NEW.published_at := COALESCE(OLD.published_at, NEW.published_at);
    NEW.failed_at := OLD.failed_at;
    NEW.error_message := OLD.error_message;
  END IF;

  RETURN NEW;
END;
$delivery_function$;

CREATE OR REPLACE FUNCTION ai_edge_guard_publishing_post_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $post_function$
DECLARE
  expected_platforms text[] := ARRAY[]::text[];
  expected_platform_count integer := 0;
  latest_delivery_count integer := 0;
  verified_published_count integer := 0;
  warning_receipt_count integer := 0;
  terminal_failure_count integer := 0;
  latest_unresolved_count integer := 0;
  latest_published_at timestamptz := NULL;
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
          WHERE latest.status IN (
            'published',
            'published_with_warning',
            'idempotency_hit'
          )
          AND (
            latest.external_post_id IS NOT NULL
            OR latest.external_post_url IS NOT NULL
          )
        )::integer,
        count(*) FILTER (
          WHERE latest.status = 'published_with_warning'
          AND (
            latest.external_post_id IS NOT NULL
            OR latest.external_post_url IS NOT NULL
          )
        )::integer,
        count(*) FILTER (
          WHERE latest.status IN ('failed', 'skipped', 'cancelled')
          OR (
            latest.status IN (
              'published',
              'published_with_warning',
              'idempotency_hit'
            )
            AND latest.external_post_id IS NULL
            AND latest.external_post_url IS NULL
          )
        )::integer,
        count(*) FILTER (
          WHERE latest.status NOT IN (
            'failed',
            'skipped',
            'cancelled',
            'published',
            'published_with_warning',
            'idempotency_hit'
          )
        )::integer,
        max(COALESCE(latest.published_at, latest.updated_at)) FILTER (
          WHERE latest.status IN (
            'published',
            'published_with_warning',
            'idempotency_hit'
          )
          AND (
            latest.external_post_id IS NOT NULL
            OR latest.external_post_url IS NOT NULL
          )
        )
      INTO
        latest_delivery_count,
        verified_published_count,
        warning_receipt_count,
        terminal_failure_count,
        latest_unresolved_count,
        latest_published_at
      FROM (
        SELECT DISTINCT ON (platform)
          platform,
          status,
          external_post_id,
          external_post_url,
          published_at,
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
        OR verified_published_count + terminal_failure_count
          <> expected_platform_count
      ) THEN
        IF NOT (
          COALESCE(OLD.published_by, '') = 'scheduler'
          AND (${schedulerRecoverySql})
        ) THEN
          NEW.status := OLD.status;
          NEW.published_at := OLD.published_at;
        END IF;
      ELSIF verified_published_count = expected_platform_count
            AND warning_receipt_count = 0 THEN
        NEW.status := 'published';
        NEW.published_at := latest_published_at;
        NEW.error_message := NULL;
      ELSIF verified_published_count > 0 THEN
        NEW.status := 'published_with_warning';
        NEW.published_at := latest_published_at;
      ELSE
        NEW.status := 'failed';
        NEW.published_at := NULL;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$post_function$;

DO $triggers$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgname = 'trg_ai_edge_preserve_verified_delivery_receipt'
       AND tgrelid = 'platform_deliveries'::regclass
       AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_ai_edge_preserve_verified_delivery_receipt
      BEFORE UPDATE OR DELETE ON platform_deliveries
      FOR EACH ROW
      EXECUTE FUNCTION ai_edge_preserve_verified_delivery_receipt()';
  END IF;

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
$triggers$;
COMMIT;
`;

export async function bootstrapPublishingMutationGuard(): Promise<void> {
  const { pool } = await import("@workspace/db");
  await pool.query(PUBLISHING_MUTATION_GUARD_DDL);
}
