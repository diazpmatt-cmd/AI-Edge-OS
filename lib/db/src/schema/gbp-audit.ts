/**
 * GBP Audit & Optimization Engine — Schema
 *
 * Two tables, bootstrapped via raw SQL in the gbp-audit route
 * (same pattern as call_intelligence and integration_health_history).
 * Do NOT use drizzle-kit push for these tables.
 *
 * gbp_audit_snapshots — one audit run per client
 * gbp_audit_checks    — one row per check per snapshot (25 checks total)
 */

import {
  pgTable, text, integer, boolean, timestamp, jsonb, uuid,
} from "drizzle-orm/pg-core";

// ── Local type aliases (not exported — canonical types live in gbp-audit-engine) ──
// These are used only for Drizzle .$type<>() annotations within this file.

type GbpCheckStatus   = "pass" | "warning" | "fail" | "data_pending" | "error" | "skip";
type GbpCheckPriority = "critical" | "high" | "medium" | "low";
type GbpCheckCategory = "information" | "media" | "reviews" | "posts" | "authority";
type GbpEvidenceType  = "local" | "gbp_api";
type GbpAuditStatus   = "pending" | "running" | "complete" | "failed";

// ── gbp_audit_snapshots ───────────────────────────────────────────────────────

export const gbpAuditSnapshotsTable = pgTable("gbp_audit_snapshots", {
  id:           uuid("id").primaryKey().defaultRandom(),
  clientId:     text("client_id").notNull(),
  userId:       text("user_id").notNull(),
  status:       text("status").$type<GbpAuditStatus>().notNull().default("pending"),

  // ── Scores ──────────────────────────────────────────────────────────────────
  /** Points earned from "local" evidence checks (Phase 1 max = 41). */
  localScore:   integer("local_score").notNull().default(0),
  /** Maximum local-evidence score (always 41). */
  localMaxScore:integer("local_max_score").notNull().default(0),
  /** Points earned from GBP API checks (Phase 2 max = 59, 0 when not connected). */
  apiScore:     integer("api_score").notNull().default(0),
  /** Maximum GBP API score (59 when API connected, 0 when data_pending). */
  apiMaxScore:  integer("api_max_score").notNull().default(0),
  /** Total points earned across all checks (localScore + apiScore). */
  overallScore: integer("overall_score").notNull().default(0),
  /** Total possible score including data_pending checks (always 100). */
  maxScore:     integer("max_score").notNull().default(100),

  // ── Check summary ────────────────────────────────────────────────────────────
  checksPassed:  integer("checks_passed").notNull().default(0),
  checksWarning: integer("checks_warning").notNull().default(0),
  checksFailed:  integer("checks_failed").notNull().default(0),
  checksPending: integer("checks_pending").notNull().default(0),

  // ── GBP connection state captured at audit time ───────────────────────────
  locationName:  text("location_name"),
  locationTitle: text("location_title"),
  gbpConnected:  boolean("gbp_connected").notNull().default(false),

  // ── Error ─────────────────────────────────────────────────────────────────
  errorMessage:  text("error_message"),

  // ── Timing ────────────────────────────────────────────────────────────────
  startedAt:    timestamp("started_at",   { withTimezone: true }).notNull().defaultNow(),
  completedAt:  timestamp("completed_at", { withTimezone: true }),
  createdAt:    timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at",   { withTimezone: true }).notNull().defaultNow(),
});

export type GbpAuditSnapshot       = typeof gbpAuditSnapshotsTable.$inferSelect;
export type InsertGbpAuditSnapshot  = typeof gbpAuditSnapshotsTable.$inferInsert;

// ── gbp_audit_checks ──────────────────────────────────────────────────────────

export const gbpAuditChecksTable = pgTable("gbp_audit_checks", {
  id:             uuid("id").primaryKey().defaultRandom(),
  /** FK → gbp_audit_snapshots.id (stored as text for raw-SQL bootstrap safety). */
  snapshotId:     text("snapshot_id").notNull(),
  /** Always included on every table — tenant isolation. */
  clientId:       text("client_id").notNull(),

  category:       text("category").$type<GbpCheckCategory>().notNull(),
  checkKey:       text("check_key").notNull(),
  checkLabel:     text("check_label").notNull(),

  /** "local" = evaluated from existing DB data; "gbp_api" = needs GBP Business Information API. */
  evidenceType:   text("evidence_type").$type<GbpEvidenceType>().notNull().default("local"),

  status:         text("status").$type<GbpCheckStatus>().notNull().default("data_pending"),
  score:          integer("score").notNull().default(0),
  maxScore:       integer("max_score").notNull().default(0),
  priority:       text("priority").$type<GbpCheckPriority>().notNull().default("medium"),

  /** Human-readable description of what was found. */
  currentValue:   text("current_value"),
  /** Actionable recommendation shown in the UI. */
  recommendation: text("recommendation"),
  /** Raw evidence preserved for debugging. */
  rawData:        jsonb("raw_data").notNull().default({}),

  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GbpAuditCheck      = typeof gbpAuditChecksTable.$inferSelect;
export type InsertGbpAuditCheck = typeof gbpAuditChecksTable.$inferInsert;
