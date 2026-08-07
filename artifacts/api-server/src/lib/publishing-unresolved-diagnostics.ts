export type PublishingLaneState =
  | "verified_published"
  | "terminal_failure"
  | "receipt_missing"
  | "in_flight"
  | "missing_attempt";

export interface PublishingDiagnosticDelivery {
  readonly platform: string;
  readonly status: string;
  readonly attemptNumber: number;
  readonly externalPostId: string | null;
  readonly externalPostUrl: string | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly updatedAt: Date | string | null;
}

export interface PublishingLaneDiagnostic {
  readonly platform: string;
  readonly state: PublishingLaneState;
  readonly attemptNumber: number | null;
  readonly status: string | null;
  readonly receiptVerified: boolean;
  readonly retryAllowed: boolean;
  readonly diagnosticCode: string;
  readonly message: string;
  readonly updatedAt: string | null;
}

function timeValue(value: Date | string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function sanitize(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .replace(/access_token=[^&\s"']*/gi, "access_token=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
    .replace(/eyJ[A-Za-z0-9._\-]+/g, "[REDACTED]")
    .replace(/\b[A-Za-z0-9]{40,}\b/g, "[REDACTED]")
    .slice(0, 300);
}

export function selectLatestPublishingAttempts(
  deliveries: readonly PublishingDiagnosticDelivery[],
): ReadonlyMap<string, PublishingDiagnosticDelivery> {
  const latest = new Map<string, PublishingDiagnosticDelivery>();
  for (const delivery of deliveries) {
    const current = latest.get(delivery.platform);
    if (
      !current ||
      delivery.attemptNumber > current.attemptNumber ||
      (delivery.attemptNumber === current.attemptNumber &&
        timeValue(delivery.updatedAt) > timeValue(current.updatedAt))
    ) {
      latest.set(delivery.platform, delivery);
    }
  }
  return latest;
}

export function diagnosePublishingLanes(input: {
  readonly expectedPlatforms: readonly string[];
  readonly deliveries: readonly PublishingDiagnosticDelivery[];
}): readonly PublishingLaneDiagnostic[] {
  const expected = [...new Set(input.expectedPlatforms.map((p) => p.trim()).filter(Boolean))];
  const latest = selectLatestPublishingAttempts(input.deliveries);

  return expected.map((platform) => {
    const delivery = latest.get(platform);
    if (!delivery) {
      return Object.freeze({
        platform,
        state: "missing_attempt" as const,
        attemptNumber: null,
        status: null,
        receiptVerified: false,
        retryAllowed: false,
        diagnosticCode: "PUBLISHING_ATTEMPT_MISSING",
        message: "No delivery attempt exists for this expected platform.",
        updatedAt: null,
      });
    }

    const hasReceipt = Boolean(delivery.externalPostId || delivery.externalPostUrl);
    const publishedStatus = [
      "published",
      "published_with_warning",
      "idempotency_hit",
    ].includes(delivery.status);

    if (publishedStatus && hasReceipt) {
      return Object.freeze({
        platform,
        state: "verified_published" as const,
        attemptNumber: delivery.attemptNumber,
        status: delivery.status,
        receiptVerified: true,
        retryAllowed: false,
        diagnosticCode: "PUBLISHING_RECEIPT_VERIFIED",
        message: "External provider receipt is verified.",
        updatedAt: iso(delivery.updatedAt),
      });
    }

    if (publishedStatus && !hasReceipt) {
      return Object.freeze({
        platform,
        state: "receipt_missing" as const,
        attemptNumber: delivery.attemptNumber,
        status: delivery.status,
        receiptVerified: false,
        retryAllowed: false,
        diagnosticCode: "PUBLISHING_RECEIPT_MISSING",
        message: "Provider reported publication without a verifiable external receipt.",
        updatedAt: iso(delivery.updatedAt),
      });
    }

    if (["failed", "skipped", "cancelled"].includes(delivery.status)) {
      const detail = sanitize(delivery.errorMessage);
      return Object.freeze({
        platform,
        state: "terminal_failure" as const,
        attemptNumber: delivery.attemptNumber,
        status: delivery.status,
        receiptVerified: false,
        retryAllowed: delivery.status !== "cancelled",
        diagnosticCode: sanitize(delivery.errorCode) ?? "PUBLISHING_TERMINAL_FAILURE",
        message: detail ?? `Latest delivery ended as ${delivery.status}.`,
        updatedAt: iso(delivery.updatedAt),
      });
    }

    return Object.freeze({
      platform,
      state: "in_flight" as const,
      attemptNumber: delivery.attemptNumber,
      status: delivery.status,
      receiptVerified: false,
      retryAllowed: false,
      diagnosticCode: "PUBLISHING_DELIVERY_UNRESOLVED",
      message: `Latest delivery is still unresolved (${delivery.status}).`,
      updatedAt: iso(delivery.updatedAt),
    });
  });
}

export function summarizePublishingDiagnostics(
  lanes: readonly PublishingLaneDiagnostic[],
): {
  readonly total: number;
  readonly verified: number;
  readonly terminalFailures: number;
  readonly receiptMissing: number;
  readonly inFlight: number;
  readonly missingAttempts: number;
  readonly unresolved: number;
} {
  const count = (state: PublishingLaneState) => lanes.filter((lane) => lane.state === state).length;
  const verified = count("verified_published");
  const terminalFailures = count("terminal_failure");
  const receiptMissing = count("receipt_missing");
  const inFlight = count("in_flight");
  const missingAttempts = count("missing_attempt");
  return Object.freeze({
    total: lanes.length,
    verified,
    terminalFailures,
    receiptMissing,
    inFlight,
    missingAttempts,
    unresolved: lanes.length - verified - terminalFailures,
  });
}
