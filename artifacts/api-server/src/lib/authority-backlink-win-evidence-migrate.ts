import { pool } from "@workspace/db";

export async function migrateAuthorityBacklinkWinEvidence(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authority_backlink_win_evidence (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id TEXT NOT NULL,
      opportunity_id TEXT NOT NULL,
      prospect_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      target_url TEXT NOT NULL,
      notes TEXT,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      verified_at TIMESTAMPTZ,
      verified_by TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_authority_backlink_win_evidence_id_client UNIQUE (id, client_id),
      CONSTRAINT uq_authority_backlink_win_evidence_opportunity_client UNIQUE (opportunity_id, client_id),
      CONSTRAINT fk_authority_backlink_win_evidence_opportunity_tenant
        FOREIGN KEY (opportunity_id, client_id)
        REFERENCES backlink_opportunities(id, client_id),
      CONSTRAINT fk_authority_backlink_win_evidence_prospect_tenant
        FOREIGN KEY (prospect_id, client_id)
        REFERENCES backlink_prospects(id, client_id),
      CONSTRAINT ck_authority_backlink_win_evidence_verification
        CHECK (verification_status IN ('unverified','human_verified','invalid')),
      CONSTRAINT ck_authority_backlink_win_evidence_source
        CHECK (char_length(source_url) BETWEEN 1 AND 2000),
      CONSTRAINT ck_authority_backlink_win_evidence_target
        CHECK (char_length(target_url) BETWEEN 1 AND 2000),
      CONSTRAINT ck_authority_backlink_win_evidence_notes
        CHECK (notes IS NULL OR char_length(notes) <= 4000),
      CONSTRAINT ck_authority_backlink_win_evidence_version CHECK (version > 0),
      CONSTRAINT ck_authority_backlink_win_evidence_verified_pair CHECK (
        (verification_status = 'human_verified'
          AND verified_at IS NOT NULL
          AND verified_by IS NOT NULL)
        OR
        (verification_status <> 'human_verified'
          AND verified_at IS NULL
          AND verified_by IS NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_authority_backlink_win_evidence_opportunity
      ON authority_backlink_win_evidence(client_id, opportunity_id, verification_status, updated_at DESC);
  `);
}
