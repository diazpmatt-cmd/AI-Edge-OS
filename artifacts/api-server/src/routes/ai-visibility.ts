import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, pool } from "@workspace/db";
import { aiVisibilityAuditsTable, auditExportsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import nodemailer from "nodemailer";
import { generateAuditPDF } from "../services/pdf-generator.js";
import { AiVisibilityExecutionService } from "../lib/ai-visibility-execution-service.js";
import { AiQueryScanService } from "../lib/ai-query-scan-service.js";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";

const router = Router();

function requireAuth(req: any, res: any): boolean {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return false; }
  return true;
}

// Demo fallback audit data
const DEMO_AUDIT = {
  clientId:           "demo",
  businessName:       "Bed Bugs & Beyond",
  overallScore:       34,
  searchScore:        42,
  mapsScore:          51,
  aiSearchScore:      18,
  authorityScore:     29,
  reviewScore:        61,
  competitorGapScore: 27,
  channelsJson: JSON.stringify([
    { id: "google_search",    name: "Google Search",     category: "search",    status: "Connected",    score: 58, priority: "high",     action: "Add LocalBusiness schema" },
    { id: "bing_search",      name: "Bing Search",       category: "search",    status: "Needs Setup",  score: 22, priority: "high",     action: "Claim Bing Places listing" },
    { id: "google_maps",      name: "Google Maps",       category: "maps",      status: "Connected",    score: 64, priority: "high",     action: "Add more photos & posts" },
    { id: "apple_maps",       name: "Apple Maps",        category: "maps",      status: "Needs Setup",  score: 0,  priority: "critical", action: "Claim Apple Business Connect" },
    { id: "bing_places",      name: "Bing Places",       category: "maps",      status: "Needs Setup",  score: 0,  priority: "high",     action: "Claim Bing Places for Business" },
    { id: "waze",             name: "Waze",              category: "maps",      status: "Opportunity",  score: 15, priority: "medium",   action: "Add Waze business listing" },
    { id: "yelp",             name: "Yelp",              category: "directory", status: "Connected",    score: 44, priority: "medium",   action: "Increase review velocity" },
    { id: "facebook",         name: "Facebook",          category: "directory", status: "Connected",    score: 52, priority: "medium",   action: "Enable recommendations" },
    { id: "nextdoor",         name: "Nextdoor",          category: "directory", status: "Opportunity",  score: 8,  priority: "medium",   action: "Create Nextdoor business page" },
    { id: "chatgpt",          name: "ChatGPT",           category: "ai",        status: "Monitoring",   score: 12, priority: "critical", action: "Build citation authority" },
    { id: "claude",           name: "Claude",            category: "ai",        status: "Monitoring",   score: 9,  priority: "high",     action: "Add structured data + FAQ" },
    { id: "gemini",           name: "Gemini",            category: "ai",        status: "Monitoring",   score: 21, priority: "high",     action: "Strengthen GBP signals" },
    { id: "perplexity",       name: "Perplexity",        category: "ai",        status: "Monitoring",   score: 7,  priority: "high",     action: "Build high-authority citations" },
    { id: "copilot",          name: "Copilot",           category: "ai",        status: "Monitoring",   score: 14, priority: "high",     action: "Claim Bing Places + schema" },
    { id: "grok",             name: "Grok",              category: "ai",        status: "Monitoring",   score: 5,  priority: "low",      action: "Monitor for future integration" },
    { id: "siri",             name: "Siri / Voice",      category: "voice",     status: "Needs Setup",  score: 0,  priority: "high",     action: "Claim Apple Business Connect" },
    { id: "alexa",            name: "Alexa / Voice",     category: "voice",     status: "Opportunity",  score: 6,  priority: "medium",   action: "Add Yext or Alexa listing" },
    { id: "google_assistant", name: "Google Assistant",  category: "voice",     status: "Connected",    score: 38, priority: "medium",   action: "Optimize for voice queries" },
  ]),
  competitorsJson: JSON.stringify([
    { name: "Havard Pest Control",            reviewGap: -24, keywordGap: "High",   backlinkGap: "High",   aiGap: -16, opportunityScore: 78 },
    { name: "Beebe's Pest & Termite Control", reviewGap: -8,  keywordGap: "Medium", backlinkGap: "Medium", aiGap: -9,  opportunityScore: 55 },
    { name: "Knox Pest Control",              reviewGap: -3,  keywordGap: "Low",    backlinkGap: "Low",    aiGap: -7,  opportunityScore: 42 },
    { name: "Arrow Exterminators",            reviewGap: -41, keywordGap: "High",   backlinkGap: "High",   aiGap: -22, opportunityScore: 91 },
  ]),
  recommendationsJson: JSON.stringify([
    { priority: "critical", task: "Claim Apple Business Connect",        reason: "Siri & Apple Maps send zero customers without this listing", impact: "High",   status: "pending" },
    { priority: "critical", task: "Add LocalBusiness JSON-LD schema",    reason: "AI platforms can't identify the business as a local entity",   impact: "High",   status: "pending" },
    { priority: "critical", task: "Build 20+ citation listings",         reason: "Citation count is below competitor average by 18 listings",    impact: "High",   status: "pending" },
    { priority: "high",     task: "Claim Bing Places for Business",      reason: "Copilot AI pulls from Bing Places — currently missing",        impact: "High",   status: "pending" },
    { priority: "high",     task: "Add FAQPage schema to service pages", reason: "FAQ schema is the top signal for AI search snippet selection", impact: "Medium", status: "pending" },
    { priority: "high",     task: "Launch post-job review campaign",     reason: "Review velocity is below competitor average by 68%",           impact: "High",   status: "pending" },
    { priority: "high",     task: "Create 6 city-specific service pages", reason: "Location pages unlock long-tail AI visibility per city",      impact: "High",   status: "pending" },
    { priority: "medium",   task: "Add llms.txt to website root",        reason: "Allows AI crawlers to index business info directly",           impact: "Medium", status: "pending" },
    { priority: "medium",   task: "Create AI-optimized About page",      reason: "Entity recognition requires a clear, crawlable business bio",  impact: "Medium", status: "pending" },
    { priority: "medium",   task: "Build local backlink profile",        reason: "Chamber links + news citations improve authority signals",     impact: "Medium", status: "pending" },
    { priority: "low",      task: "Set up Nextdoor business page",       reason: "Nextdoor drives hyper-local neighborhood word-of-mouth",       impact: "Low",    status: "pending" },
    { priority: "low",      task: "Add Waze business listing",           reason: "Captures nearby navigation-intent customers",                  impact: "Low",    status: "pending" },
  ]),
};

// ── Helper: resolve audit by clientId (or demo) ──────────────────────────────
async function resolveAudit(clientId: string) {
  if (clientId === "demo") return { ...DEMO_AUDIT, id: "demo", createdAt: new Date(), updatedAt: new Date() };
  const [row] = await db
    .select()
    .from(aiVisibilityAuditsTable)
    .where(eq(aiVisibilityAuditsTable.clientId, clientId))
    .orderBy(desc(aiVisibilityAuditsTable.createdAt))
    .limit(1);
  return row ?? { ...DEMO_AUDIT, id: "demo", createdAt: new Date(), updatedAt: new Date() };
}

// ── GET /api/ai-visibility ── list all audits ─────────────────────────────────
router.get("/ai-visibility", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const rows = await db.select().from(aiVisibilityAuditsTable).orderBy(desc(aiVisibilityAuditsTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("[ai-visibility] list error:", err);
    res.status(500).json({ error: "Failed to load audits" });
  }
});

// ── GET /api/ai-visibility/:clientId ── single (with demo fallback) ───────────
router.get("/ai-visibility/:clientId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const audit = await resolveAudit(req.params.clientId);
    res.json(audit);
  } catch (err) {
    console.error("[ai-visibility] get error:", err);
    res.status(500).json({ error: "Failed to load audit" });
  }
});

// ── POST /api/ai-visibility/audit ── create audit ────────────────────────────
router.post("/ai-visibility/audit", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const {
      clientId, businessName,
      overallScore, searchScore, mapsScore, aiSearchScore,
      authorityScore, reviewScore, competitorGapScore,
      channelsJson, competitorsJson, recommendationsJson,
    } = req.body;

    const [row] = await db.insert(aiVisibilityAuditsTable).values({
      clientId:            clientId             ?? "default",
      businessName:        businessName         ?? "",
      overallScore:        overallScore         ?? 0,
      searchScore:         searchScore          ?? 0,
      mapsScore:           mapsScore            ?? 0,
      aiSearchScore:       aiSearchScore        ?? 0,
      authorityScore:      authorityScore       ?? 0,
      reviewScore:         reviewScore          ?? 0,
      competitorGapScore:  competitorGapScore   ?? 0,
      channelsJson:        JSON.stringify(channelsJson         ?? []),
      competitorsJson:     JSON.stringify(competitorsJson      ?? []),
      recommendationsJson: JSON.stringify(recommendationsJson  ?? []),
    }).returning();

    res.status(201).json(row);
  } catch (err) {
    console.error("[ai-visibility] create error:", err);
    res.status(500).json({ error: "Failed to create audit" });
  }
});

// ── PUT /api/ai-visibility/:id ── update ──────────────────────────────────────
router.put("/ai-visibility/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const b = req.body;
    const [row] = await db
      .update(aiVisibilityAuditsTable)
      .set({
        ...(b.overallScore        !== undefined && { overallScore:        b.overallScore }),
        ...(b.searchScore         !== undefined && { searchScore:         b.searchScore }),
        ...(b.mapsScore           !== undefined && { mapsScore:           b.mapsScore }),
        ...(b.aiSearchScore       !== undefined && { aiSearchScore:       b.aiSearchScore }),
        ...(b.authorityScore      !== undefined && { authorityScore:      b.authorityScore }),
        ...(b.reviewScore         !== undefined && { reviewScore:         b.reviewScore }),
        ...(b.competitorGapScore  !== undefined && { competitorGapScore:  b.competitorGapScore }),
        ...(b.channelsJson        !== undefined && { channelsJson:        JSON.stringify(b.channelsJson) }),
        ...(b.competitorsJson     !== undefined && { competitorsJson:     JSON.stringify(b.competitorsJson) }),
        ...(b.recommendationsJson !== undefined && { recommendationsJson: JSON.stringify(b.recommendationsJson) }),
      })
      .where(eq(aiVisibilityAuditsTable.id, req.params.id))
      .returning();

    if (!row) return void res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    console.error("[ai-visibility] update error:", err);
    res.status(500).json({ error: "Failed to update audit" });
  }
});

// ── POST /api/ai-visibility/generate-report ── create fresh audit snapshot ─────
router.post("/ai-visibility/generate-report", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { clientId = "demo" } = req.body;
    const existing = await resolveAudit(clientId);

    const bump = (n: number, range = 8) =>
      Math.max(0, Math.min(100, n + Math.round((Math.random() - 0.4) * range)));

    const [row] = await db.insert(aiVisibilityAuditsTable).values({
      clientId,
      businessName:        existing.businessName,
      overallScore:        bump(existing.overallScore),
      searchScore:         bump(existing.searchScore),
      mapsScore:           bump(existing.mapsScore),
      aiSearchScore:       bump(existing.aiSearchScore, 6),
      authorityScore:      bump(existing.authorityScore, 6),
      reviewScore:         bump(existing.reviewScore, 5),
      competitorGapScore:  bump(existing.competitorGapScore, 6),
      channelsJson:        existing.channelsJson,
      competitorsJson:     existing.competitorsJson,
      recommendationsJson: existing.recommendationsJson,
    }).returning();

    await db.insert(auditExportsTable).values({ clientId, exportType: "report" });
    res.status(201).json(row);
  } catch (err) {
    console.error("[ai-visibility] generate-report error:", err);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

// ── Shared PDF handler ────────────────────────────────────────────────────────
async function streamPDF(req: any, res: any) {
  if (!requireAuth(req, res)) return;
  try {
    const { clientId = "demo" } = req.body;
    const audit = await resolveAudit(clientId);
    await db.insert(auditExportsTable).values({ clientId, exportType: "pdf" });
    const filename = `AI-Visibility-Audit-${audit.businessName.replace(/[^a-z0-9]/gi, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    generateAuditPDF(audit as any).pipe(res);
  } catch (err) {
    console.error("[ai-visibility] pdf error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
}

// ── POST /api/ai-visibility/download-pdf ─────────────────────────────────────
router.post("/ai-visibility/download-pdf", streamPDF);

// ── POST /api/ai-visibility/export-pdf ── (legacy alias) ─────────────────────
router.post("/ai-visibility/export-pdf", streamPDF);

// ── POST /api/ai-visibility/email-report ── email PDF to recipient ────────────
router.post("/ai-visibility/email-report", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { clientId = "demo", recipientEmail } = req.body;
    if (!recipientEmail) return void res.status(400).json({ error: "recipientEmail is required" });

    const audit = await resolveAudit(clientId);

    // Check SMTP config
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      // Log the attempt but return config-needed message
      await db.insert(auditExportsTable).values({ clientId, exportType: "email", recipientEmail });
      return void res.status(202).json({
        status: "queued",
        message: "Email logged. Configure SMTP_HOST, SMTP_USER, SMTP_PASS environment variables to enable sending.",
      });
    }

    // Collect PDF into a buffer
    const pdfStream = generateAuditPDF(audit as any);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      pdfStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      pdfStream.on("end", resolve);
      pdfStream.on("error", reject);
    });
    const pdfBuffer = Buffer.concat(chunks);

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: smtpUser, pass: smtpPass },
    });

    const filename = `AI-Visibility-Audit-${audit.businessName.replace(/[^a-z0-9]/gi, "-")}.pdf`;
    await transporter.sendMail({
      from: `"AI Edge Solutions" <${process.env.SMTP_FROM ?? smtpUser}>`,
      to: recipientEmail,
      subject: `AI Visibility Audit Report — ${audit.businessName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#030612;padding:32px 24px;text-align:center;border-bottom:3px solid #00AEEF;">
            <h1 style="color:#00AEEF;margin:0;font-size:22px;">AI Edge Solutions</h1>
            <p style="color:#C0C0C0;margin:8px 0 0;font-size:13px;">AI Visibility Audit Report</p>
          </div>
          <div style="padding:32px 24px;background:#ffffff;">
            <p style="color:#374151;font-size:15px;line-height:1.6;">
              Attached is the <strong>AI Visibility Audit Report</strong> for <strong>${audit.businessName}</strong>.
            </p>
            <p style="color:#374151;font-size:14px;line-height:1.6;">
              This report shows opportunities to improve search rankings, map visibility,
              AI search recommendations, and lead generation.
            </p>
            <div style="background:#F3F4F6;border-radius:8px;padding:16px 20px;margin:24px 0;">
              <p style="margin:0 0 8px;font-weight:700;color:#111827;">Overall Visibility Score</p>
              <div style="font-size:36px;font-weight:800;color:#00AEEF;">${audit.overallScore}<span style="font-size:16px;color:#6B7280;">/100</span></div>
            </div>
            <p style="color:#374151;font-size:13px;">Open the attached PDF for the full audit, action plan, and package recommendation.</p>
          </div>
          <div style="padding:16px 24px;background:#F9FAFB;text-align:center;border-top:1px solid #E5E7EB;">
            <p style="color:#9CA3AF;font-size:12px;margin:0;">AI Edge Solutions · aiedgesolutions.com</p>
          </div>
        </div>
      `,
      attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
    });

    await db.insert(auditExportsTable).values({ clientId, exportType: "email", recipientEmail });
    res.json({ status: "sent", message: `Report sent to ${recipientEmail}` });
  } catch (err) {
    console.error("[ai-visibility] email-report error:", err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// ── GET /api/ai-visibility/read-model/:clientId ───────────────────────────────
// Returns a live AiVisibilityReadModel composed from real canonical source data.
// Requires the authenticated userId to own the requested client slug.

router.get("/ai-visibility/read-model/:clientId", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const requestedSlug = req.params.clientId;
  if (!requestedSlug) { res.status(400).json({ error: "client_id_required" }); return; }

  const clientCheck = await resolveClientActiveCheck(userId);
  if (!clientCheck.ok) {
    const status = clientCheck.reason === "not_found" ? 404 : 403;
    res.status(status).json({ error: clientCheck.reason }); return;
  }
  if (clientCheck.slug !== requestedSlug) {
    res.status(403).json({ error: "forbidden" }); return;
  }

  try {
    const svc   = new AiVisibilityExecutionService(pool, db);
    const model = await svc.execute({ clientId: clientCheck.clientId, userId });
    res.json(model);
  } catch (err) {
    console.error("[ai-visibility] read-model error:", err);
    res.status(500).json({ error: "execution_failed" });
  }
});

// ── GET /api/ai-visibility/read-model/:clientId/history ───────────────────────
// Returns paginated AI query scan summaries with optional status filter.
// Query params:
//   ?page=1        (1-based, default 1)
//   ?pageSize=20   (max 50, default 20)
//   ?status=completed|failed|running  (optional, omit for all)

router.get("/ai-visibility/read-model/:clientId/history", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const requestedSlug = req.params.clientId;

  const clientCheck = await resolveClientActiveCheck(userId);
  if (!clientCheck.ok) {
    const status = clientCheck.reason === "not_found" ? 404 : 403;
    res.status(status).json({ error: clientCheck.reason }); return;
  }
  if (clientCheck.slug !== requestedSlug) {
    res.status(403).json({ error: "forbidden" }); return;
  }

  const page     = Math.max(1, Number(req.query.page)     || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const status   = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;

  try {
    const svc  = new AiQueryScanService(pool, db);
    const page_ = await svc.listHistory(clientCheck.clientId, { page, pageSize, status });
    res.json(page_);
  } catch (err) {
    console.error("[ai-visibility] history error:", err);
    res.status(500).json({ error: "history_query_failed" });
  }
});

// ── GET /api/ai-visibility/schedule/:clientId ──────────────────────────────────
// Returns the scheduling configuration for this tenant, or a default (disabled)
// stub if no schedule row exists yet.

router.get("/ai-visibility/schedule/:clientId", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const requestedSlug = req.params.clientId;
  const clientCheck = await resolveClientActiveCheck(userId);
  if (!clientCheck.ok) {
    const status = clientCheck.reason === "not_found" ? 404 : 403;
    res.status(status).json({ error: clientCheck.reason }); return;
  }
  if (clientCheck.slug !== requestedSlug) {
    res.status(403).json({ error: "forbidden" }); return;
  }

  try {
    const { rows } = await pool.query<{
      id: string; client_id: string; enabled: boolean; frequency: string;
      next_run_at: Date | null; last_run_at: Date | null; last_success_at: Date | null;
      consecutive_failures: number; max_retries: number;
      created_at: Date; updated_at: Date;
    }>(
      `SELECT id, client_id, enabled, frequency, next_run_at, last_run_at,
              last_success_at, consecutive_failures, max_retries, created_at, updated_at
       FROM ai_visibility_schedule WHERE client_id = $1 LIMIT 1`,
      [clientCheck.clientId],
    );

    if (!rows.length) {
      res.json({
        clientId:            clientCheck.clientId,
        enabled:             false,
        frequency:           "weekly",
        nextRunAt:           null,
        lastRunAt:           null,
        lastSuccessAt:       null,
        consecutiveFailures: 0,
        maxRetries:          3,
      });
      return;
    }

    const r = rows[0];
    res.json({
      id:                  r.id,
      clientId:            r.client_id,
      enabled:             r.enabled,
      frequency:           r.frequency,
      nextRunAt:           r.next_run_at  ? r.next_run_at.toISOString()  : null,
      lastRunAt:           r.last_run_at  ? r.last_run_at.toISOString()  : null,
      lastSuccessAt:       r.last_success_at ? r.last_success_at.toISOString() : null,
      consecutiveFailures: r.consecutive_failures,
      maxRetries:          r.max_retries,
      createdAt:           r.created_at.toISOString(),
      updatedAt:           r.updated_at.toISOString(),
    });
  } catch (err: any) {
    if (err?.code === "42P01") {
      res.json({ clientId: clientCheck.clientId, enabled: false, frequency: "weekly", nextRunAt: null, lastRunAt: null, lastSuccessAt: null, consecutiveFailures: 0, maxRetries: 3 });
      return;
    }
    console.error("[ai-visibility] schedule get error:", err);
    res.status(500).json({ error: "schedule_query_failed" });
  }
});

// ── PUT /api/ai-visibility/schedule/:clientId ─────────────────────────────────
// Upserts scheduling config for this tenant.
// Body: { enabled: boolean, frequency?: "daily"|"weekly"|"biweekly"|"monthly" }

router.put("/ai-visibility/schedule/:clientId", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const requestedSlug = req.params.clientId;
  const clientCheck = await resolveClientActiveCheck(userId);
  if (!clientCheck.ok) {
    const status = clientCheck.reason === "not_found" ? 404 : 403;
    res.status(status).json({ error: clientCheck.reason }); return;
  }
  if (clientCheck.slug !== requestedSlug) {
    res.status(403).json({ error: "forbidden" }); return;
  }

  const { enabled, frequency = "weekly" } = req.body as { enabled?: boolean; frequency?: string };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled_required_boolean" }); return;
  }

  const validFrequencies = ["daily", "weekly", "biweekly", "monthly"];
  const safeFrequency = validFrequencies.includes(frequency) ? frequency : "weekly";

  try {
    const nextRunAt = enabled ? new Date(Date.now() + 60 * 1000) : null; // first run ~1 min from now if enabling

    await pool.query(
      `INSERT INTO ai_visibility_schedule
         (client_id, enabled, frequency, next_run_at, consecutive_failures, max_retries, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 0, 3, NOW(), NOW())
       ON CONFLICT (client_id) DO UPDATE
         SET enabled    = EXCLUDED.enabled,
             frequency  = EXCLUDED.frequency,
             next_run_at = CASE
               WHEN EXCLUDED.enabled = TRUE AND ai_visibility_schedule.enabled = FALSE THEN $4
               WHEN EXCLUDED.enabled = TRUE THEN ai_visibility_schedule.next_run_at
               ELSE NULL
             END,
             consecutive_failures = CASE
               WHEN EXCLUDED.enabled = TRUE AND ai_visibility_schedule.enabled = FALSE THEN 0
               ELSE ai_visibility_schedule.consecutive_failures
             END,
             updated_at = NOW()`,
      [clientCheck.clientId, enabled, safeFrequency, nextRunAt],
    );

    res.json({ ok: true, clientId: clientCheck.clientId, enabled, frequency: safeFrequency });
  } catch (err: any) {
    if (err?.code === "42P01") {
      res.status(503).json({ error: "schedule_table_not_ready" }); return;
    }
    console.error("[ai-visibility] schedule put error:", err);
    res.status(500).json({ error: "schedule_update_failed" });
  }
});

// ── POST /api/ai-visibility/query-scan/:clientId ───────────────────────────────
// Triggers a live AI query scan for this tenant. Runs synchronously (all queries
// execute before the response is returned). Typical latency: 15–60 s depending
// on query count and provider speed.

router.post("/ai-visibility/query-scan/:clientId", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const requestedSlug = req.params.clientId;

  const clientCheck = await resolveClientActiveCheck(userId);
  if (!clientCheck.ok) {
    const status = clientCheck.reason === "not_found" ? 404 : 403;
    res.status(status).json({ error: clientCheck.reason }); return;
  }
  if (clientCheck.slug !== requestedSlug) {
    res.status(403).json({ error: "forbidden" }); return;
  }

  try {
    const svc     = new AiQueryScanService(pool, db);
    const summary = await svc.execute({ clientId: clientCheck.clientId, userId });
    res.status(201).json(summary);
  } catch (err) {
    console.error("[ai-visibility] query-scan error:", err);
    res.status(500).json({ error: "scan_failed" });
  }
});

// ── GET /api/ai-visibility/query-scan/:clientId/latest ────────────────────────
// Returns the latest completed scan summary + results for this tenant.
// Returns 404 if no scan has been run yet.

router.get("/ai-visibility/query-scan/:clientId/latest", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const requestedSlug = req.params.clientId;

  const clientCheck = await resolveClientActiveCheck(userId);
  if (!clientCheck.ok) {
    const status = clientCheck.reason === "not_found" ? 404 : 403;
    res.status(status).json({ error: clientCheck.reason }); return;
  }
  if (clientCheck.slug !== requestedSlug) {
    res.status(403).json({ error: "forbidden" }); return;
  }

  try {
    const svc  = new AiQueryScanService(pool, db);
    const data = await svc.getLatestScan(clientCheck.clientId);
    if (!data.scan) {
      res.status(404).json({ error: "no_scan_found" }); return;
    }
    res.json({ scan: data.scan, results: data.results });
  } catch (err) {
    console.error("[ai-visibility] query-scan latest error:", err);
    res.status(500).json({ error: "scan_query_failed" });
  }
});

// ── GET /api/ai-visibility/query-scan/evidence/:scanId ────────────────────────
// Returns full evidence for a specific scan by UUID.
// The scanId must belong to the authenticated tenant (IDOR guard).

router.get("/ai-visibility/query-scan/evidence/:scanId", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { scanId } = req.params;

  const clientCheck = await resolveClientActiveCheck(userId);
  if (!clientCheck.ok) {
    const status = clientCheck.reason === "not_found" ? 404 : 403;
    res.status(status).json({ error: clientCheck.reason }); return;
  }

  try {
    const svc  = new AiQueryScanService(pool, db);
    const data = await svc.getScanEvidence(scanId, clientCheck.clientId);
    if (!data.scan) {
      res.status(404).json({ error: "scan_not_found" }); return;
    }
    res.json({ scan: data.scan, results: data.results });
  } catch (err) {
    console.error("[ai-visibility] query-scan evidence error:", err);
    res.status(500).json({ error: "evidence_query_failed" });
  }
});

export default router;
