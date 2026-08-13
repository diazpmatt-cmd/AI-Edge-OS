import { logger } from "./logger.js";
import { publishDuePosts } from "./scheduler.js";
import { resolveScheduledPublishingOwner } from "./scheduled-publishing-enabled.js";

export const SCHEDULED_PUBLISHING_POLL_MS = 60_000;

let publishingCycleRunning = false;

export function startScheduledPublishingMonitor(): void {
  const owner = resolveScheduledPublishingOwner();
  if (owner !== "dedicated_monitor") {
    logger.info(
      { owner },
      "[scheduled-publishing] dedicated monitor not started",
    );
    return;
  }

  const run = async () => {
    if (publishingCycleRunning) return;
    publishingCycleRunning = true;
    try {
      await publishDuePosts();
    } catch (error: unknown) {
      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        "[scheduled-publishing] cycle failed",
      );
    } finally {
      publishingCycleRunning = false;
    }
  };

  logger.info(
    { intervalMs: SCHEDULED_PUBLISHING_POLL_MS },
    "[scheduled-publishing] dedicated monitor started",
  );
  void run();
  const timer = setInterval(() => void run(), SCHEDULED_PUBLISHING_POLL_MS);
  timer.unref?.();
}
