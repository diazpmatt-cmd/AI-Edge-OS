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
    await seedDemoData();
  } catch (err) {
    console.warn("[referrals] bootstrap warning:", err);
  }
})();

async function seedDemoData() {
  try {
    const { rows } = await pool.query(
      `SELECT id FROM referral_programs WHERE client_id = 'bbb' LIMIT 1`
    );
    if (rows.length > 0) return;

    const { rows: programs } = await pool.query(`
      INSERT INTO referral_programs (client_id, name, description, reward_type, reward_value, status, referral_code, promo_message)
      VALUES
        ('bbb','Neighbor Referral','Refer a neighbor for bed bug treatment and earn $50 credit toward your next service.','credit',50,'active','BBB-NEIGHBOR','Know someone with bed bugs? Share our number and earn $50 off your next visit!'),
        ('bbb','Partner Program','For real estate agents and property managers. Earn $75 per confirmed booking.','cash',75,'active','BBB-PARTNER','We pay $75 per client you send our way. No cap on earnings.'),
        ('bbb','Post-Service Thank You','Happy with your service? Refer a friend and both of you get $25 off.','discount',25,'active','BBB-THANKS','Love our service? So will your neighbors. Share and save!')
      RETURNING id
    `);

    const [neighbor, partner, postService] = programs;
    const now = new Date();
    const ago = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

    await pool.query(`
      INSERT INTO referrals
        (client_id,program_id,referrer_name,referrer_email,referrer_phone,referred_name,referred_phone,status,reward_amount,source,converted_at,paid_at,created_at)
      VALUES
        ('bbb',$1,'Sandra M.','sandra.m@email.com','702-555-0101','Tom W.','702-555-0201','paid',50,'link',$2,$3,$4),
        ('bbb',$1,'Carlos R.','carlos.r@email.com','702-555-0102','Maria G.','702-555-0202','converted',50,'qr',$5,NULL,$6),
        ('bbb',$1,'Linda T.','linda.t@email.com','702-555-0103',NULL,NULL,'pending',50,'link',NULL,NULL,$7),
        ('bbb',$1,'James K.',NULL,'702-555-0104','Beth K.','702-555-0204','pending',50,'manual',NULL,NULL,$8),
        ('bbb',$9,'Sunrise Realty','mgmt@sunrisenv.com','702-555-0110','Unit 4B HOA','702-555-0210','paid',75,'link',$10,$11,$12),
        ('bbb',$9,'NV Prop Mgmt','referrals@nvpm.com','702-555-0111','Desert Villas','702-555-0211','converted',75,'link',$13,NULL,$14),
        ('bbb',$9,'Clark Realty','info@clarkrealty.com','702-555-0112',NULL,NULL,'pending',75,'link',NULL,NULL,$15),
        ('bbb',$16,'Rachel B.','rachel.b@email.com','702-555-0120','Kim P.','702-555-0220','paid',25,'link',$17,$18,$19),
        ('bbb',$16,'David C.','david.c@email.com','702-555-0121','Ana C.','702-555-0221','converted',25,'qr',$20,NULL,$21),
        ('bbb',$16,'Priya S.','priya.s@email.com','702-555-0122',NULL,NULL,'pending',25,'link',NULL,NULL,$22),
        ('bbb',$16,'Marcus W.',NULL,'702-555-0123','Joe D.','702-555-0223','cancelled',25,'manual',NULL,NULL,$23),
        ('bbb',$1,'Yvonne F.','yvonne.f@email.com','702-555-0105','Paul F.','702-555-0205','converted',50,'link',$24,NULL,$25)
    `, [
      neighbor.id,
      ago(45), ago(38), ago(50),
      ago(12), ago(15),
      ago(7), ago(3),
      partner.id,
      ago(30), ago(25), ago(35),
      ago(8), ago(10), ago(2),
      postService.id,
      ago(20), ago(15), ago(22),
      ago(9), ago(11), ago(5), ago(6),
      ago(9), ago(12),
    ]);

    await pool.query(`
      UPDATE referral_programs SET uses_count = (
        SELECT COUNT(*) FROM referrals WHERE program_id = referral_programs.id AND status != 'cancelled'
      ) WHERE client_id = 'bbb'
    `);

    console.log("[referrals] demo data seeded for bbb");
  } catch (err) {
    console.warn("[referrals] seed warning:", err);
  }
}

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
      const prog = await db.select().from(referralProgramsTable).where(eq(referralProgramsTable.id, Number(programId))).limit(1);
      if (prog.length) rewardAmount = prog[0].rewardValue ?? undefined;
    }

    const [referral] = await db
      .insert(referralsTable)
      .values({ clientId: auth.clientId, programId: programId ? Number(programId) : null, referrerName, referrerEmail, referrerPhone, referredName, referredEmail, referredPhone, notes, source: source ?? "manual", rewardAmount })
      .returning();

    if (programId) {
      await pool.query(`UPDATE referral_programs SET uses_count = uses_count + 1 WHERE id = $1`, [Number(programId)]);
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
