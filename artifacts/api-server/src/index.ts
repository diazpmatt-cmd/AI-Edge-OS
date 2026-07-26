import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { isSchedulerEnabled } from "./lib/scheduler-enabled.js";
import { migrateAgentTasks } from "./lib/agent-tasks-migrate.js";
import { migrateSchema } from "./lib/schema-migrate.js";

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
  .then(() => migrateAgentTasks())
  .then(() => import("./app.js"))
  .then(({ default: app }) => {
    app.listen(port, (err: unknown) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      if (isSchedulerEnabled()) {
        startScheduler();
      } else {
        logger.info("[scheduler] disabled by SCHEDULER_ENABLED");
      }
    });
  })
  .catch((err) => {
    logger.error({ err }, "Startup migration failed — server will not start");
    process.exit(1);
  });
