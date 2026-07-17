import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Agent Tasks — bounded autonomy approval layer.
 *
 * Agents submit tasks here for deterministic rule evaluation.
 * Low-risk tasks are auto-approved; high-stakes tasks wait for human review.
 *
 * Status flow:
 *   pending_review → approved | rejected   (human or system decision)
 *   approved       → executed | failed     (managed by execution layer)
 *
 * Decision-field semantics:
 *   decision   — immutable engine evaluation: auto_approved | requires_review | rejected
 *                Preserved alongside ruleId/ruleSetVersion as the engine audit record.
 *   resolution — terminal outcome: "approved" | "rejected" | null while pending.
 *                Set at creation for auto-decided tasks; set when a human acts on
 *                requires_review tasks. Never contradicts status.
 *
 * NOTE: Table is bootstrapped via controlled migration in lib/agent-tasks-migrate.ts.
 * drizzle-kit push is blocked by a pre-existing constraint conflict in this DB.
 */
export const agentTasksTable = pgTable("agent_tasks", {
  id:             uuid("id").primaryKey().defaultRandom(),
  userId:         text("user_id").notNull(),
  taskType:       text("task_type").notNull(),
  payload:        text("payload").notNull().default("{}"),
  status:         text("status").notNull().default("pending_review"),
  decision:       text("decision"),
  resolution:     text("resolution"),
  decisionBy:     text("decision_by"),
  decisionAt:     timestamp("decision_at",  { withTimezone: true }),
  decisionNote:   text("decision_note"),
  ruleId:         text("rule_id"),
  ruleSetVersion: text("rule_set_version").notNull().default("v1"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AgentTask    = typeof agentTasksTable.$inferSelect;
export type NewAgentTask = typeof agentTasksTable.$inferInsert;
