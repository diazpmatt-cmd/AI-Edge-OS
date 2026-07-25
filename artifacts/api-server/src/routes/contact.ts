import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable } from "@workspace/db/schema";

const router = Router();

router.post("/contact", async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    business,
    industry,
    services,
    message,
    packageKey,
    packageLabel,
  } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    business?: string;
    industry?: string;
    services?: string[];
    message?: string;
    packageKey?: string;
    packageLabel?: string;
  };

  const lines: string[] = [];

  if (packageLabel) {
    lines.push(`Package: ${packageLabel}`);
  }
  if (email) {
    lines.push(`Email: ${email}`);
  }
  if (business) {
    lines.push(`Business: ${business}`);
  }
  if (industry) {
    lines.push(`Industry: ${industry}`);
  }
  if (services && services.length > 0) {
    lines.push(`Services: ${services.join(", ")}`);
  }
  if (message) {
    lines.push(`Message: ${message}`);
  }

  const composedMessage = lines.join("\n");

  const [lead] = await db
    .insert(leadsTable)
    .values({
      clientName: "AI Edge Solutions",
      source: "contact-form",
      phone: phone ?? "",
      customerName: [firstName, lastName].filter(Boolean).join(" ") || undefined,
      message: composedMessage || undefined,
      eventType: packageKey ? `contact-form:${packageKey}` : "contact-form",
      status: "new",
    })
    .returning();

  res.status(201).json({ id: lead.id });
});

export default router;
