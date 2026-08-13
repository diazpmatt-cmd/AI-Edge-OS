import { normalizeE164 } from "./lead-recovery-transfer-safety.js";

export type PublicInboundEvidenceSource = "local_presence_profile";

export interface PublicInboundEvidence {
  phone: string | null;
  source: PublicInboundEvidenceSource | null;
  available: boolean;
}

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
    };
  }

  return {
    phone: normalized,
    source: "local_presence_profile",
    available: true,
  };
}
