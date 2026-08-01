import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const socialPostsTable = pgTable("social_posts", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       text("user_id").notNull(),
  clientId:     text("client_id"),
  clientName:   text("client_name").notNull().default(""),
  platforms:    text("platforms").notNull().default("[]"),
  imageData:    text("image_data"),
  mediaFilename: text("media_filename"),
  mediaMimeType: text("media_mime_type"),
  mediaFileSize: integer("media_file_size"),
  caption:      text("caption").notNull().default(""),
  ctaType:      text("cta_type").notNull().default("none"),
  ctaValue:     text("cta_value"),
  scheduledAt:  timestamp("scheduled_at", { withTimezone: true }),
  status:       text("status").notNull().default("draft"),
  publishedAt:  timestamp("published_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  captionFacebook: text("caption_facebook"),
  captionGoogle:   text("caption_google"),
  aiCity:       text("ai_city"),
  aiTopic:      text("ai_topic"),
  aiAngle:      text("ai_angle"),
  contentScore:        text("content_score"),
  bestPlatform:        text("best_platform"),
  imageRecommendation: text("image_recommendation"),
  duplicateRisk:       text("duplicate_risk"),
  // YouTube / video publishing
  videoUrl:       text("video_url"),
  youtubeTitle:   text("youtube_title"),    // explicit video title; falls back to caption[0..100]
  youtubePrivacy: text("youtube_privacy"),  // 'public' | 'unlisted' | 'private'; defaults to 'public'
  youtubeVideoId: text("youtube_video_id"), // provider video ID stored after a successful upload
  youtubeTags:    text("youtube_tags"),     // JSON array of tag strings e.g. '["bed bugs","Baldwin County"]'
  // Media assets (object storage paths starting with /objects/ or legacy /api/uploads/ URLs)
  audioUrl:       text("audio_url"),        // MP3 source asset path — stored for future use, not directly publishable
  // V4: Auto Image Attachment
  matchedImageId:    text("matched_image_id"),
  matchedImageUrl:   text("matched_image_url"),
  matchedImageScore: text("matched_image_score"),
  // V4: Performance Tracking
  impressions:     text("impressions"),
  reach:           text("reach"),
  clicks:          text("clicks"),
  likes:           text("likes"),
  comments:        text("comments"),
  shares:          text("shares"),
  engagementScore: text("engagement_score"),
  // V5: Campaign Metadata — sourced from canonical BB&B service registry
  serviceId:      text("service_id"),      // canonical serviceId from BBB_SERVICES registry
  campaignGoal:   text("campaign_goal"),   // one of CAMPAIGN_GOALS
  audienceId:     text("audience_id"),     // one of BBB_AUDIENCES audienceId
  weeklyPlanId:   text("weekly_plan_id"), // groups posts belonging to the same generated week
  approvalStatus: text("approval_status"), // 'pending_review' | 'approved' | 'rejected' | null
  approvedAt:     timestamp("approved_at", { withTimezone: true }),
  approvedBy:     text("approved_by"),     // Clerk userId of approver
  // V5.1: Autonomous generation tracking
  generationRunId: text("generation_run_id"), // UUID grouping all posts from one scheduler run
  revenueWeight:   text("revenue_weight"),    // registry revenueWeight at generation time
  urgency:         text("urgency"),           // registry urgency at generation time
  // V6: 3-posts-per-day scheduling
  timeSlot:        text("time_slot"),         // 'morning' | 'afternoon' | 'evening'
  slotIndex:       text("slot_index"),        // '0' | '1' | '2' (ordinal within the day)
  campaignSlotKey: text("campaign_slot_key"), // e.g. '2026-W28-monday-morning' — unique slot identifier
  postsPerDay:     text("posts_per_day"),     // '1' | '2' | '3' — how many slots were active when generated
  // V6: Publishing actor tracking
  publishedBy:     text("published_by"),      // Clerk userId or 'scheduler' that triggered Send/Publish
  cancelledAt:     timestamp("cancelled_at",  { withTimezone: true }),
  cancelledBy:     text("cancelled_by"),
  cancelReason:    text("cancel_reason"),
  archivedAt:      timestamp("archived_at", { withTimezone: true }),
  archivedBy:      text("archived_by"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSocialPostSchema = createInsertSchema(socialPostsTable).omit({
  id: true,
  archivedAt: true,
  archivedBy: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type SocialPost = typeof socialPostsTable.$inferSelect;
