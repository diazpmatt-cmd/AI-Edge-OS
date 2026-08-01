-- Preserve durable upload metadata across Publishing Center draft save/reopen.
-- Existing records remain valid; unavailable legacy metadata stays nullable.
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS media_filename TEXT,
  ADD COLUMN IF NOT EXISTS media_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS media_file_size INTEGER;
