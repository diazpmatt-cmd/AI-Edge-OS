import { pool as defaultPool } from "@workspace/db";

type Pool = typeof defaultPool;

export interface ReviewRequestConfiguration {
  status: "not_configured" | "owner_confirmed";
  reviewUrl: string | null;
  confirmedAt: string | null;
}

interface GoogleBusinessChannelRow {
  metadata_json: string | null;
}

const GOOGLE_REVIEW_HOSTS = new Set([
  "g.page",
  "search.google.com",
  "www.google.com",
  "google.com",
  "maps.app.goo.gl",
  "goo.gl",
]);

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function normalizeOwnerConfirmedGoogleReviewUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (!GOOGLE_REVIEW_HOSTS.has(host) && !host.endsWith(".google.com")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function getReviewRequestConfiguration(
  clientSlug: string,
  activePool: Pool = defaultPool,
): Promise<ReviewRequestConfiguration> {
  const { rows } = await activePool.query<GoogleBusinessChannelRow>(
    `SELECT metadata_json
       FROM local_presence_channels
      WHERE client_id = $1 AND channel_name = 'google_business'
      LIMIT 1`,
    [clientSlug],
  );

  if (!rows.length) {
    return { status: "not_configured", reviewUrl: null, confirmedAt: null };
  }

  const metadata = parseMetadata(rows[0].metadata_json);
  const reviewRequest = metadata["reviewRequest"];
  if (!reviewRequest || typeof reviewRequest !== "object" || Array.isArray(reviewRequest)) {
    return { status: "not_configured", reviewUrl: null, confirmedAt: null };
  }

  const config = reviewRequest as Record<string, unknown>;
  const reviewUrl = normalizeOwnerConfirmedGoogleReviewUrl(config["reviewUrl"]);
  const status = config["status"] === "owner_confirmed" && reviewUrl
    ? "owner_confirmed"
    : "not_configured";

  return {
    status,
    reviewUrl: status === "owner_confirmed" ? reviewUrl : null,
    confirmedAt: status === "owner_confirmed" && typeof config["confirmedAt"] === "string"
      ? config["confirmedAt"]
      : null,
  };
}

export async function saveOwnerConfirmedReviewUrl(input: {
  clientSlug: string;
  userId: string;
  reviewUrl: string;
  pool?: Pool;
}): Promise<ReviewRequestConfiguration> {
  const activePool = input.pool ?? defaultPool;
  const reviewUrl = normalizeOwnerConfirmedGoogleReviewUrl(input.reviewUrl);
  if (!reviewUrl) {
    throw Object.assign(new Error("invalid_google_review_url"), { code: "invalid_google_review_url" });
  }

  const { rows } = await activePool.query<GoogleBusinessChannelRow>(
    `SELECT metadata_json
       FROM local_presence_channels
      WHERE client_id = $1 AND channel_name = 'google_business'
      LIMIT 1`,
    [input.clientSlug],
  );

  if (!rows.length) {
    throw Object.assign(new Error("google_business_channel_not_initialized"), {
      code: "google_business_channel_not_initialized",
    });
  }

  const metadata = parseMetadata(rows[0].metadata_json);
  const confirmedAt = new Date().toISOString();
  const nextMetadata = {
    ...metadata,
    reviewRequest: {
      reviewUrl,
      status: "owner_confirmed",
      confirmedAt,
      confirmedByUserId: input.userId,
    },
  };

  await activePool.query(
    `UPDATE local_presence_channels
        SET metadata_json = $1, updated_at = NOW()
      WHERE client_id = $2 AND channel_name = 'google_business'`,
    [JSON.stringify(nextMetadata), input.clientSlug],
  );

  return { status: "owner_confirmed", reviewUrl, confirmedAt };
}
