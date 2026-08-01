import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  normalizePersistedMediaMetadata,
  resolvePublicImageUrl,
  selectInstagramImageUrl,
} from "../lib/social-media-publishing.js";

describe("Instagram public media selection", () => {
  it("turns a durable object path into the public HTTPS storage route", () => {
    expect(resolvePublicImageUrl("/objects/image-123")).toBe(
      "https://aiedgesolutions.online/api/storage/objects/objects/image-123",
    );
  });

  it("reuses the Facebook-hosted image first for paired publishing", () => {
    expect(selectInstagramImageUrl({
      facebookHostedUrl: "https://scontent.example/facebook-photo.jpg",
      postImageUrl: "/objects/image-123",
    })).toBe("https://scontent.example/facebook-photo.jpg");
  });

  it("blocks Instagram-only publishing when no public image exists", () => {
    expect(selectInstagramImageUrl({
      postImageUrl: "/api/uploads/social-posts/legacy.jpg",
    })).toBeNull();
  });

  it("accepts an existing public HTTPS URL for Instagram-only publishing", () => {
    expect(selectInstagramImageUrl({
      postImageUrl: "https://cdn.example/image.jpg",
    })).toBe("https://cdn.example/image.jpg");
  });
});

describe("persisted media metadata", () => {
  it("keeps bounded valid metadata and rejects zero-byte metadata", () => {
    expect(normalizePersistedMediaMetadata({
      filename: " inspection.png ",
      mimeType: "IMAGE/PNG",
      fileSize: 248_912,
    })).toEqual({ filename: "inspection.png", mimeType: "image/png", fileSize: 248_912 });

    expect(normalizePersistedMediaMetadata({
      filename: "empty.png",
      mimeType: "image/png",
      fileSize: 0,
    }).fileSize).toBeNull();
  });

  it("wires metadata through the social-post DTO, create, and update paths", () => {
    const routeSource = readFileSync(
      new URL("../routes/social-posts.ts", import.meta.url),
      "utf8",
    );

    expect(routeSource).toContain("mediaFilename:   r.mediaFilename ?? null");
    expect(routeSource).toContain("mediaFilename: mediaMetadata.filename");
    expect(routeSource).toContain("b.mediaFilename   !== undefined");
    expect(routeSource).toContain("selectInstagramImageUrl({");
  });

  it("uses a backward-compatible additive migration for existing drafts", () => {
    const migrationSource = readFileSync(
      new URL("../../../../lib/db/migrations/0009_social_post_media_metadata.sql", import.meta.url),
      "utf8",
    );

    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS media_filename TEXT");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS media_mime_type TEXT");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS media_file_size INTEGER");
    expect(migrationSource).not.toMatch(/\b(DROP TABLE|DELETE FROM|TRUNCATE)\b/i);
  });
});
