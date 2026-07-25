import { Router } from "express";
import { getAuth } from "@clerk/express";
import { pool, db, eq, and } from "@workspace/db";
import { referralProgramsTable, referralsTable } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";

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
    const { name, description, rewardType, rewardValue, promoMessage, maxUses, expiresAt } = req.body;
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const code = `${auth.clientId.toUpperCase().slice(0, 3)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const [prog] = await db
      .insert(referralProgramsTable)
      .values({ clientId: auth.clientId, name, description, rewardType: rewardType ?? "credit", rewardValue: String(rewardValue ?? "25"), promoMessage, maxUses, expiresAt, referralCode: code })
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
