/**
 * platform_deliveries — per-post per-platform delivery records.
 *
 * One row per (post × platform × attempt). The first attempt is created
 * when a post enters the "publishing" state. Retry creates a new row with
 * attempt_number incremented, preserving the full attempt history.
 *
 * Status values:
 *   pending            — delivery record created, not yet dispatched
 *   queued             — in the internal publish queue
 *   scheduled          — has a future scheduled_at; waiting for worker
 *   publishing         — adapter call in-flight
 *   published          — adapter returned confirmed external success
 *   published_with_warning — partial/degraded success (e.g. image missing)
 *   failed             — adapter returned error or threw
 *   cancelled          — cancelled before publishing
 *   skipped            — platform skipped due to media/validation requirements
 *
 * attempt_id is derived deterministically: sha256(post_id::platform::attempt_number).
 * This provides idempotency — if the same attempt_id is seen twice, the second
 * call is rejected without calling the platform adapter again.
 *
 * No access tokens, credentials, or secrets are stored here.
 * metadata stores only safe response fields (IDs, URLs, HTTP status codes).
 */

import { pgTable, text, uuid, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const platformDeliveriesTable = pgTable("platform_deliveries", {
  id:              uuid("id").primaryKey().defaultRandom(),
  postId:          uuid("post_id").notNull(),
  userId:          text("user_id").notNull(),
  platform:        text("platform").notNull(),

  // Delivery lifecycle
  status:          text("status").notNull().default("pending"),
  attemptNumber:   integer("attempt_number").notNull().default(1),
  attemptId:       text("attempt_id"),

  // External platform result
  externalPostId:  text("external_post_id"),
  externalPostUrl: text("external_post_url"),
  apiResponseStatus: integer("api_response_status"),

  // Timestamps
  publishedAt:     timestamp("published_at",  { withTimezone: true }),
  failedAt:        timestamp("failed_at",     { withTimezone: true }),

  // Error details (sanitized — no credentials, no raw tokens)
  errorMessage:    text("error_message"),
  errorCode:       text("error_code"),
  retryAllowed:    boolean("retry_allowed").notNull().default(true),
  retryCount:      integer("retry_count").notNull().default(0),

  // Actors (Clerk userIds or "scheduler")
  approvedBy:      text("approved_by"),
  publishedBy:     text("published_by"),

  // Safe platform-specific data (JSON, secrets stripped)
  metadata:        text("metadata"),

  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformDelivery       = typeof platformDeliveriesTable.$inferSelect;
export type PlatformDeliveryInsert = typeof platformDeliveriesTable.$inferInsert;

// Canonical delivery status values
export const DELIVERY_STATUSES = [
  "pending",
  "queued",
  "scheduled",
  "publishing",
  "published",
  "published_with_warning",
  "failed",
  "cancelled",
  "skipped",
] as const;
export type DeliveryStatus = typeof DELIVERY_STATUSES[number];
