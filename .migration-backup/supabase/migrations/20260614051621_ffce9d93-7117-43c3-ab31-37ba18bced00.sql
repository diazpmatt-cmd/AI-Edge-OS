ALTER TABLE public.article_drafts
  ADD COLUMN IF NOT EXISTS verified_live_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_code integer,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;