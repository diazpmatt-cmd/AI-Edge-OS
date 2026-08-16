ALTER TABLE client_onboarding
  ADD COLUMN IF NOT EXISTS provisioned_client_id UUID,
  ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS client_onboarding_provisioned_client_id_idx
  ON client_onboarding (provisioned_client_id)
  WHERE provisioned_client_id IS NOT NULL;
