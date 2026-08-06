export interface AdapterPlatformResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly postId?: string;
  readonly postUrl?: string;
}

export interface AdapterDeliveryDecision {
  readonly status: "published" | "failed" | "skipped";
  readonly externalPostId: string | null;
  readonly externalPostUrl: string | null;
  readonly errorMessage: string | null;
  readonly isPublished: boolean;
  readonly isFailed: boolean;
}

const SECRET_PATTERNS = [
  /access_token=[^&\s"']*/gi,
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /eyJ[A-Za-z0-9._\-]+/g,
  /\b[A-Za-z0-9]{40,}\b/g,
];

export function sanitizeAdapterError(value: string): string {
  let sanitized = value || "Unknown provider error";
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized.slice(0, 500);
}

export function mapAdapterResultToDelivery(
  result: AdapterPlatformResult | null | undefined,
): AdapterDeliveryDecision {
  if (!result) {
    return Object.freeze({
      status: "failed" as const,
      externalPostId: null,
      externalPostUrl: null,
      errorMessage: "Platform adapter did not return a result",
      isPublished: false,
      isFailed: true,
    });
  }

  if (result.ok && (result.postId || result.postUrl)) {
    return Object.freeze({
      status: "published" as const,
      externalPostId: result.postId ?? null,
      externalPostUrl: result.postUrl ?? null,
      errorMessage: null,
      isPublished: true,
      isFailed: false,
    });
  }

  if (result.ok) {
    return Object.freeze({
      status: "failed" as const,
      externalPostId: null,
      externalPostUrl: null,
      errorMessage:
        "Provider reported success without an external post receipt",
      isPublished: false,
      isFailed: true,
    });
  }

  const errorMessage = sanitizeAdapterError(
    result.error ?? "Unknown provider error",
  );
  const skipped =
    errorMessage.includes("requires video") ||
    errorMessage.includes("requires image") ||
    errorMessage.includes("Skipped");

  return Object.freeze({
    status: skipped ? "skipped" as const : "failed" as const,
    externalPostId: null,
    externalPostUrl: null,
    errorMessage,
    isPublished: false,
    isFailed: !skipped,
  });
}

export function isAdapterResultsEnvelope(
  body: unknown,
): body is { results: Record<string, AdapterPlatformResult> } {
  if (!body || typeof body !== "object") return false;
  const results = (body as { results?: unknown }).results;
  return Boolean(results && typeof results === "object" && !Array.isArray(results));
}

export function readAdapterResultsEnvelope(
  body: unknown,
): Record<string, AdapterPlatformResult> | null {
  return isAdapterResultsEnvelope(body) ? body.results : null;
}
