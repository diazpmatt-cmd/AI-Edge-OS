import { Storage, File, type StorageOptions } from "@google-cloud/storage";
import { GoogleAuth } from "google-auth-library";
import { existsSync } from "node:fs";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export type ObjectStorageProvider = "replit" | "gcs-wif";

export class ObjectStorageConfigurationError extends Error {
  readonly code = "object_storage_configuration_error";

  constructor(
    message: string,
    readonly missingVariables: string[] = [],
  ) {
    super(message);
    this.name = "ObjectStorageConfigurationError";
    Object.setPrototypeOf(this, ObjectStorageConfigurationError.prototype);
  }
}

type ObjectStorageEnvironment = Record<string, string | undefined>;

function getObjectStorageProvider(environment: ObjectStorageEnvironment): ObjectStorageProvider {
  const provider = (environment.OBJECT_STORAGE_PROVIDER || "replit").trim().toLowerCase();
  if (provider !== "replit" && provider !== "gcs-wif") {
    throw new ObjectStorageConfigurationError(
      `Unsupported OBJECT_STORAGE_PROVIDER: ${provider || "empty"}`,
    );
  }
  return provider;
}

function getGcsWifClientConfiguration(
  environment: ObjectStorageEnvironment,
  fileExists: (path: string) => boolean,
) {
  const requiredVariables = [
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_API_CERTIFICATE_CONFIG",
  ] as const;
  const missingVariables = requiredVariables.filter(
    (name) => !environment[name]?.trim(),
  );
  if (missingVariables.length > 0) {
    throw new ObjectStorageConfigurationError(
      "Google Cloud keyless workload identity is not completely configured.",
      [...missingVariables],
    );
  }

  const credentialFiles = [
    environment.GOOGLE_APPLICATION_CREDENTIALS!.trim(),
    environment.GOOGLE_API_CERTIFICATE_CONFIG!.trim(),
  ];
  if (credentialFiles.some((path) => !fileExists(path))) {
    throw new ObjectStorageConfigurationError(
      "Google Cloud keyless workload identity files are unavailable.",
    );
  }

  return {
    projectId: environment.GOOGLE_CLOUD_PROJECT!.trim(),
    keyFilename: environment.GOOGLE_APPLICATION_CREDENTIALS!.trim(),
  };
}

export function safeStorageFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown object-storage failure";
  return message
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "[redacted-key]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]{10,}){1,2}\b/g, "[redacted-token]")
    .replace(/(token|secret|password|credential|assertion|signature)(\s*[:=]\s*)\S+/gi, "$1$2[redacted]")
    .slice(0, 500);
}

export function createObjectStorageClient(
  environment: ObjectStorageEnvironment = process.env,
  fileExists: (path: string) => boolean = existsSync,
): Storage {
  if (getObjectStorageProvider(environment) === "gcs-wif") {
    const configuration = getGcsWifClientConfiguration(environment, fileExists);
    const authClient = new GoogleAuth({
      ...configuration,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    return new Storage({
      projectId: configuration.projectId,
      // Storage currently carries an older duplicate auth-library type. The
      // runtime interface is compatible, while the direct v10 client is
      // required for X.509 external-account credentials.
      authClient: authClient as unknown as StorageOptions["authClient"],
    });
  }

  return new Storage({
        credentials: {
          audience: "replit",
          subject_token_type: "access_token",
          token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
          type: "external_account",
          credential_source: {
            url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
            format: {
              type: "json",
              subject_token_field_name: "access_token",
            },
          },
          universe_domain: "googleapis.com",
        },
        projectId: "",
      });
}

export const objectStorageClient = createObjectStorageClient();

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor(
    private readonly client: Storage = objectStorageClient,
    private readonly environment: ObjectStorageEnvironment = process.env,
  ) {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = this.environment.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new ObjectStorageConfigurationError(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths).",
        ["PUBLIC_OBJECT_SEARCH_PATHS"],
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = this.environment.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new ObjectStorageConfigurationError(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var.",
        ["PRIVATE_OBJECT_DIR"],
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = this.client.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(file: File, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      client: this.client,
      provider: getObjectStorageProvider(this.environment),
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = this.client.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  client,
  provider,
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  client: Storage;
  provider: ObjectStorageProvider;
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  if (provider === "gcs-wif") {
    const [signedURL] = await client.bucket(bucketName).file(objectName).getSignedUrl({
      version: "v4",
      action: method === "PUT" ? "write" : method === "GET" ? "read" : method.toLowerCase() as "delete" | "read",
      expires: Date.now() + ttlSec * 1000,
    });
    return signedURL;
  }

  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json() as { signed_url: string };
  return signedURL;
}
