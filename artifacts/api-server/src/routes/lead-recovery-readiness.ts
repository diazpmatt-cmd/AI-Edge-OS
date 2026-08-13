import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, db, eq } from "@workspace/db";
import {
  aiReceptionistSettingsTable,
  communicationEndpointsTable,
} from "@workspace/db/schema";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";

const router = Router();

function normalizeE164(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.startsWith("+") ? raw : `+${digits}`;
}

router.get("/lead-recovery/readiness", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const resolved = await resolveClientActiveCheck(userId);
    if (!resolved.ok) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    const clientId = resolved.clientId;
    const telnyxFromNumber = normalizeE164(
      process.env.TELNYX_FROM_NUMBER ?? "+12512863200",
    );

    const [endpointRows, settingsRows] = await Promise.all([
      db
        .select({
          id: communicationEndpointsTable.id,
          active: communicationEndpointsTable.active,
          verified: communicationEndpointsTable.verified,
          purpose: communicationEndpointsTable.purpose,
        })
        .from(communicationEndpointsTable)
        .where(
          and(
            eq(communicationEndpointsTable.clientId, clientId),
            eq(communicationEndpointsTable.provider, "telnyx"),
            eq(communicationEndpointsTable.e164Number, telnyxFromNumber),
          ),
        )
        .limit(1),
      db
        .select({
          transferPhone: aiReceptionistSettingsTable.transferPhone,
          businessName: aiReceptionistSettingsTable.businessName,
          afterHoursMode: aiReceptionistSettingsTable.afterHoursMode,
        })
        .from(aiReceptionistSettingsTable)
        .where(eq(aiReceptionistSettingsTable.clientId, clientId))
        .limit(1),
    ]);

    const endpoint = endpointRows[0] ?? null;
    const settings = settingsRows[0] ?? null;
    const endpointReady = !!endpoint?.active && !!endpoint?.verified;
    const telnyxApiKeyConfigured = !!process.env.TELNYX_API_KEY?.trim();
    const telnyxPublicKeyConfigured = !!process.env.TELNYX_PUBLIC_KEY?.trim();
    const schedulerEnabled = process.env.SCHEDULER_ENABLED === "true";
    const transferConfigured = !!settings?.transferPhone?.trim();

    res.json({
      checkedAt: new Date().toISOString(),
      clientId,
      telnyx: {
        apiKeyConfigured: telnyxApiKeyConfigured,
        publicKeyConfigured: telnyxPublicKeyConfigured,
        fromNumber: telnyxFromNumber,
      },
      communicationEndpoint: {
        found: !!endpoint,
        active: endpoint?.active ?? false,
        verified: endpoint?.verified ?? false,
        purpose: endpoint?.purpose ?? null,
        ready: endpointReady,
      },
      aiReceptionist: {
        settingsPresent: !!settings,
        businessName: settings?.businessName ?? null,
        transferConfigured,
        afterHoursMode: settings?.afterHoursMode ?? null,
      },
      recoveryOwnership: {
        schedulerEnabled,
        immediateWebhookOwner: true,
        duplicateOwnerRisk: schedulerEnabled,
      },
      readiness: {
        inboundRoutingReady: endpointReady,
        missedCallRecoveryReady: endpointReady && telnyxApiKeyConfigured && !schedulerEnabled,
        signedWebhookVerificationReady: telnyxPublicKeyConfigured,
        receptionistTransferReady: endpointReady && transferConfigured,
      },
    });
  } catch (error) {
    console.error("[lead-recovery-readiness] failed:", error);
    res.status(500).json({ error: "readiness_check_failed" });
  }
});

export default router;
