import { describe, expect, it } from "vitest";
import { usesDurableMediaUpload } from "@/components/MediaUploader";
import {
  instagramMediaBlocker,
  mediaMetadataPayload,
  persistedMediaAttachment,
} from "../publishing-media";

const durableImage = {
  objectPath: "/objects/image-123",
  kind: "image" as const,
  mimeType: "image/png",
  filename: "inspection.png",
  byteSize: 248_912,
};

describe("Publishing Center persisted media", () => {
  it("routes Publishing Center images through durable object storage", () => {
    expect(usesDurableMediaUpload("image", true)).toBe(true);
    expect(usesDurableMediaUpload("image", false)).toBe(false);
  });

  it("saved draft payload retains uploaded media metadata", () => {
    expect(mediaMetadataPayload(durableImage)).toEqual({
      mediaFilename: "inspection.png",
      mediaMimeType: "image/png",
      mediaFileSize: 248_912,
    });
  });

  it("reopened draft restores a durable image with its nonzero file size", () => {
    expect(persistedMediaAttachment({
      imageUrl: durableImage.objectPath,
      videoUrl: null,
      audioUrl: null,
      mediaFilename: durableImage.filename,
      mediaMimeType: durableImage.mimeType,
      mediaFileSize: durableImage.byteSize,
    })).toEqual(durableImage);
  });

  it("does not present an expired browser object URL as attached media", () => {
    expect(persistedMediaAttachment({
      imageUrl: "blob:https://aiedgesolutions.online/expired",
      videoUrl: null,
      audioUrl: null,
      mediaFilename: "expired.png",
      mediaMimeType: "image/png",
      mediaFileSize: 10,
    })).toBeNull();
  });

  it("blocks Instagram-only publishing without a public URL", () => {
    expect(instagramMediaBlocker(["instagram"], "/api/uploads/social-posts/legacy.jpg"))
      .toContain("durable public image");
  });

  it("allows Instagram-only publishing with a durable object reference", () => {
    expect(instagramMediaBlocker(["instagram"], "/objects/image-123")).toBeNull();
  });

  it("allows paired Facebook and Instagram legacy publishing for hosted-URL reuse", () => {
    expect(instagramMediaBlocker(
      ["facebook", "instagram"],
      "/api/uploads/social-posts/legacy.jpg",
    )).toBeNull();
  });
});
