import { pool } from "@workspace/db";

export async function migrateAuthorityTargetContacts(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authority_target_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id TEXT NOT NULL,
      opportunity_id TEXT NOT NULL,
      prospect_id TEXT NOT NULL,
      organization_name TEXT NOT NULL,
      contact_name TEXT,
      role_title TEXT,
      contact_method TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      contact_url TEXT,
      source_url TEXT,
      notes TEXT,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      verified_at TIMESTAMPTZ,
      verified_by TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_authority_target_contacts_id_client UNIQUE (id, client_id),
      CONSTRAINT fk_authority_target_contact_opportunity_tenant
        FOREIGN KEY (opportunity_id, client_id)
        REFERENCES backlink_opportunities(id, client_id),
      CONSTRAINT fk_authority_target_contact_prospect_tenant
        FOREIGN KEY (prospect_id, client_id)
        REFERENCES backlink_prospects(id, client_id),
      CONSTRAINT ck_authority_target_contact_method
        CHECK (contact_method IN ('email','phone','contact_form','social','other')),
      CONSTRAINT ck_authority_target_contact_verification
        CHECK (verification_status IN ('unverified','human_verified','invalid')),
      CONSTRAINT ck_authority_target_contact_org
        CHECK (char_length(organization_name) BETWEEN 1 AND 300),
      CONSTRAINT ck_authority_target_contact_name
        CHECK (contact_name IS NULL OR char_length(contact_name) <= 300),
      CONSTRAINT ck_authority_target_contact_role
        CHECK (role_title IS NULL OR char_length(role_title) <= 300),
      CONSTRAINT ck_authority_target_contact_email
        CHECK (email IS NULL OR char_length(email) <= 320),
      CONSTRAINT ck_authority_target_contact_phone
        CHECK (phone IS NULL OR char_length(phone) <= 80),
      CONSTRAINT ck_authority_target_contact_url
        CHECK (contact_url IS NULL OR char_length(contact_url) <= 2000),
      CONSTRAINT ck_authority_target_contact_source
        CHECK (source_url IS NULL OR char_length(source_url) <= 2000),
      CONSTRAINT ck_authority_target_contact_notes
        CHECK (notes IS NULL OR char_length(notes) <= 4000),
      CONSTRAINT ck_authority_target_contact_path
        CHECK (email IS NOT NULL OR phone IS NOT NULL OR contact_url IS NOT NULL),
      CONSTRAINT ck_authority_target_contact_version CHECK (version > 0),
      CONSTRAINT ck_authority_target_contact_verified_pair CHECK (
        (verification_status = 'human_verified'
          AND verified_at IS NOT NULL
          AND verified_by IS NOT NULL
          AND source_url IS NOT NULL)
        OR
        (verification_status <> 'human_verified'
          AND verified_at IS NULL
          AND verified_by IS NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_authority_target_contacts_opportunity
      ON authority_target_contacts(client_id, opportunity_id, verification_status, updated_at DESC);
  `);
}
