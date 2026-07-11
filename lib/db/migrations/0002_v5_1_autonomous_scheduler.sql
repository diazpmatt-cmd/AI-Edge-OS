-- Migration 0002: V5.1 Autonomous Scheduler
-- Adds generation run tracking to social_posts and autopilot configuration
-- to auto_content_settings.
-- Safe to run on existing databases (ADD COLUMN IF NOT EXISTS).

-- social_posts: V5.1 autonomous generation tracking
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS generation_run_id  TEXT,
  ADD COLUMN IF NOT EXISTS revenue_weight     TEXT,
  ADD COLUMN IF NOT EXISTS urgency            TEXT;

-- auto_content_settings: V5.1 autonomous scheduler configuration
-- autopilot_enabled defaults to 'false' — no tenant is auto-enrolled.
-- Must be explicitly set to 'true' per tenant after approval.
ALTER TABLE auto_content_settings
  ADD COLUMN IF NOT EXISTS autopilot_enabled  TEXT DEFAULT 'false',
  ADD COLUMN IF NOT EXISTS generation_day     TEXT,
  ADD COLUMN IF NOT EXISTS generation_time    TEXT;
