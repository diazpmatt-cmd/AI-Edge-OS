import { Router } from "express";
import { db } from "@workspace/db";
import { assessmentsTable } from "@workspace/db/schema";

const router = Router();

// PUBLIC — no Clerk auth (lead generation tool for public visitors)
router.post("/assessments", async (req, res) => {
  try {
    const body = req.body as {
      businessName: string;
      industry: string;
      city: string;
      state: string;
      websiteUrl?: string;
      gbpUrl?: string;
      facebookUrl?: string;
      instagramUrl?: string;
      contactName: string;
      contactEmail: string;
      contactPhone?: string;
      contactMethod?: string;
      scoreOverall?: number;
      scoreLeadRecovery?: number;
      scoreLocalPresence?: number;
      scoreAiVisibility?: number;
      scoreReviewStrength?: number;
    };

    if (!body.businessName || !body.industry || !body.city || !body.state || !body.contactName || !body.contactEmail) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const [row] = await db
      .insert(assessmentsTable)
      .values({
        businessName:         body.businessName,
        industry:             body.industry,
        city:                 body.city,
        state:                body.state,
        websiteUrl:           body.websiteUrl   || null,
        gbpUrl:               body.gbpUrl       || null,
        facebookUrl:          body.facebookUrl  || null,
        instagramUrl:         body.instagramUrl || null,
        contactName:          body.contactName,
        contactEmail:         body.contactEmail,
        contactPhone:         body.contactPhone  || null,
        contactMethod:        body.contactMethod || null,
        scoreOverall:         body.scoreOverall         ?? null,
        scoreLeadRecovery:    body.scoreLeadRecovery    ?? null,
        scoreLocalPresence:   body.scoreLocalPresence   ?? null,
        scoreAiVisibility:    body.scoreAiVisibility    ?? null,
        scoreReviewStrength:  body.scoreReviewStrength  ?? null,
      })
      .returning();

    res.status(201).json({ id: row.id });
  } catch (err) {
    console.error("[assessments] POST error:", err);
    res.status(500).json({ error: "Failed to save assessment" });
  }
});

export default router;
