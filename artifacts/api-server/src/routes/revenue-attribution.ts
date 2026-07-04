import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, eq, and, sql, or } from "@workspace/db";
import { revenueAttributionTable, gorilladeskCustomersTable } from "@workspace/db";

const router = Router();

function rowToDto(row: typeof revenueAttributionTable.$inferSelect) {
  return {
    id:               row.id,
    leadId:           row.leadId,
    clientId:         row.clientId,
    customerName:     row.customerName,
    phone:            row.phone,
    leadSource:       row.leadSource,
    status:           row.status,
    revenue:          row.revenue ? parseFloat(row.revenue) : null,
    serviceType:      row.serviceType,
    notes:            row.notes,
    gorilladeskJobId: row.gorilladeskJobId,
    matchedAt:        row.matchedAt?.toISOString() ?? null,
    createdAt:        row.createdAt?.toISOString(),
    updatedAt:        row.updatedAt?.toISOString(),
  };
}

router.get("/revenue-attribution", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const clientId = (req.query.clientId as string) ?? "default";
    const rows = await db
      .select()
      .from(revenueAttributionTable)
      .where(eq(revenueAttributionTable.clientId, clientId))
      .orderBy(sql`${revenueAttributionTable.createdAt} desc`);
    return res.json(rows.map(rowToDto));
  } catch (err) {
    console.error("[revenue-attribution] GET error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/revenue-attribution", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { leadId, clientId, customerName, phone, leadSource, status, revenue, serviceType, notes, gorilladeskJobId } = req.body;

  if (!clientId || !customerName || !leadSource) {
    return res.status(400).json({ error: "clientId, customerName, and leadSource are required" });
  }

  try {
    const [row] = await db
      .insert(revenueAttributionTable)
      .values({
        leadId, clientId, customerName, phone,
        leadSource, status: status ?? "pending",
        revenue: revenue != null ? String(revenue) : null,
        serviceType, notes, gorilladeskJobId,
      })
      .returning();
    return res.status(201).json(rowToDto(row));
  } catch (err) {
    console.error("[revenue-attribution] POST error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/revenue-attribution/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  const { status, revenue, serviceType, notes, gorilladeskJobId, matchedAt } = req.body;

  try {
    const [row] = await db
      .update(revenueAttributionTable)
      .set({
        ...(status           !== undefined && { status }),
        ...(revenue          !== undefined && { revenue: revenue != null ? String(revenue) : null }),
        ...(serviceType      !== undefined && { serviceType }),
        ...(notes            !== undefined && { notes }),
        ...(gorilladeskJobId !== undefined && { gorilladeskJobId }),
        ...(matchedAt        !== undefined && { matchedAt: matchedAt ? new Date(matchedAt) : null }),
      })
      .where(eq(revenueAttributionTable.id, id))
      .returning();

    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(rowToDto(row));
  } catch (err) {
    console.error("[revenue-attribution] PUT error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/revenue-attribution/match-gorilladesk
// Attempts to match all unmatched leads against GorillaDesk customers by phone.
// Falls back gracefully if GorillaDesk table is empty or API key is missing.
router.post("/revenue-attribution/match-gorilladesk", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.body.clientId as string) ?? "default";

  try {
    // 1. Fetch all unmatched leads for this client
    const leads = await db
      .select()
      .from(revenueAttributionTable)
      .where(
        and(
          eq(revenueAttributionTable.clientId, clientId),
          eq(revenueAttributionTable.status, "unmatched"),
        )
      );

    if (leads.length === 0) {
      return res.json({ matched: 0, ids: [], message: "No unmatched leads to process" });
    }

    // 2. Fetch GorillaDesk customers to match against (safe — returns [] if table empty)
    let gdCustomers: Array<{ phone: string | null; firstName: string | null; lastName: string | null }> = [];
    try {
      gdCustomers = await db
        .select({
          phone:     gorilladeskCustomersTable.phone,
          firstName: gorilladeskCustomersTable.firstName,
          lastName:  gorilladeskCustomersTable.lastName,
        })
        .from(gorilladeskCustomersTable);
    } catch {
      // GorillaDesk table not available — continue with name-only matching
    }

    // 3. Match each lead by phone (primary) or full name (secondary)
    const matched: string[] = [];
    const now = new Date();

    for (const lead of leads) {
      const leadPhone = lead.phone?.replace(/\D/g, "") ?? "";

      // Try GorillaDesk customer phone match
      const gdMatch = gdCustomers.find(c => {
        const gdPhone = c.phone?.replace(/\D/g, "") ?? "";
        return gdPhone && leadPhone && gdPhone === leadPhone;
      });

      // Name match fallback
      const leadName = lead.customerName.toLowerCase();
      const nameMatch = !gdMatch && gdCustomers.find(c => {
        const full = `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase().trim();
        return full && leadName.includes(full.split(" ")[0]);
      });

      if (gdMatch || nameMatch) {
        await db
          .update(revenueAttributionTable)
          .set({ status: "matched", matchedAt: now })
          .where(eq(revenueAttributionTable.id, lead.id));
        matched.push(lead.id);
      }
    }

    return res.json({
      matched:      matched.length,
      ids:          matched,
      totalChecked: leads.length,
      gdCustomers:  gdCustomers.length,
      message:      `Matched ${matched.length} of ${leads.length} unmatched leads against ${gdCustomers.length} GorillaDesk customers`,
    });
  } catch (err) {
    console.error("[revenue-attribution] match-gorilladesk error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
