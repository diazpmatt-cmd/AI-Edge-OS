
CREATE TABLE public.content_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project text NOT NULL DEFAULT 'bed-bugs-and-beyond',
  business_name text NOT NULL DEFAULT '',
  service text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  keyword text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_packages TO anon, authenticated;
GRANT ALL ON public.content_packages TO service_role;
ALTER TABLE public.content_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read packages" ON public.content_packages FOR SELECT USING (true);
CREATE POLICY "Public can insert packages" ON public.content_packages FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update packages" ON public.content_packages FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete packages" ON public.content_packages FOR DELETE USING (true);

CREATE TRIGGER content_packages_set_updated_at
BEFORE UPDATE ON public.content_packages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.content_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.content_packages(id) ON DELETE CASCADE,
  channel text NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  published_url text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_assets TO anon, authenticated;
GRANT ALL ON public.content_assets TO service_role;
ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read assets" ON public.content_assets FOR SELECT USING (true);
CREATE POLICY "Public can insert assets" ON public.content_assets FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update assets" ON public.content_assets FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete assets" ON public.content_assets FOR DELETE USING (true);

CREATE TRIGGER content_assets_set_updated_at
BEFORE UPDATE ON public.content_assets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX content_assets_package_id_idx ON public.content_assets(package_id);
