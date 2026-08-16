import { BBB_BRAND } from "./bbb-brand.js";

export type ImageBrandMode = "bbb_official" | "tenant_unbranded";

export interface ImageBrandPolicy {
  mode: ImageBrandMode;
  providerPrompt: string;
  metadataBrand: string;
  requiresOverlay: boolean;
}

export function buildTenantImagePrompt(opts: {
  industryLabel: string;
  serviceDisplayName: string;
  city?: string;
  creativeBrief?: string;
}): string {
  const industry = opts.industryLabel.trim() || "local service";
  const parts = [`Professional ${industry} marketing image for ${opts.serviceDisplayName}`];
  if (opts.city?.trim()) parts.push(`serving ${opts.city.trim()}`);
  if (opts.creativeBrief?.trim()) parts.push(`Creative brief: ${opts.creativeBrief.trim()}`);
  return parts.join(". ");
}

export function resolveImageBrandPolicy(opts: {
  clientSlug: string;
  clientName: string;
  effectivePrompt: string;
}): ImageBrandPolicy {
  if (opts.clientSlug === "bed-bugs-and-beyond") {
    return {
      mode: "bbb_official",
      requiresOverlay: true,
      metadataBrand: "bed-bugs-and-beyond-v1",
      providerPrompt: `${opts.effectivePrompt}. Use this exact brand palette throughout the artwork: deep navy ${BBB_BRAND.navy}, ocean blue ${BBB_BRAND.oceanBlue}, aqua ${BBB_BRAND.aqua}, coral orange ${BBB_BRAND.coralOrange}, and white. Leave the lower-right safe area visually clean for the official logo overlay. Do not generate, imitate, spell, or approximate any logo or business name.`,
    };
  }

  return {
    mode: "tenant_unbranded",
    requiresOverlay: false,
    metadataBrand: "tenant-unbranded-v1",
    providerPrompt: `${opts.effectivePrompt}. Create clean professional artwork appropriate for ${opts.clientName}. Do not generate, imitate, spell, or approximate any logo, brand mark, or business name.`,
  };
}
