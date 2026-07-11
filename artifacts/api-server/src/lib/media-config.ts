// ── Backend Media Validation Configuration ────────────────────────────────────
// Server-side equivalent of artifacts/ai-edge-solutions/src/lib/media-config.ts
// Used by POST /storage/uploads/request-url to validate incoming upload requests.

export type MediaKind = "image" | "video" | "audio";

const MB = 1024 * 1024;

export const MAX_IMAGE_BYTES  =  10 * MB;
export const MAX_VIDEO_BYTES  = 100 * MB;
export const MAX_AUDIO_BYTES  =  50 * MB;

interface MediaTypeConfig {
  kind:       MediaKind;
  mimeType:   string;
  extensions: string[];
  maxBytes:   number;
  label:      string;
}

const MEDIA_TYPES: MediaTypeConfig[] = [
  { kind: "image", mimeType: "image/jpeg", extensions: [".jpg", ".jpeg"], maxBytes: MAX_IMAGE_BYTES, label: "JPG" },
  { kind: "image", mimeType: "image/jpg",  extensions: [".jpg", ".jpeg"], maxBytes: MAX_IMAGE_BYTES, label: "JPG" },
  { kind: "image", mimeType: "image/png",  extensions: [".png"],          maxBytes: MAX_IMAGE_BYTES, label: "PNG" },
  { kind: "image", mimeType: "image/webp", extensions: [".webp"],         maxBytes: MAX_IMAGE_BYTES, label: "WEBP" },
  { kind: "image", mimeType: "image/gif",  extensions: [".gif"],          maxBytes: MAX_IMAGE_BYTES, label: "GIF" },
  { kind: "video", mimeType: "video/mp4",  extensions: [".mp4"],          maxBytes: MAX_VIDEO_BYTES, label: "MP4" },
  { kind: "audio", mimeType: "audio/mpeg", extensions: [".mp3"],          maxBytes: MAX_AUDIO_BYTES, label: "MP3" },
  { kind: "audio", mimeType: "audio/mp3",  extensions: [".mp3"],          maxBytes: MAX_AUDIO_BYTES, label: "MP3" },
];

// Normalized MIME map — normalizes browser alias (audio/mp3 → audio/mpeg)
const MIME_NORMALIZE: Record<string, string> = {
  "image/jpg":  "image/jpeg",
  "audio/mp3":  "audio/mpeg",
};

export function normalizeMimeType(mimeType: string): string {
  return MIME_NORMALIZE[mimeType] ?? mimeType;
}

export const ALLOWED_MIME_SET = new Set(MEDIA_TYPES.map(t => t.mimeType));

function getConfig(mimeType: string): MediaTypeConfig | undefined {
  return MEDIA_TYPES.find(t => t.mimeType === mimeType);
}

export type MediaValidationError =
  | { code: "empty_file";              message: string }
  | { code: "unsupported_type";        message: string }
  | { code: "mime_extension_mismatch"; message: string }
  | { code: "too_large";               message: string };

export type MediaValidationResult =
  | { ok: true;  kind: MediaKind; normalizedMimeType: string }
  | { ok: false; error: MediaValidationError };

export function validateUploadRequest(
  rawMimeType: string,
  filename:    string,
  byteSize:    number,
): MediaValidationResult {
  if (byteSize <= 0) {
    return { ok: false, error: { code: "empty_file", message: "File is empty." } };
  }

  const mimeType = normalizeMimeType(rawMimeType);

  if (!ALLOWED_MIME_SET.has(mimeType)) {
    return {
      ok: false,
      error: {
        code: "unsupported_type",
        message: `Unsupported file type: "${rawMimeType}". Accepted: image/jpeg, image/png, image/webp, image/gif, video/mp4, audio/mpeg.`,
      },
    };
  }

  const config = getConfig(mimeType)!;

  // Extension check (when a filename with extension is provided)
  const ext = filename.includes(".")
    ? "." + filename.split(".").pop()!.toLowerCase()
    : "";
  if (ext && !config.extensions.includes(ext)) {
    return {
      ok: false,
      error: {
        code: "mime_extension_mismatch",
        message: `Extension "${ext}" does not match content type "${mimeType}".`,
      },
    };
  }

  if (byteSize > config.maxBytes) {
    const limitMb = config.maxBytes / MB;
    return {
      ok: false,
      error: {
        code: "too_large",
        message: `File too large. Maximum size for ${config.label} is ${limitMb} MB.`,
      },
    };
  }

  return { ok: true, kind: config.kind, normalizedMimeType: mimeType };
}

// Unsafe types that must always be rejected regardless of MIME config above
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".sh", ".ps1", ".msi",
  ".dll", ".so", ".dmg", ".pkg", ".deb", ".rpm", ".apk",
  ".js", ".jsx", ".ts", ".tsx", ".php", ".py", ".rb",
  ".html", ".htm", ".xml", ".svg",
  ".zip", ".tar", ".gz", ".rar", ".7z",
]);

export function isBlockedExtension(filename: string): boolean {
  const ext = filename.includes(".")
    ? "." + filename.split(".").pop()!.toLowerCase()
    : "";
  return BLOCKED_EXTENSIONS.has(ext);
}
