import { pgTable, text, timestamp, uuid, integer, boolean } from "drizzle-orm/pg-core";

export const gorilladeskJobsTable = pgTable("gorilladesk_jobs", {
  id:           uuid("id").primaryKey().defaultRandom(),
  externalId:   text("external_id").unique(),
  customerId:   text("customer_id"),
  status:       text("status").notNull().default("scheduled"),
  serviceType:  text("service_type"),
  amountCents:  integer("amount_cents").notNull().default(0),
  projectId:    text("project_id").notNull().default("bed-bugs-and-beyond"),
  completedAt:  timestamp("completed_at", { withTimezone: true }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gorilladeskCustomersTable = pgTable("gorilladesk_customers", {
  id:             uuid("id").primaryKey().defaultRandom(),
  externalId:     text("external_id").unique(),
  name:           text("name").notNull(),
  email:          text("email"),
  phone:          text("phone"),
  isRecurring:    boolean("is_recurring").notNull().default(false),
  leadSource:     text("lead_source"),
  activeServices: integer("active_services").notNull().default(0),
  firstServiceAt: timestamp("first_service_at", { withTimezone: true }),
  lastServiceAt:  timestamp("last_service_at", { withTimezone: true }),
  projectId:      text("project_id").notNull().default("bed-bugs-and-beyond"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gorilladeskPaymentsTable = pgTable("gorilladesk_payments", {
  id:          uuid("id").primaryKey().defaultRandom(),
  externalId:  text("external_id").unique(),
  jobId:       text("job_id"),
  amountCents: integer("amount_cents").notNull().default(0),
  method:      text("method").notNull().default("other"),
  status:      text("status").notNull().default("outstanding"),
  paidAt:      timestamp("paid_at", { withTimezone: true }),
  projectId:   text("project_id").notNull().default("bed-bugs-and-beyond"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gorilladeskLeadSourcesTable = pgTable("gorilladesk_lead_sources", {
  id:           uuid("id").primaryKey().defaultRandom(),
  name:         text("name").notNull(),
  jobCount:     integer("job_count").notNull().default(0),
  revenueCents: integer("revenue_cents").notNull().default(0),
  period:       text("period").notNull(),
  projectId:    text("project_id").notNull().default("bed-bugs-and-beyond"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GorilladeskJob      = typeof gorilladeskJobsTable.$inferSelect;
export type GorilladeskCustomer = typeof gorilladeskCustomersTable.$inferSelect;
export type GorilladeskPayment  = typeof gorilladeskPaymentsTable.$inferSelect;
export type GorilladeskLeadSource = typeof gorilladeskLeadSourcesTable.$inferSelect;
