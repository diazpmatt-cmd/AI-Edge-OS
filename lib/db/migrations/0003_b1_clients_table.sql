-- Migration 0003: Phase B1 Canonical Clients Table
-- Creates the canonical client identity table for multi-tenant content resolution.
-- Backfills the BB&B pilot client from the existing auto_content_settings row.
--
-- All statements are idempotent (CREATE IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- autopilot_enabled is NOT modified — the safety gate in auto_content_settings
-- remains entirely unchanged by this migration.
--
-- NOTE: This migration is also applied via raw SQL bootstrap in
-- artifacts/api-server/src/lib/client-resolver.ts (same pattern as
-- diagnostics.ts), because drizzle-kit push is blocked by a pre-existing
-- review_platform_stats unique constraint conflict in this environment.

CREATE TABLE IF NOT EXISTS clients (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT        NOT NULL,
  slug           TEXT        NOT NULL,
  client_name    TEXT        NOT NULL,
  industry       TEXT        NOT NULL DEFAULT 'pest_control',
  industry_label TEXT        NOT NULL DEFAULT 'pest control',
  region         TEXT        NOT NULL DEFAULT '',
  service_areas  TEXT        NOT NULL DEFAULT '[]',
  timezone       TEXT        NOT NULL DEFAULT 'America/Chicago',
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique indexes enforce one client per tenant and globally unique slugs
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_slug    ON clients(slug);

-- BB&B backfill: one canonical client record derived from the existing
-- auto_content_settings row for Bed Bugs & Beyond.
-- Filtered by client_name + industry so only the BB&B row is selected.
-- ON CONFLICT DO NOTHING ensures full idempotency on repeated runs.
INSERT INTO clients (
  user_id, slug, client_name, industry, industry_label,
  region, service_areas, timezone, is_active
)
SELECT
  acs.user_id,
  'bed-bugs-and-beyond',
  'Bed Bugs & Beyond',
  'pest_control',
  'pest control',
  'Gulf Coast of Alabama (Baldwin County)',
  '["Foley, AL","Daphne, AL","Loxley, AL","Fairhope, AL","Gulf Shores, AL","Orange Beach, AL","Summerdale, AL","Spanish Fort, AL","Elberta, AL","Lillian, AL","Perdido Beach, AL"]',
  'America/Chicago',
  TRUE
FROM auto_content_settings acs
WHERE acs.client_name = 'Bed Bugs & Beyond'
  AND acs.industry = 'pest_control'
LIMIT 1
ON CONFLICT DO NOTHING;
