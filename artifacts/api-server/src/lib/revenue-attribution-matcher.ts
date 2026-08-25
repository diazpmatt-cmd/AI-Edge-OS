export type RevenueMatchMethod =
  | "provider_customer_id"
  | "normalized_phone"
  | "first_name_candidate"
  | "human_verified"
  | "legacy_unknown";

export type RevenueMatchCandidate = {
  customerExternalId: string | null;
  customerName: string;
  customerPhone: string | null;
};

export type RevenueMatchDecision = {
  candidate: RevenueMatchCandidate;
  method: Exclude<RevenueMatchMethod, "human_verified" | "legacy_unknown">;
  confidence: number;
  automaticMatchAllowed: boolean;
};

export function normalizeRevenuePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function selectRevenueAttributionCandidate(
  lead: { customerName: string; phone: string | null; providerCustomerId?: string | null },
  candidates: readonly RevenueMatchCandidate[],
): RevenueMatchDecision | null {
  const providerCustomerId = lead.providerCustomerId?.trim();
  if (providerCustomerId) {
    const candidate = candidates.find(row => row.customerExternalId === providerCustomerId);
    if (candidate) return { candidate, method: "provider_customer_id", confidence: 100, automaticMatchAllowed: true };
  }

  const phone = normalizeRevenuePhone(lead.phone);
  if (phone) {
    const phoneMatches = candidates.filter(row => normalizeRevenuePhone(row.customerPhone) === phone);
    if (phoneMatches.length === 1) {
      return { candidate: phoneMatches[0], method: "normalized_phone", confidence: 85, automaticMatchAllowed: true };
    }
    if (phoneMatches.length > 1) {
      return { candidate: phoneMatches[0], method: "normalized_phone", confidence: 50, automaticMatchAllowed: false };
    }
  }

  const leadFirstName = lead.customerName.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (leadFirstName.length <= 2) return null;
  const candidate = candidates.find(row => {
    const candidateFirstName = row.customerName.trim().toLowerCase().split(/\s+/)[0] ?? "";
    return candidateFirstName === leadFirstName;
  });
  return candidate
    ? { candidate, method: "first_name_candidate", confidence: 20, automaticMatchAllowed: false }
    : null;
}
