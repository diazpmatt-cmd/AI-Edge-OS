export type NativeVideoTenantPolicy = {
  allowed: boolean;
  reason: string | null;
  brandProfile: "bed-bugs-and-beyond-v1" | null;
  phoneNumber: string | null;
  allowPestStoryMode: boolean;
};

const BBB_SLUG = "bed-bugs-and-beyond";
const BBB_PUBLIC_PHONE = "(251) 324-9090";

/**
 * The current native FFmpeg renderer contains an intentionally bespoke BB&B
 * visual package (logo, palette, jingle, pest-story scenes). Until a tenant-
 * owned brand-kit renderer exists, every other tenant must fail closed rather
 * than silently receiving BB&B assets or claims.
 */
export function resolveNativeVideoTenantPolicy(clientSlug: string): NativeVideoTenantPolicy {
  if (clientSlug === BBB_SLUG) {
    return {
      allowed: true,
      reason: null,
      brandProfile: "bed-bugs-and-beyond-v1",
      phoneNumber: BBB_PUBLIC_PHONE,
      allowPestStoryMode: true,
    };
  }

  return {
    allowed: false,
    reason: "tenant_video_branding_not_configured",
    brandProfile: null,
    phoneNumber: null,
    allowPestStoryMode: false,
  };
}

export function buildTenantSafeVideoTitle(input: {
  explicitTitle?: string | null;
  topic?: string | null;
  industryLabel: string;
  clientName: string;
}): string {
  const subject = input.topic?.trim() || input.industryLabel.trim() || "Local Service";
  return (input.explicitTitle?.trim() || `${subject} | ${input.clientName}`).slice(0, 100);
}
