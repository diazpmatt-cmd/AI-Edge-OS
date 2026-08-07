import { pool } from "@workspace/db";

/**
 * Dedicated additive bootstrap for Authority outreach draft persistence.
 *
 * This intentionally lives outside schema-migrate.ts so the subsystem owns its
 * two tables without rewriting the global migration monolith. DDL is additive
 * only; no destructive operation is permitted here.
 */
export async function migrateAuthorityOutreachDrafts(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authority_outreach_drafts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id TEXT NOT NULL,
      opportunity_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
      generated_by TEXT NOT NULL DEFAULT 'deterministic_template_v1',
      version INTEGER NOT NULL DEFAULT 1,
      approved_at TIMESTAMPTZ,
      approved_by TEXT,
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_authority_outreach_drafts_id_client UNIQUE (id, client_id),
      CONSTRAINT uq_authority_outreach_drafts_opportunity_client UNIQUE (opportunity_id, client_id),
      CONSTRAINT fk_authority_outreach_draft_opportunity_tenant
        FOREIGN KEY (opportunity_id, client_id)
        REFERENCES backlink_opportunities(id, client_id),
      CONSTRAINT fk_authority_outreach_draft_workflow_tenant
        FOREIGN KEY (workflow_id, client_id)
        REFERENCES backlink_workflows(id, client_id),
      CONSTRAINT ck_authority_outreach_draft_status
        CHECK (status IN ('draft','approved','rejected')),
      CONSTRAINT ck_authority_outreach_draft_subject
        CHECK (char_length(subject) BETWEEN 1 AND 300),
      CONSTRAINT ck_authority_outreach_draft_body
        CHECK (char_length(body) BETWEEN 1 AND 8000),
      CONSTRAINT ck_authority_outreach_draft_version
        CHECK (version > 0),
      CONSTRAINT ck_authority_outreach_draft_provenance
        CHECK (jsonb_typeof(provenance) = 'object' AND octet_length(provenance::text) <= 65536),
      CONSTRAINT ck_authority_outreach_draft_approval_pair
        CHECK (
          (status = 'approved' AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
          OR
          (status <> 'approved' AND approved_at IS NULL AND approved_by IS NULL)
        )
    );

    CREATE INDEX IF NOT EXISTS idx_authority_outreach_drafts_client_status
      ON authority_outreach_drafts(client_id, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS authority_outreach_draft_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      draft_id UUID NOT NULL,
      client_id TEXT NOT NULL,
      opportunity_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
      generated_by TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_authority_outreach_draft_versions_draft_version
        UNIQUE (draft_id, client_id, version),
      CONSTRAINT fk_authority_outreach_draft_version_draft_tenant
        FOREIGN KEY (draft_id, client_id)
        REFERENCES authority_outreach_drafts(id, client_id),
      CONSTRAINT fk_authority_outreach_draft_version_opportunity_tenant
        FOREIGN KEY (opportunity_id, client_id)
        REFERENCES backlink_opportunities(id, client_id),
      CONSTRAINT fk_authority_outreach_draft_version_workflow_tenant
        FOREIGN KEY (workflow_id, client_id)
        REFERENCES backlink_workflows(id, client_id),
      CONSTRAINT ck_authority_outreach_draft_version_action
        CHECK (action IN ('create','save','approve','reopen','reject')),
      CONSTRAINT ck_authority_outreach_draft_version_status
        CHECK (status IN ('draft','approved','rejected')),
      CONSTRAINT ck_authority_outreach_draft_version_subject
        CHECK (char_length(subject) BETWEEN 1 AND 300),
      CONSTRAINT ck_authority_outreach_draft_version_body
        CHECK (char_length(body) BETWEEN 1 AND 8000),
      CONSTRAINT ck_authority_outreach_draft_version_number
        CHECK (version > 0),
      CONSTRAINT ck_authority_outreach_draft_version_provenance
        CHECK (jsonb_typeof(provenance) = 'object' AND octet_length(provenance::text) <= 65536)
    );

    CREATE INDEX IF NOT EXISTS idx_authority_outreach_draft_versions_opportunity
      ON authority_outreach_draft_versions(client_id, opportunity_id, version DESC);
  `);
}
