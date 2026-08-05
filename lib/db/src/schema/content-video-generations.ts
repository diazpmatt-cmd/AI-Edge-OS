import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const contentVideoGenerationsTable = pgTable("content_video_generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull(),
  userId: text("user_id").notNull(),
  postId: uuid("post_id").notNull(),
  provider: text("provider").notNull().default("native_ffmpeg"),
  voiceModel: text("voice_model").notNull().default("gpt-4o-mini-tts"),
  format: text("format").notNull().default("youtube_16_9"),
  narration: text("narration").notNull(),
  sourceImages: jsonb("source_images").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("pending"),
  storageKey: text("storage_key"),
  durationSeconds: integer("duration_seconds"),
  failureReason: text("failure_reason"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  clientIdempotencyUnique: uniqueIndex("content_video_generations_client_idempotency_uniq")
    .on(table.clientId, table.idempotencyKey),
}));

export type ContentVideoGeneration = typeof contentVideoGenerationsTable.$inferSelect;
