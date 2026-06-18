export type SocialProvider =
  | "google_business"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "youtube"
  | "tiktok";

export const SOCIAL_PROVIDERS: {
  id: SocialProvider;
  label: string;
  description: string;
}[] = [
  {
    id: "google_business",
    label: "Google Business Profile",
    description: "Publish posts and updates to your Google Business listing.",
  },
  {
    id: "facebook",
    label: "Facebook Pages",
    description: "Publish posts directly to your connected Facebook Page.",
  },
  {
    id: "instagram",
    label: "Instagram Business",
    description: "Publish captions and media to your Instagram Business account.",
  },
  {
    id: "youtube",
    label: "YouTube",
    description: "Upload Shorts and videos to your YouTube channel.",
  },
  {
    id: "tiktok",
    label: "TikTok Business",
    description: "Publish videos to your TikTok Business account.",
  },
  {
    id: "linkedin",
    label: "LinkedIn Company Pages",
    description: "Publish updates to your LinkedIn company page.",
  },
];
