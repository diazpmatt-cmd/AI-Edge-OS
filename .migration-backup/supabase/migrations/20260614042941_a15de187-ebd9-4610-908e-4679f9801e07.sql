
-- Keywords table
CREATE TABLE public.keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  volume integer NOT NULL DEFAULT 0,
  difficulty text NOT NULL DEFAULT 'Medium',
  intent text NOT NULL DEFAULT 'Local',
  service text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.keywords TO anon, authenticated;
GRANT ALL ON public.keywords TO service_role;

ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read keywords" ON public.keywords FOR SELECT USING (true);
CREATE POLICY "Public can insert keywords" ON public.keywords FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update keywords" ON public.keywords FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete keywords" ON public.keywords FOR DELETE USING (true);

-- Extend article_drafts
ALTER TABLE public.article_drafts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_url text,
  ADD COLUMN IF NOT EXISTS keyword_id uuid REFERENCES public.keywords(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project text NOT NULL DEFAULT 'bed-bugs-and-beyond';

-- Backfill status from existing published flag
UPDATE public.article_drafts SET status = CASE WHEN published THEN 'published' ELSE 'draft' END;
