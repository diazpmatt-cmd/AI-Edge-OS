import type { MediaAttachment } from "@/components/MediaUploader";

export type PersistedPostMedia = {
  imageUrl: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  mediaFilename: string | null;
  mediaMimeType: string | null;
  mediaFileSize: number | null;
};

export function isPersistentMediaReference(value: string | null | undefined): value is string {
  if (!value || value.startsWith("blob:")) return false;
  return value.startsWith("/objects/")
    || value.startsWith("/api/uploads/")
    || value.startsWith("https://")
    || value.startsWith("data:image/");
}

export function isPublicInstagramImageReference(value: string | null | undefined): boolean {
  return !!value && (value.startsWith("/objects/") || value.startsWith("https://"));
}

export function persistedMediaAttachment(post: PersistedPostMedia): MediaAttachment | null {
  const source = post.imageUrl || post.videoUrl || post.audioUrl;
  if (!isPersistentMediaReference(source)) return null;

  const kind = post.imageUrl ? "image" : post.videoUrl ? "video" : "audio";
  const defaultMime = kind === "image" ? "image/jpeg" : kind === "video" ? "video/mp4" : "audio/mpeg";

  return {
    objectPath: source,
    kind,
    mimeType: post.mediaMimeType || defaultMime,
    filename: post.mediaFilename || source.split("/").pop() || "Attached media",
    byteSize: post.mediaFileSize && post.mediaFileSize > 0 ? post.mediaFileSize : 0,
  };
}

export function mediaMetadataPayload(attachment: MediaAttachment | null) {
  return {
    mediaFilename: attachment?.filename || null,
    mediaMimeType: attachment?.mimeType || null,
    mediaFileSize: attachment?.byteSize && attachment.byteSize > 0 ? attachment.byteSize : null,
  };
}

export function instagramMediaBlocker(
  platforms: string[],
  imageUrl: string | null | undefined,
): string | null {
  if (!platforms.includes("instagram")) return null;
  if (isPublicInstagramImageReference(imageUrl)) return null;
  if (platforms.includes("facebook") && isPersistentMediaReference(imageUrl)) return null;
  return "Instagram needs a durable public image before publishing. Upload or replace the image, then save the draft again.";
}
