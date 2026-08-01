import { describe, expect, it, vi } from "vitest";
import type { Storage } from "@google-cloud/storage";
import {
  ObjectStorageConfigurationError,
  ObjectStorageService,
  createObjectStorageClient,
} from "../lib/objectStorage";

const SERVICE_ACCOUNT = Buffer.from(JSON.stringify({
  project_id: "test-project",
  client_email: "storage@example.invalid",
  private_key: "test-private-key",
})).toString("base64");

describe("production object-storage configuration", () => {
  it("fails closed when the direct GCS credential is missing", () => {
    expect(() => createObjectStorageClient({ OBJECT_STORAGE_PROVIDER: "gcs" }))
      .toThrowError(ObjectStorageConfigurationError);

    try {
      createObjectStorageClient({ OBJECT_STORAGE_PROVIDER: "gcs" });
    } catch (error) {
      expect(error).toMatchObject({
        code: "object_storage_configuration_error",
        missingVariables: ["OBJECT_STORAGE_SERVICE_ACCOUNT_JSON_B64"],
      });
      expect(String(error)).not.toContain("private_key");
    }
  });

  it("rejects malformed credentials without logging their value", () => {
    const malformedValue = "not-valid-base64-json";
    expect(() => createObjectStorageClient({
      OBJECT_STORAGE_PROVIDER: "gcs",
      OBJECT_STORAGE_SERVICE_ACCOUNT_JSON_B64: malformedValue,
    })).toThrowError("is not valid base64-encoded JSON");

    try {
      createObjectStorageClient({
        OBJECT_STORAGE_PROVIDER: "gcs",
        OBJECT_STORAGE_SERVICE_ACCOUNT_JSON_B64: malformedValue,
      });
    } catch (error) {
      expect(String(error)).not.toContain(malformedValue);
    }
  });

  it("generates a V4 signed PUT URL and returns a stable object path", async () => {
    const getSignedUrl = vi.fn().mockResolvedValue([
      "https://storage.googleapis.com/media-bucket/private/uploads/object-id?signature=redacted",
    ]);
    const file = vi.fn(() => ({ getSignedUrl }));
    const bucket = vi.fn(() => ({ file }));
    const client = { bucket } as unknown as Storage;
    const service = new ObjectStorageService(client, {
      OBJECT_STORAGE_PROVIDER: "gcs",
      OBJECT_STORAGE_SERVICE_ACCOUNT_JSON_B64: SERVICE_ACCOUNT,
      PRIVATE_OBJECT_DIR: "/media-bucket/private",
    });

    const uploadURL = await service.getObjectEntityUploadURL();
    const objectPath = service.normalizeObjectEntityPath(uploadURL);

    expect(uploadURL).toContain("https://storage.googleapis.com/media-bucket/private/uploads/");
    expect(objectPath).toBe("/objects/uploads/object-id");
    expect(file).toHaveBeenCalledWith(expect.stringMatching(/^private\/uploads\/[0-9a-f-]+$/));
    expect(getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({
      version: "v4",
      action: "write",
    }));
  });

  it("preserves the Replit signer as the default outside Coolify", async () => {
    const client = { bucket: vi.fn() } as unknown as Storage;
    const service = new ObjectStorageService(client, {
      PRIVATE_OBJECT_DIR: "/media-bucket/private",
    });
    await expect(service.getObjectEntityUploadURL()).rejects.toThrow();
  });
});
