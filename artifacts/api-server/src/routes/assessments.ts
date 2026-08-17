import { createHash } from "node:crypto";
import { Router } from "express";
import { db } from "@workspace/db";
import { assessmentsTable } from "@workspace/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { authorizeAssessmentsAccess } from "../lib/assessments-access-policy.js";

const router = Router();
const ASSESSMENT_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");
const optionalScore = z.number().int().min(0).max(100).optional();

export const assessmentSubmissionSchema = z.object({
  businessName: z.string().trim().min(1).max(160),
  industry: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/).transform(value => value.toUpperCase()),
  websiteUrl: optionalText(2048),
  gbpUrl: optionalText(2048),
  facebookUrl: optionalText(2048),
  instagramUrl: optionalText(2048),
  contactName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  contactPhone: optionalText(32),
  contactMethod: z.enum(["email", "phone", "text"]).optional().default("email"),
  scoreOverall: optionalScore,
  scoreLeadRecovery: optionalScore,
  scoreLocalPresence: optionalScore,
  scoreAiVisibility: optionalScore,
  scoreReviewStrength: optionalScore,
}).strict();

export type AssessmentSubmission = z.infer<typeof assessmentSubmissionSchema>;
type AssessmentCaptureResult = { id: string; duplicate: boolean };
export type AssessmentCaptureFn = (
  submission: AssessmentSubmission,
  dedupeKey: string,
  now?: Date,
) => Promise<AssessmentCaptureResult>;

function normalizedAssessmentFingerprint(submission: {
  businessName: string;
  industry: string;
  city: string;
  state: string;
  websiteUrl?: string | null;
  gbpUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  contactMethod?: string | null;
  scoreOverall?: number | null;
  scoreLeadRecovery?: number | null;
  scoreLocalPresence?: number | null;
  scoreAiVisibility?: number | null;
  scoreReviewStrength?: number | null;
}) {
  return {
    businessName: submission.businessName.trim().toLowerCase(),
    industry: submission.industry.trim().toLowerCase(),
    city: submission.city.trim().toLowerCase(),
    state: submission.state.trim().toUpperCase(),
    websiteUrl: (submission.websiteUrl ?? "").trim().toLowerCase(),
    gbpUrl: (submission.gbpUrl ?? "").trim().toLowerCase(),
    facebookUrl: (submission.facebookUrl ?? "").trim().toLowerCase(),
    instagramUrl: (submission.instagramUrl ?? "").trim().toLowerCase(),
    contactName: submission.contactName.trim().toLowerCase(),
    contactEmail: submission.contactEmail.trim().toLowerCase(),
    contactPhone: (submission.contactPhone ?? "").replace(/\D/g, ""),
    contactMethod: (submission.contactMethod ?? "email").trim().toLowerCase(),
    scoreOverall: submission.scoreOverall ?? null,
    scoreLeadRecovery: submission.scoreLeadRecovery ?? null,
    scoreLocalPresence: submission.scoreLocalPresence ?? null,
    scoreAiVisibility: submission.scoreAiVisibility ?? null,
    scoreReviewStrength: submission.scoreReviewStrength ?? null,
  };
}

export function deriveAssessmentDedupeKey(submission: AssessmentSubmission): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(normalizedAssessmentFingerprint(submission)))
    .digest("hex");
  return `assessment:${digest}`;
}

export async function captureAssessment(
  submission: AssessmentSubmission,
  dedupeKey: string,
  now = new Date(),
): Promise<AssessmentCaptureResult> {
  const dedupeCutoff = new Date(now.getTime() - ASSESSMENT_DEDUPE_WINDOW_MS);

  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${dedupeKey}))`);

    const recent = await tx
      .select()
      .from(assessmentsTable)
      .where(and(
        eq(assessmentsTable.contactEmail, submission.contactEmail),
        gte(assessmentsTable.createdAt, dedupeCutoff),
      ))
      .orderBy(desc(assessmentsTable.createdAt));

    const requestedFingerprint = JSON.stringify(normalizedAssessmentFingerprint(submission));
    const existing = recent.find(row => JSON.stringify(normalizedAssessmentFingerprint(row)) === requestedFingerprint);
    if (existing) return { id: existing.id, duplicate: true };

    const [row] = await tx
      .insert(assessmentsTable)
      .values({
        businessName: submission.businessName,
        industry: submission.industry,
        city: submission.city,
        state: submission.state,
        websiteUrl: submission.websiteUrl || null,
        gbpUrl: submission.gbpUrl || null,
        facebookUrl: submission.facebookUrl || null,
        instagramUrl: submission.instagramUrl || null,
        contactName: submission.contactName,
        contactEmail: submission.contactEmail,
        contactPhone: submission.contactPhone || null,
        contactMethod: submission.contactMethod,
        scoreOverall: submission.scoreOverall ?? null,
        scoreLeadRecovery: submission.scoreLeadRecovery ?? null,
        scoreLocalPresence: submission.scoreLocalPresence ?? null,
        scoreAiVisibility: submission.scoreAiVisibility ?? null,
        scoreReviewStrength: submission.scoreReviewStrength ?? null,
        status: "new",
      })
      .returning({ id: assessmentsTable.id });

    return { id: row.id, duplicate: false };
  });
}

export function createAssessmentSubmissionHandler(captureFn: AssessmentCaptureFn = captureAssessment) {
  return async (req: { body: unknown }, res: any) => {
    const parsed = assessmentSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues
        .map(issue => issue.path[0])
        .filter((field): field is string | number => field !== undefined)
        .map(String))];
      res.status(422).json({ error: "invalid_assessment_submission", fields });
      return;
    }

    try {
      const dedupeKey = deriveAssessmentDedupeKey(parsed.data);
      const result = await captureFn(parsed.data, dedupeKey);
      res.status(result.duplicate ? 200 : 201).json({ id: result.id, duplicate: result.duplicate });
    } catch (err) {
      console.error("[assessments] POST error:", err instanceof Error ? err.message : "unknown_error");
      res.status(503).json({ error: "assessment_capture_unavailable" });
    }
  };
}

// PUBLIC — no Clerk auth (lead generation tool for public visitors)
router.post("/assessments", createAssessmentSubmissionHandler() as any);

// PROTECTED — company assessment CRM requires canonical Apollos admin access.
router.get("/assessments", async (req, res) => {
  const { userId } = getAuth(req);
  const access = authorizeAssessmentsAccess(userId);
  if (!access.ok) { res.status(access.status).json({ error: access.error }); return; }

  try {
    const rows = await db
      .select()
      .from(assessmentsTable)
      .orderBy(desc(assessmentsTable.createdAt));

    res.json({ assessments: rows });
  } catch (err) {
    console.error("[assessments] GET error:", err);
    res.status(500).json({ error: "Failed to fetch assessments" });
  }
});

// PROTECTED — company assessment CRM writes require canonical Apollos admin access.
router.patch("/assessments/:id", async (req, res) => {
  const { userId } = getAuth(req);
  const access = authorizeAssessmentsAccess(userId);
  if (!access.ok) { res.status(access.status).json({ error: access.error }); return; }

  try {
    const body = req.body as { status?: string; notes?: string };
    const [updated] = await db
      .update(assessmentsTable)
      .set({
        ...(body.status !== undefined && { status: body.status }),
        ...(body.notes  !== undefined && { notes:  body.notes  }),
      })
      .where(eq(assessmentsTable.id, req.params.id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("[assessments] PATCH error:", err);
    res.status(500).json({ error: "Failed to update assessment" });
  }
});

export default router;
