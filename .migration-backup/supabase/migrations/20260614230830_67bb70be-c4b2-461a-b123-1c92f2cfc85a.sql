
-- 1. clients table
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  phone TEXT,
  email TEXT,
  service_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  social_urls JSONB NOT NULL DEFAULT '{}'::jsonb,
  logo_url TEXT,
  brand_voice TEXT,
  timezone TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own clients"
  ON public.clients
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX clients_user_id_idx ON public.clients(user_id);
CREATE UNIQUE INDEX clients_one_default_per_user
  ON public.clients(user_id) WHERE is_default = true;

CREATE TRIGGER clients_set_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Add nullable client_id FK to existing tables
ALTER TABLE public.article_drafts
  ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX article_drafts_client_id_idx ON public.article_drafts(client_id);

ALTER TABLE public.article_assets
  ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX article_assets_client_id_idx ON public.article_assets(client_id);

ALTER TABLE public.content_packages
  ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX content_packages_client_id_idx ON public.content_packages(client_id);

ALTER TABLE public.content_assets
  ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX content_assets_client_id_idx ON public.content_assets(client_id);

ALTER TABLE public.keywords
  ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX keywords_client_id_idx ON public.keywords(client_id);

ALTER TABLE public.social_connections
  ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX social_connections_client_id_idx ON public.social_connections(client_id);

-- 3. social_connections OAuth metadata
ALTER TABLE public.social_connections
  ADD COLUMN scope TEXT,
  ADD COLUMN token_type TEXT,
  ADD COLUMN provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN last_error TEXT,
  ADD COLUMN last_verified_at TIMESTAMPTZ;

-- Make (user_id, provider, account_id) unique so we can upsert by real provider account.
-- account_id can be null for legacy rows; partial unique handles that.
CREATE UNIQUE INDEX social_connections_user_provider_account_idx
  ON public.social_connections(user_id, provider, account_id)
  WHERE account_id IS NOT NULL;
