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
  publicReferralSubmissionSchema,
  referralSubmissionRateLimiter,
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
    `);
    console.log("[referrals] tables ready");
    // Production data must originate from real referral activity. Demo seeding is intentionally disabled.
  } catch (err) {
    console.warn("[referrals] bootstrap warning:", err);
  }
})();

async function resolveClient(req: any, res: any): Promise<{ userId: string; clientId: string } | null> {
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
  return { userId, clientId: resolved.client.id };
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
