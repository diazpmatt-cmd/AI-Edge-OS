export interface SchedulerPublishResultShape {
  readonly postStatus: string;
  readonly published: number;
  readonly failed: number;
  readonly skipped: number;
  readonly deliveries: readonly unknown[];
  readonly summary: string;
}

/**
 * Canonical PublishingService rejections that happen before delivery rows are
 * created all share the same durable shape: failed aggregate result, zero
 * verified publishes, and no platform delivery results.
 *
 * This deliberately does not inspect human-readable error strings. The caller
 * must still use a compare-and-set database update against status='scheduled'
 * before treating the rejection as terminal. That guard prevents an
 * already-published or concurrently-publishing race from being overwritten.
 */
export function isEarlyCanonicalPublishRejection(
  result: SchedulerPublishResultShape,
): boolean {
  return (
    result.postStatus === "failed" &&
    result.published === 0 &&
    result.failed > 0 &&
    result.deliveries.length === 0
  );
}

export function buildScheduledPreflightFailureMessage(
  summary: string,
): string {
  const normalized = summary.trim() || "Canonical publishing rejected the post before platform delivery began.";
  return `Scheduler stopped terminal preflight retries: ${normalized}`.slice(0, 500);
}
