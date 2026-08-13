export type TransferSafetyStatus =
  | "blocked"
  | "manual_verification_required"
  | "verified_non_looping";

export type TransferSafetyReason =
  | "transfer_not_configured"
  | "matches_telnyx_ai_number"
  | "matches_known_legacy_public_forwarding_number"
  | "matches_canonical_public_inbound_number"
  | "public_inbound_number_not_configured"
  | "transfer_destination_distinct_from_public_inbound";

// Transitional migration guard only. This value was the historical database
// default for ai_receptionist_settings.transfer_phone and is known to be BB&B's
// public line, which may forward back to the Telnyx AI number. It is never used
// as a routing default or a destination for new settings.
export const KNOWN_LEGACY_UNSAFE_TRANSFER_NUMBERS = ["+12513249090"] as const;

export function normalizeE164(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.startsWith("+") ? raw : digits ? `+${digits}` : "";
}

export interface TransferSafetyInput {
  transferPhone: string | null | undefined;
  telnyxAiNumber: string | null | undefined;
  canonicalPublicInboundPhone?: string | null | undefined;
  knownLegacyUnsafeNumbers?: readonly string[];
}

export interface TransferSafetyAssessment {
  status: TransferSafetyStatus;
  reason: TransferSafetyReason;
  transferPhone: string;
  telnyxAiNumber: string;
  canonicalPublicInboundPhone: string | null;
  configured: boolean;
  sameAsTelnyxAiNumber: boolean;
  sameAsCanonicalPublicInbound: boolean;
  knownLegacyUnsafeDefaultDetected: boolean;
}

export function assessTransferSafety(input: TransferSafetyInput): TransferSafetyAssessment {
  const transferPhone = normalizeE164(input.transferPhone);
  const telnyxAiNumber = normalizeE164(input.telnyxAiNumber);
  const canonicalPublicInboundPhone = normalizeE164(input.canonicalPublicInboundPhone) || null;
  const legacyUnsafe = new Set(
    (input.knownLegacyUnsafeNumbers ?? KNOWN_LEGACY_UNSAFE_TRANSFER_NUMBERS)
      .map(normalizeE164)
      .filter(Boolean),
  );

  const configured = Boolean(transferPhone);
  const sameAsTelnyxAiNumber = configured && Boolean(telnyxAiNumber) && transferPhone === telnyxAiNumber;
  const sameAsCanonicalPublicInbound =
    configured && Boolean(canonicalPublicInboundPhone) && transferPhone === canonicalPublicInboundPhone;
  const knownLegacyUnsafeDefaultDetected = configured && legacyUnsafe.has(transferPhone);

  let status: TransferSafetyStatus;
  let reason: TransferSafetyReason;

  if (!configured) {
    status = "blocked";
    reason = "transfer_not_configured";
  } else if (sameAsTelnyxAiNumber) {
    status = "blocked";
    reason = "matches_telnyx_ai_number";
  } else if (sameAsCanonicalPublicInbound) {
    status = "blocked";
    reason = "matches_canonical_public_inbound_number";
  } else if (knownLegacyUnsafeDefaultDetected) {
    status = "blocked";
    reason = "matches_known_legacy_public_forwarding_number";
  } else if (!canonicalPublicInboundPhone) {
    status = "manual_verification_required";
    reason = "public_inbound_number_not_configured";
  } else {
    status = "verified_non_looping";
    reason = "transfer_destination_distinct_from_public_inbound";
  }

  return {
    status,
    reason,
    transferPhone,
    telnyxAiNumber,
    canonicalPublicInboundPhone,
    configured,
    sameAsTelnyxAiNumber,
    sameAsCanonicalPublicInbound,
    knownLegacyUnsafeDefaultDetected,
  };
}
