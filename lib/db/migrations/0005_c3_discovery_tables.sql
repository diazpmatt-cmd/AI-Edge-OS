-- Migration 0005: Phase C3 Discovery Persistence Tables
--
-- Four new tables for the canonical discovery engine persistence layer.
-- All statements are idempotent (CREATE IF NOT EXISTS, CREATE ... IF NOT EXISTS).
--
-- NOTE: drizzle-kit push is blocked in this environment by a pre-existing
-- review_platform_stats unique constraint conflict. These tables are also
-- bootstrapped at runtime via bootstrapDiscoveryTables(pool) in
-- lib/db/src/discovery-drizzle-repository.ts (same pattern as diagnostics.ts,
-- client-resolver.ts, and service-registry-loader.ts).
--
-- Design rules:
--   - Text PKs for signals/clusters/opportunities: deterministic Phase C2 IDs.
--     ON CONFLICT DO NOTHING on PK is the idempotency guarantee.
--   - discovery_snapshots PK = runId ("run::{clientId}::{weekLabel}").
--     UNIQUE INDEX on (client_id, week_label) enforces one snapshot per tenant-week.
--   - clientId is present on EVERY table — tenant isolation never relies on
--     globally-unique IDs alone.
--   - No FK constraints (drizzle-kit push blocked; FK adds risk during bootstrap).
--   - JSONB used for arrays, nested objects, and provider payloads.

CREATE TABLE IF NOT EXISTS discovery_snapshots (
  id                              TEXT        PRIMARY KEY,
  client_id                       TEXT        NOT NULL,
  week_label                      TEXT        NOT NULL,
  status                          TEXT        NOT NULL DEFAULT 'running',
  providers_run                   JSONB       NOT NULL DEFAULT '[]',
  provider_failures               JSONB       NOT NULL DEFAULT '[]',
  signals_received                INTEGER     NOT NULL DEFAULT 0,
  signals_accepted                INTEGER     NOT NULL DEFAULT 0,
  signals_blocked                 INTEGER     NOT NULL DEFAULT 0,
  cluster_count                   INTEGER     NOT NULL DEFAULT 0,
  opportunity_count               INTEGER     NOT NULL DEFAULT 0,
  high_priority_opportunity_count INTEGER     NOT NULL DEFAULT 0,
  top_opportunity_score           INTEGER     NOT NULL DEFAULT 0,
  run_duration_ms                 INTEGER     NOT NULL DEFAULT 0,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at                    TIMESTAMPTZ
);

-- One snapshot per client per week.
-- ON CONFLICT on this index supports idempotent upsert by (client_id, week_label).
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_snapshots_client_week
  ON discovery_snapshots(client_id, week_label);

CREATE INDEX IF NOT EXISTS idx_discovery_snapshots_client_id
  ON discovery_snapshots(client_id);

CREATE TABLE IF NOT EXISTS discovery_signals (
  id                  TEXT        PRIMARY KEY,
  snapshot_id         TEXT        NOT NULL,
  client_id           TEXT        NOT NULL,
  signal_type         TEXT        NOT NULL,
  source              TEXT        NOT NULL,
  raw_value           TEXT        NOT NULL,
  normalized_value    TEXT        NOT NULL,
  service_id          TEXT,
  intent              TEXT        NOT NULL,
  volume_estimate     INTEGER,
  difficulty_score    INTEGER,
  seasonal_relevance  INTEGER     NOT NULL DEFAULT 0,
  geographic_scope    TEXT        NOT NULL DEFAULT 'local',
  trend_direction     TEXT        NOT NULL DEFAULT 'unknown',
  competitor_rank     INTEGER,
  citation_found      BOOLEAN,
  evidence_strength   INTEGER     NOT NULL DEFAULT 50,
  raw_provider_data   JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_signals_snapshot_client
  ON discovery_signals(snapshot_id, client_id);

CREATE INDEX IF NOT EXISTS idx_discovery_signals_client_id
  ON discovery_signals(client_id);

CREATE TABLE IF NOT EXISTS discovery_clusters (
  id                  TEXT        PRIMARY KEY,
  snapshot_id         TEXT        NOT NULL,
  client_id           TEXT        NOT NULL,
  cluster_name        TEXT        NOT NULL,
  primary_service_id  TEXT,
  intent              TEXT        NOT NULL,
  signal_ids          JSONB       NOT NULL DEFAULT '[]',
  signal_count        INTEGER     NOT NULL DEFAULT 0,
  total_volume        INTEGER     NOT NULL DEFAULT 0,
  opportunity_score   INTEGER     NOT NULL DEFAULT 0,
  content_angle       TEXT        NOT NULL DEFAULT '',
  seasonal_window     TEXT,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_clusters_snapshot_client
  ON discovery_clusters(snapshot_id, client_id);

CREATE INDEX IF NOT EXISTS idx_discovery_clusters_client_id
  ON discovery_clusters(client_id);

CREATE TABLE IF NOT EXISTS discovery_opportunities (
  id                  TEXT        PRIMARY KEY,
  snapshot_id         TEXT        NOT NULL,
  client_id           TEXT        NOT NULL,
  opportunity_type    TEXT        NOT NULL,
  title               TEXT        NOT NULL,
  description         TEXT        NOT NULL,
  target_engine       TEXT        NOT NULL,
  cluster_id          TEXT,
  service_id          TEXT,
  score_card          JSONB       NOT NULL DEFAULT '{}',
  composite_score     INTEGER     NOT NULL DEFAULT 0,
  priority            TEXT        NOT NULL DEFAULT 'medium',
  status              TEXT        NOT NULL DEFAULT 'pending',
  assigned_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_opportunities_snapshot_client
  ON discovery_opportunities(snapshot_id, client_id);

CREATE INDEX IF NOT EXISTS idx_discovery_opportunities_client_id
  ON discovery_opportunities(client_id);
