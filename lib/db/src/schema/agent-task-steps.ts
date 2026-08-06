import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { agentTasksTable } from "./agent-tasks";

/**
 * Durable, resumable execution checkpoints for Apollos plans.
 *
 * A step key is stable within its parent task. Completed steps are never
 * re-executed merely because a worker restarted or a later step failed.
 */
export const agentTaskStepsTable = pgTable(
  "agent_task_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => agentTasksTable.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    position: integer("position").notNull(),
    capability: text("capability").notNull(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    inputDigest: text("input_digest").notNull(),
    outputReceipt: jsonb("output_receipt"),
    failureCode: text("failure_code"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    taskStepUnique: uniqueIndex("idx_agent_task_steps_task_key").on(
      table.taskId,
      table.stepKey,
    ),
    taskPositionUnique: uniqueIndex("idx_agent_task_steps_task_position").on(
      table.taskId,
      table.position,
    ),
  }),
);

export type AgentTaskStep = typeof agentTaskStepsTable.$inferSelect;
export type NewAgentTaskStep = typeof agentTaskStepsTable.$inferInsert;
