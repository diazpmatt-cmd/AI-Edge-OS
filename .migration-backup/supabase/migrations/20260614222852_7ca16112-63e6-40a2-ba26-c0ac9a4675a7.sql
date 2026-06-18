
CREATE TABLE public.article_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id text NOT NULL REFERENCES public.article_drafts(id) ON DELETE CASCADE,
  channel text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  published_url text,
  published_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_assets TO anon, authenticated;
GRANT ALL ON public.article_assets TO service_role;
ALTER TABLE public.article_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read article assets" ON public.article_assets FOR SELECT USING (true);
CREATE POLICY "Public can insert article assets" ON public.article_assets FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update article assets" ON public.article_assets FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete article assets" ON public.article_assets FOR DELETE USING (true);

CREATE TRIGGER article_assets_set_updated_at
BEFORE UPDATE ON public.article_assets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX article_assets_article_id_idx ON public.article_assets(article_id);
CREATE INDEX article_assets_channel_idx ON public.article_assets(channel);
