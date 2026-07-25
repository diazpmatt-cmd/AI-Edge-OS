import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable } from "@workspace/db/schema";
import { eq, desc, gte, and, isNotNull, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();

function parseWebLeadMessage(msg: string | null): {
  email: string | null;
  business: string | null;
  industry: string | null;
  services: string | null;
  packageLabel: string | null;
  note: string | null;
} {
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
    if (key === "email")    result.email        = val;
    if (key === "business") result.business     = val;
    if (key === "industry") result.industry     = val;
    if (key === "services") result.services     = val;
    if (key === "package")  result.packageLabel = val;
    if (key === "message")  result.note         = val;
  }
  return result;
}

router.get("/leads/web", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select()
    .from(leadsTable)
    .where(sql`
      ${leadsTable.clientName} = ${"AI Edge Solutions"}
      AND ${leadsTable.source} = ${"contact-form"}
    `)
    .orderBy(desc(leadsTable.createdAt));

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const active    = rows.filter(r => r.status === "new" || r.status === "contacted").length;
  const thisMonth = rows.filter(r => new Date(r.createdAt) >= startOfMonth).length;

  res.json({
    leads: rows.map(r => {
      const parsed = parseWebLeadMessage(r.message);
      return {
        id:           r.id,
        customerName: r.customerName ?? null,
        phone:        r.phone,
        email:        parsed.email,
        business:     parsed.business,
        industry:     parsed.industry,
        services:     parsed.services,
        packageLabel: parsed.packageLabel,
        packageKey:   r.eventType.startsWith("contact-form:") ? r.eventType.replace("contact-form:", "") : null,
        note:         parsed.note,
        status:       r.status,
        notes:        r.notes,
        createdAt:    r.createdAt.toISOString(),
        updatedAt:    r.updatedAt.toISOString(),
      };
    }),
    stats: { total: rows.length, active, thisMonth },
  });
});

router.get("/leads", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select()
    .from(leadsTable)
    .where(sql`
      ${leadsTable.phone}      NOT LIKE ${"+1555%"}
      AND ${leadsTable.phone}  NOT LIKE ${"+10000000%"}
      AND ${leadsTable.message} NOT LIKE ${"[TEST]%"}
      AND ${leadsTable.clientName} != ${"AI Edge Solutions"}
    `)
    .orderBy(desc(leadsTable.createdAt));

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const active = rows.filter(r => r.status === "new" || r.status === "contacted").length;
  const thisMonth = rows.filter(r => new Date(r.createdAt) >= startOfMonth).length;
  const withMessages = rows.filter(r => r.message && r.message.trim().length > 0).length;

  res.json({
    leads: rows.map(rowToDto),
    stats: { total: rows.length, active, thisMonth, withMessages },
  });
});

router.patch("/leads/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const body = req.body as { status?: string; notes?: string };
  const updated = await db
    .update(leadsTable)
    .set({
      ...(body.status !== undefined && { status: body.status }),
      ...(body.notes  !== undefined && { notes:  body.notes  }),
      updatedAt: new Date(),
    })
    .where(eq(leadsTable.id, req.params.id))
    .returning();

  if (!updated[0]) { res.status(404).send(); return; }
  res.json(rowToDto(updated[0]));
});

function rowToDto(r: typeof leadsTable.$inferSelect) {
  return {
    id:           r.id,
    clientName:   r.clientName,
    source:       r.source,
    phone:        r.phone,
    customerName: r.customerName,
    message:      r.message,
    eventType:    r.eventType,
    status:       r.status,
    notes:        r.notes,
    createdAt:    r.createdAt.toISOString(),
    updatedAt:    r.updatedAt.toISOString(),
  };
}

export default router;
