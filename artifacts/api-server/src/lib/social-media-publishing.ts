const DEFAULT_PUBLIC_ORIGIN = "https://aiedgesolutions.online";

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function resolvePublicImageUrl(
  value: string | null | undefined,
  publicOrigin = DEFAULT_PUBLIC_ORIGIN,
): string | null {
  if (!value) return null;
  if (isHttpsUrl(value)) return value;
  if (/^\/objects\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(value)) {
    return `${publicOrigin.replace(/\/$/, "")}/api/storage/objects${value}`;
  }
  return null;
}

export function selectInstagramImageUrl(
  sources: {
    facebookHostedUrl?: string | null;
    postImageUrl?: string | null;
    matchedImageUrl?: string | null;
  },
  publicOrigin = DEFAULT_PUBLIC_ORIGIN,
): string | null {
  return resolvePublicImageUrl(sources.facebookHostedUrl, publicOrigin)
    ?? resolvePublicImageUrl(sources.postImageUrl, publicOrigin)
    ?? resolvePublicImageUrl(sources.matchedImageUrl, publicOrigin);
}

export type PersistedMediaMetadata = {
  filename: string | null;
  mimeType: string | null;
  fileSize: number | null;
};

export function normalizePersistedMediaMetadata(input: {
  filename?: unknown;
  mimeType?: unknown;
  fileSize?: unknown;
}): PersistedMediaMetadata {
  const filename = typeof input.filename === "string" && input.filename.trim()
    ? input.filename.trim().slice(0, 255)
    : null;
  const mimeType = typeof input.mimeType === "string" && input.mimeType.trim()
    ? input.mimeType.trim().toLowerCase().slice(0, 127)
    : null;
  const fileSize = typeof input.fileSize === "number"
    && Number.isSafeInteger(input.fileSize)
    && input.fileSize > 0
    && input.fileSize <= 100 * 1024 * 1024
    ? input.fileSize
    : null;

  return { filename, mimeType, fileSize };
}
