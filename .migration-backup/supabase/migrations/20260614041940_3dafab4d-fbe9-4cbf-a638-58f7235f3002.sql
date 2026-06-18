CREATE TABLE public.article_drafts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  keyword TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  meta_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT false,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_drafts TO anon, authenticated;
GRANT ALL ON public.article_drafts TO service_role;

ALTER TABLE public.article_drafts ENABLE ROW LEVEL SECURITY;

-- MVP prototype: shared demo workspace, no auth yet. Anyone can read/write drafts.
CREATE POLICY "Public can read drafts" ON public.article_drafts FOR SELECT USING (true);
CREATE POLICY "Public can insert drafts" ON public.article_drafts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update drafts" ON public.article_drafts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete drafts" ON public.article_drafts FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER article_drafts_set_updated_at
BEFORE UPDATE ON public.article_drafts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();