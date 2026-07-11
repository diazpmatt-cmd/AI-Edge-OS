-- Migration 0001: V5 Campaign Metadata
-- Adds campaign metadata fields to social_posts and autonomous scheduler
-- fields to auto_content_settings.
-- Safe to run on existing databases (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- social_posts: V5 campaign tracking fields
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS service_id        TEXT,
  ADD COLUMN IF NOT EXISTS campaign_goal     TEXT,
  ADD COLUMN IF NOT EXISTS audience_id       TEXT,
  ADD COLUMN IF NOT EXISTS weekly_plan_id    TEXT,
  ADD COLUMN IF NOT EXISTS approval_status   TEXT,
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by       TEXT;

-- auto_content_settings: V5 generation schedule fields
ALTER TABLE auto_content_settings
  ADD COLUMN IF NOT EXISTS next_generation_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_generated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS campaign_mix         TEXT,
  ADD COLUMN IF NOT EXISTS selected_audiences   TEXT;
