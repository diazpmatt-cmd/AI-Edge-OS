import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable } from "@workspace/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { analyzeLead } from "../services/lead-analysis";
import { reviewLead } from "../services/lead-review";
import { sendApprovedLead } from "../services/lead-send";
import { needsFollowUp } from "../services/lead-delivery";
import { resolveClientContentContextFromDb } from "../lib/client-resolver";
import { authorizeWebLeadsAccess } from "../lib/web-leads-access-policy.js";

const router = Router();

type ClientResolver = typeof resolveClientContentContextFromDb;
type LeadOwnershipChecker = (clientId: string, leadId: string) => Promise<boolean>;

async function defaultLeadOwnershipChecker(clientId: string, leadId: string): Promise<boolean> {
  const [lead] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.clientId, clientId)))
    .limit(1);
  return Boolean(lead);
}

async function resolveLeadClientId(
  userId: string,
  res: any,
  resolver: ClientResolver = resolveClientContentContextFromDb,
): Promise<string | null> {
  const resolved = await resolver(userId);
  if (resolved.found) return resolved.client.id;
  if (resolved.reason === "registry_unavailable") { res.status(503).json({ error: "client_context_unavailable" }); return null; }
  if (resolved.reason === "inactive") { res.status(403).json({ error: "client_inactive" }); return null; }
  if (resolved.reason === "not_found") { res.status(404).json({ error: "client_not_found" }); return null; }
  res.status(422).json({ error: "client_context_invalid" });
  return null;
}

function parseWebLeadMessage(msg: string | null) {
  const result = { email: null, business: null, industry: null, services: null, packageLabel: null, note: null } as {
    email: string | null; business: string | null; industry: string | null;
    services: string | null; packageLabel: string | null; note: string | null;
  };
  if (!msg) return result;
  for (const line of msg.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim() || null;
    if (key === "email") result.email = val;
    if (key === "business") result.business = val;
    if (key === "industry") result.industry = val;
    if (key === "services") result.services = val;
    if (key === "package") result.packageLabel = val;
    if (key === "message") result.note = val;
  }
  return result;
}

router.get("/leads/web", async (req, res) => {
  const { userId } = getAuth(req);
  const access = authorizeWebLeadsAccess(userId);
  if (!access.ok) { res.status(access.status).json({ error: access.error }); return; }
  const rows = await db.select().from(leadsTable).where(sql`
    ${leadsTable.clientName} = ${"AI Edge Solutions"}
    AND ${leadsTable.source} = ${"contact-form"}
  `).orderBy(desc(leadsTable.createdAt));
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const active = rows.filter(r => r.status === "new" || r.status === "contacted").length;
  const thisMonth = rows.filter(r => new Date(r.createdAt) >= startOfMonth).length;
  res.json({
    leads: rows.map(r => {
      const parsed = parseWebLeadMessage(r.message);
      return {
        id: r.id, customerName: r.customerName ?? null, phone: r.phone,
        email: parsed.email, business: parsed.business, industry: parsed.industry,
        services: parsed.services, packageLabel: parsed.packageLabel,
        packageKey: r.eventType.startsWith("contact-form:") ? r.eventType.replace("contact-form:", "") : null,
        note: parsed.note, status: r.status, notes: r.notes,
        createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
      };
    }),
    stats: { total: rows.length, active, thisMonth },
  });
});

router.get("/leads", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const clientId = await resolveLeadClientId(userId, res);
  if (!clientId) return;
  const rows = await db.select().from(leadsTable).where(sql`
    ${leadsTable.clientId} = ${clientId}
    AND ${leadsTable.phone} NOT LIKE ${"+1555%"}
    AND ${leadsTable.phone} NOT LIKE ${"+10000000%"}
    AND ${leadsTable.message} NOT LIKE ${"[TEST]%"}
    AND ${leadsTable.clientName} != ${"AI Edge Solutions"}
  `).orderBy(desc(leadsTable.createdAt));
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const active = rows.filter(r => r.status === "new" || r.status === "contacted").length;
  const thisMonth = rows.filter(r => new Date(r.createdAt) >= startOfMonth).length;
  const withMessages = rows.filter(r => r.message && r.message.trim().length > 0).length;
  const followUpDue = rows.filter(r => needsFollowUp(r, now)).length;
  res.json({ leads: rows.map(rowToDto), stats: { total: rows.length, active, thisMonth, withMessages, followUpDue } });
});

export function createLeadAnalysisHandler(
  analyzeLeadFn: typeof analyzeLead = analyzeLead,
  getAuthFn: typeof getAuth = getAuth,
  resolveClientFn: ClientResolver = resolveClientContentContextFromDb,
  ownsLeadFn: LeadOwnershipChecker = defaultLeadOwnershipChecker,
) {
  return async (req: Parameters<typeof getAuth>[0] & { params: { id: string } }, res: any) => {
    const { userId } = getAuthFn(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    try {
      const clientId = await resolveLeadClientId(userId, res, resolveClientFn);
      if (!clientId) return;
      if (!(await ownsLeadFn(clientId, req.params.id))) { res.status(404).json({ error: "lead_not_found" }); return; }
      const result = await analyzeLeadFn(clientId, req.params.id);
      if (result.status === "not_found") { res.status(404).json({ error: result.error }); return; }
      if (result.status === "failed") {
        const statusCode = result.error === "provider_failure" ? 503 : result.error === "invalid_ai_output" ? 422 : 500;
        res.status(statusCode).json({ error: result.error, lead: rowToDto(result.lead) }); return;
      }
      res.json({ lead: rowToDto(result.lead), analysis: { summary: result.analysis.summary, missingInformation: result.analysis.missingInformation } });
    } catch { res.status(500).json({ error: "analysis_unavailable" }); }
  };
}

router.post("/leads/:id/analyze", createLeadAnalysisHandler() as any);

export function createLeadReviewHandler(
  reviewLeadFn: typeof reviewLead = reviewLead,
  getAuthFn: typeof getAuth = getAuth,
  resolveClientFn: ClientResolver = resolveClientContentContextFromDb,
  ownsLeadFn: LeadOwnershipChecker = defaultLeadOwnershipChecker,
) {
  return async (req: Parameters<typeof getAuth>[0] & { params: { id: string }; body: unknown }, res: any) => {
    const { userId } = getAuthFn(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    try {
      const clientId = await resolveLeadClientId(userId, res, resolveClientFn);
      if (!clientId) return;
      if (!(await ownsLeadFn(clientId, req.params.id))) { res.status(404).json({ error: "lead_not_found" }); return; }
      const result = await reviewLeadFn(clientId, req.params.id, req.body);
      if (result.status === "not_found") { res.status(404).json({ error: result.error }); return; }
      if (result.status === "invalid") { res.status(result.error === "draft_not_ready" ? 409 : 422).json({ error: result.error }); return; }
      if (result.status === "failed") { res.status(500).json({ error: result.error }); return; }
      res.json({ action: result.status, lead: rowToDto(result.lead) });
    } catch { res.status(500).json({ error: "review_unavailable" }); }
  };
}

router.patch("/leads/:id/review", createLeadReviewHandler() as any);

export function createLeadSendHandler(
  sendFn: typeof sendApprovedLead = sendApprovedLead,
  getAuthFn: typeof getAuth = getAuth,
  resolveClientFn: ClientResolver = resolveClientContentContextFromDb,
  ownsLeadFn: LeadOwnershipChecker = defaultLeadOwnershipChecker,
) {
  return async (req: Parameters<typeof getAuth>[0] & { params: { id: string } }, res: any) => {
    const { userId } = getAuthFn(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    try {
      const clientId = await resolveLeadClientId(userId, res, resolveClientFn);
      if (!clientId) return;
      if (!(await ownsLeadFn(clientId, req.params.id))) { res.status(404).json({ error: "lead_not_found" }); return; }
      const result = await sendFn(clientId, req.params.id);
      if (result.status === "not_found") { res.status(404).json({ error: result.error }); return; }
      if (result.status === "invalid") {
        const statusCode = result.error === "already_sent" || result.error === "send_in_progress" ? 409 : 422;
        res.status(statusCode).json({ error: result.error }); return;
      }
      if (result.status === "failed") {
        res.status(503).json({ error: result.error, detail: result.detail, lead: result.lead ? rowToDto(result.lead) : null }); return;
      }
      res.json({ action: "sent", messageId: result.messageId, lead: rowToDto(result.lead) });
    } catch { res.status(500).json({ error: "send_unavailable" }); }
  };
}

router.post("/leads/:id/send", createLeadSendHandler() as any);

router.patch("/leads/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const clientId = await resolveLeadClientId(userId, res);
  if (!clientId) return;
  const body = req.body as { status?: string; notes?: string };
  const updated = await db.update(leadsTable).set({
    ...(body.status !== undefined && { status: body.status }),
    ...(body.notes !== undefined && { notes: body.notes }),
    updatedAt: new Date(),
  }).where(and(eq(leadsTable.id, req.params.id), eq(leadsTable.clientId, clientId))).returning();
  if (!updated[0]) { res.status(404).json({ error: "lead_not_found" }); return; }
  res.json(rowToDto(updated[0]));
});

function deliveryStatus(outcome: string | null): string | null {
  if (!outcome?.startsWith("sms_")) return null;
  return outcome.slice(4).split(":")[0] || null;
}

function rowToDto(r: typeof leadsTable.$inferSelect) {
  return {
    id: r.id, clientName: r.clientName, source: r.source, phone: r.phone,
    customerName: r.customerName, message: r.message, eventType: r.eventType,
    status: r.status, notes: r.notes, service: r.service, location: r.location,
    urgency: r.urgency, sourceMessageId: r.sourceMessageId,
    draftResponse: r.draftResponse, responseStatus: r.responseStatus,
    receivedAt: r.receivedAt.toISOString(), lastFollowUpAt: r.lastFollowUpAt?.toISOString() ?? null,
    outcome: r.outcome, deliveryStatus: deliveryStatus(r.outcome), needsFollowUp: needsFollowUp(r),
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

export default router;
