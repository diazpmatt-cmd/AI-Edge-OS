import { afterEach, describe, expect, it, vi } from "vitest";
import { Storage } from "@google-cloud/storage";
import {
  ObjectStorageConfigurationError,
  ObjectStorageService,
  createObjectStorageClient,
  safeStorageFailureReason,
} from "../lib/objectStorage";

const KEYLESS_ENVIRONMENT = {
  OBJECT_STORAGE_PROVIDER: "gcs-wif",
  GOOGLE_CLOUD_PROJECT: "test-project",
  GOOGLE_APPLICATION_CREDENTIALS: "/run/secrets/gcp/workload-identity-credential.json",
  GOOGLE_API_CERTIFICATE_CONFIG: "/run/secrets/gcp/certificate-config.json",
  PRIVATE_OBJECT_DIR: "/media-bucket/private",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("production object-storage configuration", () => {
  it("initializes keyless external-account credentials without a service-account key", () => {
    const client = createObjectStorageClient(KEYLESS_ENVIRONMENT, () => true);

    expect(client).toBeInstanceOf(Storage);
    expect(KEYLESS_ENVIRONMENT).not.toHaveProperty("OBJECT_STORAGE_SERVICE_ACCOUNT_JSON_B64");
  });

  it.each([
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_API_CERTIFICATE_CONFIG",
  ])("fails closed when %s is missing", (missingVariable) => {
    const environment = { ...KEYLESS_ENVIRONMENT, [missingVariable]: "" };

    expect(() => createObjectStorageClient(environment, () => true))
      .toThrowError(ObjectStorageConfigurationError);

    try {
      createObjectStorageClient(environment, () => true);
    } catch (error) {
      expect(error).toMatchObject({
        code: "object_storage_configuration_error",
        missingVariables: [missingVariable],
      });
    }
  });

  it("fails closed when configured workload identity files are unavailable", () => {
    expect(() => createObjectStorageClient(KEYLESS_ENVIRONMENT, () => false))
      .toThrowError("Google Cloud keyless workload identity files are unavailable.");
  });

  it("generates a V4 signed PUT URL and returns a stable object path", async () => {
    const getSignedUrl = vi.fn().mockResolvedValue([
      "https://storage.googleapis.com/media-bucket/private/uploads/object-id?signature=redacted",
    ]);
    const file = vi.fn(() => ({ getSignedUrl }));
    const bucket = vi.fn(() => ({ file }));
    const client = { bucket } as unknown as Storage;
    const service = new ObjectStorageService(client, KEYLESS_ENVIRONMENT);

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

  it("fails closed and redacts diagnostics when impersonated signing fails", async () => {
    const sensitiveToken = "eyJhbGciOiJSUzI1NiJ9.sensitive-payload.signaturevalue";
    const getSignedUrl = vi.fn().mockRejectedValue(new Error(
      `PERMISSION_DENIED credential=private-value assertion=${sensitiveToken} https://signed.example.invalid/object?signature=secret`,
    ));
    const client = {
      bucket: vi.fn(() => ({ file: vi.fn(() => ({ getSignedUrl })) })),
    } as unknown as Storage;
    const service = new ObjectStorageService(client, KEYLESS_ENVIRONMENT);

    let failure: unknown;
    try {
      await service.getObjectEntityUploadURL();
    } catch (error) {
      failure = error;
    }

    const diagnostic = safeStorageFailureReason(failure);
    expect(diagnostic).toContain("PERMISSION_DENIED");
    expect(diagnostic).not.toContain("private-value");
    expect(diagnostic).not.toContain(sensitiveToken);
    expect(diagnostic).not.toContain("signed.example.invalid");
  });

  it("preserves the Replit sidecar signing path as the default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        signed_url: "https://storage.googleapis.com/media-bucket/private/uploads/replit-object",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = { bucket: vi.fn() } as unknown as Storage;
    const service = new ObjectStorageService(client, {
      PRIVATE_OBJECT_DIR: "/media-bucket/private",
    });

    await expect(service.getObjectEntityUploadURL()).resolves.toContain("replit-object");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:1106/object-storage/signed-object-url",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
