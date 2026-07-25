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
  referralInvitationDraftSchema,
  referralInvitationTemplateSchema,
  referralSubmissionRateLimiter,
  renderReferralInvitation,
} from "../lib/referral-growth.js";

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
      CREATE INDEX IF NOT EXISTS referral_invitations_tenant_status_created
        ON referral_invitations(client_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS referral_contact_preferences_suppression
        ON referral_contact_preferences(client_id, channel, destination, status);
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


// ── GET /api/referrals/stats ──────────────────────────────────────────────────
router.get("/referrals/stats", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int                                                            AS total,
        COUNT(*) FILTER (WHERE status='converted')::int                         AS converted,
        COUNT(*) FILTER (WHERE status='paid')::int                              AS paid,
        COUNT(*) FILTER (WHERE status='pending')::int                           AS pending,
        COUNT(*) FILTER (WHERE status='cancelled')::int                         AS cancelled,
        COALESCE(SUM(reward_amount) FILTER (WHERE status='paid'),0)             AS "totalPaidOut",
        COALESCE(SUM(reward_amount) FILTER (WHERE status IN ('converted','pending')),0) AS "pendingPayout"
      FROM referrals WHERE client_id = $1
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
router.patch("/referrals/:id", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!status) { res.status(400).json({ error: "status required" }); return; }

    const now = new Date();
    const extra: Record<string, unknown> = { status };
    if (status === "converted") extra.convertedAt = now;
    if (status === "paid")      extra.paidAt      = now;

    const [updated] = await db
      .update(referralsTable)
      .set(extra as Parameters<typeof db.update>[0] extends infer T ? any : never)
      .where(and(eq(referralsTable.id, id), eq(referralsTable.clientId, auth.clientId)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("[referrals] update error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
