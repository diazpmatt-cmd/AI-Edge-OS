from pathlib import Path

path = Path("artifacts/api-server/src/routes/auto-content.ts")
source = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global source
    count = source.count(old)
    assert count == 1, f"expected one match, found {count}: {old[:120]!r}"
    source = source.replace(old, new, 1)

replace_once("  matchServiceByTopic,\n", "")
replace_once(
    'import { BBB_BRAND, BBB_LOGO_PNG_BASE64 } from "../lib/bbb-brand.js";\n',
    'import { BBB_BRAND, BBB_LOGO_PNG_BASE64 } from "../lib/bbb-brand.js";\nimport { buildTenantImagePrompt, resolveImageBrandPolicy } from "../lib/image-generation-brand-policy.js";\n',
)
replace_once(
    '''export function buildImagePrompt(opts: {
  serviceDisplayName: string;
  city?: string;
  creativeBrief?: string;
}): string {
  const parts: string[] = [
    `Professional pest control marketing image for ${opts.serviceDisplayName}`,
  ];
  if (opts.city?.trim()) parts.push(`serving ${opts.city.trim()}`);
  if (opts.creativeBrief?.trim()) parts.push(`Creative brief: ${opts.creativeBrief.trim()}`);
  return parts.join(". ");
}''',
    '''export function buildImagePrompt(opts: {
  industryLabel?: string;
  serviceDisplayName: string;
  city?: string;
  creativeBrief?: string;
}): string {
  return buildTenantImagePrompt({
    industryLabel: opts.industryLabel ?? "pest control",
    serviceDisplayName: opts.serviceDisplayName,
    city: opts.city,
    creativeBrief: opts.creativeBrief,
  });
}''',
)
replace_once(
    "    const svcRecord = matchServiceByTopic(serviceKey);\n",
    "    const svcRecord = resolved.context.registry.matchByTopic(serviceKey);\n",
)
replace_once(
    '''    effectivePrompt = buildImagePrompt({
      serviceDisplayName: resolvedServiceDisplayName,
      city: city?.trim(),
      creativeBrief: prompt?.trim(),
    });''',
    '''    effectivePrompt = buildImagePrompt({
      industryLabel: resolved.client.industryLabel,
      serviceDisplayName: resolvedServiceDisplayName,
      city: city?.trim(),
      creativeBrief: prompt?.trim(),
    });''',
)
replace_once(
    '''  // [S5] Size allow-list
  const validSizes = ["1024x1024", "1536x1024", "1024x1536"];''',
    '''  const brandPolicy = resolveImageBrandPolicy({
    clientSlug: resolved.client.slug,
    clientName: resolved.client.clientName,
    effectivePrompt,
  });

  // [S5] Size allow-list
  const validSizes = ["1024x1024", "1536x1024", "1024x1536"];''',
)
replace_once(
    '''        prompt: `${effectivePrompt}. Use this exact brand palette throughout the artwork: deep navy ${BBB_BRAND.navy}, ocean blue ${BBB_BRAND.oceanBlue}, aqua ${BBB_BRAND.aqua}, coral orange ${BBB_BRAND.coralOrange}, and white. Leave the lower-right safe area visually clean for the official logo overlay. Do not generate, imitate, spell, or approximate any logo or business name.`,''',
    '''        prompt: brandPolicy.providerPrompt,''',
)
replace_once(
    '''  // Exact brand asset is mandatory. Never save or publish unbranded provider art.
  let brandedImageBuffer: Buffer;
  try {
    brandedImageBuffer = await applyBbbBranding(imageBuffer, size);
  } catch (brandErr: any) {
    console.error("[auto-content/generate-image] branding error:", sanitizeProviderDiagnostic(brandErr?.message ?? "unknown"));
    await markFailed("brand_overlay_failed");
    res.status(500).json({
      error: "Official branding could not be applied",
      message: "The artwork was generated, but the official Bed Bugs & Beyond logo could not be embedded. Nothing was saved or queued.",
    });
    return;
  }''',
    '''  // The canonical BB&B tenant retains its exact logo overlay. Other tenants
  // remain explicitly unbranded until a tenant-owned brand kit is configured;
  // they must never inherit BB&B brand assets or palette.
  let finalImageBuffer: Buffer = imageBuffer;
  if (brandPolicy.requiresOverlay) {
    try {
      finalImageBuffer = await applyBbbBranding(imageBuffer, size);
    } catch (brandErr: any) {
      console.error("[auto-content/generate-image] branding error:", sanitizeProviderDiagnostic(brandErr?.message ?? "unknown"));
      await markFailed("brand_overlay_failed");
      res.status(500).json({
        error: "Official branding could not be applied",
        message: "The artwork was generated, but the official Bed Bugs & Beyond logo could not be embedded. Nothing was saved or queued.",
      });
      return;
    }
  }''',
)
replace_once(
    '      await writeFile(localDataPath, brandedImageBuffer, { flag: "wx" });\n',
    '      await writeFile(localDataPath, finalImageBuffer, { flag: "wx" });\n',
)
replace_once(
    '        JSON.stringify({ contentType: "image/png", byteSize: brandedImageBuffer.length, brand: "bed-bugs-and-beyond-v1" }),\n',
    '        JSON.stringify({ contentType: "image/png", byteSize: finalImageBuffer.length, brand: brandPolicy.metadataBrand }),\n',
)
replace_once(
    '        .save(brandedImageBuffer, { contentType: "image/png", resumable: false });\n',
    '        .save(finalImageBuffer, { contentType: "image/png", resumable: false });\n',
)

assert "matchServiceByTopic(serviceKey)" not in source
assert "brand: \"bed-bugs-and-beyond-v1\"" not in source
path.write_text(source, encoding="utf-8")
