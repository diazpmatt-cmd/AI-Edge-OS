import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { aiVisibilityAuditsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

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
    { name: "Havard Pest Control",            reviewGap: -24, keywordGap: "High", backlinkGap: "High",   aiGap: -16, opportunityScore: 78 },
    { name: "Beebe's Pest & Termite Control", reviewGap: -8,  keywordGap: "Medium", backlinkGap: "Medium", aiGap: -9,  opportunityScore: 55 },
    { name: "Knox Pest Control",              reviewGap: -3,  keywordGap: "Low",  backlinkGap: "Low",    aiGap: -7,  opportunityScore: 42 },
    { name: "Arrow Exterminators",            reviewGap: -41, keywordGap: "High", backlinkGap: "High",   aiGap: -22, opportunityScore: 91 },
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

// ── GET /api/ai-visibility ── list all audits ────────────────────────────────
router.get("/ai-visibility", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const rows = await db
      .select()
      .from(aiVisibilityAuditsTable)
      .orderBy(desc(aiVisibilityAuditsTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("[ai-visibility] list error:", err);
    res.status(500).json({ error: "Failed to load audits" });
  }
});

// ── GET /api/ai-visibility/:clientId ── single (with demo fallback) ──────────
router.get("/ai-visibility/:clientId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const [row] = await db
      .select()
      .from(aiVisibilityAuditsTable)
      .where(eq(aiVisibilityAuditsTable.clientId, req.params.clientId))
      .orderBy(desc(aiVisibilityAuditsTable.createdAt))
      .limit(1);

    if (!row) {
      // Return demo/fallback data so the dashboard is never empty
      return res.json({ ...DEMO_AUDIT, id: "demo", createdAt: new Date(), updatedAt: new Date() });
    }
    res.json(row);
  } catch (err) {
    console.error("[ai-visibility] get error:", err);
    res.status(500).json({ error: "Failed to load audit" });
  }
});

// ── POST /api/ai-visibility/audit ── create audit ───────────────────────────
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

// ── PUT /api/ai-visibility/:id ── update ─────────────────────────────────────
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

export default router;
