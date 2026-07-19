/**
 * GBP Live Data Fetcher — Phase 2
 *
 * Fetches live data from the Google Business Profile APIs and normalises it
 * into the GbpLiveData shape consumed by evaluateGbpAudit().
 *
 * APIs used:
 *   Business Information API  — mybusinessbusinessinformation.googleapis.com/v1
 *   Media API (v4 legacy)     — mybusiness.googleapis.com/v4
 *   Reviews API (v4 legacy)   — mybusiness.googleapis.com/v4
 *   Account Management API    — mybusinessaccountmanagement.googleapis.com/v1
 *
 * Token refresh guard: `refreshToken && (!expiresAt || expired)` — must handle
 * the case where expiresAt is NULL (dropped by dev-sync) so the refresh path
 * is still attempted. See memory note: youtube-token-refresh.md.
 *
 * All sub-API calls are individually try/caught; failures populate
 * liveData.errors.* rather than throwing, so partial results are preserved.
 */

import type { GbpLiveData } from "@workspace/db";
import { resolveGoogleToken } from "./google-token.js";

// ── Types (raw API response shapes — local to this file) ─────────────────────

type TimeOfDay = { hours?: number; minutes?: number };
type HourPeriod = {
  openDay: string; closeDay: string;
  openTime: TimeOfDay | string; closeTime: TimeOfDay | string;
};

type LocationResponse = {
  name?: string;
  categories?: {
    primaryCategory?: { name?: string; displayName?: string };
    additionalCategories?: Array<{ name?: string; displayName?: string }>;
  };
  regularHours?: { periods?: HourPeriod[] };
  profile?: { description?: string };
  serviceArea?: {
    businessType?: string;
    places?: { placeInfos?: Array<{ name: string; placeName: string }> };
    regionCode?: string;
  };
  specialHours?: { specialHourPeriods?: Array<unknown> };
  serviceItems?: Array<unknown>;
  metadata?: {
    hasPendingVerification?: boolean;
    mapsUri?: string;
    newReviewUri?: string;
  };
};

type MediaItem = {
  name?: string;
  mediaFormat?: "PHOTO" | "VIDEO";
  locationAssociation?: { category?: string };
};

type MediaResponse = {
  mediaItems?: MediaItem[];
  totalMediaItemCount?: number;
};

type ReviewItem = {
  reviewId?: string;
  createTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

type ReviewsResponse = {
  reviews?: ReviewItem[];
  averageRating?: number;
  totalReviewCount?: number;
};

type AccountsResponse = {
  accounts?: Array<{ name?: string; accountName?: string }>;
};

type LocationsListResponse = {
  locations?: Array<{ name?: string; title?: string }>;
};

// ── Business Information API ──────────────────────────────────────────────────

async function fetchBusinessInfo(
  accessToken:  string,
  locationName: string,
): Promise<{ data: LocationResponse | null; error: string | null }> {
  const readMask = "categories,regularHours,profile,serviceArea,specialHours,serviceItems,metadata";
  const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}?readMask=${encodeURIComponent(readMask)}`;
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12000),
    });
    const body = await r.text();
    if (!r.ok) {
      console.warn(`[GBP-LIVE] businessInfo HTTP ${r.status}: ${body.slice(0, 300)}`);
      return { data: null, error: `HTTP ${r.status}` };
    }
    return { data: JSON.parse(body) as LocationResponse, error: null };
  } catch (e: any) {
    console.warn(`[GBP-LIVE] businessInfo exception: ${e?.message}`);
    return { data: null, error: e?.message ?? "fetch_error" };
  }
}

// ── Media API (v4 legacy) ─────────────────────────────────────────────────────

async function fetchMedia(
  accessToken:  string,
  locationName: string,
): Promise<{ data: MediaResponse | null; error: string | null }> {
  const url = `https://mybusiness.googleapis.com/v4/${locationName}/media?pageSize=100`;
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12000),
    });
    const body = await r.text();
    if (!r.ok) {
      console.warn(`[GBP-LIVE] media HTTP ${r.status}: ${body.slice(0, 300)}`);
      return { data: null, error: `HTTP ${r.status}` };
    }
    return { data: JSON.parse(body) as MediaResponse, error: null };
  } catch (e: any) {
    console.warn(`[GBP-LIVE] media exception: ${e?.message}`);
    return { data: null, error: e?.message ?? "fetch_error" };
  }
}

// ── Reviews API (v4 legacy) ───────────────────────────────────────────────────

async function fetchReviews(
  accessToken:  string,
  locationName: string,
): Promise<{ data: ReviewsResponse | null; error: string | null }> {
  const url = `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=50&orderBy=updateTime+desc`;
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12000),
    });
    const body = await r.text();
    if (!r.ok) {
      console.warn(`[GBP-LIVE] reviews HTTP ${r.status}: ${body.slice(0, 300)}`);
      return { data: null, error: `HTTP ${r.status}` };
    }
    return { data: JSON.parse(body) as ReviewsResponse, error: null };
  } catch (e: any) {
    console.warn(`[GBP-LIVE] reviews exception: ${e?.message}`);
    return { data: null, error: e?.message ?? "fetch_error" };
  }
}

// ── Accounts + Locations (duplicate heuristic) ────────────────────────────────

async function fetchLocationCount(
  accessToken: string,
  accountName: string,
): Promise<{ count: number | null; error: string | null }> {
  const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title&pageSize=100`;
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12000),
    });
    const body = await r.text();
    if (!r.ok) {
      console.warn(`[GBP-LIVE] locationCount HTTP ${r.status}: ${body.slice(0, 300)}`);
      return { count: null, error: `HTTP ${r.status}` };
    }
    const parsed = JSON.parse(body) as LocationsListResponse;
    return { count: (parsed.locations ?? []).length, error: null };
  } catch (e: any) {
    console.warn(`[GBP-LIVE] locationCount exception: ${e?.message}`);
    return { count: null, error: e?.message ?? "fetch_error" };
  }
}

// ── Normalise helpers ─────────────────────────────────────────────────────────

function countRegularHoursDays(periods: HourPeriod[] | undefined): number {
  if (!periods || periods.length === 0) return 0;
  const days = new Set(periods.map(p => p.openDay));
  return days.size;
}

function computeResponseRate(reviews: ReviewItem[]): number {
  if (reviews.length === 0) return 0;
  const withReply = reviews.filter(r => !!r.reviewReply?.comment).length;
  return withReply / reviews.length;
}

function countReviewsLast30Days(reviews: ReviewItem[]): number {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return reviews.filter(r => {
    if (!r.createTime) return false;
    try { return new Date(r.createTime) >= cutoff; } catch { return false; }
  }).length;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export interface GbpTokenConn {
  accessToken:  string;
  refreshToken: string | null;
  expiresAt:    Date | null;
  userId:       string;
  locationName: string;   // full resource name: "accounts/123/locations/456"
  accountName:  string;   // "accounts/123"
}

/**
 * Fetch live GBP data for the given connection and normalise it into GbpLiveData.
 *
 * Always returns a GbpLiveData object — individual API failures set the
 * corresponding error key rather than throwing. The caller passes this to
 * evaluateGbpAudit(input, liveData) which gracefully degrades affected checks
 * to data_pending.
 */
export async function fetchGbpLiveData(conn: GbpTokenConn): Promise<GbpLiveData> {
  const errors: GbpLiveData["errors"] = {};

  const tokenResult = await resolveGoogleToken({
    accessToken:  conn.accessToken,
    refreshToken: conn.refreshToken,
    expiresAt:    conn.expiresAt,
    userId:       conn.userId,
  });
  if (!tokenResult.ok) {
    console.warn(`[GBP-LIVE] token refresh failed (${tokenResult.reason}) — using stored token as fallback`);
  }
  const token = tokenResult.ok ? tokenResult.token : conn.accessToken;

  console.log(`[GBP-LIVE] fetching live data for locationName=${conn.locationName}`);

  // Fire all four sub-requests in parallel for speed
  const [biResult, mediaResult, reviewsResult, locCountResult] = await Promise.all([
    fetchBusinessInfo(token, conn.locationName),
    fetchMedia(token, conn.locationName),
    fetchReviews(token, conn.locationName),
    fetchLocationCount(token, conn.accountName),
  ]);

  if (biResult.error) errors.businessInfo = biResult.error;
  if (mediaResult.error) errors.media = mediaResult.error;
  if (reviewsResult.error) errors.reviews = reviewsResult.error;
  if (locCountResult.error) errors.duplicates = locCountResult.error;

  // ── Business Information fields ──
  const bi = biResult.data;
  const primaryCategory =
    bi?.categories?.primaryCategory?.displayName ?? null;
  const additionalCategories =
    (bi?.categories?.additionalCategories ?? [])
      .map(c => c.displayName ?? "")
      .filter(Boolean);
  const regularHoursDaysCount = bi
    ? countRegularHoursDays(bi.regularHours?.periods)
    : null;
  const profileDescription = bi?.profile?.description ?? null;

  let hasServiceArea: boolean | null = null;
  if (bi) {
    const sa = bi.serviceArea;
    hasServiceArea = !!(
      sa?.businessType ||
      (sa?.places?.placeInfos?.length ?? 0) > 0 ||
      sa?.regionCode
    );
  }

  const specialHourPeriodsCount = bi
    ? (bi.specialHours?.specialHourPeriods?.length ?? 0)
    : null;
  const serviceItemsCount = bi
    ? (bi.serviceItems?.length ?? 0)
    : null;
  const hasPendingVerification = bi?.metadata?.hasPendingVerification ?? null;
  const mapsUri = bi?.metadata?.mapsUri ?? null;

  // ── Media fields ──
  const items = mediaResult.data?.mediaItems ?? [];
  let hasLogo: boolean | null   = null;
  let hasCover: boolean | null  = null;
  let totalPhotoCount: number | null = null;
  let hasVideo: boolean | null  = null;

  if (!mediaResult.error) {
    const LOGO_CATEGORIES  = new Set(["LOGO", "PROFILE"]);
    const COVER_CATEGORIES = new Set(["COVER_PHOTO"]);
    hasLogo         = items.some(i => LOGO_CATEGORIES.has(i.locationAssociation?.category ?? ""));
    hasCover        = items.some(i => COVER_CATEGORIES.has(i.locationAssociation?.category ?? ""));
    totalPhotoCount = items.filter(i => i.mediaFormat === "PHOTO").length;
    hasVideo        = items.some(i => i.mediaFormat === "VIDEO");
  }

  // ── Reviews fields ──
  const reviews = reviewsResult.data?.reviews ?? [];
  let reviewResponseRate: number | null   = null;
  let reviewsLast30Days:  number | null   = null;

  if (!reviewsResult.error) {
    reviewResponseRate = computeResponseRate(reviews);
    reviewsLast30Days  = countReviewsLast30Days(reviews);
  }

  // ── Duplicate listings ──
  const locationCount = locCountResult.count;

  const liveData: GbpLiveData = {
    primaryCategory,
    additionalCategories,
    regularHoursDaysCount,
    profileDescription,
    hasServiceArea,
    specialHourPeriodsCount,
    serviceItemsCount,
    hasPendingVerification,
    mapsUri,
    hasLogo,
    hasCover,
    totalPhotoCount,
    hasVideo,
    reviewResponseRate,
    reviewsLast30Days,
    locationCount,
    errors,
  };

  const errorKeys = Object.keys(errors);
  if (errorKeys.length > 0) {
    console.warn(`[GBP-LIVE] completed with errors on: ${errorKeys.join(", ")}`);
  } else {
    console.log(`[GBP-LIVE] all sub-APIs succeeded for ${conn.locationName}`);
  }

  return liveData;
}
