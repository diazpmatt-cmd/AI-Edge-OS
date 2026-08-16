import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, pool } from "@workspace/db";
import { clientOnboardingTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { buildStagingRowPreflight } from "../lib/client-onboarding-staging-preflight.js";
import { isApollosAdminUser } from "../lib/apollos-admin-access-policy.js";
import { CanonicalProvisioningError, provisionCanonicalClient } from "../lib/client-onboarding-provisioning.js";

const router = Router();

/**
 * Production does not run drizzle-kit push. Bootstrap only the ownership column
 * needed by this route, idempotently, and fail closed if PostgreSQL is not ready.
 * The matching SQL migration remains the durable schema history.
 */
const onboardingOwnershipBootstrapReady: Promise<boolean> = pool
  .query(`
    ALTER TABLE client_onboarding
      ADD COLUMN IF NOT EXISTS created_by_user_id TEXT,
      ADD COLUMN IF NOT EXISTS provisioned_client_id UUID,
      ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS client_onboarding_created_by_user_id_idx
      ON client_onboarding (created_by_user_id)
      WHERE created_by_user_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS client_onboarding_provisioned_client_id_idx
      ON client_onboarding (provisioned_client_id)
      WHERE provisioned_client_id IS NOT NULL;
  `)
  .then(() => {
    console.log("[client-onboarding] operator ownership schema ready");
    return true;
  })
  .catch((err) => {
    console.error("[client-onboarding] ownership bootstrap failed:", err);
    return false;
  });

function authenticatedUserId(req: any, res: any): string | null {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId;
}

async function requireOwnershipSchema(res: any): Promise<boolean> {
  const ready = await onboardingOwnershipBootstrapReady;
  if (!ready) {
    res.status(503).json({
      error: "client_onboarding_unavailable",
      code: "ONBOARDING_OWNERSHIP_BOOTSTRAP_UNAVAILABLE",
    });
    return false;
  }
  return true;
}

function ownedRow(id: string, userId: string) {
  return and(
    eq(clientOnboardingTable.id, id),
    eq(clientOnboardingTable.createdByUserId, userId),
  );
}

// ── GET /api/client-onboarding ── operator-owned staging rows only ────────────
router.get("/client-onboarding", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId || !(await requireOwnershipSchema(res))) return;

  try {
    const rows = await db
      .select()
      .from(clientOnboardingTable)
      .where(eq(clientOnboardingTable.createdByUserId, userId))
      .orderBy(clientOnboardingTable.createdAt);
    res.json(rows);
  } catch (err) {
    console.error("[client-onboarding] list error:", err);
    res.status(500).json({ error: "Failed to load onboardings" });
  }
});

// ── GET /api/client-onboarding/:id/preflight ── read-only owned draft check ──
router.get("/client-onboarding/:id/preflight", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId || !(await requireOwnershipSchema(res))) return;

  try {
    const [row] = await db
      .select()
      .from(clientOnboardingTable)
      .where(ownedRow(req.params.id, userId));

    if (!row) return void res.status(404).json({ error: "Not found" });

    const preflight = buildStagingRowPreflight(row);
    res.json({
      onboardingId: row.id,
      stagingStatus: row.status,
      preflight,
      provisioningStatus: row.provisionedClientId ? "provisioned" : "not_accepted",
      canonicalClientId: row.provisionedClientId ?? null,
      provisionedAt: row.provisionedAt?.toISOString?.() ?? row.provisionedAt ?? null,
      safety: {
        stagingRowMutated: false,
        canonicalClientCreated: false,
        externalProviderCalled: false,
      },
    });
  } catch (err) {
    console.error("[client-onboarding] preflight error:", err);
    res.status(500).json({ error: "Failed to run onboarding preflight" });
  }
});

// ── GET /api/client-onboarding/:id ── owned row only ─────────────────────────
router.get("/client-onboarding/:id", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId || !(await requireOwnershipSchema(res))) return;

  try {
    const [row] = await db
      .select()
      .from(clientOnboardingTable)
      .where(ownedRow(req.params.id, userId));
    if (!row) return void res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    console.error("[client-onboarding] get error:", err);
    res.status(500).json({ error: "Failed to load onboarding" });
  }
});

// ── POST /api/client-onboarding ── create operator-owned draft ───────────────
router.post("/client-onboarding", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId || !(await requireOwnershipSchema(res))) return;

  try {
    const {
      businessName, industry, website, mainPhone, forwardingPhone, email,
      city, state, zip, serviceRadius, businessHours,
      emergencyService, appointmentRequired, services,
      logoUrl, primaryColor, secondaryColor, brandTone,
      modulesEnabled,
    } = req.body;

    if (!String(businessName ?? "").trim()) {
      return void res.status(400).json({ error: "businessName required" });
    }

    const [row] = await db.insert(clientOnboardingTable).values({
      createdByUserId:     userId,
      businessName:        String(businessName).trim(),
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
      modulesEnabled:      JSON.stringify(Array.isArray(modulesEnabled) ? modulesEnabled : []),
      status:              "draft",
    }).returning();

    res.status(201).json(row);
  } catch (err) {
    console.error("[client-onboarding] create error:", err);
    res.status(500).json({ error: "Failed to create onboarding" });
  }
});

// ── PUT /api/client-onboarding/:id ── update owned draft fields only ─────────
router.put("/client-onboarding/:id", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId || !(await requireOwnershipSchema(res))) return;

  try {
    const b = req.body;
    const [row] = await db
      .update(clientOnboardingTable)
      .set({
        ...(b.businessName      !== undefined && { businessName:        String(b.businessName).trim() }),
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
        ...(b.modulesEnabled    !== undefined && {
          modulesEnabled: JSON.stringify(Array.isArray(b.modulesEnabled) ? b.modulesEnabled : []),
        }),
      })
      .where(ownedRow(req.params.id, userId))
      .returning();

    if (!row) return void res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    console.error("[client-onboarding] update error:", err);
    res.status(500).json({ error: "Failed to update onboarding" });
  }
});

// Canonical provisioning is an internal, no-provider transaction. The target
// tenant identity is accepted only from an explicitly allowlisted Apollos admin.
// Provider activation, phone ordering, messaging, publishing, billing and OAuth
// remain outside this endpoint and are returned as readiness-only work.
router.post("/client-onboarding/:id/deploy", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId || !(await requireOwnershipSchema(res))) return;

  if (!isApollosAdminUser(userId)) {
    return void res.status(403).json({
      error: "Forbidden",
      code: "APOLLOS_ADMIN_REQUIRED",
    });
  }

  const targetIdentitySource = String(req.body?.targetIdentitySource ?? "").trim();
  if (targetIdentitySource !== "clerk_user_id") {
    return void res.status(400).json({
      error: "trusted_target_identity_required",
      code: "TRUSTED_TARGET_IDENTITY_REQUIRED",
      message: "targetIdentitySource must be clerk_user_id and targetUserId must be supplied by an allowlisted admin.",
    });
  }

  try {
    const result = await provisionCanonicalClient({
      stagingId: req.params.id,
      actorUserId: userId,
      targetUserId: req.body?.targetUserId,
    });
    return void res.status(result.idempotent ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof CanonicalProvisioningError) {
      return void res.status(error.status).json({
        error: error.message,
        code: error.code,
        ...(error.details !== undefined && { details: error.details }),
      });
    }
    console.error("[client-onboarding] deploy error:", error);
    return void res.status(500).json({ error: "Canonical provisioning failed" });
  }
});

// ── DELETE /api/client-onboarding/:id ── owned row only ──────────────────────
router.delete("/client-onboarding/:id", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId || !(await requireOwnershipSchema(res))) return;

  try {
    const [row] = await db
      .delete(clientOnboardingTable)
      .where(ownedRow(req.params.id, userId))
      .returning({ id: clientOnboardingTable.id });

    if (!row) return void res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("[client-onboarding] delete error:", err);
    res.status(500).json({ error: "Failed to delete" });
  }
});

export default router;
