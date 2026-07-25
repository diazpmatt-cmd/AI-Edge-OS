import { Router } from "express";
import { getAuth } from "@clerk/express";
import { pool, db, eq, and } from "@workspace/db";
import { referralProgramsTable, referralsTable } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import {
  createReferralProgramSchema,
  generateReferralCode,
  getPublicProgramAvailability,
  isSelfReferral,
  normalizeEmail,
  normalizePhone,
  normalizeReferralCode,
  normalizeInvitationDestination,
  publicReferralSubmissionSchema,
  referralContactPreferenceSchema,
  referralDeliveryRequestSchema,
  referralInvitationDraftSchema,
  referralInvitationTemplateSchema,
  referralRewardApprovalSchema,
  referralRewardFulfillmentSchema,
  referralFraudDecisionSchema,
  referralFraudEvaluationSchema,
  referralSubmissionRateLimiter,
  renderReferralInvitation,
} from "../lib/referral-growth.js";
import {
  createReferralDeliveryProviders,
  dispatchReferralDelivery,
  evaluateReferralDeliveryGate,
  resolveReferralDeliveryConfig,
} from "../lib/referral-delivery.js";
import {
  evaluateReferralRisk,
  type ReferralRiskAssessment,
} from "../lib/referral-fraud.js";
import { buildReferralEconomics } from "../lib/referral-reporting.js";
import { scoreReferralCustomerMatch } from "../lib/referral-attribution.js";

const router = Router();

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referral_programs (
        id             SERIAL PRIMARY KEY,
        client_id      TEXT NOT NULL,
        name           TEXT NOT NULL,
        description    TEXT,
        reward_type    TEXT NOT NULL DEFAULT 'credit',
        reward_value   NUMERIC(10,2) NOT NULL DEFAULT 25,
        status         TEXT NOT NULL DEFAULT 'active',
        referral_code  TEXT UNIQUE,
        promo_message  TEXT,
        max_uses       INTEGER,
        uses_count     INTEGER NOT NULL DEFAULT 0,
        expires_at     TIMESTAMPTZ,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS referrals (
        id             SERIAL PRIMARY KEY,
        program_id     INTEGER REFERENCES referral_programs(id),
        client_id      TEXT NOT NULL,
        referrer_name  TEXT NOT NULL,
        referrer_email TEXT,
        referrer_phone TEXT,
        referred_name  TEXT,
        referred_email TEXT,
        referred_phone TEXT,
        status         TEXT NOT NULL DEFAULT 'pending',
        reward_amount  NUMERIC(10,2),
        source         TEXT NOT NULL DEFAULT 'manual',
        referral_code  TEXT,
        notes          TEXT,
        converted_at   TIMESTAMPTZ,
        paid_at        TIMESTAMPTZ,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS referral_invitation_templates (
        id                   SERIAL PRIMARY KEY,
        client_id            TEXT NOT NULL,
        name                 TEXT NOT NULL,
        channel              TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
        subject              TEXT,
        body                 TEXT NOT NULL,
        follow_up_body       TEXT,
        follow_up_delay_days INTEGER NOT NULL DEFAULT 3 CHECK (follow_up_delay_days BETWEEN 1 AND 30),
        status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (client_id, name, channel)
      );
      CREATE TABLE IF NOT EXISTS referral_invitations (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id             TEXT NOT NULL,
        program_id            INTEGER NOT NULL REFERENCES referral_programs(id),
        template_id           INTEGER REFERENCES referral_invitation_templates(id),
        channel               TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
        recipient_name        TEXT NOT NULL,
        recipient_destination TEXT NOT NULL,
        subject               TEXT,
        initial_message       TEXT NOT NULL,
        follow_up_message     TEXT,
        follow_up_delay_days  INTEGER NOT NULL DEFAULT 3 CHECK (follow_up_delay_days BETWEEN 1 AND 30),
        status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'cancelled', 'suppressed')),
        delivery_state        TEXT NOT NULL DEFAULT 'not_dispatched' CHECK (delivery_state = 'not_dispatched'),
        sequence_step         INTEGER NOT NULL DEFAULT 0 CHECK (sequence_step = 0),
        next_action_at        TIMESTAMPTZ,
        consent_source        TEXT NOT NULL,
        consent_at            TIMESTAMPTZ NOT NULL,
        idempotency_key       TEXT NOT NULL,
        created_by_user_id    TEXT NOT NULL,
        approved_by_user_id   TEXT,
        approved_at           TIMESTAMPTZ,
        cancelled_at          TIMESTAMPTZ,
        suppression_reason    TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (client_id, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS referral_contact_preferences (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id       TEXT NOT NULL,
        channel         TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
        destination     TEXT NOT NULL,
        status          TEXT NOT NULL CHECK (status IN ('opted_in', 'opted_out')),
        consent_source  TEXT,
        consent_at      TIMESTAMPTZ,
        opted_out_at    TIMESTAMPTZ,
        reason          TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (client_id, channel, destination)
      );
      CREATE TABLE IF NOT EXISTS referral_delivery_attempts (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id             TEXT NOT NULL,
        invitation_id         UUID NOT NULL REFERENCES referral_invitations(id),
        channel               TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
        recipient_destination TEXT NOT NULL,
        sequence_step         INTEGER NOT NULL DEFAULT 0 CHECK (sequence_step = 0),
        requested_mode        TEXT NOT NULL CHECK (requested_mode IN ('dry_run', 'live')),
        status                TEXT NOT NULL CHECK (
          status IN ('simulated', 'dispatching', 'delivered', 'failed', 'blocked')
        ),
        provider              TEXT,
        provider_message_id   TEXT,
        failure_code          TEXT,
        idempotency_key       TEXT NOT NULL,
        requested_by_user_id  TEXT NOT NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at          TIMESTAMPTZ,
        UNIQUE (client_id, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS referral_reward_ledger (
        id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id                   TEXT NOT NULL,
        referral_id                 INTEGER NOT NULL REFERENCES referrals(id),
        program_id                  INTEGER REFERENCES referral_programs(id),
        reward_type                 TEXT NOT NULL,
        reward_amount               NUMERIC(10,2) NOT NULL CHECK (reward_amount >= 0),
        status                      TEXT NOT NULL DEFAULT 'pending_review' CHECK (
          status IN ('pending_review', 'approved', 'fulfilled', 'rejected')
        ),
        approval_idempotency_key    TEXT,
        approved_by_user_id         TEXT,
        approved_at                 TIMESTAMPTZ,
        fulfillment_idempotency_key TEXT,
        fulfillment_method          TEXT,
        fulfillment_reference       TEXT,
        fulfillment_note            TEXT,
        fulfilled_by_user_id        TEXT,
        fulfilled_at                TIMESTAMPTZ,
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (client_id, referral_id),
        UNIQUE (client_id, approval_idempotency_key),
        UNIQUE (client_id, fulfillment_idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS referral_fraud_reviews (
        id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id                TEXT NOT NULL,
        referral_id              INTEGER NOT NULL REFERENCES referrals(id),
        status                   TEXT NOT NULL DEFAULT 'open' CHECK (
          status IN ('open', 'held', 'cleared', 'rejected')
        ),
        risk_score               INTEGER NOT NULL DEFAULT 0 CHECK (
          risk_score BETWEEN 0 AND 100
        ),
        reasons                  JSONB NOT NULL DEFAULT '[]'::jsonb,
        evidence                 JSONB NOT NULL DEFAULT '{}'::jsonb,
        fingerprint_evaluation   TEXT NOT NULL DEFAULT 'not_available' CHECK (
          fingerprint_evaluation IN ('evaluated', 'not_available')
        ),
        version                  INTEGER NOT NULL DEFAULT 0,
        reviewed_by_user_id      TEXT,
        reviewed_at              TIMESTAMPTZ,
        review_note              TEXT,
        decision_idempotency_key TEXT,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (client_id, referral_id),
        UNIQUE (client_id, decision_idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS referral_fraud_review_events (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id         TEXT NOT NULL,
        review_id         UUID NOT NULL REFERENCES referral_fraud_reviews(id),
        referral_id       INTEGER NOT NULL REFERENCES referrals(id),
        previous_status   TEXT NOT NULL CHECK (
          previous_status IN ('open', 'held', 'cleared', 'rejected')
        ),
        new_status        TEXT NOT NULL CHECK (
          new_status IN ('held', 'cleared', 'rejected')
        ),
        note              TEXT NOT NULL,
        actor_user_id     TEXT NOT NULL,
        idempotency_key   TEXT NOT NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (client_id, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS referral_crm_attributions (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id            TEXT NOT NULL,
        referral_id          INTEGER NOT NULL REFERENCES referrals(id),
        source_system        TEXT NOT NULL DEFAULT 'gorilladesk_sync',
        customer_external_id TEXT NOT NULL,
        status               TEXT NOT NULL DEFAULT 'proposed' CHECK (
          status IN ('proposed', 'confirmed', 'rejected')
        ),
        confidence           INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
        reasons              JSONB NOT NULL DEFAULT '[]'::jsonb,
        measured_revenue     NUMERIC(12,2),
        decided_by_user_id   TEXT,
        decided_at           TIMESTAMPTZ,
        decision_idempotency_key TEXT,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (client_id, referral_id, customer_external_id),
        UNIQUE (client_id, decision_idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS referral_invitations_tenant_status_created
        ON referral_invitations(client_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS referral_contact_preferences_suppression
        ON referral_contact_preferences(client_id, channel, destination, status);
      CREATE INDEX IF NOT EXISTS referral_delivery_attempts_tenant_created
        ON referral_delivery_attempts(client_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS referral_delivery_attempts_live_once
        ON referral_delivery_attempts(client_id, invitation_id, sequence_step)
        WHERE requested_mode = 'live' AND status IN ('dispatching', 'delivered');
      CREATE INDEX IF NOT EXISTS referral_reward_ledger_tenant_status_created
        ON referral_reward_ledger(client_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS referral_fraud_reviews_tenant_status_score
        ON referral_fraud_reviews(client_id, status, risk_score DESC, created_at DESC);
      CREATE INDEX IF NOT EXISTS referral_fraud_events_tenant_review_created
        ON referral_fraud_review_events(client_id, review_id, created_at DESC);
    `);
    console.log("[referrals] tables ready");
    // Production data must originate from real referral activity. Demo seeding is intentionally disabled.
  } catch (err) {
    console.warn("[referrals] bootstrap warning:", err);
  }
})();

async function resolveClient(req: any, res: any): Promise<{ userId: string; clientId: string; clientName: string } | null> {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  let resolved;
  try {
    resolved = await resolveClientContentContextFromDb(userId);
  } catch {
    res.status(500).json({ error: "db_error", message: "Failed to resolve client." });
    return null;
  }
  if (!resolved.found) {
    res.status(404).json({ error: "client_not_found", reason: resolved.reason });
    return null;
  }
  return { userId, clientId: resolved.client.id, clientName: resolved.client.clientName };
}

async function assessReferralRisk(
  client: { query: (sql: string, params?: unknown[]) => Promise<any> },
  clientId: string,
  referralId: number,
): Promise<ReferralRiskAssessment | null> {
  const result = await client.query(
    `
    SELECT
      r.id,
      (
        SELECT COUNT(*)::int
        FROM referrals d
        WHERE d.client_id = r.client_id
          AND d.id <> r.id
          AND (
            (NULLIF(LOWER(TRIM(r.referred_email)), '') IS NOT NULL
              AND LOWER(TRIM(d.referred_email)) = LOWER(TRIM(r.referred_email)))
            OR
            (NULLIF(REGEXP_REPLACE(COALESCE(r.referred_phone, ''), '\\D', '', 'g'), '') IS NOT NULL
              AND REGEXP_REPLACE(COALESCE(d.referred_phone, ''), '\\D', '', 'g')
                = REGEXP_REPLACE(COALESCE(r.referred_phone, ''), '\\D', '', 'g'))
          )
      )::int + 1 AS "duplicateIdentityCount",
      (
        SELECT COUNT(*)::int
        FROM referral_invitations i
        WHERE i.client_id = r.client_id
          AND (
            (i.channel = 'email'
              AND NULLIF(LOWER(TRIM(r.referred_email)), '') IS NOT NULL
              AND i.recipient_destination = LOWER(TRIM(r.referred_email)))
            OR
            (i.channel = 'sms'
              AND NULLIF(REGEXP_REPLACE(COALESCE(r.referred_phone, ''), '\\D', '', 'g'), '') IS NOT NULL
              AND i.recipient_destination
                = RIGHT(REGEXP_REPLACE(COALESCE(r.referred_phone, ''), '\\D', '', 'g'), 10))
          )
      )::int AS "repeatedDestinationCount",
      (
        SELECT COUNT(*)::int
        FROM referrals v
        WHERE v.client_id = r.client_id
          AND v.created_at >= NOW() - INTERVAL '24 hours'
          AND (
            (NULLIF(LOWER(TRIM(r.referrer_email)), '') IS NOT NULL
              AND LOWER(TRIM(v.referrer_email)) = LOWER(TRIM(r.referrer_email)))
            OR
            (NULLIF(REGEXP_REPLACE(COALESCE(r.referrer_phone, ''), '\\D', '', 'g'), '') IS NOT NULL
              AND REGEXP_REPLACE(COALESCE(v.referrer_phone, ''), '\\D', '', 'g')
                = REGEXP_REPLACE(COALESCE(r.referrer_phone, ''), '\\D', '', 'g'))
          )
      )::int AS "recentReferrerCount",
      (
        (NULLIF(LOWER(TRIM(r.referrer_email)), '') IS NOT NULL
          AND LOWER(TRIM(r.referrer_email)) = LOWER(TRIM(r.referred_email)))
        OR
        (NULLIF(REGEXP_REPLACE(COALESCE(r.referrer_phone, ''), '\\D', '', 'g'), '') IS NOT NULL
          AND REGEXP_REPLACE(COALESCE(r.referrer_phone, ''), '\\D', '', 'g')
            = REGEXP_REPLACE(COALESCE(r.referred_phone, ''), '\\D', '', 'g'))
      ) AS "selfReferral",
      (
        SELECT COUNT(*)::int
        FROM referral_reward_ledger rl
        JOIN referrals rr
          ON rr.id = rl.referral_id
         AND rr.client_id = rl.client_id
        WHERE rl.client_id = r.client_id
          AND rl.status IN ('pending_review', 'approved', 'fulfilled')
          AND (
            (NULLIF(LOWER(TRIM(r.referrer_email)), '') IS NOT NULL
              AND LOWER(TRIM(rr.referrer_email)) = LOWER(TRIM(r.referrer_email)))
            OR
            (NULLIF(REGEXP_REPLACE(COALESCE(r.referrer_phone, ''), '\\D', '', 'g'), '') IS NOT NULL
              AND REGEXP_REPLACE(COALESCE(rr.referrer_phone, ''), '\\D', '', 'g')
                = REGEXP_REPLACE(COALESCE(r.referrer_phone, ''), '\\D', '', 'g'))
          )
      )::int AS "activeRewardCount"
    FROM referrals r
    WHERE r.id = $1 AND r.client_id = $2
    LIMIT 1
  `,
    [referralId, clientId],
  );
  const metrics = result.rows[0];
  if (!metrics) return null;
  return evaluateReferralRisk({
    duplicateIdentityCount: metrics.duplicateIdentityCount,
    repeatedDestinationCount: metrics.repeatedDestinationCount,
    recentReferrerCount: metrics.recentReferrerCount,
    selfReferral: Boolean(metrics.selfReferral),
    activeRewardCount: metrics.activeRewardCount,
    // RGE-5 does not collect raw IP addresses or device fingerprints.
    fingerprintCount: null,
  });
}

// ── Public referral enrollment ───────────────────────────────────────────────
// These routes intentionally do not require Clerk authentication. The
// unguessable referral code is resolved to exactly one active program, and the
// program supplies the canonical client_id for every inserted referral.
router.get("/referrals/public/:code", async (req, res) => {
  const code = normalizeReferralCode(req.params.code);
  if (!code) {
    res.status(404).json({ error: "program_not_found" });
    return;
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        rp.id,
        rp.name,
        rp.description,
        rp.reward_type AS "rewardType",
        rp.reward_value AS "rewardValue",
        rp.promo_message AS "promoMessage",
        rp.referral_code AS "referralCode",
        rp.status,
        rp.uses_count AS "usesCount",
        rp.max_uses AS "maxUses",
        rp.expires_at AS "expiresAt",
        c.client_name AS "businessName"
      FROM referral_programs rp
      JOIN clients c ON c.id::text = rp.client_id
      WHERE rp.referral_code = $1
        AND c.is_active = TRUE
      LIMIT 1
    `, [code]);

    const program = rows[0];
    if (!program) {
      res.status(404).json({ error: "program_not_found" });
      return;
    }

    const availability = getPublicProgramAvailability(program);
    if (!availability.available) {
      res.status(410).json({ error: "program_unavailable", reason: availability.reason });
      return;
    }

    const {
      id: _id,
      status: _status,
      usesCount: _usesCount,
      maxUses: _maxUses,
      expiresAt: _expiresAt,
      ...publicProgram
    } = program;
    res.json(publicProgram);
  } catch (err) {
    console.error("[referrals] public program error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/referrals/public/:code", async (req, res) => {
  const code = normalizeReferralCode(req.params.code);
  if (!code) {
    res.status(404).json({ error: "program_not_found" });
    return;
  }

  const rateLimit = referralSubmissionRateLimiter.check(`${code}:${req.ip || req.socket.remoteAddress || "unknown"}`);
  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    res.status(429).json({ error: "rate_limit_exceeded", retryAfterSeconds: rateLimit.retryAfterSeconds });
    return;
  }

  const parsed = publicReferralSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_submission",
      issues: parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })),
    });
    return;
  }
  if (isSelfReferral(parsed.data)) {
    res.status(422).json({ error: "self_referral_not_allowed" });
    return;
  }

  const submission = parsed.data;
  const referredEmail = normalizeEmail(submission.referredEmail);
  const referredPhone = normalizePhone(submission.referredPhone);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`
      SELECT
        rp.id,
        rp.client_id AS "clientId",
        rp.reward_value AS "rewardValue",
        rp.status,
        rp.uses_count AS "usesCount",
        rp.max_uses AS "maxUses",
        rp.expires_at AS "expiresAt"
      FROM referral_programs rp
      JOIN clients c ON c.id::text = rp.client_id
      WHERE rp.referral_code = $1
        AND c.is_active = TRUE
      FOR UPDATE OF rp
    `, [code]);

    const program = rows[0];
    if (!program) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "program_not_found" });
      return;
    }

    const availability = getPublicProgramAvailability(program);
    if (!availability.available) {
      await client.query("ROLLBACK");
      res.status(410).json({ error: "program_unavailable", reason: availability.reason });
      return;
    }

    const duplicate = await client.query(`
      SELECT id
      FROM referrals
      WHERE program_id = $1
        AND (
          ($2::text IS NOT NULL AND LOWER(referred_email) = $2)
          OR
          ($3::text IS NOT NULL AND REGEXP_REPLACE(COALESCE(referred_phone, ''), '\\D', '', 'g') = $3)
        )
      LIMIT 1
    `, [program.id, referredEmail, referredPhone]);
    if (duplicate.rowCount) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "referral_already_submitted" });
      return;
    }

    const inserted = await client.query(`
      INSERT INTO referrals (
        program_id,
        client_id,
        referrer_name,
        referrer_email,
        referrer_phone,
        referred_name,
        referred_email,
        referred_phone,
        status,
        reward_amount,
        source,
        referral_code,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, 'link', $10, $11)
      RETURNING id, status, created_at AS "createdAt"
    `, [
      program.id,
      program.clientId,
      submission.referrerName,
      normalizeEmail(submission.referrerEmail),
      submission.referrerPhone?.trim() || null,
      submission.referredName,
      referredEmail,
      submission.referredPhone?.trim() || null,
      program.rewardValue,
      code,
      submission.notes?.trim() || null,
    ]);

    await client.query(`
      UPDATE referral_programs
      SET uses_count = uses_count + 1, updated_at = NOW()
      WHERE id = $1 AND client_id = $2
    `, [program.id, program.clientId]);
    await client.query("COMMIT");

    res.status(201).json({ ok: true, referral: inserted.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[referrals] public submission error:", err);
    res.status(500).json({ error: "Failed" });
  } finally {
    client.release();
  }
});

// ── RGE-2: invitation templates, consent, approval, and follow-up metadata ───
// Deliberate boundary: these routes do not import a delivery provider and do
// not expose a "send" action. Approval records human intent but leaves every
// row in delivery_state='not_dispatched' for a separately authorized phase.

router.get("/referrals/invitation-templates", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        name,
        channel,
        subject,
        body,
        follow_up_body AS "followUpBody",
        follow_up_delay_days AS "followUpDelayDays",
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM referral_invitation_templates
      WHERE client_id = $1
      ORDER BY status ASC, created_at DESC
    `,
      [auth.clientId],
    );
    res.json(rows);
  } catch (err) {
    console.error("[referrals] invitation template list error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/referrals/invitation-templates", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const parsed = referralInvitationTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_template",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const value = parsed.data;
    const { rows } = await pool.query(
      `
      INSERT INTO referral_invitation_templates (
        client_id, name, channel, subject, body, follow_up_body, follow_up_delay_days
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        name,
        channel,
        subject,
        body,
        follow_up_body AS "followUpBody",
        follow_up_delay_days AS "followUpDelayDays",
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
      [
        auth.clientId,
        value.name,
        value.channel,
        value.subject || null,
        value.body,
        value.followUpBody || null,
        value.followUpDelayDays,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "template_already_exists" });
      return;
    }
    console.error("[referrals] invitation template create error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.patch("/referrals/invitation-templates/:id", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!Number.isInteger(id) || !["active", "archived"].includes(status)) {
    res.status(400).json({ error: "invalid_template_update" });
    return;
  }
  try {
    const { rows } = await pool.query(
      `
      UPDATE referral_invitation_templates
      SET status = $3, updated_at = NOW()
      WHERE id = $1 AND client_id = $2
      RETURNING id, name, channel, status, updated_at AS "updatedAt"
    `,
      [id, auth.clientId, status],
    );
    if (!rows[0]) {
      res.status(404).json({ error: "template_not_found" });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("[referrals] invitation template update error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/referrals/invitations", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const { rows } = await pool.query(
      `
      SELECT
        ri.id,
        ri.program_id AS "programId",
        rp.name AS "programName",
        ri.template_id AS "templateId",
        rit.name AS "templateName",
        ri.channel,
        ri.recipient_name AS "recipientName",
        ri.recipient_destination AS "recipientDestination",
        ri.subject,
        ri.initial_message AS "initialMessage",
        ri.follow_up_message AS "followUpMessage",
        ri.follow_up_delay_days AS "followUpDelayDays",
        ri.status,
        ri.delivery_state AS "deliveryState",
        ri.sequence_step AS "sequenceStep",
        ri.next_action_at AS "nextActionAt",
        ri.consent_source AS "consentSource",
        ri.consent_at AS "consentAt",
        ri.approved_at AS "approvedAt",
        ri.cancelled_at AS "cancelledAt",
        ri.suppression_reason AS "suppressionReason",
        ri.created_at AS "createdAt"
      FROM referral_invitations ri
      JOIN referral_programs rp
        ON rp.id = ri.program_id AND rp.client_id = ri.client_id
      LEFT JOIN referral_invitation_templates rit
        ON rit.id = ri.template_id AND rit.client_id = ri.client_id
      WHERE ri.client_id = $1
      ORDER BY ri.created_at DESC
      LIMIT 250
    `,
      [auth.clientId],
    );
    res.json({
      sendingEnabled: false,
      invitations: rows,
    });
  } catch (err) {
    console.error("[referrals] invitation list error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/referrals/invitations", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const parsed = referralInvitationDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_invitation",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const value = parsed.data;
  const destination = normalizeInvitationDestination(
    value.channel,
    value.channel === "sms" ? value.recipientPhone : value.recipientEmail,
  );
  if (!destination) {
    res.status(400).json({ error: "invalid_destination" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize consent, suppression, and duplicate checks even when no
    // preference row exists yet. This closes the absent-row race between a
    // simultaneous draft and opt-out for the same tenant/contact/channel.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${auth.clientId}:${value.channel}:${destination}`,
    ]);
    const programResult = await client.query(
      `
      SELECT id, referral_code AS "referralCode", status
      FROM referral_programs
      WHERE id = $1 AND client_id = $2
      FOR SHARE
    `,
      [value.programId, auth.clientId],
    );
    const program = programResult.rows[0];
    if (!program || program.status !== "active" || !program.referralCode) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "active_program_not_found" });
      return;
    }

    let template: any = null;
    if (value.templateId) {
      const templateResult = await client.query(
        `
        SELECT id, channel, subject, body, follow_up_body AS "followUpBody",
               follow_up_delay_days AS "followUpDelayDays"
        FROM referral_invitation_templates
        WHERE id = $1 AND client_id = $2 AND status = 'active'
        FOR SHARE
      `,
        [value.templateId, auth.clientId],
      );
      template = templateResult.rows[0];
      if (!template || template.channel !== value.channel) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "active_template_not_found" });
        return;
      }
    }

    const preferenceResult = await client.query(
      `
      SELECT status
      FROM referral_contact_preferences
      WHERE client_id = $1 AND channel = $2 AND destination = $3
      FOR UPDATE
    `,
      [auth.clientId, value.channel, destination],
    );
    if (preferenceResult.rows[0]?.status === "opted_out") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "contact_opted_out" });
      return;
    }

    const idempotentResult = await client.query(
      `
      SELECT
        id,
        program_id AS "programId",
        channel,
        recipient_destination AS "recipientDestination",
        status,
        delivery_state AS "deliveryState",
        created_at AS "createdAt"
      FROM referral_invitations
      WHERE client_id = $1 AND idempotency_key = $2
      LIMIT 1
    `,
      [auth.clientId, value.idempotencyKey],
    );
    if (idempotentResult.rows[0]) {
      const existing = idempotentResult.rows[0];
      if (
        existing.programId !== value.programId ||
        existing.channel !== value.channel ||
        existing.recipientDestination !== destination
      ) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "idempotency_conflict" });
        return;
      }
      await client.query("COMMIT");
      res.status(200).json({
        idempotent: true,
        sendingEnabled: false,
        invitation: existing,
      });
      return;
    }

    const duplicateResult = await client.query(
      `
      SELECT id
      FROM referral_invitations
      WHERE client_id = $1
        AND program_id = $2
        AND channel = $3
        AND recipient_destination = $4
        AND status IN ('draft', 'approved')
        AND created_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `,
      [auth.clientId, value.programId, value.channel, destination],
    );
    if (duplicateResult.rows[0]) {
      await client.query("ROLLBACK");
      res.status(409).json({
        error: "duplicate_invitation",
        existingInvitationId: duplicateResult.rows[0].id,
      });
      return;
    }

    const referralLink = `${req.protocol}://${req.get("host")}/refer/${program.referralCode}`;
    const tokenValues = {
      firstName: value.recipientName.trim().split(/\s+/)[0],
      businessName: auth.clientName,
      referralLink,
    };
    const rawSubject = template?.subject ?? value.subject ?? null;
    const rawInitial = template?.body ?? value.initialMessage ?? "";
    const rawFollowUp = template?.followUpBody ?? value.followUpMessage ?? null;
    const followUpDelayDays =
      template?.followUpDelayDays ?? value.followUpDelayDays;
    const subject = rawSubject
      ? renderReferralInvitation(rawSubject, tokenValues)
      : null;
    const initialMessage = renderReferralInvitation(rawInitial, tokenValues);
    const followUpMessage = rawFollowUp
      ? renderReferralInvitation(rawFollowUp, tokenValues)
      : null;

    await client.query(
      `
      INSERT INTO referral_contact_preferences (
        client_id, channel, destination, status, consent_source, consent_at
      )
      VALUES ($1, $2, $3, 'opted_in', $4, $5)
      ON CONFLICT (client_id, channel, destination)
      DO UPDATE SET
        consent_source = EXCLUDED.consent_source,
        consent_at = EXCLUDED.consent_at,
        updated_at = NOW()
      WHERE referral_contact_preferences.status <> 'opted_out'
    `,
      [
        auth.clientId,
        value.channel,
        destination,
        value.consentSource,
        value.consentAt,
      ],
    );

    const inserted = await client.query(
      `
      INSERT INTO referral_invitations (
        client_id,
        program_id,
        template_id,
        channel,
        recipient_name,
        recipient_destination,
        subject,
        initial_message,
        follow_up_message,
        follow_up_delay_days,
        status,
        delivery_state,
        sequence_step,
        next_action_at,
        consent_source,
        consent_at,
        idempotency_key,
        created_by_user_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        'draft', 'not_dispatched', 0, NULL, $11, $12, $13, $14
      )
      ON CONFLICT (client_id, idempotency_key) DO NOTHING
      RETURNING
        id,
        status,
        delivery_state AS "deliveryState",
        created_at AS "createdAt"
    `,
      [
        auth.clientId,
        value.programId,
        value.templateId ?? null,
        value.channel,
        value.recipientName,
        destination,
        subject,
        initialMessage,
        followUpMessage,
        followUpDelayDays,
        value.consentSource,
        value.consentAt,
        value.idempotencyKey,
        auth.userId,
      ],
    );

    if (!inserted.rows[0]) {
      const existing = await client.query(
        `
        SELECT id, status, delivery_state AS "deliveryState", created_at AS "createdAt"
        FROM referral_invitations
        WHERE client_id = $1 AND idempotency_key = $2
      `,
        [auth.clientId, value.idempotencyKey],
      );
      await client.query("COMMIT");
      res.status(200).json({
        idempotent: true,
        sendingEnabled: false,
        invitation: existing.rows[0],
      });
      return;
    }

    await client.query("COMMIT");
    res.status(201).json({
      idempotent: false,
      sendingEnabled: false,
      invitation: inserted.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[referrals] invitation create error:", err);
    res.status(500).json({ error: "Failed" });
  } finally {
    client.release();
  }
});

router.post("/referrals/invitations/:id/approve", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const { rows } = await pool.query(
      `
      UPDATE referral_invitations ri
      SET
        status = 'approved',
        delivery_state = 'not_dispatched',
        next_action_at = NULL,
        approved_by_user_id = $3,
        approved_at = NOW(),
        updated_at = NOW()
      WHERE ri.id = $1
        AND ri.client_id = $2
        AND ri.status = 'draft'
        AND NOT EXISTS (
          SELECT 1
          FROM referral_contact_preferences rcp
          WHERE rcp.client_id = ri.client_id
            AND rcp.channel = ri.channel
            AND rcp.destination = ri.recipient_destination
            AND rcp.status = 'opted_out'
        )
      RETURNING
        id,
        status,
        delivery_state AS "deliveryState",
        approved_at AS "approvedAt"
    `,
      [req.params.id, auth.clientId, auth.userId],
    );
    if (!rows[0]) {
      res.status(409).json({ error: "invitation_not_approvable" });
      return;
    }
    res.json({
      sendingEnabled: false,
      message: "Approved for a future delivery phase; no message was sent.",
      invitation: rows[0],
    });
  } catch (err) {
    console.error("[referrals] invitation approval error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/referrals/invitations/:id/cancel", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const { rows } = await pool.query(
      `
      UPDATE referral_invitations
      SET
        status = 'cancelled',
        delivery_state = 'not_dispatched',
        next_action_at = NULL,
        cancelled_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND client_id = $2
        AND status IN ('draft', 'approved')
      RETURNING id, status, delivery_state AS "deliveryState", cancelled_at AS "cancelledAt"
    `,
      [req.params.id, auth.clientId],
    );
    if (!rows[0]) {
      res.status(409).json({ error: "invitation_not_cancellable" });
      return;
    }
    res.json({ sendingEnabled: false, invitation: rows[0] });
  } catch (err) {
    console.error("[referrals] invitation cancellation error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/referrals/contact-preferences/opt-out", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const parsed = referralContactPreferenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_contact_preference" });
    return;
  }
  const destination = normalizeInvitationDestination(
    parsed.data.channel,
    parsed.data.destination,
  );
  if (!destination) {
    res.status(400).json({ error: "invalid_destination" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${auth.clientId}:${parsed.data.channel}:${destination}`,
    ]);
    await client.query(
      `
      INSERT INTO referral_contact_preferences (
        client_id, channel, destination, status, opted_out_at, reason
      )
      VALUES ($1, $2, $3, 'opted_out', NOW(), $4)
      ON CONFLICT (client_id, channel, destination)
      DO UPDATE SET
        status = 'opted_out',
        opted_out_at = NOW(),
        reason = EXCLUDED.reason,
        updated_at = NOW()
    `,
      [auth.clientId, parsed.data.channel, destination, parsed.data.reason],
    );
    const suppressed = await client.query(
      `
      UPDATE referral_invitations
      SET
        status = 'suppressed',
        delivery_state = 'not_dispatched',
        next_action_at = NULL,
        suppression_reason = $4,
        updated_at = NOW()
      WHERE client_id = $1
        AND channel = $2
        AND recipient_destination = $3
        AND status IN ('draft', 'approved')
      RETURNING id
    `,
      [auth.clientId, parsed.data.channel, destination, parsed.data.reason],
    );
    await client.query("COMMIT");
    res.json({
      ok: true,
      sendingEnabled: false,
      suppressedInvitationCount: suppressed.rowCount ?? 0,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[referrals] contact opt-out error:", err);
    res.status(500).json({ error: "Failed" });
  } finally {
    client.release();
  }
});

// ── RGE-3: explicitly requested controlled delivery ─────────────────────────
// There is deliberately no scheduler. The UI only requests dry-runs. Live
// provider delivery additionally requires environment enablement, live mode,
// a disengaged emergency stop, and exact destination allowlisting.

router.get("/referrals/delivery-config", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const config = resolveReferralDeliveryConfig();
  res.json({
    defaultMode: "dry_run",
    liveDeliveryEnabled:
      config.enabled &&
      config.mode === "live" &&
      !config.emergencyStop &&
      config.allowlist.size > 0,
    emergencyStop: config.emergencyStop,
    allowlistConfigured: config.allowlist.size > 0,
    hourlyLimit: config.hourlyLimit,
    schedulerEnabled: false,
  });
});

router.get("/referrals/delivery-attempts", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        invitation_id AS "invitationId",
        channel,
        recipient_destination AS "recipientDestination",
        sequence_step AS "sequenceStep",
        requested_mode AS "requestedMode",
        status,
        provider,
        provider_message_id AS "providerMessageId",
        failure_code AS "failureCode",
        created_at AS "createdAt",
        completed_at AS "completedAt"
      FROM referral_delivery_attempts
      WHERE client_id = $1
      ORDER BY created_at DESC
      LIMIT 250
    `,
      [auth.clientId],
    );
    res.json(rows);
  } catch (error) {
    console.error("[referrals] delivery attempt list error:", error);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/referrals/invitations/:id/dispatch", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const parsed = referralDeliveryRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "explicit_dispatch_confirmation_required" });
    return;
  }

  const config = resolveReferralDeliveryConfig();
  const client = await pool.connect();
  let attempt:
    | {
        id: string;
        channel: "sms" | "email";
        destination: string;
        subject: string | null;
        body: string;
        mode: "dry_run" | "live";
      }
    | undefined;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${auth.clientId}:referral-delivery:${req.params.id}`,
    ]);

    const existing = await client.query(
      `
      SELECT
        id,
        invitation_id AS "invitationId",
        requested_mode AS "requestedMode",
        status,
        provider_message_id AS "providerMessageId",
        failure_code AS "failureCode",
        created_at AS "createdAt",
        completed_at AS "completedAt"
      FROM referral_delivery_attempts
      WHERE client_id = $1 AND idempotency_key = $2
      LIMIT 1
    `,
      [auth.clientId, parsed.data.idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].invitationId !== req.params.id) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "idempotency_conflict" });
        return;
      }
      await client.query("COMMIT");
      res.json({ idempotent: true, attempt: existing.rows[0] });
      return;
    }

    const invitationResult = await client.query(
      `
      SELECT
        ri.id,
        ri.channel,
        ri.recipient_destination AS destination,
        ri.subject,
        ri.initial_message AS body,
        ri.status,
        ri.delivery_state AS "deliveryState",
        ri.sequence_step AS "sequenceStep",
        ri.approved_by_user_id AS "approvedByUserId",
        ri.approved_at AS "approvedAt",
        rcp.status AS "contactStatus"
      FROM referral_invitations ri
      LEFT JOIN referral_contact_preferences rcp
        ON rcp.client_id = ri.client_id
       AND rcp.channel = ri.channel
       AND rcp.destination = ri.recipient_destination
      WHERE ri.id = $1 AND ri.client_id = $2
      FOR UPDATE OF ri
    `,
      [req.params.id, auth.clientId],
    );
    const invitation = invitationResult.rows[0];
    if (
      !invitation ||
      invitation.status !== "approved" ||
      invitation.deliveryState !== "not_dispatched" ||
      invitation.sequenceStep !== 0 ||
      !invitation.approvedByUserId ||
      !invitation.approvedAt
    ) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "invitation_not_dispatchable" });
      return;
    }
    if (invitation.contactStatus !== "opted_in") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "contact_not_opted_in" });
      return;
    }

    const gate = evaluateReferralDeliveryGate(
      config,
      parsed.data.requestedMode,
      invitation.destination,
    );
    if (!gate.allowed) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: gate.reason });
      return;
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${auth.clientId}:referral-delivery-rate-limit`,
    ]);
    const rateResult = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM referral_delivery_attempts
      WHERE client_id = $1
        AND created_at > NOW() - INTERVAL '1 hour'
        AND status IN ('simulated', 'dispatching', 'delivered', 'failed')
    `,
      [auth.clientId],
    );
    if ((rateResult.rows[0]?.count ?? 0) >= config.hourlyLimit) {
      await client.query("ROLLBACK");
      res.status(429).json({
        error: "referral_delivery_rate_limited",
        retryAfterSeconds: 3600,
      });
      return;
    }

    if (gate.mode === "live") {
      const duplicate = await client.query(
        `
        SELECT id
        FROM referral_delivery_attempts
        WHERE client_id = $1
          AND invitation_id = $2
          AND sequence_step = 0
          AND requested_mode = 'live'
          AND status IN ('dispatching', 'delivered')
        LIMIT 1
      `,
        [auth.clientId, invitation.id],
      );
      if (duplicate.rows[0]) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "delivery_already_attempted" });
        return;
      }
    }

    const inserted = await client.query(
      `
      INSERT INTO referral_delivery_attempts (
        client_id,
        invitation_id,
        channel,
        recipient_destination,
        sequence_step,
        requested_mode,
        status,
        provider,
        idempotency_key,
        requested_by_user_id,
        completed_at
      )
      VALUES (
        $1, $2, $3, $4, 0, $5,
        CASE WHEN $5 = 'dry_run' THEN 'simulated' ELSE 'dispatching' END,
        CASE WHEN $5 = 'dry_run' THEN NULL
             WHEN $3 = 'sms' THEN 'telnyx'
             ELSE 'smtp' END,
        $6, $7,
        CASE WHEN $5 = 'dry_run' THEN NOW() ELSE NULL END
      )
      RETURNING id
    `,
      [
        auth.clientId,
        invitation.id,
        invitation.channel,
        invitation.destination,
        gate.mode,
        parsed.data.idempotencyKey,
        auth.userId,
      ],
    );
    attempt = {
      id: inserted.rows[0].id,
      channel: invitation.channel,
      destination: invitation.destination,
      subject: invitation.subject,
      body: invitation.body,
      mode: gate.mode,
    };
    await client.query("COMMIT");
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error?.code === "23505") {
      res.status(409).json({ error: "duplicate_delivery_attempt" });
      return;
    }
    console.error("[referrals] controlled delivery prepare error:", error);
    res.status(500).json({ error: "Failed" });
    return;
  } finally {
    client.release();
  }

  if (!attempt) {
    res.status(500).json({ error: "delivery_attempt_not_created" });
    return;
  }
  if (attempt.mode === "dry_run") {
    res.json({
      idempotent: false,
      mode: "dry_run",
      sent: false,
      message: "Dry-run recorded. No SMS or email was sent.",
      attemptId: attempt.id,
    });
    return;
  }

  const providerResult = await dispatchReferralDelivery(
    createReferralDeliveryProviders(),
    {
      channel: attempt.channel,
      destination: attempt.destination,
      subject: attempt.subject,
      body: attempt.body,
    },
    "live",
  );
  await pool.query(
    `
    UPDATE referral_delivery_attempts
    SET
      status = $3,
      provider_message_id = $4,
      failure_code = $5,
      completed_at = NOW()
    WHERE id = $1 AND client_id = $2 AND status = 'dispatching'
  `,
    [
      attempt.id,
      auth.clientId,
      providerResult.ok ? "delivered" : "failed",
      providerResult.ok ? providerResult.providerMessageId : null,
      providerResult.ok ? null : providerResult.errorCode,
    ],
  );
  if (!providerResult.ok) {
    res.status(502).json({
      error: "provider_delivery_failed",
      failureCode: providerResult.errorCode,
      attemptId: attempt.id,
    });
    return;
  }
  res.json({
    idempotent: false,
    mode: "live",
    sent: true,
    attemptId: attempt.id,
    providerMessageId: providerResult.providerMessageId,
  });
});

// ── RGE-4: reward ledger, approval, and manual fulfillment ───────────────────
// This phase records human decisions and evidence only. It never calls a
// payment processor, creates a credit, sends a message, or schedules work.

router.get("/referrals/rewards", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const { rows } = await pool.query(
      `
      SELECT
        rl.id,
        rl.referral_id AS "referralId",
        rl.program_id AS "programId",
        rl.reward_type AS "rewardType",
        rl.reward_amount AS "rewardAmount",
        rl.status,
        rl.approved_at AS "approvedAt",
        rl.fulfillment_method AS "fulfillmentMethod",
        rl.fulfillment_reference AS "fulfillmentReference",
        rl.fulfillment_note AS "fulfillmentNote",
        rl.fulfilled_at AS "fulfilledAt",
        rl.created_at AS "createdAt",
        r.referrer_name AS "referrerName",
        r.referred_name AS "referredName",
        rp.name AS "programName"
      FROM referral_reward_ledger rl
      JOIN referrals r
        ON r.id = rl.referral_id
       AND r.client_id = rl.client_id
      LEFT JOIN referral_programs rp
        ON rp.id = rl.program_id
       AND rp.client_id = rl.client_id
      WHERE rl.client_id = $1
      ORDER BY rl.created_at DESC
      LIMIT 500
    `,
      [auth.clientId],
    );
    res.json(rows);
  } catch (error) {
    console.error("[referrals] reward ledger list error:", error);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/referrals/rewards/:id/approve", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const parsed = referralRewardApprovalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "explicit_reward_approval_required" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${auth.clientId}:referral-reward:${req.params.id}`,
    ]);
    const existing = await client.query(
      `
      SELECT id, status, approval_idempotency_key AS "approvalIdempotencyKey"
      FROM referral_reward_ledger
      WHERE client_id = $1 AND approval_idempotency_key = $2
      LIMIT 1
    `,
      [auth.clientId, parsed.data.idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].id !== req.params.id) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "reward_approval_idempotency_conflict" });
        return;
      }
      await client.query("COMMIT");
      res.json({ idempotent: true, reward: existing.rows[0] });
      return;
    }
    const { rows } = await client.query(
      `
      UPDATE referral_reward_ledger
      SET
        status = 'approved',
        approval_idempotency_key = $3,
        approved_by_user_id = $4,
        approved_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND client_id = $2
        AND status = 'pending_review'
      RETURNING id, referral_id AS "referralId", reward_amount AS "rewardAmount",
                reward_type AS "rewardType", status, approved_at AS "approvedAt"
    `,
      [
        req.params.id,
        auth.clientId,
        parsed.data.idempotencyKey,
        auth.userId,
      ],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "reward_not_approvable" });
      return;
    }
    await client.query("COMMIT");
    res.json({ idempotent: false, reward: rows[0] });
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error?.code === "23505") {
      res.status(409).json({ error: "duplicate_reward_approval" });
      return;
    }
    console.error("[referrals] reward approval error:", error);
    res.status(500).json({ error: "Failed" });
  } finally {
    client.release();
  }
});

router.post("/referrals/rewards/:id/fulfill", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const parsed = referralRewardFulfillmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "fulfillment_evidence_required" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${auth.clientId}:referral-reward:${req.params.id}`,
    ]);
    const existing = await client.query(
      `
      SELECT id, status, fulfillment_idempotency_key AS "fulfillmentIdempotencyKey"
      FROM referral_reward_ledger
      WHERE client_id = $1 AND fulfillment_idempotency_key = $2
      LIMIT 1
    `,
      [auth.clientId, parsed.data.idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].id !== req.params.id) {
        await client.query("ROLLBACK");
        res
          .status(409)
          .json({ error: "reward_fulfillment_idempotency_conflict" });
        return;
      }
      await client.query("COMMIT");
      res.json({ idempotent: true, reward: existing.rows[0] });
      return;
    }
    const { rows } = await client.query(
      `
      UPDATE referral_reward_ledger
      SET
        status = 'fulfilled',
        fulfillment_idempotency_key = $3,
        fulfillment_method = $4,
        fulfillment_reference = $5,
        fulfillment_note = $6,
        fulfilled_by_user_id = $7,
        fulfilled_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND client_id = $2
        AND status = 'approved'
      RETURNING id, referral_id AS "referralId", reward_amount AS "rewardAmount",
                reward_type AS "rewardType", status,
                fulfillment_method AS "fulfillmentMethod",
                fulfillment_reference AS "fulfillmentReference",
                fulfilled_at AS "fulfilledAt"
    `,
      [
        req.params.id,
        auth.clientId,
        parsed.data.idempotencyKey,
        parsed.data.method,
        parsed.data.reference,
        parsed.data.note ?? null,
        auth.userId,
      ],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "reward_not_fulfillable" });
      return;
    }
    await client.query(
      `
      UPDATE referrals
      SET status = 'paid', paid_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND client_id = $2 AND status = 'converted'
    `,
      [rows[0].referralId, auth.clientId],
    );
    await client.query("COMMIT");
    res.json({
      idempotent: false,
      externallyPaid: false,
      message: "Manual fulfillment evidence recorded; no payment was issued.",
      reward: rows[0],
    });
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error?.code === "23505") {
      res.status(409).json({ error: "duplicate_reward_fulfillment" });
      return;
    }
    console.error("[referrals] reward fulfillment error:", error);
    res.status(500).json({ error: "Failed" });
  } finally {
    client.release();
  }
});

// ── RGE-5: fraud review evidence and human decisions ─────────────────────────
// Risk signals create a review queue only. They never mutate referrals,
// rewards, invitations, delivery state, customer records, or external systems.

router.get("/referrals/fraud-reviews", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const requestedStatus = String(req.query.status ?? "open");
  const allowed = new Set(["open", "held", "cleared", "rejected", "all"]);
  if (!allowed.has(requestedStatus)) {
    res.status(400).json({ error: "invalid_review_status" });
    return;
  }
  try {
    const { rows } = await pool.query(
      `
      SELECT
        fr.id,
        fr.referral_id AS "referralId",
        fr.status,
        fr.risk_score AS "riskScore",
        fr.reasons,
        fr.evidence,
        fr.fingerprint_evaluation AS "fingerprintEvaluation",
        fr.version,
        fr.reviewed_at AS "reviewedAt",
        fr.review_note AS "reviewNote",
        fr.created_at AS "createdAt",
        fr.updated_at AS "updatedAt",
        r.referrer_name AS "referrerName",
        r.referred_name AS "referredName",
        r.status AS "referralStatus",
        rp.name AS "programName"
      FROM referral_fraud_reviews fr
      JOIN referrals r
        ON r.id = fr.referral_id
       AND r.client_id = fr.client_id
      LEFT JOIN referral_programs rp
        ON rp.id = r.program_id
       AND rp.client_id = fr.client_id
      WHERE fr.client_id = $1
        AND ($2 = 'all' OR fr.status = $2)
      ORDER BY
        CASE fr.status WHEN 'open' THEN 0 WHEN 'held' THEN 1 ELSE 2 END,
        fr.risk_score DESC,
        fr.created_at DESC
      LIMIT 500
    `,
      [auth.clientId, requestedStatus],
    );
    res.json({
      automatedDecisions: false,
      fingerprintCollection: false,
      reviews: rows,
    });
  } catch (error) {
    console.error("[referrals] fraud review list error:", error);
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/referrals/fraud-reviews/:id/events", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const review = await pool.query(
      `SELECT id FROM referral_fraud_reviews WHERE id = $1 AND client_id = $2`,
      [req.params.id, auth.clientId],
    );
    if (!review.rows[0]) {
      res.status(404).json({ error: "review_not_found" });
      return;
    }
    const { rows } = await pool.query(
      `
      SELECT
        id,
        previous_status AS "previousStatus",
        new_status AS "newStatus",
        note,
        actor_user_id AS "actorUserId",
        created_at AS "createdAt"
      FROM referral_fraud_review_events
      WHERE review_id = $1 AND client_id = $2
      ORDER BY created_at DESC
      LIMIT 250
    `,
      [req.params.id, auth.clientId],
    );
    res.json(rows);
  } catch (error) {
    console.error("[referrals] fraud review event list error:", error);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/referrals/fraud-reviews/evaluate", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const parsed = referralFraudEvaluationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "explicit_risk_evaluation_required" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${auth.clientId}:referral-fraud-evaluation`,
    ]);
    const referralResult = await client.query(
      `
      SELECT id
      FROM referrals
      WHERE client_id = $1
        AND ($2::int IS NULL OR id = $2)
      ORDER BY created_at DESC
      LIMIT 250
    `,
      [auth.clientId, parsed.data.referralId ?? null],
    );
    if (parsed.data.referralId && !referralResult.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "referral_not_found" });
      return;
    }
    let flagged = 0;
    for (const referral of referralResult.rows) {
      const assessment = await assessReferralRisk(
        client,
        auth.clientId,
        referral.id,
      );
      if (!assessment || assessment.signals.length === 0) continue;
      flagged += 1;
      await client.query(
        `
        INSERT INTO referral_fraud_reviews (
          client_id,
          referral_id,
          status,
          risk_score,
          reasons,
          evidence,
          fingerprint_evaluation
        )
        VALUES ($1, $2, 'open', $3, $4::jsonb, $5::jsonb, $6)
        ON CONFLICT (client_id, referral_id) DO UPDATE
        SET
          risk_score = EXCLUDED.risk_score,
          reasons = EXCLUDED.reasons,
          evidence = EXCLUDED.evidence,
          fingerprint_evaluation = EXCLUDED.fingerprint_evaluation,
          version = referral_fraud_reviews.version + 1,
          updated_at = NOW()
        WHERE referral_fraud_reviews.status IN ('open', 'held')
      `,
        [
          auth.clientId,
          referral.id,
          assessment.score,
          JSON.stringify(assessment.signals.map((signal) => signal.reason)),
          JSON.stringify({
            signals: assessment.signals,
            containsRawContactData: false,
          }),
          assessment.fingerprintEvaluation,
        ],
      );
    }
    await client.query("COMMIT");
    res.json({
      evaluated: referralResult.rows.length,
      flagged,
      automatedDecisions: false,
      fingerprintCollection: false,
      message: "Risk evidence refreshed. No customer action was taken.",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[referrals] fraud evaluation error:", error);
    res.status(500).json({ error: "Failed" });
  } finally {
    client.release();
  }
});

router.post("/referrals/fraud-reviews/:id/decision", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const parsed = referralFraudDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "explicit_review_decision_required" });
    return;
  }
  const statusByDecision = {
    clear: "cleared",
    hold: "held",
    reject: "rejected",
  } as const;
  const nextStatus = statusByDecision[parsed.data.decision];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${auth.clientId}:referral-fraud-review:${req.params.id}`,
    ]);
    const priorEvent = await client.query(
      `
      SELECT id, review_id AS "reviewId", new_status AS "newStatus"
      FROM referral_fraud_review_events
      WHERE client_id = $1 AND idempotency_key = $2
      LIMIT 1
    `,
      [auth.clientId, parsed.data.idempotencyKey],
    );
    if (priorEvent.rows[0]) {
      if (priorEvent.rows[0].reviewId !== req.params.id) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "review_idempotency_conflict" });
        return;
      }
      await client.query("COMMIT");
      res.json({ idempotent: true, decision: priorEvent.rows[0] });
      return;
    }
    const currentResult = await client.query(
      `
      SELECT id, referral_id AS "referralId", status, version
      FROM referral_fraud_reviews
      WHERE id = $1 AND client_id = $2
      FOR UPDATE
    `,
      [req.params.id, auth.clientId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "review_not_found" });
      return;
    }
    if (!["open", "held"].includes(current.status)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "review_already_finalized" });
      return;
    }
    if (current.version !== parsed.data.expectedVersion) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "stale_review_version" });
      return;
    }
    const updated = await client.query(
      `
      UPDATE referral_fraud_reviews
      SET
        status = $3,
        version = version + 1,
        reviewed_by_user_id = $4,
        reviewed_at = NOW(),
        review_note = $5,
        decision_idempotency_key = $6,
        updated_at = NOW()
      WHERE id = $1
        AND client_id = $2
        AND version = $7
        AND status IN ('open', 'held')
      RETURNING id, referral_id AS "referralId", status, version,
                reviewed_at AS "reviewedAt"
    `,
      [
        req.params.id,
        auth.clientId,
        nextStatus,
        auth.userId,
        parsed.data.note,
        parsed.data.idempotencyKey,
        parsed.data.expectedVersion,
      ],
    );
    if (!updated.rows[0]) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "concurrent_review_conflict" });
      return;
    }
    await client.query(
      `
      INSERT INTO referral_fraud_review_events (
        client_id,
        review_id,
        referral_id,
        previous_status,
        new_status,
        note,
        actor_user_id,
        idempotency_key
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        auth.clientId,
        req.params.id,
        current.referralId,
        current.status,
        nextStatus,
        parsed.data.note,
        auth.userId,
        parsed.data.idempotencyKey,
      ],
    );
    await client.query("COMMIT");
    res.json({
      idempotent: false,
      review: updated.rows[0],
      customerActionTaken: false,
      rewardChanged: false,
      messageChanged: false,
      crmChanged: false,
    });
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error?.code === "23505") {
      res.status(409).json({ error: "duplicate_review_decision" });
      return;
    }
    console.error("[referrals] fraud review decision error:", error);
    res.status(500).json({ error: "Failed" });
  } finally {
    client.release();
  }
});


// ── GET /api/referrals/stats ──────────────────────────────────────────────────
router.get("/referrals/stats", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const { rows } = await pool.query(`
      WITH referral_stats AS (
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='converted')::int AS converted,
          COUNT(*) FILTER (WHERE status='paid')::int AS paid,
          COUNT(*) FILTER (WHERE status='pending')::int AS pending,
          COUNT(*) FILTER (WHERE status='cancelled')::int AS cancelled
        FROM referrals
        WHERE client_id = $1
      ),
      reward_stats AS (
        SELECT
          COALESCE(SUM(reward_amount) FILTER (WHERE status='fulfilled'), 0) AS "totalPaidOut",
          COALESCE(SUM(reward_amount) FILTER (WHERE status IN ('pending_review','approved')), 0) AS "pendingPayout",
          COUNT(*) FILTER (WHERE status IN ('pending_review','approved'))::int AS "pendingRewardCount",
          COUNT(*) FILTER (WHERE status='fulfilled')::int AS "fulfilledRewardCount"
        FROM referral_reward_ledger
        WHERE client_id = $1
      )
      SELECT referral_stats.*, reward_stats.*
      FROM referral_stats CROSS JOIN reward_stats
    `, [auth.clientId]);
    const s = rows[0];
    const conversionRate = s.total > 0
      ? Math.round(((s.converted + s.paid) / s.total) * 100)
      : 0;
    res.json({ ...s, conversionRate });
  } catch (err) {
    console.error("[referrals] stats error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ── GET /api/referrals/programs ───────────────────────────────────────────────
router.get("/referrals/programs", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const programs = await db
      .select()
      .from(referralProgramsTable)
      .where(eq(referralProgramsTable.clientId, auth.clientId));
    res.json(programs);
  } catch (err) {
    console.error("[referrals] programs error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/referrals/programs ──────────────────────────────────────────────
router.post("/referrals/programs", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const parsed = createReferralProgramSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_program",
        issues: parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })),
      });
      return;
    }
    const { name, description, rewardType, rewardValue, promoMessage, maxUses, expiresAt } = parsed.data;
    const code = generateReferralCode();
    const [prog] = await db
      .insert(referralProgramsTable)
      .values({ clientId: auth.clientId, name, description, rewardType, rewardValue: String(rewardValue), promoMessage, maxUses, expiresAt, referralCode: code })
      .returning();
    res.status(201).json(prog);
  } catch (err) {
    console.error("[referrals] create program error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ── PATCH /api/referrals/programs/:id ────────────────────────────────────────
router.patch("/referrals/programs/:id", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    const [updated] = await db
      .update(referralProgramsTable)
      .set({ status })
      .where(and(eq(referralProgramsTable.id, id), eq(referralProgramsTable.clientId, auth.clientId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("[referrals] update program error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ── GET /api/referrals ────────────────────────────────────────────────────────
router.get("/referrals", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const status = typeof req.query.status === "string" && req.query.status !== "all"
      ? req.query.status
      : null;
    const { rows } = await pool.query(`
      SELECT r.*, rp.name AS program_name, rp.reward_type
      FROM referrals r
      LEFT JOIN referral_programs rp ON r.program_id = rp.id
      WHERE r.client_id = $1
        ${status ? `AND r.status = $2` : ""}
      ORDER BY r.created_at DESC
    `, status ? [auth.clientId, status] : [auth.clientId]);
    res.json(rows);
  } catch (err) {
    console.error("[referrals] list error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/referrals ───────────────────────────────────────────────────────
router.post("/referrals", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const { programId, referrerName, referrerEmail, referrerPhone, referredName, referredEmail, referredPhone, notes, source } = req.body;
    if (!referrerName) { res.status(400).json({ error: "referrerName required" }); return; }

    let rewardAmount: string | undefined;
    if (programId) {
      // Program ownership is part of the authorization boundary: a tenant may
      // only create a referral against one of its own programs.
      const prog = await db
        .select()
        .from(referralProgramsTable)
        .where(and(
          eq(referralProgramsTable.id, Number(programId)),
          eq(referralProgramsTable.clientId, auth.clientId),
        ))
        .limit(1);
      if (!prog.length) {
        res.status(404).json({ error: "Program not found" });
        return;
      }
      rewardAmount = prog[0].rewardValue ?? undefined;
    }

    const [referral] = await db
      .insert(referralsTable)
      .values({ clientId: auth.clientId, programId: programId ? Number(programId) : null, referrerName, referrerEmail, referrerPhone, referredName, referredEmail, referredPhone, notes, source: source ?? "manual", rewardAmount })
      .returning();

    if (programId) {
      await pool.query(`UPDATE referral_programs SET uses_count = uses_count + 1 WHERE id = $1 AND client_id = $2`, [Number(programId), auth.clientId]);
    }

    res.status(201).json(referral);
  } catch (err) {
    console.error("[referrals] create error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ── PATCH /api/referrals/:id ──────────────────────────────────────────────────
router.get("/referrals/reporting", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const { rows } = await pool.query(
      `
      SELECT
        p.id AS "programId",
        p.name AS "programName",
        COALESCE(i.invitations, 0)::int AS invitations,
        COALESCE(r.referrals, 0)::int AS referrals,
        COALESCE(r.conversions, 0)::int AS conversions,
        COALESCE(l.pending_rewards, 0)::int AS "pendingRewards",
        COALESCE(l.fulfilled_rewards, 0)::int AS "fulfilledRewards",
        COALESCE(l.reward_cost, 0)::numeric AS "rewardCost"
      FROM referral_programs p
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS invitations
        FROM referral_invitations
        WHERE client_id = p.client_id AND program_id = p.id
      ) i ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS referrals,
          COUNT(*) FILTER (
            WHERE status IN ('converted', 'paid')
          )::int AS conversions
        FROM referrals
        WHERE client_id = p.client_id AND program_id = p.id
      ) r ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (
            WHERE status IN ('pending_review', 'approved')
          )::int AS pending_rewards,
          COUNT(*) FILTER (
            WHERE status = 'fulfilled'
          )::int AS fulfilled_rewards,
          COALESCE(SUM(reward_amount) FILTER (
            WHERE status = 'fulfilled'
          ), 0)::numeric AS reward_cost
        FROM referral_reward_ledger
        WHERE client_id = p.client_id AND program_id = p.id
      ) l ON TRUE
      WHERE p.client_id = $1
      ORDER BY p.created_at DESC
      `,
      [auth.clientId],
    );
    res.json({
      generatedAt: new Date().toISOString(),
      revenueSource: "not_configured",
      programs: rows.map((row) =>
        buildReferralEconomics({
          ...row,
          rewardCost: Number(row.rewardCost ?? 0),
          attributedRevenue: null,
        }),
      ),
    });
  } catch (err) {
    console.error("[referrals] reporting error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/referrals/attribution/candidates", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const clientResult = await pool.query(
      `SELECT slug FROM clients WHERE id = $1 LIMIT 1`,
      [auth.clientId],
    );
    const projectId = clientResult.rows[0]?.slug;
    if (!projectId) {
      res.status(404).json({ error: "client_not_found" });
      return;
    }
    const { rows } = await pool.query(
      `
      SELECT
        r.id AS "referralId",
        r.referred_name AS "referredName",
        r.referred_phone AS "referralPhone",
        r.referred_email AS "referralEmail",
        c.external_id AS "customerExternalId",
        c.name AS "customerName",
        c.phone AS "customerPhone",
        c.email AS "customerEmail",
        CASE
          WHEN COALESCE(j.revenue_cents, 0) > 0
          THEN j.revenue_cents::numeric / 100
          ELSE NULL
        END AS "measuredRevenue",
        COALESCE(a.status, 'proposed') AS status
      FROM referrals r
      JOIN gorilladesk_customers c
        ON c.project_id = $2
       AND (
         (
           NULLIF(regexp_replace(COALESCE(r.referred_phone, ''), '\\D', '', 'g'), '') IS NOT NULL
           AND right(regexp_replace(r.referred_phone, '\\D', '', 'g'), 10)
             = right(regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g'), 10)
         )
         OR (
           NULLIF(lower(trim(COALESCE(r.referred_email, ''))), '') IS NOT NULL
           AND lower(trim(r.referred_email)) = lower(trim(COALESCE(c.email, '')))
         )
       )
      LEFT JOIN LATERAL (
        SELECT SUM(amount_cents)::int AS revenue_cents
        FROM gorilladesk_jobs
        WHERE project_id = $2 AND customer_id = c.external_id
      ) j ON TRUE
      LEFT JOIN referral_crm_attributions a
        ON a.client_id = r.client_id
       AND a.referral_id = r.id
       AND a.customer_external_id = c.external_id
      WHERE r.client_id = $1
      ORDER BY r.created_at DESC
      `,
      [auth.clientId, projectId],
    );
    res.json({
      source: "local_gorilladesk_sync",
      externalCalls: false,
      candidates: rows
        .map((row) => ({
          ...row,
          ...scoreReferralCustomerMatch(row),
          measuredRevenue:
            row.measuredRevenue == null ? null : Number(row.measuredRevenue),
        }))
        .filter((row) => row.confidence > 0),
    });
  } catch (err) {
    console.error("[referrals] attribution candidates error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/referrals/attribution/decision", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const referralId = Number(req.body?.referralId);
  const customerExternalId = String(req.body?.customerExternalId ?? "");
  const decision = req.body?.decision;
  const idempotencyKey = String(req.body?.idempotencyKey ?? "");
  if (
    !Number.isInteger(referralId) ||
    !customerExternalId ||
    !["confirmed", "rejected"].includes(decision) ||
    idempotencyKey.length < 8
  ) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  try {
    const candidate = await pool.query(
      `
      SELECT
        r.referred_phone AS "referralPhone",
        r.referred_email AS "referralEmail",
        c.phone AS "customerPhone",
        c.email AS "customerEmail",
        CASE
          WHEN COALESCE(j.revenue_cents, 0) > 0
          THEN j.revenue_cents::numeric / 100
          ELSE NULL
        END AS "measuredRevenue"
      FROM referrals r
      JOIN clients tenant ON tenant.id = r.client_id
      JOIN gorilladesk_customers c
        ON c.project_id = tenant.slug
       AND c.external_id = $3
       AND (
         (
           NULLIF(regexp_replace(COALESCE(r.referred_phone, ''), '\\D', '', 'g'), '') IS NOT NULL
           AND right(regexp_replace(r.referred_phone, '\\D', '', 'g'), 10)
             = right(regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g'), 10)
         )
         OR (
           NULLIF(lower(trim(COALESCE(r.referred_email, ''))), '') IS NOT NULL
           AND lower(trim(r.referred_email)) = lower(trim(COALESCE(c.email, '')))
         )
       )
      LEFT JOIN LATERAL (
        SELECT SUM(amount_cents)::int AS revenue_cents
        FROM gorilladesk_jobs
        WHERE project_id = tenant.slug AND customer_id = c.external_id
      ) j ON TRUE
      WHERE r.id = $1 AND r.client_id = $2
      LIMIT 1
      `,
      [referralId, auth.clientId, customerExternalId],
    );
    if (!candidate.rows[0]) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const match = scoreReferralCustomerMatch(candidate.rows[0]);
    if (match.confidence === 0) {
      res.status(409).json({ error: "identity_match_no_longer_valid" });
      return;
    }
    const { rows } = await pool.query(
      `
      INSERT INTO referral_crm_attributions (
        client_id, referral_id, customer_external_id, status,
        confidence, reasons, measured_revenue, decided_by_user_id, decided_at,
        decision_idempotency_key
      )
      VALUES ($1, $2, $3, $4, $7, $8::jsonb, $9, $5, now(), $6)
      ON CONFLICT (client_id, referral_id, customer_external_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        decided_by_user_id = EXCLUDED.decided_by_user_id,
        decided_at = EXCLUDED.decided_at,
        decision_idempotency_key = EXCLUDED.decision_idempotency_key,
        confidence = EXCLUDED.confidence,
        reasons = EXCLUDED.reasons,
        measured_revenue = EXCLUDED.measured_revenue,
        updated_at = now()
      WHERE referral_crm_attributions.client_id = $1
      RETURNING *
      `,
      [
        auth.clientId,
        referralId,
        customerExternalId,
        decision,
        auth.userId,
        idempotencyKey,
        match.confidence,
        JSON.stringify(match.reasons),
        candidate.rows[0].measuredRevenue,
      ],
    );
    res.json({ attribution: rows[0], externalWrite: false });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "duplicate_decision" });
      return;
    }
    console.error("[referrals] attribution decision error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.patch("/referrals/:id", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!Number.isInteger(id) || !["converted", "cancelled"].includes(status)) {
    res.status(400).json({ error: "invalid_referral_transition" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const referralResult = await client.query(
      `
      SELECT
        r.id,
        r.program_id AS "programId",
        r.status,
        r.reward_amount AS "rewardAmount",
        rp.reward_type AS "rewardType"
      FROM referrals r
      LEFT JOIN referral_programs rp
        ON rp.id = r.program_id
       AND rp.client_id = r.client_id
      WHERE r.id = $1 AND r.client_id = $2
      FOR UPDATE OF r
    `,
      [id, auth.clientId],
    );
    const referral = referralResult.rows[0];
    if (!referral) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (referral.status !== "pending") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "referral_transition_not_allowed" });
      return;
    }
    const { rows } = await client.query(
      `
      UPDATE referrals
      SET
        status = $3,
        converted_at = CASE WHEN $3 = 'converted' THEN NOW() ELSE converted_at END,
        updated_at = NOW()
      WHERE id = $1 AND client_id = $2 AND status = 'pending'
      RETURNING *
    `,
      [id, auth.clientId, status],
    );
    if (status === "converted") {
      if (referral.rewardAmount == null || !referral.rewardType) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "reward_snapshot_missing" });
        return;
      }
      await client.query(
        `
        INSERT INTO referral_reward_ledger (
          client_id,
          referral_id,
          program_id,
          reward_type,
          reward_amount,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'pending_review')
        ON CONFLICT (client_id, referral_id) DO NOTHING
      `,
        [
          auth.clientId,
          id,
          referral.programId,
          referral.rewardType,
          referral.rewardAmount,
        ],
      );
    }
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[referrals] transition error:", err);
    res.status(500).json({ error: "Failed" });
  } finally {
    client.release();
  }
});

export default router;
