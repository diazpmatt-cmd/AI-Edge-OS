import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { clientOnboardingTable, aiVisibilityAuditsTable } from "@workspace/db/schema";
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

// ── POST /api/client-onboarding/:id/deploy ── deploy ────────────────────────
router.post("/client-onboarding/:id/deploy", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const [existing] = await db
      .select()
      .from(clientOnboardingTable)
      .where(eq(clientOnboardingTable.id, req.params.id));

    if (!existing) return void res.status(404).json({ error: "Not found" });
    if (existing.status === "deployed") return void res.status(400).json({ error: "Already deployed" });

    const [row] = await db
      .update(clientOnboardingTable)
      .set({ status: "deployed" })
      .where(eq(clientOnboardingTable.id, req.params.id))
      .returning();

    // ── Auto-create AI Visibility audit record ────────────────────────────────
    const [visibilityAudit] = await db.insert(aiVisibilityAuditsTable).values({
      clientId:     row.id,
      businessName: row.businessName,
      overallScore: 30, searchScore: 42, mapsScore: 48,
      aiSearchScore: 14, authorityScore: 22, reviewScore: 55, competitorGapScore: 20,
      channelsJson: JSON.stringify([
        { id: "google_search",    name: "Google Search",    category: "search",    status: "Connected",   score: 52, priority: "high",     action: "Add LocalBusiness schema" },
        { id: "bing_search",      name: "Bing Search",      category: "search",    status: "Needs Setup", score: 18, priority: "high",     action: "Claim Bing Places listing" },
        { id: "google_maps",      name: "Google Maps",      category: "maps",      status: "Connected",   score: 61, priority: "high",     action: "Add photos & weekly posts" },
        { id: "apple_maps",       name: "Apple Maps",       category: "maps",      status: "Needs Setup", score: 0,  priority: "critical", action: "Claim Apple Business Connect" },
        { id: "bing_places",      name: "Bing Places",      category: "maps",      status: "Needs Setup", score: 0,  priority: "high",     action: "Claim Bing Places for Business" },
        { id: "waze",             name: "Waze",             category: "maps",      status: "Opportunity", score: 12, priority: "medium",   action: "Add Waze business listing" },
        { id: "yelp",             name: "Yelp",             category: "directory", status: "Connected",   score: 40, priority: "medium",   action: "Increase review velocity" },
        { id: "facebook",         name: "Facebook",         category: "directory", status: "Connected",   score: 48, priority: "medium",   action: "Enable recommendations" },
        { id: "nextdoor",         name: "Nextdoor",         category: "directory", status: "Opportunity", score: 6,  priority: "medium",   action: "Create Nextdoor business page" },
        { id: "chatgpt",          name: "ChatGPT",          category: "ai",        status: "Monitoring",  score: 10, priority: "critical", action: "Build citation authority" },
        { id: "claude",           name: "Claude",           category: "ai",        status: "Monitoring",  score: 8,  priority: "high",     action: "Add structured data + FAQ" },
        { id: "gemini",           name: "Gemini",           category: "ai",        status: "Monitoring",  score: 19, priority: "high",     action: "Strengthen GBP signals" },
        { id: "perplexity",       name: "Perplexity",       category: "ai",        status: "Monitoring",  score: 6,  priority: "high",     action: "Build high-authority citations" },
        { id: "copilot",          name: "Copilot",          category: "ai",        status: "Monitoring",  score: 12, priority: "high",     action: "Claim Bing Places + schema" },
        { id: "grok",             name: "Grok",             category: "ai",        status: "Monitoring",  score: 4,  priority: "low",      action: "Monitor for future integration" },
        { id: "siri",             name: "Siri / Voice",     category: "voice",     status: "Needs Setup", score: 0,  priority: "high",     action: "Claim Apple Business Connect" },
        { id: "alexa",            name: "Alexa / Voice",    category: "voice",     status: "Opportunity", score: 5,  priority: "medium",   action: "Add Yext or Alexa listing" },
        { id: "google_assistant", name: "Google Assistant", category: "voice",     status: "Connected",   score: 35, priority: "medium",   action: "Optimize for voice queries" },
      ]),
      competitorsJson: JSON.stringify([
        { name: "Local Competitor A", reviewGap: -18, keywordGap: "High",   backlinkGap: "High",   aiGap: -14, opportunityScore: 74 },
        { name: "Local Competitor B", reviewGap: -7,  keywordGap: "Medium", backlinkGap: "Medium", aiGap: -8,  opportunityScore: 52 },
        { name: "Local Competitor C", reviewGap: -2,  keywordGap: "Low",    backlinkGap: "Low",    aiGap: -5,  opportunityScore: 38 },
      ]),
      recommendationsJson: JSON.stringify([
        { priority: "critical", task: "Claim Apple Business Connect",         reason: "Siri & Apple Maps send zero customers without this listing",          impact: "High",   status: "pending" },
        { priority: "critical", task: "Add LocalBusiness JSON-LD schema",     reason: "AI platforms cannot identify business as a verified local entity",    impact: "High",   status: "pending" },
        { priority: "critical", task: "Build 20+ citation listings",          reason: "Low citation count is limiting AI search authority",                  impact: "High",   status: "pending" },
        { priority: "high",     task: "Claim Bing Places for Business",       reason: "Copilot AI pulls from Bing Places — currently missing",              impact: "High",   status: "pending" },
        { priority: "high",     task: "Add FAQPage schema to service pages",  reason: "FAQ schema is the #1 signal for AI search snippet selection",        impact: "Medium", status: "pending" },
        { priority: "high",     task: "Launch post-job review request campaign", reason: "Review velocity below competitor average",                        impact: "High",   status: "pending" },
        { priority: "high",     task: "Create location-specific service pages",  reason: "City pages unlock long-tail AI visibility per service area",      impact: "High",   status: "pending" },
        { priority: "medium",   task: "Add llms.txt to website root",         reason: "Allows AI crawlers to index business information directly",          impact: "Medium", status: "pending" },
        { priority: "medium",   task: "Create AI-optimized About page",       reason: "Entity recognition requires a clear, crawlable business bio",        impact: "Medium", status: "pending" },
        { priority: "medium",   task: "Build local backlink profile",         reason: "Chamber links + news citations improve authority scores",            impact: "Medium", status: "pending" },
        { priority: "low",      task: "Set up Nextdoor business page",        reason: "Nextdoor drives hyper-local neighborhood referrals",                 impact: "Low",    status: "pending" },
        { priority: "low",      task: "Add Waze business listing",            reason: "Captures navigation-intent customers nearby",                        impact: "Low",    status: "pending" },
      ]),
    }).returning();

    res.json({
      success: true,
      client: row,
      deployedAt: new Date().toISOString(),
      workspace: `workspace_${row.id.slice(0, 8)}`,
      modulesActivated: JSON.parse(row.modulesEnabled ?? "[]"),
      visibilityAuditId: visibilityAudit.id,
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
