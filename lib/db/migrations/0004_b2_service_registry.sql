-- Phase B2: Canonical Service Registry Schema
-- Idempotent — safe to run repeatedly.
-- Seed data is NOT in this file; it is applied via the TypeScript bootstrap
-- IIFE in artifacts/api-server/src/lib/service-registry-loader.ts using
-- BBB_SERVICES as the authoritative source of truth (no transcription risk).

CREATE TABLE IF NOT EXISTS client_services (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_key             TEXT        NOT NULL,
  display_name            TEXT        NOT NULL,
  short_name              TEXT,
  category                TEXT        NOT NULL,
  description             TEXT        NOT NULL DEFAULT '',
  status                  TEXT        NOT NULL DEFAULT 'active',

  -- capability flags
  allow_ai_generation     BOOLEAN     NOT NULL DEFAULT TRUE,
  allow_booking           BOOLEAN     NOT NULL DEFAULT TRUE,
  allow_cta               BOOLEAN     NOT NULL DEFAULT TRUE,
  allow_publishing        BOOLEAN     NOT NULL DEFAULT TRUE,
  allow_recommendation    BOOLEAN     NOT NULL DEFAULT TRUE,

  -- JSON text arrays
  supported_audiences     TEXT        NOT NULL DEFAULT '[]',
  campaign_goals          TEXT        NOT NULL DEFAULT '[]',
  allowed_content_angles  TEXT        NOT NULL DEFAULT '[]',
  prohibited_claims       TEXT        NOT NULL DEFAULT '[]',
  differentiators         TEXT        NOT NULL DEFAULT '[]',

  -- selection weights / scheduling
  priority                INTEGER     NOT NULL DEFAULT 5,
  revenue_weight          INTEGER     NOT NULL DEFAULT 5,
  content_frequency_weight INTEGER    NOT NULL DEFAULT 5,
  urgency                 TEXT        NOT NULL DEFAULT 'medium',
  seasonality             TEXT,

  -- AI prompt
  prompt_rule_prefix      TEXT,
  notes                   TEXT        NOT NULL DEFAULT '',
  sort_order              INTEGER     NOT NULL DEFAULT 0,
  is_active               BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_services_client_key
  ON client_services(client_id, service_key);

CREATE INDEX IF NOT EXISTS idx_client_services_client_id
  ON client_services(client_id);

CREATE TABLE IF NOT EXISTS client_service_topics (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id            UUID        NOT NULL REFERENCES client_services(id) ON DELETE CASCADE,
  alias                 TEXT        NOT NULL,
  normalized_alias      TEXT        NOT NULL,
  is_primary            BOOLEAN     NOT NULL DEFAULT FALSE,
  weekly_eligible       BOOLEAN     NOT NULL DEFAULT TRUE,
  default_topic_eligible BOOLEAN   NOT NULL DEFAULT TRUE,
  prohibited_wording    TEXT,
  preferred_wording     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_service_topics_service_alias
  ON client_service_topics(service_id, normalized_alias);

CREATE INDEX IF NOT EXISTS idx_client_service_topics_service_id
  ON client_service_topics(service_id);

CREATE TABLE IF NOT EXISTS client_registry_rules (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID        NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  system_business_rules TEXT        NOT NULL DEFAULT '',
  registry_version      INTEGER     NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_registry_rules_client_id
  ON client_registry_rules(client_id);
