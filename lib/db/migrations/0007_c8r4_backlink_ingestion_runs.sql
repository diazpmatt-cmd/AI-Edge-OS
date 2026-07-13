-- Phase C8R-4: tenant-scoped transactional backlink ingestion run tracking.
-- Additive only; existing canonical backlink tables and evidence trigger are unchanged.

CREATE TABLE IF NOT EXISTS backlink_ingestion_runs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  provider_id TEXT NOT NULL CHECK (char_length(provider_id) BETWEEN 1 AND 100),
  provider_revision TEXT NOT NULL CHECK (char_length(provider_revision) BETWEEN 1 AND 100),
  mode TEXT NOT NULL CHECK (mode = 'manual'),
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed')),
  capabilities JSONB NOT NULL DEFAULT '[]',
  input_fingerprint TEXT NOT NULL CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  started_at TIMESTAMPTZ NOT NULL,
  attempt_started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  observed_count INTEGER CHECK (observed_count IS NULL OR observed_count >= 0),
  accepted_count INTEGER CHECK (accepted_count IS NULL OR accepted_count >= 0),
  rejected_count INTEGER CHECK (rejected_count IS NULL OR rejected_count >= 0),
  merged_evidence_count INTEGER CHECK (merged_evidence_count IS NULL OR merged_evidence_count >= 0),
  prospect_count INTEGER CHECK (prospect_count IS NULL OR prospect_count >= 0),
  evidence_count INTEGER CHECK (evidence_count IS NULL OR evidence_count >= 0),
  opportunity_count INTEGER CHECK (opportunity_count IS NULL OR opportunity_count >= 0),
  workflow_count INTEGER CHECK (workflow_count IS NULL OR workflow_count >= 0),
  result_summary JSONB,
  failure_stage TEXT,
  failure_code TEXT,
  CONSTRAINT uq_backlink_ingestion_runs_id_client UNIQUE (id, client_id),
  CONSTRAINT uq_backlink_ingestion_runs_identity UNIQUE (client_id, provider_id, provider_revision, mode, input_fingerprint),
  CONSTRAINT ck_backlink_ingestion_capabilities CHECK (
    jsonb_typeof(capabilities) = 'array' AND jsonb_array_length(capabilities) <= 8 AND
    capabilities <@ '["referring_domains","link_intersections","brand_mentions","broken_links","authority_metrics","resource_page_discovery","citation_directory_discovery","partnership_organization_discovery"]'::JSONB
  ),
  CONSTRAINT ck_backlink_ingestion_result_summary_bound CHECK (result_summary IS NULL OR (
    jsonb_typeof(result_summary) = 'object' AND octet_length(result_summary::TEXT) <= 65536 AND
    result_summary ?& ARRAY['observed','accepted','rejected','mergedEvidence','prospectCount','evidenceCount','opportunityCount','workflowCount','prospectIds','evidenceIds','opportunityIds','workflowIds'] AND
    (result_summary - ARRAY['observed','accepted','rejected','mergedEvidence','prospectCount','evidenceCount','opportunityCount','workflowCount','prospectIds','evidenceIds','opportunityIds','workflowIds']) = '{}'::JSONB AND
    (result_summary->>'observed') ~ '^\d+$' AND (result_summary->>'accepted') ~ '^\d+$' AND (result_summary->>'rejected') ~ '^\d+$' AND
    (result_summary->>'mergedEvidence') ~ '^\d+$' AND (result_summary->>'prospectCount') ~ '^\d+$' AND (result_summary->>'evidenceCount') ~ '^\d+$' AND
    (result_summary->>'opportunityCount') ~ '^\d+$' AND (result_summary->>'workflowCount') ~ '^\d+$' AND
    jsonb_typeof(result_summary->'prospectIds') = 'array' AND jsonb_array_length(result_summary->'prospectIds') <= 100 AND
    jsonb_typeof(result_summary->'evidenceIds') = 'array' AND jsonb_array_length(result_summary->'evidenceIds') <= 100 AND
    jsonb_typeof(result_summary->'opportunityIds') = 'array' AND jsonb_array_length(result_summary->'opportunityIds') <= 100 AND
    jsonb_typeof(result_summary->'workflowIds') = 'array' AND jsonb_array_length(result_summary->'workflowIds') <= 100 AND
    NOT jsonb_path_exists(result_summary, '$.prospectIds[*] ? (@.type() != "string")') AND
    NOT jsonb_path_exists(result_summary, '$.evidenceIds[*] ? (@.type() != "string")') AND
    NOT jsonb_path_exists(result_summary, '$.opportunityIds[*] ? (@.type() != "string")') AND
    NOT jsonb_path_exists(result_summary, '$.workflowIds[*] ? (@.type() != "string")') AND
    (result_summary->>'prospectCount')::INTEGER = jsonb_array_length(result_summary->'prospectIds') AND
    (result_summary->>'evidenceCount')::INTEGER = jsonb_array_length(result_summary->'evidenceIds') AND
    (result_summary->>'opportunityCount')::INTEGER = jsonb_array_length(result_summary->'opportunityIds') AND
    (result_summary->>'workflowCount')::INTEGER = jsonb_array_length(result_summary->'workflowIds')
  )),
  CONSTRAINT ck_backlink_ingestion_timestamps CHECK (attempt_started_at >= started_at AND (completed_at IS NULL OR completed_at >= attempt_started_at)),
  CONSTRAINT ck_backlink_ingestion_failure_stage CHECK (failure_stage IS NULL OR failure_stage IN ('provider','preparation','prospect','evidence','opportunity','workflow','initial_event','finalization')),
  CONSTRAINT ck_backlink_ingestion_failure_code CHECK (failure_code IS NULL OR failure_code IN ('provider_failed','validation_failed','persistence_failed','finalization_failed')),
  CONSTRAINT ck_backlink_ingestion_terminal_time CHECK ((status = 'running' AND completed_at IS NULL) OR (status IN ('succeeded','failed') AND completed_at IS NOT NULL)),
  CONSTRAINT ck_backlink_ingestion_failure CHECK ((status = 'failed' AND failure_stage IS NOT NULL AND failure_code IS NOT NULL) OR (status <> 'failed' AND failure_stage IS NULL AND failure_code IS NULL)),
  CONSTRAINT ck_backlink_ingestion_result_counts CHECK ((status = 'succeeded' AND prospect_count IS NOT NULL AND evidence_count IS NOT NULL AND opportunity_count IS NOT NULL AND workflow_count IS NOT NULL AND result_summary IS NOT NULL) OR (status <> 'succeeded' AND prospect_count IS NULL AND evidence_count IS NULL AND opportunity_count IS NULL AND workflow_count IS NULL AND result_summary IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_backlink_ingestion_runs_client_started ON backlink_ingestion_runs(client_id, started_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_backlink_ingestion_runs_client_status ON backlink_ingestion_runs(client_id, status, started_at);
