export type ArticleChannelId = "google_business" | "facebook" | "instagram" | "linkedin" | "youtube_short";
export type ArticleAssetStatus = "draft" | "ready" | "published" | "failed";

export const ARTICLE_CHANNELS: { id: ArticleChannelId; label: string; hint: string }[] = [
  { id: "google_business", label: "Google Business Profile Post", hint: "≤1500 chars + CTA" },
  { id: "facebook", label: "Facebook Post", hint: "80–120 words" },
  { id: "instagram", label: "Instagram Caption", hint: "Caption + hashtags" },
  { id: "linkedin", label: "LinkedIn Post", hint: "~150 words, professional" },
  { id: "youtube_short", label: "YouTube Short Script", hint: "30–45s, hook-driven" },
];

export function articleChannelLabel(id: string): string {
  return ARTICLE_CHANNELS.find((c) => c.id === id)?.label ?? id;
}
