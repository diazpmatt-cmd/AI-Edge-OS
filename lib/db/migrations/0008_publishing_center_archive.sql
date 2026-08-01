-- Publishing Center archive visibility is independent from publishing status.
-- Existing records remain active because archived_at is nullable with no default.
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by TEXT;

CREATE INDEX IF NOT EXISTS social_posts_user_archived_created_idx
  ON social_posts (user_id, archived_at, created_at DESC);
