import { normalizeE164 } from "./lead-recovery-transfer-safety.js";

export type PublicInboundEvidenceSource = "local_presence_profile_configured";

export interface PublicInboundEvidence {
  phone: string | null;
  source: PublicInboundEvidenceSource | null;
  available: boolean;
  phoneSpecificProvenanceVerified: false;
  usableForCollisionDetection: boolean;
  usableForNonLoopVerification: false;
}

/**
 * Local Presence currently stores a tenant-scoped business phone, but the phone
 * itself can be operator-edited and has no phone-specific provider provenance.
 * Treat it conservatively: it may block an obvious collision, but a distinct
 * transfer number is NOT automatically declared safe from this evidence alone.
 */
export function resolvePublicInboundEvidence(
  localPresencePhone: string | null | undefined,
): PublicInboundEvidence {
  const normalized = normalizeE164(localPresencePhone);
  const valid = /^\+[1-9]\d{9,14}$/.test(normalized);

  if (!valid) {
    return {
      phone: null,
      source: null,
      available: false,
      phoneSpecificProvenanceVerified: false,
      usableForCollisionDetection: false,
      usableForNonLoopVerification: false,
    };
  }

  return {
    phone: normalized,
    source: "local_presence_profile_configured",
    available: true,
    phoneSpecificProvenanceVerified: false,
    usableForCollisionDetection: true,
    usableForNonLoopVerification: false,
  };
}
