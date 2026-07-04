import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, eq, and, sql } from "@workspace/db";
import { revenueAttributionTable } from "@workspace/db";

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
  const { status, revenue, serviceType, notes, gorilladeskJobId } = req.body;

  try {
    const [row] = await db
      .update(revenueAttributionTable)
      .set({
        ...(status           !== undefined && { status }),
        ...(revenue          !== undefined && { revenue: revenue != null ? String(revenue) : null }),
        ...(serviceType      !== undefined && { serviceType }),
        ...(notes            !== undefined && { notes }),
        ...(gorilladeskJobId !== undefined && { gorilladeskJobId }),
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

router.post("/revenue-attribution/match-gorilladesk", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { phone, customerName, clientId } = req.body;
  if (!phone && !customerName) {
    return res.status(400).json({ error: "phone or customerName required" });
  }

  try {
    const leads = await db
      .select()
      .from(revenueAttributionTable)
      .where(
        and(
          eq(revenueAttributionTable.clientId, clientId ?? "default"),
          eq(revenueAttributionTable.status, "unmatched"),
        )
      );

    const matched: string[] = [];
    for (const lead of leads) {
      const phoneMatch = phone && lead.phone && lead.phone.replace(/\D/g, "") === phone.replace(/\D/g, "");
      const nameMatch  = customerName && lead.customerName.toLowerCase().includes(customerName.toLowerCase());

      if (phoneMatch || nameMatch) {
        await db
          .update(revenueAttributionTable)
          .set({ status: "matched" })
          .where(eq(revenueAttributionTable.id, lead.id));
        matched.push(lead.id);
      }
    }

    return res.json({ matched: matched.length, ids: matched });
  } catch (err) {
    console.error("[revenue-attribution] match-gorilladesk error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
