import { pool } from "@workspace/db";

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

export function isPublishingResultStatus(
  status: string,
): status is PublishingResultStatus {
  return PUBLISHING_RESULT_STATUSES.includes(status as PublishingResultStatus);
}

const allowedColumnsSql = PUBLISHING_MUTATION_ALLOWED_COLUMNS
  .map((column) => `'${column}'`)
  .join(", ");

const allowedStatusesSql = PUBLISHING_RESULT_STATUSES
  .map((status) => `'${status}'`)
  .join(", ");

/**
 * PostgreSQL remains the final authority for the in-flight mutation freeze.
 * The API middleware provides friendly 409 responses, but this trigger closes
 * the check-then-write race and protects writes from every process and route.
 */
export const PUBLISHING_MUTATION_GUARD_DDL = `
SELECT pg_advisory_xact_lock(hashtext('ai_edge_publishing_mutation_guard_v1'));

CREATE OR REPLACE FUNCTION ai_edge_guard_publishing_post_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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
`;

export async function bootstrapPublishingMutationGuard(): Promise<void> {
  await pool.query(PUBLISHING_MUTATION_GUARD_DDL);
}
