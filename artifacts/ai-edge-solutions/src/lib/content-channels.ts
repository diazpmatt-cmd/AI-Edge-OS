export type ChannelId =
  | "seo_article"
  | "google_business"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "x"
  | "email"
  | "youtube_short"
  | "tiktok"
  | "image_prompt";

export type AssetStatus = "draft" | "ready" | "published";

export const CHANNELS: { id: ChannelId; label: string; hint: string }[] = [
  { id: "seo_article", label: "SEO Article", hint: "Markdown, 800–1100 words" },
  { id: "google_business", label: "Google Business Post", hint: "~1500 chars, CTA" },
  { id: "facebook", label: "Facebook Post", hint: "~80–120 words" },
  { id: "instagram", label: "Instagram Post", hint: "Caption + hashtags" },
  { id: "linkedin", label: "LinkedIn Post", hint: "Professional, ~150 words" },
  { id: "x", label: "X Post", hint: "≤ 280 chars" },
  { id: "email", label: "Email Newsletter", hint: "Subject + body" },
  { id: "youtube_short", label: "YouTube Short Script", hint: "30–45s, hook-driven" },
  { id: "tiktok", label: "TikTok Script", hint: "15–30s, punchy" },
  { id: "image_prompt", label: "Image Prompt", hint: "For AI image generators" },
];

export function channelLabel(id: string): string {
  return CHANNELS.find((c) => c.id === id)?.label ?? id;
}
