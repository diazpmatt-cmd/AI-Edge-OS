import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { isSchedulerEnabled } from "./lib/scheduler-enabled.js";
import { startScheduledPublishingMonitor } from "./lib/scheduled-publishing-monitor.js";
import { migrateAgentTasks } from "./lib/agent-tasks-migrate.js";
import { migrateLeadAuditEvents } from "./lib/lead-audit-migrate.js";
import { migrateAuthorityOutreachDrafts } from "./lib/authority-outreach-draft-migrate.js";
import { migrateAuthorityTargetContacts } from "./lib/authority-target-contact-migrate.js";
import { migrateAuthorityBacklinkWinEvidence } from "./lib/authority-backlink-win-evidence-migrate.js";
import { migrateSchema } from "./lib/schema-migrate.js";
import { startPublishingInterruptionRecoveryMonitor } from "./lib/publishing-interruption-recovery.js";
import { bootstrapPublishingMutationGuard } from "./lib/publishing-mutation-guard.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

migrateSchema()
  .then(() => migrateLeadAuditEvents())
  .then(() => migrateAgentTasks())
  .then(() => migrateAuthorityOutreachDrafts())
  .then(() => migrateAuthorityTargetContacts())
  .then(() => migrateAuthorityBacklinkWinEvidence())
  .then(() => bootstrapPublishingMutationGuard())
  .then(() => import("./app.js"))
  .then(({ default: app }) => {
    app.listen(port, (err: unknown) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      startPublishingInterruptionRecoveryMonitor();
      startScheduledPublishingMonitor();
      if (isSchedulerEnabled()) {
        startScheduler();
      } else {
        logger.info("[scheduler] disabled by SCHEDULER_ENABLED");
      }
    });
  })
  .catch((err) => {
    logger.error({ err }, "Startup migration or publishing guard failed — server will not start");
    process.exit(1);
  });