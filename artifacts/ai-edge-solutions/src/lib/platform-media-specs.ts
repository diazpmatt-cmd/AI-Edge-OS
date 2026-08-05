export type MediaPlatform = "facebook" | "instagram" | "google_business" | "youtube" | "tiktok";
export type MediaKind = "image" | "video" | "thumbnail";

export interface PlatformMediaSpec { platform: MediaPlatform; kind: MediaKind; width: number; height: number; required: boolean; }
export interface GeneratedMediaEvidence { platform: MediaPlatform; kind: MediaKind; width: number; height: number; mimeType: string; storageKey: string; humanReviewed: boolean; }

const SPECS: PlatformMediaSpec[] = [
  { platform: "facebook", kind: "image", width: 1200, height: 630, required: true },
  { platform: "instagram", kind: "image", width: 1080, height: 1080, required: true },
  { platform: "google_business", kind: "image", width: 1200, height: 900, required: true },
  { platform: "youtube", kind: "video", width: 1920, height: 1080, required: true },
  { platform: "youtube", kind: "thumbnail", width: 1280, height: 720, required: false },
  { platform: "tiktok", kind: "video", width: 1080, height: 1920, required: true },
];

export function getPlatformMediaSpec(platform: MediaPlatform, kind: MediaKind) { return SPECS.find(spec => spec.platform === platform && spec.kind === kind) ?? null; }
export function validateGeneratedMedia(evidence: GeneratedMediaEvidence): string[] {
  const spec = getPlatformMediaSpec(evidence.platform, evidence.kind);
  if (!spec) return ["No media specification exists for this platform and media kind."];
  const errors: string[] = [];
  if (evidence.width !== spec.width || evidence.height !== spec.height) errors.push(`Media must be ${spec.width}x${spec.height}.`);
  if (!evidence.mimeType.trim()) errors.push("Media MIME type is required.");
  if (!evidence.storageKey.trim()) errors.push("Durable media storage is required.");
  if (!evidence.humanReviewed) errors.push("Generated media requires human review.");
  return errors;
}
