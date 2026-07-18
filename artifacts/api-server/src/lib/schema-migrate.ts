import { pool } from "@workspace/db";

/**
 * MAINTENANCE: This file is the production bootstrap for ALL application tables not
 * covered by another dedicated startup bootstrap. It MUST be kept in sync with the
 * canonical Drizzle schema in lib/db/src/schema/. Every change to that schema that
 * adds a table or column must have a corresponding additive statement here.
 * All DDL must remain strictly additive and non-destructive — only
 * CREATE TABLE IF NOT EXISTS and ALTER TABLE … ADD COLUMN IF NOT EXISTS are
 * permitted; DROP, RENAME, ALTER TYPE, and TRUNCATE are never allowed.
 *
 * Comprehensive startup schema migration.
 *
 * Creates every application table that does NOT have its own dedicated
 * startup bootstrap (agent_tasks, integration_health_history, clients,
 * client_services/topics/rules, and all discovery_* tables are handled
 * by their respective bootstrap functions).
 *
 * Design rules:
 *  - Every statement is CREATE TABLE IF NOT EXISTS or
 *    ALTER TABLE ... ADD COLUMN IF NOT EXISTS — zero destructive DDL.
 *  - No FK constraints on tables that never had them (discovery, content_assets).
 *    Backlink tables retain their FK constraints from the original migration SQL.
 *  - Must be called from index.ts before app.ts is imported, so all IIFEs
 *    that depend on these tables (client-resolver seed, service-registry seed)
 *    fire after the schema is ready.
 *  - Any failure propagates as a thrown error. The caller must process.exit(1).
 */
export async function migrateSchema(): Promise<void> {

  // ── Keywords ───────────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS keywords (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT        NOT NULL,
      keyword    TEXT        NOT NULL,
      volume     INTEGER     NOT NULL DEFAULT 0,
      difficulty TEXT        NOT NULL DEFAULT 'Medium',
      intent     TEXT        NOT NULL DEFAULT 'Local',
      service    TEXT        NOT NULL,
      city       TEXT        NOT NULL,
      state      TEXT        NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Articles ───────────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS article_drafts (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          TEXT        NOT NULL,
      title            TEXT        NOT NULL,
      keyword          TEXT        NOT NULL,
      keyword_id       UUID,
      service          TEXT        NOT NULL,
      project          TEXT        NOT NULL,
      body             TEXT        NOT NULL DEFAULT '',
      meta_title       TEXT        NOT NULL DEFAULT '',
      meta_description TEXT        NOT NULL DEFAULT '',
      slug             TEXT        NOT NULL,
      status           TEXT        NOT NULL DEFAULT 'scheduled',
      scheduled_for    TIMESTAMPTZ,
      published_at     TIMESTAMPTZ,
      published_url    TEXT,
      generated_at     TIMESTAMPTZ,
      verified_live_at TIMESTAMPTZ,
      last_status_code INTEGER,
      last_checked_at  TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS article_assets (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT        NOT NULL,
      article_id    UUID        NOT NULL,
      channel       TEXT        NOT NULL,
      body          TEXT        NOT NULL DEFAULT '',
      status        TEXT        NOT NULL DEFAULT 'draft',
      published_url TEXT,
      published_at  TIMESTAMPTZ,
      error_message TEXT,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT article_assets_article_channel UNIQUE (article_id, channel)
    );
  `);

  // ── Content Packages ───────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS content_packages (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT        NOT NULL,
      business_name TEXT        NOT NULL,
      service       TEXT        NOT NULL,
      city          TEXT        NOT NULL,
      state         TEXT        NOT NULL,
      keyword       TEXT        NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS content_assets (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      package_id UUID        NOT NULL,
      channel    TEXT        NOT NULL,
      label      TEXT        NOT NULL DEFAULT '',
      body       TEXT        NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT content_assets_pkg_channel UNIQUE (package_id, channel)
    );
  `);

  // ── Social Connections (OAuth tokens stored as application data) ───────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_connections (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT        NOT NULL,
      provider      TEXT        NOT NULL,
      account_name  TEXT,
      account_id    TEXT,
      access_token  TEXT,
      refresh_token TEXT,
      expires_at    TIMESTAMPTZ,
      metadata      TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT social_connections_user_provider UNIQUE (user_id, provider)
    );
  `);

  // ── Leads ──────────────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name   TEXT        NOT NULL DEFAULT '',
      source        TEXT        NOT NULL DEFAULT 'telnyx',
      phone         TEXT        NOT NULL DEFAULT '',
      customer_name TEXT,
      message       TEXT,
      event_type    TEXT        NOT NULL DEFAULT 'sms',
      status        TEXT        NOT NULL DEFAULT 'new',
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Social Posts ───────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_posts (
      id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              TEXT        NOT NULL,
      client_name          TEXT        NOT NULL DEFAULT '',
      platforms            TEXT        NOT NULL DEFAULT '[]',
      image_data           TEXT,
      caption              TEXT        NOT NULL DEFAULT '',
      cta_type             TEXT        NOT NULL DEFAULT 'none',
      cta_value            TEXT,
      scheduled_at         TIMESTAMPTZ,
      status               TEXT        NOT NULL DEFAULT 'draft',
      published_at         TIMESTAMPTZ,
      error_message        TEXT,
      caption_facebook     TEXT,
      caption_google       TEXT,
      ai_city              TEXT,
      ai_topic             TEXT,
      ai_angle             TEXT,
      content_score        TEXT,
      best_platform        TEXT,
      image_recommendation TEXT,
      duplicate_risk       TEXT,
      video_url            TEXT,
      youtube_title        TEXT,
      youtube_privacy      TEXT,
      youtube_video_id     TEXT,
      youtube_tags         TEXT,
      audio_url            TEXT,
      matched_image_id     TEXT,
      matched_image_url    TEXT,
      matched_image_score  TEXT,
      impressions          TEXT,
      reach                TEXT,
      clicks               TEXT,
      likes                TEXT,
      comments             TEXT,
      shares               TEXT,
      engagement_score     TEXT,
      service_id           TEXT,
      campaign_goal        TEXT,
      audience_id          TEXT,
      weekly_plan_id       TEXT,
      approval_status      TEXT,
      approved_at          TIMESTAMPTZ,
      approved_by          TEXT,
      generation_run_id    TEXT,
      revenue_weight       TEXT,
      urgency              TEXT,
      time_slot            TEXT,
      slot_index           TEXT,
      campaign_slot_key    TEXT,
      posts_per_day        TEXT,
      published_by         TEXT,
      cancelled_at         TIMESTAMPTZ,
      cancelled_by         TEXT,
      cancel_reason        TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Auto Content Settings ──────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auto_content_settings (
      id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id               TEXT        NOT NULL UNIQUE,
      client_name           TEXT        NOT NULL DEFAULT 'Bed Bugs & Beyond',
      industry              TEXT,
      service_areas         TEXT        NOT NULL DEFAULT '[]',
      topics                TEXT        NOT NULL DEFAULT '[]',
      frequency             TEXT        NOT NULL DEFAULT 'every_other_day',
      posting_times         TEXT        NOT NULL DEFAULT '["08:00","12:00","17:00"]',
      platforms             TEXT        NOT NULL DEFAULT '["facebook"]',
      approval_mode         TEXT        NOT NULL DEFAULT 'auto_schedule',
      cta_text              TEXT        NOT NULL DEFAULT 'Call Now — (251) 324-9090',
      cta_preference        TEXT,
      tone_style            TEXT,
      post_angles           TEXT,
      auto_generate_enabled TEXT,
      engine_paused         TEXT,
      used_combos           TEXT        NOT NULL DEFAULT '[]',
      last_generated_at     TIMESTAMPTZ,
      next_generation_at    TIMESTAMPTZ,
      campaign_mix          TEXT,
      selected_audiences    TEXT,
      autopilot_enabled     TEXT        DEFAULT 'false',
      generation_day        TEXT,
      generation_time       TEXT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Image Assets ───────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS image_assets (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     TEXT        NOT NULL,
      file_url    TEXT        NOT NULL,
      file_name   TEXT        NOT NULL,
      topic_tags  TEXT        NOT NULL DEFAULT '[]',
      city_tags   TEXT        NOT NULL DEFAULT '[]',
      category    TEXT        NOT NULL DEFAULT '',
      upload_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Assessments ────────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assessments (
      id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      business_name         TEXT        NOT NULL,
      industry              TEXT        NOT NULL,
      city                  TEXT        NOT NULL,
      state                 TEXT        NOT NULL,
      website_url           TEXT,
      gbp_url               TEXT,
      facebook_url          TEXT,
      instagram_url         TEXT,
      contact_name          TEXT        NOT NULL,
      contact_email         TEXT        NOT NULL,
      contact_phone         TEXT,
      contact_method        TEXT,
      score_overall         INTEGER,
      score_lead_recovery   INTEGER,
      score_local_presence  INTEGER,
      score_ai_visibility   INTEGER,
      score_review_strength INTEGER,
      status                TEXT        NOT NULL DEFAULT 'new',
      notes                 TEXT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── GorillaDesk ────────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gorilladesk_jobs (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id   TEXT        UNIQUE,
      customer_id   TEXT,
      status        TEXT        NOT NULL DEFAULT 'scheduled',
      service_type  TEXT,
      amount_cents  INTEGER     NOT NULL DEFAULT 0,
      project_id    TEXT        NOT NULL DEFAULT 'bed-bugs-and-beyond',
      completed_at  TIMESTAMPTZ,
      scheduled_for TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gorilladesk_customers (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id      TEXT        UNIQUE,
      name             TEXT        NOT NULL,
      email            TEXT,
      phone            TEXT,
      is_recurring     BOOLEAN     NOT NULL DEFAULT FALSE,
      lead_source      TEXT,
      active_services  INTEGER     NOT NULL DEFAULT 0,
      first_service_at TIMESTAMPTZ,
      last_service_at  TIMESTAMPTZ,
      project_id       TEXT        NOT NULL DEFAULT 'bed-bugs-and-beyond',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gorilladesk_payments (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id  TEXT        UNIQUE,
      job_id       TEXT,
      amount_cents INTEGER     NOT NULL DEFAULT 0,
      method       TEXT        NOT NULL DEFAULT 'other',
      status       TEXT        NOT NULL DEFAULT 'outstanding',
      paid_at      TIMESTAMPTZ,
      project_id   TEXT        NOT NULL DEFAULT 'bed-bugs-and-beyond',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gorilladesk_lead_sources (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name          TEXT        NOT NULL,
      job_count     INTEGER     NOT NULL DEFAULT 0,
      revenue_cents INTEGER     NOT NULL DEFAULT 0,
      period        TEXT        NOT NULL,
      project_id    TEXT        NOT NULL DEFAULT 'bed-bugs-and-beyond',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gorilladesk_metric_snapshots (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id  TEXT        NOT NULL DEFAULT 'bed-bugs-and-beyond',
      period      TEXT        NOT NULL,
      metric_type TEXT        NOT NULL,
      data        TEXT        NOT NULL,
      source      TEXT        NOT NULL DEFAULT 'manual_import',
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Reviews ────────────────────────────────────────────────────────────────
  // review_requests and review_platform_stats use SERIAL (auto-increment) PKs.
  // review_platform_stats.platform has a UNIQUE constraint — this was the
  // original drizzle-kit push blocker, but CREATE TABLE IF NOT EXISTS is safe.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS review_requests (
      id            SERIAL      PRIMARY KEY,
      customer_name TEXT        NOT NULL,
      contact       TEXT        NOT NULL,
      contact_type  TEXT        NOT NULL,
      platform      TEXT        NOT NULL DEFAULT 'google',
      template_id   TEXT,
      sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status        TEXT        NOT NULL DEFAULT 'sent',
      notes         TEXT
    );

    CREATE TABLE IF NOT EXISTS review_platform_stats (
      id             SERIAL         PRIMARY KEY,
      platform       TEXT           NOT NULL UNIQUE,
      review_count   INTEGER        NOT NULL DEFAULT 0,
      average_rating NUMERIC(3,2)   NOT NULL DEFAULT 0.00,
      last_updated   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    );
  `);

  // ── Calls ──────────────────────────────────────────────────────────────────
  // These tables may have been created by a prior raw-SQL bootstrap with a
  // subset of the current schema columns. CREATE TABLE IF NOT EXISTS handles
  // the case where the table doesn't exist; ADD COLUMN IF NOT EXISTS handles
  // the case where it exists but with fewer columns.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      call_sid       TEXT,
      caller_number  TEXT        NOT NULL DEFAULT '',
      called_number  TEXT        NOT NULL DEFAULT '',
      call_type      TEXT        NOT NULL DEFAULT 'incoming',
      digits_pressed TEXT,
      duration_secs  INTEGER,
      outcome        TEXT        NOT NULL DEFAULT 'pending',
      recording_url  TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_sid       TEXT`);
  await pool.query(`ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_number  TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE calls ADD COLUMN IF NOT EXISTS called_number  TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_type      TEXT NOT NULL DEFAULT 'incoming'`);
  await pool.query(`ALTER TABLE calls ADD COLUMN IF NOT EXISTS digits_pressed TEXT`);
  await pool.query(`ALTER TABLE calls ADD COLUMN IF NOT EXISTS duration_secs  INTEGER`);
  await pool.query(`ALTER TABLE calls ADD COLUMN IF NOT EXISTS outcome        TEXT NOT NULL DEFAULT 'pending'`);
  await pool.query(`ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_url  TEXT`);
  await pool.query(`ALTER TABLE calls ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE calls ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

  // ── SMS Conversations ──────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_conversations (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_number TEXT        NOT NULL DEFAULT '',
      direction       TEXT        NOT NULL DEFAULT 'inbound',
      message         TEXT        NOT NULL DEFAULT '',
      message_id      TEXT,
      status          TEXT        NOT NULL DEFAULT 'received',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE sms_conversations ADD COLUMN IF NOT EXISTS customer_number TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE sms_conversations ADD COLUMN IF NOT EXISTS direction       TEXT NOT NULL DEFAULT 'inbound'`);
  await pool.query(`ALTER TABLE sms_conversations ADD COLUMN IF NOT EXISTS message         TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE sms_conversations ADD COLUMN IF NOT EXISTS message_id      TEXT`);
  await pool.query(`ALTER TABLE sms_conversations ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'received'`);
  await pool.query(`ALTER TABLE sms_conversations ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

  // ── Client Onboarding ──────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_onboarding (
      id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      business_name        TEXT        NOT NULL,
      industry             TEXT        NOT NULL DEFAULT '',
      website              TEXT        DEFAULT '',
      main_phone           TEXT        NOT NULL DEFAULT '',
      forwarding_phone     TEXT        DEFAULT '',
      email                TEXT        DEFAULT '',
      city                 TEXT        DEFAULT '',
      state                TEXT        DEFAULT '',
      zip                  TEXT        DEFAULT '',
      service_radius       TEXT        DEFAULT '',
      business_hours       TEXT        DEFAULT 'Mon–Fri 8am–6pm',
      emergency_service    BOOLEAN     DEFAULT FALSE,
      appointment_required BOOLEAN     DEFAULT FALSE,
      services             TEXT        DEFAULT '',
      logo_url             TEXT        DEFAULT '',
      primary_color        TEXT        DEFAULT '#00AEEF',
      secondary_color      TEXT        DEFAULT '#C0C0C0',
      brand_tone           TEXT        DEFAULT 'professional',
      modules_enabled      TEXT        DEFAULT '[]',
      status               TEXT        NOT NULL DEFAULT 'draft',
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── AI Visibility ──────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_visibility_audits (
      id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id             TEXT        NOT NULL DEFAULT 'default',
      business_name         TEXT        NOT NULL DEFAULT '',
      overall_score         INTEGER     NOT NULL DEFAULT 0,
      search_score          INTEGER     NOT NULL DEFAULT 0,
      maps_score            INTEGER     NOT NULL DEFAULT 0,
      ai_search_score       INTEGER     NOT NULL DEFAULT 0,
      authority_score       INTEGER     NOT NULL DEFAULT 0,
      review_score          INTEGER     NOT NULL DEFAULT 0,
      competitor_gap_score  INTEGER     NOT NULL DEFAULT 0,
      channels_json         TEXT        NOT NULL DEFAULT '[]',
      competitors_json      TEXT        NOT NULL DEFAULT '[]',
      recommendations_json  TEXT        NOT NULL DEFAULT '[]',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Audit Exports ──────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_exports (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id       TEXT        NOT NULL,
      export_type     TEXT        NOT NULL,
      recipient_email TEXT,
      exported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Revenue Attribution ────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS revenue_attribution (
      id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id             TEXT,
      client_id           TEXT        NOT NULL,
      customer_name       TEXT        NOT NULL,
      phone               TEXT,
      lead_source         TEXT        NOT NULL,
      status              TEXT        NOT NULL DEFAULT 'pending',
      revenue             NUMERIC(10,2),
      service_type        TEXT,
      notes               TEXT,
      gorilladesk_job_id  TEXT,
      matched_at          TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── AI Receptionist Settings ───────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_receptionist_settings (
      id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id           TEXT        NOT NULL UNIQUE,
      business_name       TEXT        NOT NULL DEFAULT 'My Business',
      transfer_phone      TEXT        NOT NULL DEFAULT '+12513249090',
      greeting_script     TEXT,
      callback_message    TEXT,
      voicemail_message   TEXT,
      text_routing_message TEXT,
      custom_greeting_url TEXT,
      voice_style         TEXT        NOT NULL DEFAULT 'Polly.Joanna',
      business_hours_json TEXT,
      after_hours_mode    TEXT        NOT NULL DEFAULT 'voicemail',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Local Presence ─────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS local_presence_profiles (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id     TEXT        NOT NULL UNIQUE,
      business_name TEXT        NOT NULL DEFAULT '',
      phone         TEXT,
      website       TEXT,
      address       TEXT,
      city          TEXT,
      state         TEXT,
      zip           TEXT,
      nap_json      TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS local_presence_channels (
      id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id            TEXT        NOT NULL,
      channel_name         TEXT        NOT NULL,
      status               TEXT        NOT NULL DEFAULT 'not_started',
      score                INTEGER     NOT NULL DEFAULT 0,
      listing_url          TEXT,
      verification_status  TEXT,
      recommended_action   TEXT,
      metadata_json        TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT local_presence_channels_client_channel UNIQUE (client_id, channel_name)
    );
  `);

  // ── Asset Library ──────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assets (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT        NOT NULL,
      client_id     TEXT        NOT NULL DEFAULT '',
      brand         TEXT        NOT NULL DEFAULT '',
      asset_type    TEXT        NOT NULL DEFAULT '',
      name          TEXT        NOT NULL,
      file_url      TEXT        NOT NULL DEFAULT '',
      thumbnail_url TEXT        NOT NULL DEFAULT '',
      mime_type     TEXT        NOT NULL DEFAULT '',
      file_size     INTEGER     NOT NULL DEFAULT 0,
      tags          TEXT        NOT NULL DEFAULT '[]',
      is_favorite   BOOLEAN     NOT NULL DEFAULT FALSE,
      source_module TEXT        NOT NULL DEFAULT '',
      metadata      TEXT        NOT NULL DEFAULT '{}',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS asset_collections (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     TEXT        NOT NULL,
      client_id   TEXT        NOT NULL DEFAULT '',
      name        TEXT        NOT NULL,
      description TEXT        NOT NULL DEFAULT '',
      brand       TEXT        NOT NULL DEFAULT '',
      cover_url   TEXT        NOT NULL DEFAULT '',
      metadata    TEXT        NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS asset_collection_items (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      collection_id UUID        NOT NULL,
      asset_id      UUID        NOT NULL,
      sort_order    INTEGER     NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS asset_tags (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT        NOT NULL,
      tag        TEXT        NOT NULL,
      color      TEXT        NOT NULL DEFAULT '#00AEEF',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS asset_usage_events (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT        NOT NULL,
      asset_id      UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
      asset_type    TEXT        NOT NULL DEFAULT '',
      event_type    TEXT        NOT NULL DEFAULT '',
      source_module TEXT        NOT NULL DEFAULT '',
      metadata      TEXT        NOT NULL DEFAULT '{}',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Platform Deliveries ────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_deliveries (
      id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id             UUID        NOT NULL,
      user_id             TEXT        NOT NULL,
      platform            TEXT        NOT NULL,
      status              TEXT        NOT NULL DEFAULT 'pending',
      attempt_number      INTEGER     NOT NULL DEFAULT 1,
      attempt_id          TEXT,
      external_post_id    TEXT,
      external_post_url   TEXT,
      api_response_status INTEGER,
      published_at        TIMESTAMPTZ,
      failed_at           TIMESTAMPTZ,
      error_message       TEXT,
      error_code          TEXT,
      retry_allowed       BOOLEAN     NOT NULL DEFAULT TRUE,
      retry_count         INTEGER     NOT NULL DEFAULT 0,
      approved_by         TEXT,
      published_by        TEXT,
      metadata            TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Backlinks ──────────────────────────────────────────────────────────────
  // SQL taken verbatim from lib/db/migrations/0006 and 0007 — all constraints,
  // FK references, and the immutable-evidence trigger are preserved.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS backlink_prospects (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL, prospect_type TEXT NOT NULL,
      domain TEXT NOT NULL, page_url TEXT, display_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT ck_backlink_prospect_type CHECK (prospect_type IN ('domain','page','directory','organization','partnership','other')),
      CONSTRAINT uq_backlink_prospects_id_client UNIQUE (id, client_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_backlink_prospects_client_domain_page
      ON backlink_prospects(client_id, domain, COALESCE(page_url, ''));
    CREATE INDEX IF NOT EXISTS idx_backlink_prospects_client_domain
      ON backlink_prospects(client_id, domain);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS backlink_evidence (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL, prospect_id TEXT NOT NULL,
      source_domain TEXT NOT NULL, source_url TEXT NOT NULL, target_url TEXT, competitor_url TEXT,
      category TEXT NOT NULL, service_id TEXT, providers JSONB NOT NULL DEFAULT '[]', provider_metadata JSONB NOT NULL DEFAULT '{}',
      discovered_at TIMESTAMPTZ NOT NULL, freshness_days INTEGER NOT NULL,
      local_relevance INTEGER NOT NULL, service_relevance INTEGER NOT NULL, competitor_frequency INTEGER NOT NULL,
      relationship_accessibility INTEGER NOT NULL, editorial_requirements INTEGER NOT NULL,
      estimated_effort INTEGER NOT NULL, authority INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_backlink_evidence_id_client UNIQUE (id, client_id),
      CONSTRAINT fk_backlink_evidence_prospect_tenant
        FOREIGN KEY (prospect_id, client_id) REFERENCES backlink_prospects(id, client_id)
    );
    CREATE INDEX IF NOT EXISTS idx_backlink_evidence_prospect_client
      ON backlink_evidence(prospect_id, client_id, discovered_at DESC, id);
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION reject_backlink_evidence_update()
      RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'backlink_evidence observations are immutable'; END; $$;
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_backlink_evidence_immutable'
      ) THEN
        CREATE TRIGGER trg_backlink_evidence_immutable
          BEFORE UPDATE ON backlink_evidence
          FOR EACH ROW EXECUTE FUNCTION reject_backlink_evidence_update();
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS backlink_opportunities (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL, prospect_id TEXT NOT NULL,
      category TEXT NOT NULL, service_id TEXT,
      potential_value INTEGER NOT NULL CHECK (potential_value BETWEEN 0 AND 100),
      attainability   INTEGER NOT NULL CHECK (attainability   BETWEEN 0 AND 100),
      rationale TEXT NOT NULL CHECK (char_length(rationale) <= 2000),
      recommended_action TEXT NOT NULL CHECK (char_length(recommended_action) <= 1000),
      evidence_ids JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_backlink_opportunities_id_client UNIQUE (id, client_id),
      CONSTRAINT fk_backlink_opportunity_prospect_tenant
        FOREIGN KEY (prospect_id, client_id) REFERENCES backlink_prospects(id, client_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_backlink_opportunities_client_prospect_category_service
      ON backlink_opportunities(client_id, prospect_id, category, COALESCE(service_id, ''));
    CREATE INDEX IF NOT EXISTS idx_backlink_opportunities_client_rank
      ON backlink_opportunities(client_id, attainability DESC, potential_value DESC, id);
    CREATE INDEX IF NOT EXISTS idx_backlink_opportunities_client_category
      ON backlink_opportunities(client_id, category);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS backlink_workflows (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL, opportunity_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'discovered',
      owner_id TEXT CHECK (owner_id IS NULL OR char_length(owner_id) <= 200),
      next_action TEXT CHECK (next_action IS NULL OR char_length(next_action) <= 1000),
      due_at TIMESTAMPTZ,
      outcome_summary TEXT CHECK (outcome_summary IS NULL OR char_length(outcome_summary) <= 2000),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      CONSTRAINT ck_backlink_workflow_status
        CHECK (status IN ('discovered','reviewing','approved','pursuing','won','rejected','expired')),
      CONSTRAINT uq_backlink_workflows_id_client UNIQUE (id, client_id),
      CONSTRAINT uq_backlink_workflows_opportunity_client UNIQUE (opportunity_id, client_id),
      CONSTRAINT fk_backlink_workflow_opportunity_tenant
        FOREIGN KEY (opportunity_id, client_id) REFERENCES backlink_opportunities(id, client_id)
    );
    CREATE INDEX IF NOT EXISTS idx_backlink_workflows_client_status
      ON backlink_workflows(client_id, status, opportunity_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS backlink_workflow_events (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL, workflow_id TEXT NOT NULL,
      opportunity_id TEXT NOT NULL,
      sequence INTEGER NOT NULL CHECK (sequence > 0),
      from_status TEXT, to_status TEXT NOT NULL,
      actor_id TEXT CHECK (actor_id IS NULL OR char_length(actor_id) <= 200),
      reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 1000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_backlink_workflow_events_id_client UNIQUE (id, client_id),
      CONSTRAINT uq_backlink_workflow_events_workflow_sequence UNIQUE (workflow_id, client_id, sequence),
      CONSTRAINT fk_backlink_event_workflow_tenant
        FOREIGN KEY (workflow_id, client_id) REFERENCES backlink_workflows(id, client_id),
      CONSTRAINT fk_backlink_event_opportunity_tenant
        FOREIGN KEY (opportunity_id, client_id) REFERENCES backlink_opportunities(id, client_id),
      CONSTRAINT ck_backlink_event_to_status
        CHECK (to_status IN ('discovered','reviewing','approved','pursuing','won','rejected','expired')),
      CONSTRAINT ck_backlink_event_from_status
        CHECK (from_status IS NULL OR from_status IN ('discovered','reviewing','approved','pursuing','won','rejected','expired'))
    );
    CREATE INDEX IF NOT EXISTS idx_backlink_workflow_events_opportunity_client
      ON backlink_workflow_events(opportunity_id, client_id, sequence);
  `);

  await pool.query(`
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
      CONSTRAINT uq_backlink_ingestion_runs_identity
        UNIQUE (client_id, provider_id, provider_revision, mode, input_fingerprint),
      CONSTRAINT ck_backlink_ingestion_capabilities CHECK (
        jsonb_typeof(capabilities) = 'array' AND jsonb_array_length(capabilities) <= 8 AND
        capabilities <@ '["referring_domains","link_intersections","brand_mentions","broken_links","authority_metrics","resource_page_discovery","citation_directory_discovery","partnership_organization_discovery"]'::JSONB
      ),
      CONSTRAINT ck_backlink_ingestion_fingerprint
        CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_backlink_ingestion_attempt CHECK (attempt_count > 0),
      CONSTRAINT ck_backlink_ingestion_failure_stage
        CHECK (failure_stage IS NULL OR failure_stage IN ('provider','preparation','prospect','evidence','opportunity','workflow','initial_event','finalization')),
      CONSTRAINT ck_backlink_ingestion_failure_code
        CHECK (failure_code IS NULL OR failure_code IN ('provider_failed','validation_failed','persistence_failed','finalization_failed')),
      CONSTRAINT ck_backlink_ingestion_terminal_time
        CHECK ((status = 'running' AND completed_at IS NULL) OR (status IN ('succeeded','failed') AND completed_at IS NOT NULL)),
      CONSTRAINT ck_backlink_ingestion_failure
        CHECK ((status = 'failed' AND failure_stage IS NOT NULL AND failure_code IS NOT NULL) OR (status <> 'failed' AND failure_stage IS NULL AND failure_code IS NULL)),
      CONSTRAINT ck_backlink_ingestion_result_counts
        CHECK ((status = 'succeeded' AND prospect_count IS NOT NULL AND evidence_count IS NOT NULL AND opportunity_count IS NOT NULL AND workflow_count IS NOT NULL AND result_summary IS NOT NULL) OR (status <> 'succeeded' AND prospect_count IS NULL AND evidence_count IS NULL AND opportunity_count IS NULL AND workflow_count IS NULL AND result_summary IS NULL))
    );
    CREATE INDEX IF NOT EXISTS idx_backlink_ingestion_runs_client_started
      ON backlink_ingestion_runs(client_id, started_at DESC, id);
    CREATE INDEX IF NOT EXISTS idx_backlink_ingestion_runs_client_status
      ON backlink_ingestion_runs(client_id, status, started_at);
  `);

  // ── GBP Audit Engine ───────────────────────────────────────────────────────
  // Canonical production DDL for GBP audit tables.  This is the single source
  // of truth for CREATE TABLE.  If you add a column to lib/db/src/schema/gbp-audit.ts
  // you MUST also add it here in the CREATE TABLE AND add an ALTER TABLE guard
  // below so existing deployments pick it up without a manual migration.
  //
  // routes/gbp-audit.ts holds complementary ALTER TABLE guards only — it no
  // longer duplicates the CREATE TABLE DDL.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gbp_audit_snapshots (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id       TEXT        NOT NULL,
      user_id         TEXT        NOT NULL,
      status          TEXT        NOT NULL DEFAULT 'pending',
      local_score     INTEGER     NOT NULL DEFAULT 0,
      local_max_score INTEGER     NOT NULL DEFAULT 0,
      api_score       INTEGER     NOT NULL DEFAULT 0,
      api_max_score   INTEGER     NOT NULL DEFAULT 0,
      overall_score   INTEGER     NOT NULL DEFAULT 0,
      max_score       INTEGER     NOT NULL DEFAULT 100,
      checks_passed   INTEGER     NOT NULL DEFAULT 0,
      checks_warning  INTEGER     NOT NULL DEFAULT 0,
      checks_failed   INTEGER     NOT NULL DEFAULT 0,
      checks_pending  INTEGER     NOT NULL DEFAULT 0,
      location_name   TEXT,
      location_title  TEXT,
      gbp_connected   BOOLEAN     NOT NULL DEFAULT FALSE,
      error_message   TEXT,
      started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- ALTER TABLE guards: add any column that may be absent on tables created
    -- by an older version of this bootstrap (idempotent; ADD COLUMN IF NOT EXISTS).
    ALTER TABLE gbp_audit_snapshots
      ADD COLUMN IF NOT EXISTS api_score     INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS api_max_score INTEGER NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS gbp_audit_checks (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      snapshot_id     TEXT        NOT NULL,
      client_id       TEXT        NOT NULL,
      category        TEXT        NOT NULL,
      check_key       TEXT        NOT NULL,
      check_label     TEXT        NOT NULL,
      evidence_type   TEXT        NOT NULL DEFAULT 'local',
      status          TEXT        NOT NULL DEFAULT 'data_pending',
      score           INTEGER     NOT NULL DEFAULT 0,
      max_score       INTEGER     NOT NULL DEFAULT 0,
      priority        TEXT        NOT NULL DEFAULT 'medium',
      current_value   TEXT,
      recommendation  TEXT,
      raw_data        JSONB       NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS gbp_audit_snapshots_client_id_created_at
      ON gbp_audit_snapshots(client_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS gbp_audit_checks_snapshot_id
      ON gbp_audit_checks(snapshot_id);

    CREATE INDEX IF NOT EXISTS gbp_audit_checks_client_id
      ON gbp_audit_checks(client_id);
  `);

  // ── GBP Optimization Opportunities (Phase 3) ───────────────────────────────
  // Stores one row per check per audit snapshot: priority-scored, grouped, and
  // trend-tagged improvement opportunities derived by gbp-optimization-engine.ts.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gbp_optimization_opportunities (
      id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      snapshot_id               TEXT        NOT NULL,
      client_id                 TEXT        NOT NULL,
      check_key                 TEXT        NOT NULL,
      category                  TEXT        NOT NULL,
      title                     TEXT        NOT NULL,
      description               TEXT        NOT NULL DEFAULT '',
      severity                  TEXT        NOT NULL DEFAULT 'Medium',
      priority_score            INTEGER     NOT NULL DEFAULT 0,
      estimated_impact          INTEGER     NOT NULL DEFAULT 0,
      implementation_difficulty TEXT        NOT NULL DEFAULT 'Moderate',
      confidence                INTEGER     NOT NULL DEFAULT 0,
      evidence                  TEXT        NOT NULL DEFAULT '',
      recommended_action        TEXT        NOT NULL DEFAULT '',
      supporting_google_guideline TEXT,
      group_name                TEXT        NOT NULL DEFAULT 'needs_attention',
      trend                     TEXT,
      time_estimate             TEXT,
      ai_fix_available          BOOLEAN     NOT NULL DEFAULT FALSE,
      check_status              TEXT        NOT NULL DEFAULT 'fail',
      resolved                  BOOLEAN     NOT NULL DEFAULT FALSE,
      resolved_at               TIMESTAMPTZ,
      created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS gbp_opt_client_snap
      ON gbp_optimization_opportunities(client_id, snapshot_id);

    CREATE INDEX IF NOT EXISTS gbp_opt_snapshot_priority
      ON gbp_optimization_opportunities(snapshot_id, priority_score DESC);
  `);

  // ── GBP Audit Schedules (Phase 5) ─────────────────────────────────────────
  // Tracks per-client auto-audit schedule and alert preferences.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gbp_audit_schedules (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id       TEXT        NOT NULL UNIQUE,
      user_id         TEXT        NOT NULL DEFAULT '',
      enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
      cadence_hours   INTEGER     NOT NULL DEFAULT 168,
      next_run_at     TIMESTAMPTZ,
      last_run_at     TIMESTAMPTZ,
      alert_on_drop   INTEGER     NOT NULL DEFAULT 10,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS gbp_audit_schedules_next_run
      ON gbp_audit_schedules(next_run_at)
      WHERE enabled = TRUE;
  `);

  // ── GBP Alert Log (Phase 5) ────────────────────────────────────────────────
  // One row per alert event: score drops, new critical/high issues, etc.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gbp_alert_log (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id     TEXT        NOT NULL,
      snapshot_id   TEXT,
      alert_type    TEXT        NOT NULL,
      message       TEXT        NOT NULL,
      severity      TEXT        NOT NULL DEFAULT 'info',
      score_before  INTEGER,
      score_after   INTEGER,
      acknowledged  BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS gbp_alert_log_client
      ON gbp_alert_log(client_id, created_at DESC);
  `);

  console.log("[SCHEMA] Core schema migration complete");
}
