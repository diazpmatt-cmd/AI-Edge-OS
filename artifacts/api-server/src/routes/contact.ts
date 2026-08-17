import { createHash } from "node:crypto";
import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable } from "@workspace/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();
const CONTACT_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

export const contactSubmissionSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(32).regex(/^[+0-9().\-\s]+$/),
  business: z.string().trim().min(1).max(160),
  industry: z.string().trim().min(1).max(100),
  services: z.array(z.string().trim().min(1).max(100)).max(20).optional().default([]),
  message: z.string().trim().max(2000).optional().default(""),
  packageKey: z.string().trim().max(80).regex(/^[a-z0-9_-]*$/i).optional().default(""),
  packageLabel: z.string().trim().max(120).optional().default(""),
}).strict();

export type ContactSubmission = z.infer<typeof contactSubmissionSchema>;

type ContactCaptureResult = { id: string; duplicate: boolean };
export type ContactCaptureFn = (
  submission: ContactSubmission,
  dedupeKey: string,
  now?: Date,
) => Promise<ContactCaptureResult>;

function normalizedContactFingerprint(submission: ContactSubmission) {
  return {
    firstName: submission.firstName.toLowerCase(),
    lastName: submission.lastName.toLowerCase(),
    email: submission.email.toLowerCase(),
    phone: submission.phone.replace(/\D/g, ""),
    business: submission.business.toLowerCase(),
    industry: submission.industry.toLowerCase(),
    services: [...submission.services].map(service => service.toLowerCase()).sort(),
    message: submission.message.toLowerCase(),
    packageKey: submission.packageKey.toLowerCase(),
    packageLabel: submission.packageLabel.toLowerCase(),
  };
}

export function deriveContactDedupeKey(submission: ContactSubmission): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(normalizedContactFingerprint(submission)))
    .digest("hex");
  return `contact-form:${digest}`;
}

function composeContactMessage(submission: ContactSubmission): string | undefined {
  const lines: string[] = [];
  if (submission.packageLabel) lines.push(`Package: ${submission.packageLabel}`);
  lines.push(`Email: ${submission.email}`);
  lines.push(`Business: ${submission.business}`);
  lines.push(`Industry: ${submission.industry}`);
  if (submission.services.length > 0) lines.push(`Services: ${submission.services.join(", ")}`);
  if (submission.message) lines.push(`Message: ${submission.message}`);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

export async function captureContactLead(
  submission: ContactSubmission,
  dedupeKey: string,
  now = new Date(),
): Promise<ContactCaptureResult> {
  const dedupeCutoff = new Date(now.getTime() - CONTACT_DEDUPE_WINDOW_MS);

  return db.transaction(async tx => {
    // Serialize identical submissions across app instances before checking/inserting.
    // This prevents frontend retries or double-click races from creating duplicate leads.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${dedupeKey}))`);

    const [existing] = await tx
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(
        eq(leadsTable.source, "contact-form"),
        eq(leadsTable.sourceMessageId, dedupeKey),
        gte(leadsTable.createdAt, dedupeCutoff),
      ))
      .limit(1);

    if (existing) return { id: existing.id, duplicate: true };

    const [lead] = await tx
      .insert(leadsTable)
      .values({
        clientName: "AI Edge Solutions",
        source: "contact-form",
        phone: submission.phone,
        customerName: `${submission.firstName} ${submission.lastName}`,
        message: composeContactMessage(submission),
        eventType: submission.packageKey ? `contact-form:${submission.packageKey}` : "contact-form",
        sourceMessageId: dedupeKey,
        status: "new",
      })
      .returning({ id: leadsTable.id });

    return { id: lead.id, duplicate: false };
  });
}

export function createContactHandler(captureFn: ContactCaptureFn = captureContactLead) {
  return async (req: { body: unknown }, res: any) => {
    const parsed = contactSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues
        .map(issue => issue.path[0])
        .filter((field): field is string | number => field !== undefined)
        .map(String))];
      res.status(422).json({ error: "invalid_contact_submission", fields });
      return;
    }

    try {
      const dedupeKey = deriveContactDedupeKey(parsed.data);
      const result = await captureFn(parsed.data, dedupeKey);
      res.status(result.duplicate ? 200 : 201).json({ id: result.id, duplicate: result.duplicate });
    } catch (error) {
      console.error("[contact] lead capture failed", error instanceof Error ? error.message : "unknown_error");
      res.status(503).json({ error: "contact_capture_unavailable" });
    }
  };
}

router.post("/contact", createContactHandler() as any);

export default router;
