// ── Shared Media Validation Configuration ───────────────────────────────────
// Single source of truth for accepted MIME types, file extensions, size limits,
// and media kind mapping.  Imported by MediaUploader, SocialPublishingPage,
// BBBContentAutopilotPage, and the backend (api-server/src/lib/media-config.ts).

export type MediaKind = "image" | "video" | "audio";

export interface MediaTypeConfig {
  kind:       MediaKind;
  mimeType:   string;
  extensions: string[];  // lowercase with leading dot
  maxBytes:   number;
  label:      string;    // human-readable (e.g. "MP4")
}

const MB = 1024 * 1024;

// Size limits are publishing-safe, not object-storage maximums.
//  • Images  : 10 MB  — matches legacy multer limit
//  • MP4     : 100 MB — YouTube publisher loads blob into memory; keep well under heap
//  • MP3     : 50 MB  — audio source asset; no in-memory publishing limit yet
export const MAX_IMAGE_BYTES  =  10 * MB;
export const MAX_VIDEO_BYTES  = 100 * MB;
export const MAX_AUDIO_BYTES  =  50 * MB;

export const MEDIA_TYPES: MediaTypeConfig[] = [
  { kind: "image", mimeType: "image/jpeg", extensions: [".jpg", ".jpeg"], maxBytes: MAX_IMAGE_BYTES, label: "JPG" },
  { kind: "image", mimeType: "image/jpg",  extensions: [".jpg", ".jpeg"], maxBytes: MAX_IMAGE_BYTES, label: "JPG" },
  { kind: "image", mimeType: "image/png",  extensions: [".png"],          maxBytes: MAX_IMAGE_BYTES, label: "PNG" },
  { kind: "image", mimeType: "image/webp", extensions: [".webp"],         maxBytes: MAX_IMAGE_BYTES, label: "WEBP" },
  { kind: "image", mimeType: "image/gif",  extensions: [".gif"],          maxBytes: MAX_IMAGE_BYTES, label: "GIF" },
  { kind: "video", mimeType: "video/mp4",  extensions: [".mp4"],          maxBytes: MAX_VIDEO_BYTES, label: "MP4" },
  { kind: "audio", mimeType: "audio/mpeg", extensions: [".mp3"],          maxBytes: MAX_AUDIO_BYTES, label: "MP3" },
  { kind: "audio", mimeType: "audio/mp3",  extensions: [".mp3"],          maxBytes: MAX_AUDIO_BYTES, label: "MP3" },
];

export const ALLOWED_MIME_SET = new Set(MEDIA_TYPES.map(t => t.mimeType));
export const ALLOWED_EXT_SET  = new Set(MEDIA_TYPES.flatMap(t => t.extensions));

export function getMediaTypeConfig(mimeType: string): MediaTypeConfig | undefined {
  return MEDIA_TYPES.find(t => t.mimeType === mimeType);
}

export function getMediaKind(mimeType: string): MediaKind | null {
  return getMediaTypeConfig(mimeType)?.kind ?? null;
}

export function getMaxBytes(mimeType: string): number {
  return getMediaTypeConfig(mimeType)?.maxBytes ?? 0;
}

export function formatMaxSize(mimeType: string): string {
  const b = getMaxBytes(mimeType);
  return b ? `${Math.round(b / MB)} MB` : "Unknown";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < MB)          return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * MB)   return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / (1024 * MB)).toFixed(2)} GB`;
}

// ── Validation ────────────────────────────────────────────────────────────────

export type MediaValidationErrorCode =
  | "empty_file"
  | "unsupported_type"
  | "mime_extension_mismatch"
  | "too_large";

export interface MediaValidationResult {
  ok:        boolean;
  kind?:     MediaKind;
  error?:    string;
  errorCode?: MediaValidationErrorCode;
}

export function validateMediaFile(
  mimeType: string,
  filename: string,
  byteSize: number,
): MediaValidationResult {
  if (byteSize <= 0) {
    return { ok: false, error: "File is empty.", errorCode: "empty_file" };
  }

  if (!ALLOWED_MIME_SET.has(mimeType)) {
    return {
      ok: false,
      error: `Unsupported file type: ${mimeType}. Accepted: JPG, PNG, WEBP, GIF, MP4, MP3.`,
      errorCode: "unsupported_type",
    };
  }

  const config = getMediaTypeConfig(mimeType)!;
  const ext    = filename.includes(".")
    ? "." + filename.split(".").pop()!.toLowerCase()
    : "";

  if (ext && !config.extensions.includes(ext)) {
    return {
      ok: false,
      error: `Extension "${ext}" does not match MIME type "${mimeType}".`,
      errorCode: "mime_extension_mismatch",
    };
  }

  if (byteSize > config.maxBytes) {
    const limitMb = config.maxBytes / MB;
    return {
      ok: false,
      error: `File too large. Maximum size for ${config.label} is ${limitMb} MB.`,
      errorCode: "too_large",
    };
  }

  return { ok: true, kind: config.kind };
}

// ── Accept string for <input type="file" accept="..."> ────────────────────────

export function buildAcceptAttr(kinds: MediaKind[]): string {
  const mimes = MEDIA_TYPES
    .filter(t => kinds.includes(t.kind))
    .map(t => t.mimeType);
  const exts = MEDIA_TYPES
    .filter(t => kinds.includes(t.kind))
    .flatMap(t => t.extensions);
  return [...new Set([...mimes, ...exts])].join(",");
}

// ── Preview URL resolution ────────────────────────────────────────────────────
// objectPath may be:
//   /objects/{uuid}         → served via /api/storage/objects/objects/{uuid}
//   /api/uploads/...        → legacy multer disk upload, use as-is relative to base
//   https://...             → external URL, use as-is

export function resolvePreviewUrl(objectPath: string, base: string): string {
  if (objectPath.startsWith("http://") || objectPath.startsWith("https://")) {
    return objectPath;
  }
  if (objectPath.startsWith("/objects/")) {
    return `${base}/api/storage/objects${objectPath}`;
  }
  // Legacy /api/uploads/... or other relative paths
  if (objectPath.startsWith("/api/")) {
    return `${base}${objectPath}`;
  }
  return objectPath;
}
