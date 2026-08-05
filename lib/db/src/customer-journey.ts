export function normalizeJourneyPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function normalizeJourneyEmail(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized.includes("@") && normalized.length <= 254 ? normalized : null;
}

export function journeyIdentityKey(clientId: string, phone?: string | null, email?: string | null): string | null {
  const normalizedPhone = normalizeJourneyPhone(phone);
  const normalizedEmail = normalizeJourneyEmail(email);
  if (normalizedPhone) return `${clientId}:phone:${normalizedPhone}`;
  if (normalizedEmail) return `${clientId}:email:${normalizedEmail}`;
  return null;
}
