import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { clientOnboardingTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

function requireAuth(req: any, res: any): boolean {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return false; }
  return true;
}

// ── GET /api/client-onboarding ── list all ──────────────────────────────────
router.get("/client-onboarding", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const rows = await db
      .select()
      .from(clientOnboardingTable)
      .orderBy(clientOnboardingTable.createdAt);
    res.json(rows);
  } catch (err) {
    console.error("[client-onboarding] list error:", err);
    res.status(500).json({ error: "Failed to load onboardings" });
  }
});

// ── GET /api/client-onboarding/:id ── single ────────────────────────────────
router.get("/client-onboarding/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const [row] = await db
      .select()
      .from(clientOnboardingTable)
      .where(eq(clientOnboardingTable.id, req.params.id));
    if (!row) return void res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    console.error("[client-onboarding] get error:", err);
    res.status(500).json({ error: "Failed to load onboarding" });
  }
});

// ── POST /api/client-onboarding ── create ───────────────────────────────────
router.post("/client-onboarding", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const {
      businessName, industry, website, mainPhone, forwardingPhone, email,
      city, state, zip, serviceRadius, businessHours,
      emergencyService, appointmentRequired, services,
      logoUrl, primaryColor, secondaryColor, brandTone,
      modulesEnabled,
    } = req.body;

    if (!businessName) return void res.status(400).json({ error: "businessName required" });

    const [row] = await db.insert(clientOnboardingTable).values({
      businessName,
      industry:            industry            ?? "",
      website:             website             ?? "",
      mainPhone:           mainPhone           ?? "",
      forwardingPhone:     forwardingPhone     ?? "",
      email:               email               ?? "",
      city:                city                ?? "",
      state:               state               ?? "",
      zip:                 zip                 ?? "",
      serviceRadius:       serviceRadius       ?? "25",
      businessHours:       businessHours       ?? "Mon–Fri 8am–6pm",
      emergencyService:    Boolean(emergencyService),
      appointmentRequired: Boolean(appointmentRequired),
      services:            services            ?? "",
      logoUrl:             logoUrl             ?? "",
      primaryColor:        primaryColor        ?? "#00AEEF",
      secondaryColor:      secondaryColor      ?? "#C0C0C0",
      brandTone:           brandTone           ?? "professional",
      modulesEnabled:      JSON.stringify(modulesEnabled ?? []),
      status:              "draft",
    }).returning();

    res.status(201).json(row);
  } catch (err) {
    console.error("[client-onboarding] create error:", err);
    res.status(500).json({ error: "Failed to create onboarding" });
  }
});

// ── PUT /api/client-onboarding/:id ── update ────────────────────────────────
router.put("/client-onboarding/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const b = req.body;
    const [row] = await db
      .update(clientOnboardingTable)
      .set({
        ...(b.businessName      !== undefined && { businessName:        b.businessName }),
        ...(b.industry          !== undefined && { industry:            b.industry }),
        ...(b.website           !== undefined && { website:             b.website }),
        ...(b.mainPhone         !== undefined && { mainPhone:           b.mainPhone }),
        ...(b.forwardingPhone   !== undefined && { forwardingPhone:     b.forwardingPhone }),
        ...(b.email             !== undefined && { email:               b.email }),
        ...(b.city              !== undefined && { city:                b.city }),
        ...(b.state             !== undefined && { state:               b.state }),
        ...(b.zip               !== undefined && { zip:                 b.zip }),
        ...(b.serviceRadius     !== undefined && { serviceRadius:       b.serviceRadius }),
        ...(b.businessHours     !== undefined && { businessHours:       b.businessHours }),
        ...(b.emergencyService    !== undefined && { emergencyService:    Boolean(b.emergencyService) }),
        ...(b.appointmentRequired !== undefined && { appointmentRequired: Boolean(b.appointmentRequired) }),
        ...(b.services          !== undefined && { services:            b.services }),
        ...(b.logoUrl           !== undefined && { logoUrl:             b.logoUrl }),
        ...(b.primaryColor      !== undefined && { primaryColor:        b.primaryColor }),
        ...(b.secondaryColor    !== undefined && { secondaryColor:      b.secondaryColor }),
        ...(b.brandTone         !== undefined && { brandTone:           b.brandTone }),
        ...(b.modulesEnabled    !== undefined && { modulesEnabled:      JSON.stringify(b.modulesEnabled) }),
        ...(b.status            !== undefined && { status:              b.status }),
      })
      .where(eq(clientOnboardingTable.id, req.params.id))
      .returning();

    if (!row) return void res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    console.error("[client-onboarding] update error:", err);
    res.status(500).json({ error: "Failed to update onboarding" });
  }
});

// ── POST /api/client-onboarding/:id/deploy ── readiness handoff ─────────────
router.post("/client-onboarding/:id/deploy", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const [existing] = await db
      .select()
      .from(clientOnboardingTable)
      .where(eq(clientOnboardingTable.id, req.params.id));

    if (!existing) return void res.status(404).json({ error: "Not found" });
    if (existing.status === "active") return void res.status(400).json({ error: "Already active" });

    const missingFields = [
      ["businessName", existing.businessName], ["mainPhone", existing.mainPhone],
      ["city", existing.city], ["state", existing.state], ["services", existing.services],
    ].filter(([, value]) => !String(value ?? "").trim()).map(([field]) => field);
    if (missingFields.length) return void res.status(422).json({
      error: "Onboarding is not ready for provisioning", code: "ONBOARDING_VALIDATION_FAILED", missingFields,
    });

    const [row] = await db
      .update(clientOnboardingTable)
      .set({ status: "ready_for_provisioning" })
      .where(eq(clientOnboardingTable.id, req.params.id))
      .returning();

    res.json({
      success: true,
      client: row,
      status: "ready_for_provisioning",
      nextAction: "Complete provider connections and provisioning steps, then record acceptance evidence.",
      modulesRequested: JSON.parse(row.modulesEnabled ?? "[]"),
      clientId: row.id,
    });
  } catch (err) {
    console.error("[client-onboarding] deploy error:", err);
    res.status(500).json({ error: "Deploy failed" });
  }
});

// ── DELETE /api/client-onboarding/:id ── delete ─────────────────────────────
router.delete("/client-onboarding/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    await db
      .delete(clientOnboardingTable)
      .where(eq(clientOnboardingTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error("[client-onboarding] delete error:", err);
    res.status(500).json({ error: "Failed to delete" });
  }
});

export default router;
