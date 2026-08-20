export type AttributionMatchMethod = "normalized_phone" | "first_name_candidate";

export type AttributionCandidate = {
  method: AttributionMatchMethod;
  confidence: number;
  reasons: string[];
};

type MatchParty = { name: string; phone?: string | null };

function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function matchAttributionCandidate(
  lead: MatchParty,
  customer: MatchParty,
): AttributionCandidate | null {
  const leadPhone = normalizePhone(lead.phone);
  const customerPhone = normalizePhone(customer.phone);
  if (leadPhone && customerPhone && leadPhone === customerPhone) {
    return {
      method: "normalized_phone",
      confidence: 90,
      reasons: ["Exact normalized phone match in the tenant-scoped customer snapshot."],
    };
  }

  const leadFirstName = lead.name.trim().toLowerCase().split(/\s+/)[0] ?? "";
  const customerFirstName = customer.name.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (leadFirstName.length > 2 && leadFirstName === customerFirstName) {
    return {
      method: "first_name_candidate",
      confidence: 25,
      reasons: ["First name only; human verification is required before attribution."],
    };
  }

  return null;
}
