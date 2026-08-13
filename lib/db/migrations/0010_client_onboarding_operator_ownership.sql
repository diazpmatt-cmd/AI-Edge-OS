ALTER TABLE client_onboarding
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT;

CREATE INDEX IF NOT EXISTS client_onboarding_created_by_user_id_idx
  ON client_onboarding (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;
