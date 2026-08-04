import { Router, raw, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { Readable } from "stream";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import {
  ObjectStorageConfigurationError,
  ObjectStorageService,
  ObjectNotFoundError,
  objectStorageClient,
  safeStorageFailureReason,
} from "../lib/objectStorage";
import { validateUploadRequest, isBlockedExtension } from "../lib/media-config";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const DIRECT_UPLOAD_TTL_MS = 15 * 60_000;
const MAX_DIRECT_UPLOAD_BYTES = 110 * 1024 * 1024;

function directUploadSecret(): string {
  const secret = process.env.SCHEDULER_SECRET?.trim();
  if (!secret) {
    throw new ObjectStorageConfigurationError(
      "Direct durable uploads require SCHEDULER_SECRET.",
      ["SCHEDULER_SECRET"],
    );
  }
  return secret;
}

function directUploadSignature(objectPath: string, expiresAt: number, contentType: string): string {
  return createHmac("sha256", directUploadSecret())
    .update(`${objectPath}\n${expiresAt}\n${contentType}`)
    .digest("hex");
}

function safeSignatureEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function privateObjectLocation(objectPath: string): { bucketName: string; objectName: string } {
  if (!objectPath.startsWith("/objects/uploads/")) {
    throw new Error("Invalid durable upload object path.");
  }
  const privateDir = objectStorageService.getPrivateObjectDir().replace(/\/$/, "");
  const fullPath = `${privateDir}/${objectPath.slice("/objects/".length)}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  if (parts.length < 2 || !parts[0]) {
    throw new Error("Invalid private object directory.");
  }
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

function buildDirectUploadFallback(contentType: string) {
  const objectPath = `/objects/uploads/${randomUUID()}`;
  const expiresAt = Date.now() + DIRECT_UPLOAD_TTL_MS;
  const signature = directUploadSignature(objectPath, expiresAt, contentType);
  const query = new URLSearchParams({ objectPath, expiresAt: String(expiresAt), contentType, signature });
  return {
    uploadURL: `/api/storage/uploads/direct?${query.toString()}`,
    objectPath,
  };
}

router.put(
  "/storage/uploads/direct",
  raw({ type: "*/*", limit: MAX_DIRECT_UPLOAD_BYTES }),
  async (req: Request, res: Response) => {
    const objectPath = typeof req.query.objectPath === "string" ? req.query.objectPath : "";
    const contentType = typeof req.query.contentType === "string" ? req.query.contentType : "";
    const signature = typeof req.query.signature === "string" ? req.query.signature : "";
    const expiresAt = Number(req.query.expiresAt);

    if (!objectPath || !contentType || !signature || !Number.isFinite(expiresAt)) {
      res.status(400).json({ error: "Invalid direct upload request." });
      return;
    }
    if (Date.now() > expiresAt) {
      res.status(410).json({ error: "Direct upload request expired." });
      return;
    }

    let expectedSignature: string;
    try {
      expectedSignature = directUploadSignature(objectPath, expiresAt, contentType);
    } catch (error) {
      console.error("[storage/direct-upload] configuration failure", {
        reason: safeStorageFailureReason(error),
      });
      res.status(503).json({ error: "Durable media storage is not configured." });
      return;
    }

    if (!safeSignatureEquals(signature, expectedSignature)) {
      res.status(403).json({ error: "Invalid direct upload signature." });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Upload body is empty." });
      return;
    }

    const requestContentType = req.get("content-type")?.split(";")[0]?.trim() || "";
    if (requestContentType !== contentType) {
      res.status(409).json({ error: "Upload content type does not match the authorized request." });
      return;
    }

    try {
      const { bucketName, objectName } = privateObjectLocation(objectPath);
      await objectStorageClient.bucket(bucketName).file(objectName).save(req.body, {
        contentType,
        resumable: false,
        validation: "crc32c",
      });
      res.status(204).end();
    } catch (error) {
      console.error("[storage/direct-upload] durable upload failed", {
        provider: process.env.OBJECT_STORAGE_PROVIDER || "replit",
        reason: safeStorageFailureReason(error),
      });
      res.status(502).json({ error: "The durable media upload could not be completed." });
    }
  },
);

router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { name, size, contentType } = (req.body ?? {}) as { name?: string; size?: number; contentType?: string };
  if (!name || size == null || !contentType) {
    res.status(400).json({ error: "Missing required fields: name, size, contentType" });
    return;
  }

  if (isBlockedExtension(name)) {
    res.status(400).json({ error: `File type not allowed: "${name}".` });
    return;
  }

  const validation = validateUploadRequest(contentType, name, size);
  if (!validation.ok) {
    res.status(400).json({ error: validation.error.message, code: validation.error.code });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType: validation.normalizedMimeType } });
  } catch (error) {
    const provider = process.env.OBJECT_STORAGE_PROVIDER || "replit";
    console.error("[storage/request-url] signed upload URL generation failed", {
      code: error instanceof ObjectStorageConfigurationError ? error.code : "object_storage_signing_failed",
      provider,
      missingVariables: error instanceof ObjectStorageConfigurationError ? error.missingVariables : [],
      reason: safeStorageFailureReason(error),
    });

    if (provider === "gcs-wif") {
      try {
        const fallback = buildDirectUploadFallback(validation.normalizedMimeType);
        res.json({
          ...fallback,
          metadata: { name, size, contentType: validation.normalizedMimeType, transport: "direct-api-fallback" },
        });
        return;
      } catch (fallbackError) {
        console.error("[storage/request-url] direct upload fallback unavailable", {
          reason: safeStorageFailureReason(fallbackError),
        });
      }
    }

    const configurationFailure = error instanceof ObjectStorageConfigurationError;
    res.status(configurationFailure ? 503 : 502).json({
      error: configurationFailure
        ? "Durable media storage is not configured."
        : "The durable media upload service could not generate an upload URL.",
      code: configurationFailure ? error.code : "object_storage_signing_failed",
    });
  }
});

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  const filePath = (req.params as Record<string, string>)["filePath"] ?? "";
  try {
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) { res.status(404).json({ error: "Not found" }); return; }
    const response = await objectStorageService.downloadObject(file);
    res.setHeader("Content-Type", response.headers.get("Content-Type") ?? "application/octet-stream");
    if (response.body) {
      Readable.fromWeb(response.body as import("stream/web").ReadableStream).pipe(res);
    } else {
      res.status(500).json({ error: "No response body" });
    }
  } catch (error) {
    console.error("Error serving public object", error);
    res.status(500).json({ error: "Failed to serve object" });
  }
});

router.get("/storage/objects/*objectPath", async (req: Request, res: Response) => {
  const objectPath = "/" + ((req.params as Record<string, string>)["objectPath"] ?? "");
  try {
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(file);
    const contentType = response.headers.get("Content-Type") ?? "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000");
    if (response.body) {
      Readable.fromWeb(response.body as import("stream/web").ReadableStream).pipe(res);
    } else {
      res.status(500).json({ error: "No response body" });
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    console.error("Error serving object", error);
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
