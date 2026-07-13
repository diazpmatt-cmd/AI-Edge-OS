-- Phase C8R-2: tenant-safe backlink persistence and workflow foundation.
-- Additive/idempotent only. Evidence rows are append-only and immutable.

CREATE TABLE IF NOT EXISTS backlink_prospects (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, prospect_type TEXT NOT NULL,
  domain TEXT NOT NULL, page_url TEXT, display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_backlink_prospect_type CHECK (prospect_type IN ('domain','page','directory','organization','partnership','other')),
  CONSTRAINT uq_backlink_prospects_id_client UNIQUE (id, client_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_backlink_prospects_client_domain_page ON backlink_prospects(client_id, domain, COALESCE(page_url, ''));
CREATE INDEX IF NOT EXISTS idx_backlink_prospects_client_domain ON backlink_prospects(client_id, domain);

CREATE TABLE IF NOT EXISTS backlink_evidence (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, prospect_id TEXT NOT NULL,
  source_domain TEXT NOT NULL, source_url TEXT NOT NULL, target_url TEXT, competitor_url TEXT,
  category TEXT NOT NULL, service_id TEXT, providers JSONB NOT NULL DEFAULT '[]', provider_metadata JSONB NOT NULL DEFAULT '{}',
  discovered_at TIMESTAMPTZ NOT NULL, freshness_days INTEGER NOT NULL,
  local_relevance INTEGER NOT NULL, service_relevance INTEGER NOT NULL, competitor_frequency INTEGER NOT NULL,
  relationship_accessibility INTEGER NOT NULL, editorial_requirements INTEGER NOT NULL, estimated_effort INTEGER NOT NULL, authority INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_backlink_evidence_id_client UNIQUE (id, client_id),
  CONSTRAINT fk_backlink_evidence_prospect_tenant FOREIGN KEY (prospect_id, client_id) REFERENCES backlink_prospects(id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_backlink_evidence_prospect_client ON backlink_evidence(prospect_id, client_id, discovered_at DESC, id);

CREATE TABLE IF NOT EXISTS backlink_opportunities (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, prospect_id TEXT NOT NULL, category TEXT NOT NULL, service_id TEXT,
  potential_value INTEGER NOT NULL CHECK (potential_value BETWEEN 0 AND 100),
  attainability INTEGER NOT NULL CHECK (attainability BETWEEN 0 AND 100),
  rationale TEXT NOT NULL CHECK (char_length(rationale) <= 2000),
  recommended_action TEXT NOT NULL CHECK (char_length(recommended_action) <= 1000),
  evidence_ids JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_backlink_opportunities_id_client UNIQUE (id, client_id),
  CONSTRAINT fk_backlink_opportunity_prospect_tenant FOREIGN KEY (prospect_id, client_id) REFERENCES backlink_prospects(id, client_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_backlink_opportunities_client_prospect_category_service ON backlink_opportunities(client_id, prospect_id, category, COALESCE(service_id, ''));
CREATE INDEX IF NOT EXISTS idx_backlink_opportunities_client_rank ON backlink_opportunities(client_id, attainability DESC, potential_value DESC, id);
CREATE INDEX IF NOT EXISTS idx_backlink_opportunities_client_category ON backlink_opportunities(client_id, category);

CREATE TABLE IF NOT EXISTS backlink_workflows (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, opportunity_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'discovered',
  owner_id TEXT CHECK (owner_id IS NULL OR char_length(owner_id) <= 200),
  next_action TEXT CHECK (next_action IS NULL OR char_length(next_action) <= 1000), due_at TIMESTAMPTZ,
  outcome_summary TEXT CHECK (outcome_summary IS NULL OR char_length(outcome_summary) <= 2000), version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ,
  CONSTRAINT ck_backlink_workflow_status CHECK (status IN ('discovered','reviewing','approved','pursuing','won','rejected','expired')),
  CONSTRAINT uq_backlink_workflows_id_client UNIQUE (id, client_id),
  CONSTRAINT uq_backlink_workflows_opportunity_client UNIQUE (opportunity_id, client_id),
  CONSTRAINT fk_backlink_workflow_opportunity_tenant FOREIGN KEY (opportunity_id, client_id) REFERENCES backlink_opportunities(id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_backlink_workflows_client_status ON backlink_workflows(client_id, status, opportunity_id);

CREATE TABLE IF NOT EXISTS backlink_workflow_events (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, workflow_id TEXT NOT NULL, opportunity_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0), from_status TEXT, to_status TEXT NOT NULL,
  actor_id TEXT CHECK (actor_id IS NULL OR char_length(actor_id) <= 200),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 1000), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_backlink_workflow_events_id_client UNIQUE (id, client_id),
  CONSTRAINT uq_backlink_workflow_events_workflow_sequence UNIQUE (workflow_id, client_id, sequence),
  CONSTRAINT fk_backlink_event_workflow_tenant FOREIGN KEY (workflow_id, client_id) REFERENCES backlink_workflows(id, client_id),
  CONSTRAINT fk_backlink_event_opportunity_tenant FOREIGN KEY (opportunity_id, client_id) REFERENCES backlink_opportunities(id, client_id),
  CONSTRAINT ck_backlink_event_to_status CHECK (to_status IN ('discovered','reviewing','approved','pursuing','won','rejected','expired')),
  CONSTRAINT ck_backlink_event_from_status CHECK (from_status IS NULL OR from_status IN ('discovered','reviewing','approved','pursuing','won','rejected','expired'))
);
CREATE INDEX IF NOT EXISTS idx_backlink_workflow_events_opportunity_client ON backlink_workflow_events(opportunity_id, client_id, sequence);

CREATE OR REPLACE FUNCTION reject_backlink_evidence_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'backlink_evidence observations are immutable'; END;
$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_backlink_evidence_immutable') THEN
    CREATE TRIGGER trg_backlink_evidence_immutable BEFORE UPDATE ON backlink_evidence
    FOR EACH ROW EXECUTE FUNCTION reject_backlink_evidence_update();
  END IF;
END $$;
