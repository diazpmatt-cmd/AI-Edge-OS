export function buildReferralShareUrl(origin: string, referralCode: string): string {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  return `${normalizedOrigin}/refer/${encodeURIComponent(referralCode)}`;
}
