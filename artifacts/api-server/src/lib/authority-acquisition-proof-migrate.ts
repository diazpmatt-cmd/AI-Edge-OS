import { pool } from "@workspace/db";

export async function migrateAuthorityAcquisitionProofs(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authority_acquisition_proofs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id TEXT NOT NULL,
      opportunity_id TEXT NOT NULL,
      prospect_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      proof_type TEXT NOT NULL,
      source_url TEXT NOT NULL,
      target_url TEXT,
      notes TEXT,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      verified_at TIMESTAMPTZ,
      verified_by TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_authority_acquisition_proofs_id_client UNIQUE (id, client_id),
      CONSTRAINT fk_authority_acquisition_proof_opportunity_tenant
        FOREIGN KEY (opportunity_id, client_id)
        REFERENCES backlink_opportunities(id, client_id),
      CONSTRAINT fk_authority_acquisition_proof_prospect_tenant
        FOREIGN KEY (prospect_id, client_id)
        REFERENCES backlink_prospects(id, client_id),
      CONSTRAINT fk_authority_acquisition_proof_workflow_tenant
        FOREIGN KEY (workflow_id, client_id)
        REFERENCES backlink_workflows(id, client_id),
      CONSTRAINT ck_authority_acquisition_proof_type
        CHECK (proof_type IN ('backlink_live','citation_live','partnership_confirmed','sponsorship_confirmed','guest_post_live','other')),
      CONSTRAINT ck_authority_acquisition_proof_verification
        CHECK (verification_status IN ('unverified','human_verified','invalid')),
      CONSTRAINT ck_authority_acquisition_proof_source
        CHECK (char_length(source_url) BETWEEN 1 AND 2000),
      CONSTRAINT ck_authority_acquisition_proof_target
        CHECK (target_url IS NULL OR char_length(target_url) <= 2000),
      CONSTRAINT ck_authority_acquisition_proof_notes
        CHECK (notes IS NULL OR char_length(notes) <= 4000),
      CONSTRAINT ck_authority_acquisition_proof_version CHECK (version > 0),
      CONSTRAINT ck_authority_acquisition_proof_verified_pair CHECK (
        (verification_status = 'human_verified'
          AND verified_at IS NOT NULL
          AND verified_by IS NOT NULL)
        OR
        (verification_status <> 'human_verified'
          AND verified_at IS NULL
          AND verified_by IS NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_authority_acquisition_proofs_opportunity
      ON authority_acquisition_proofs(client_id, opportunity_id, verification_status, updated_at DESC);
  `);
}
