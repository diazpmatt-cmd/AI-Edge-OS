import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, db, eq, pool } from "@workspace/db";
import {
  aiReceptionistSettingsTable,
  communicationEndpointsTable,
  localPresenceProfilesTable,
} from "@workspace/db/schema";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";
import {
  assessTransferSafety,
  normalizeE164,
} from "../lib/lead-recovery-transfer-safety.js";
import { resolvePublicInboundEvidence } from "../lib/lead-recovery-public-phone-evidence.js";

const router = Router();

// Production does not run drizzle-kit push automatically. Neutralize only the
// historical database DEFAULT here; never rewrite an existing tenant row.
const transferDefaultSafetyBootstrap: Promise<boolean> = pool
  .query(`
    ALTER TABLE ai_receptionist_settings
      ALTER COLUMN transfer_phone SET DEFAULT '';
  `)
  .then(() => {
    console.log("[lead-recovery-readiness] receptionist transfer default neutralized");
    return true;
  })
  .catch((error) => {
    console.error("[lead-recovery-readiness] transfer default bootstrap failed:", error);
    return false;
  });

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

    const [endpointRows, settingsRows, localPresenceRows, schemaDefaultNeutralized] = await Promise.all([
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
      db
        .select({ phone: localPresenceProfilesTable.phone })
        .from(localPresenceProfilesTable)
        .where(eq(localPresenceProfilesTable.clientId, clientId))
        .limit(1),
      transferDefaultSafetyBootstrap,
    ]);

    const endpoint = endpointRows[0] ?? null;
    const settings = settingsRows[0] ?? null;
    const publicInboundEvidence = resolvePublicInboundEvidence(localPresenceRows[0]?.phone);
    const endpointReady = !!endpoint?.active && !!endpoint?.verified;
    const telnyxApiKeyConfigured = !!process.env.TELNYX_API_KEY?.trim();
    const telnyxPublicKeyConfigured = !!process.env.TELNYX_PUBLIC_KEY?.trim();
    const schedulerEnabled = process.env.SCHEDULER_ENABLED === "true";

    const normalizedTransfer = normalizeE164(settings?.transferPhone);
    const profilePhoneCollision = Boolean(
      publicInboundEvidence.usableForCollisionDetection &&
      publicInboundEvidence.phone &&
      normalizedTransfer &&
      publicInboundEvidence.phone === normalizedTransfer,
    );

    // The Local Presence phone is tenant-scoped but currently lacks phone-specific
    // provider provenance. Use it to block an obvious collision only. A distinct
    // number remains manual-verification-required until verified phone provenance
    // exists; do not turn configured profile data into a false safety claim.
    const transferSafety = assessTransferSafety({
      transferPhone: settings?.transferPhone,
      telnyxAiNumber: telnyxFromNumber,
      canonicalPublicInboundPhone: profilePhoneCollision
        ? publicInboundEvidence.phone
        : undefined,
    });

    const transferConfigured = transferSafety.configured;
    const transferConfigurationReady = endpointReady && transferConfigured;
    const transferSafeForLiveTest =
      endpointReady && transferSafety.status === "verified_non_looping";

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
      publicInboundEvidence: {
        ...publicInboundEvidence,
        collisionWithTransfer: profilePhoneCollision,
      },
      aiReceptionist: {
        settingsPresent: !!settings,
        businessName: settings?.businessName ?? null,
        transferConfigured,
        transferPhone: transferSafety.transferPhone || null,
        afterHoursMode: settings?.afterHoursMode ?? null,
        transferSafety: {
          status: transferSafety.status,
          reason: transferSafety.reason,
          sameAsTelnyxAiNumber: transferSafety.sameAsTelnyxAiNumber,
          sameAsCanonicalPublicInbound: profilePhoneCollision,
          knownLegacyUnsafeDefaultDetected: transferSafety.knownLegacyUnsafeDefaultDetected,
          canonicalPublicInboundPhone: profilePhoneCollision
            ? publicInboundEvidence.phone
            : null,
          manualVerificationRequired:
            transferSafety.status === "manual_verification_required",
        },
      },
      recoveryOwnership: {
        schedulerEnabled,
        immediateWebhookOwner: true,
        duplicateOwnerRisk: schedulerEnabled,
      },
      safetyMaintenance: {
        schemaDefaultNeutralized,
        existingTransferRowMutated: false,
      },
      readiness: {
        inboundRoutingReady: endpointReady,
        missedCallRecoveryReady: endpointReady && telnyxApiKeyConfigured && !schedulerEnabled,
        signedWebhookVerificationReady: telnyxPublicKeyConfigured,
        receptionistTransferConfigurationReady: transferConfigurationReady,
        receptionistTransferSafetyVerified:
          transferSafety.status === "verified_non_looping",
        receptionistTransferReady: transferSafeForLiveTest,
      },
    });
  } catch (error) {
    console.error("[lead-recovery-readiness] failed:", error);
    res.status(500).json({ error: "readiness_check_failed" });
  }
});

export default router;
