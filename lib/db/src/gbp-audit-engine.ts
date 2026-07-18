/**
 * GBP Audit & Optimization Engine — Phase 1
 *
 * Pure functions. Zero side effects. Zero database imports.
 * All inputs are passed explicitly; all outputs are plain objects.
 *
 * SCORING MODEL (100 pts total):
 *   information  — 35 pts  (11 checks)
 *   media        — 20 pts  (4 checks)
 *   reviews      — 20 pts  (4 checks)
 *   posts        — 10 pts  (3 checks)
 *   authority    — 15 pts  (3 checks)
 *
 * EVIDENCE TYPES:
 *   local    — 10 checks (41 pts) — evaluated from existing DB tables
 *   gbp_api  — 15 checks (59 pts) — data_pending until Phase 2 connects
 *                                    the GBP Business Information API
 *
 * CHECK STATUSES:
 *   pass         — fully met; full points awarded
 *   warning      — partially met; half points awarded
 *   fail         — not met; 0 points
 *   data_pending — requires GBP API data not yet available
 *   error        — evaluation failed unexpectedly
 */

// ── Input types ───────────────────────────────────────────────────────────────

export interface GbpProfileInput {
  businessName: string;
  phone:        string | null;
  website:      string | null;
  address:      string | null;
  city:         string | null;
  state:        string | null;
  zip:          string | null;
}

export interface GbpConnectionInput {
  connected:    boolean;
  locationName: string | null;
  locationTitle:string | null;
  accountName:  string | null;
  tokenExists:  boolean;
}

export interface GbpReviewInput {
  reviewCount:   number;
  averageRating: number;
}

export interface GbpPostsInput {
  totalLast30Days:            number;
  totalLast14Days:            number;
  postsWithImageLast30Days:   number;
}

export interface GbpAuditInput {
  profile:          GbpProfileInput | null;
  googleConnection: GbpConnectionInput | null;
  reviewStats:      GbpReviewInput | null;
  googlePosts:      GbpPostsInput | null;
}

// ── Output types ──────────────────────────────────────────────────────────────

export type GbpCheckStatus   = "pass" | "warning" | "fail" | "data_pending" | "error";
export type GbpCheckPriority = "critical" | "high" | "medium" | "low";
export type GbpCheckCategory = "information" | "media" | "reviews" | "posts" | "authority";
export type GbpEvidenceType  = "local" | "gbp_api";

export interface GbpCheckResult {
  category:       GbpCheckCategory;
  checkKey:       string;
  checkLabel:     string;
  evidenceType:   GbpEvidenceType;
  status:         GbpCheckStatus;
  score:          number;
  maxScore:       number;
  priority:       GbpCheckPriority;
  currentValue:   string | null;
  recommendation: string | null;
  rawData:        Record<string, unknown>;
}

export interface GbpAuditResult {
  localScore:    number;
  localMaxScore: number;
  overallScore:  number;
  maxScore:      number;
  checksPassed:  number;
  checksWarning: number;
  checksFailed:  number;
  checksPending: number;
  checks:        GbpCheckResult[];
}

// ── Check registry ────────────────────────────────────────────────────────────
// 25 checks, 100 pts total. Used for documentation and UI rendering.

export interface CheckDefinition {
  category:     GbpCheckCategory;
  checkKey:     string;
  checkLabel:   string;
  evidenceType: GbpEvidenceType;
  maxScore:     number;
  priority:     GbpCheckPriority;
  phase2Notes?: string;
}

export const GBP_CHECK_REGISTRY: CheckDefinition[] = [
  // ── information (35 pts) ──────────────────────────────────────────────────
  { category: "information", checkKey: "business_name",        checkLabel: "Business Name",            evidenceType: "local",   maxScore:  2, priority: "critical" },
  { category: "information", checkKey: "primary_category",     checkLabel: "Primary Category",         evidenceType: "gbp_api", maxScore:  5, priority: "critical",  phase2Notes: "readMask: categories" },
  { category: "information", checkKey: "phone_number",         checkLabel: "Phone Number",             evidenceType: "local",   maxScore:  4, priority: "high"     },
  { category: "information", checkKey: "website_url",          checkLabel: "Website URL",              evidenceType: "local",   maxScore:  4, priority: "high"     },
  { category: "information", checkKey: "address_complete",     checkLabel: "Complete Address",         evidenceType: "local",   maxScore:  3, priority: "high"     },
  { category: "information", checkKey: "regular_hours",        checkLabel: "Business Hours",           evidenceType: "gbp_api", maxScore:  5, priority: "high",      phase2Notes: "readMask: regularHours" },
  { category: "information", checkKey: "business_description", checkLabel: "Business Description",     evidenceType: "gbp_api", maxScore:  4, priority: "high",      phase2Notes: "readMask: profile.description" },
  { category: "information", checkKey: "additional_categories",checkLabel: "Additional Categories",    evidenceType: "gbp_api", maxScore:  3, priority: "medium",    phase2Notes: "readMask: categories" },
  { category: "information", checkKey: "service_areas",        checkLabel: "Service Area",             evidenceType: "gbp_api", maxScore:  2, priority: "medium",    phase2Notes: "readMask: serviceArea" },
  { category: "information", checkKey: "holiday_hours",        checkLabel: "Holiday Hours",            evidenceType: "gbp_api", maxScore:  2, priority: "medium",    phase2Notes: "readMask: specialHours" },
  { category: "information", checkKey: "services_listed",      checkLabel: "Services Catalog",         evidenceType: "gbp_api", maxScore:  1, priority: "low",       phase2Notes: "readMask: serviceItems" },

  // ── media (20 pts) ────────────────────────────────────────────────────────
  { category: "media", checkKey: "logo_photo",    checkLabel: "Logo / Profile Photo", evidenceType: "gbp_api", maxScore:  5, priority: "critical", phase2Notes: "mybusiness.media API, LOGO type" },
  { category: "media", checkKey: "cover_photo",   checkLabel: "Cover Photo",          evidenceType: "gbp_api", maxScore:  5, priority: "high",     phase2Notes: "mybusiness.media API, COVER type" },
  { category: "media", checkKey: "photo_count",   checkLabel: "Photo Count (10+)",    evidenceType: "gbp_api", maxScore:  7, priority: "high",     phase2Notes: "mybusiness.media API, list all" },
  { category: "media", checkKey: "video_present", checkLabel: "Video Content",        evidenceType: "gbp_api", maxScore:  3, priority: "low",      phase2Notes: "mybusiness.media API, VIDEO type" },

  // ── reviews (20 pts) ─────────────────────────────────────────────────────
  { category: "reviews", checkKey: "review_count",   checkLabel: "Review Count (10+)",       evidenceType: "local",   maxScore:  5, priority: "critical" },
  { category: "reviews", checkKey: "average_rating",  checkLabel: "Average Rating (4.0+)",    evidenceType: "local",   maxScore:  5, priority: "critical" },
  { category: "reviews", checkKey: "response_rate",   checkLabel: "Review Response Rate",     evidenceType: "gbp_api", maxScore:  5, priority: "high",    phase2Notes: "mybusiness.reviews API, compute rate from owned replies" },
  { category: "reviews", checkKey: "review_velocity", checkLabel: "Review Velocity (2+/mo)",  evidenceType: "gbp_api", maxScore:  5, priority: "high",    phase2Notes: "mybusiness.reviews API, filter by createTime last 30 days" },

  // ── posts (10 pts) ────────────────────────────────────────────────────────
  { category: "posts", checkKey: "recent_post",      checkLabel: "Recent Post (14 days)", evidenceType: "local", maxScore:  5, priority: "high"   },
  { category: "posts", checkKey: "post_frequency",   checkLabel: "Post Frequency (4+/mo)",evidenceType: "local", maxScore:  3, priority: "medium" },
  { category: "posts", checkKey: "posts_with_media", checkLabel: "Posts Include Photos",  evidenceType: "local", maxScore:  2, priority: "low"    },

  // ── authority (15 pts) ────────────────────────────────────────────────────
  { category: "authority", checkKey: "verification_status", checkLabel: "Google-Verified Listing", evidenceType: "local",   maxScore:  8, priority: "critical" },
  { category: "authority", checkKey: "suspension_free",      checkLabel: "No Suspension / Flag",    evidenceType: "gbp_api", maxScore:  5, priority: "critical", phase2Notes: "readMask: metadata.hasPendingVerification, metadata.mapsUri" },
  { category: "authority", checkKey: "duplicate_listings",   checkLabel: "No Duplicate Listings",   evidenceType: "gbp_api", maxScore:  2, priority: "medium",   phase2Notes: "mybusinessaccountmanagement API, scan for duplicates by placeId" },
];

// Local-evidence max score = 2+4+4+3+5+5+5+3+2+8 = 41
export const GBP_LOCAL_MAX_SCORE = 41;
// Total max = 100
export const GBP_MAX_SCORE = 100;

// ── Individual check evaluators ───────────────────────────────────────────────

function pending(def: CheckDefinition, notes?: string): GbpCheckResult {
  return {
    category:       def.category,
    checkKey:       def.checkKey,
    checkLabel:     def.checkLabel,
    evidenceType:   "gbp_api",
    status:         "data_pending",
    score:          0,
    maxScore:       def.maxScore,
    priority:       def.priority,
    currentValue:   null,
    recommendation: notes ?? "Connect the GBP Business Information API (Phase 2) to evaluate this check.",
    rawData:        { phase2Notes: def.phase2Notes ?? null },
  };
}

function checkBusinessName(input: GbpAuditInput): GbpCheckResult {
  const name = input.profile?.businessName?.trim() ?? null;
  const ok   = !!name && name.length >= 3;
  return {
    category: "information", checkKey: "business_name", checkLabel: "Business Name",
    evidenceType: "local", priority: "critical", maxScore: 2,
    status:       ok ? "pass" : "fail",
    score:        ok ? 2 : 0,
    currentValue: name,
    recommendation: ok ? null : "Add your business name to the Local Presence profile.",
    rawData: { businessName: name },
  };
}

function checkPhoneNumber(input: GbpAuditInput): GbpCheckResult {
  const phone = input.profile?.phone?.trim() ?? null;
  const ok    = !!phone && phone.replace(/\D/g, "").length >= 7;
  return {
    category: "information", checkKey: "phone_number", checkLabel: "Phone Number",
    evidenceType: "local", priority: "high", maxScore: 4,
    status:       ok ? "pass" : "fail",
    score:        ok ? 4 : 0,
    currentValue: phone,
    recommendation: ok ? null : "Add a local phone number to your GBP listing.",
    rawData: { phone },
  };
}

function checkWebsiteUrl(input: GbpAuditInput): GbpCheckResult {
  const website = input.profile?.website?.trim() ?? null;
  const ok      = !!website && /^https?:\/\/.+/.test(website);
  return {
    category: "information", checkKey: "website_url", checkLabel: "Website URL",
    evidenceType: "local", priority: "high", maxScore: 4,
    status:       ok ? "pass" : "fail",
    score:        ok ? 4 : 0,
    currentValue: website,
    recommendation: ok ? null : "Add your website URL to your GBP listing.",
    rawData: { website },
  };
}

function checkAddressComplete(input: GbpAuditInput): GbpCheckResult {
  const p       = input.profile;
  const hasAddr  = !!(p?.address?.trim());
  const hasCity  = !!(p?.city?.trim());
  const hasState = !!(p?.state?.trim());
  const allThree = hasAddr && hasCity && hasState;
  const anyOne   = hasAddr || hasCity || hasState;
  return {
    category: "information", checkKey: "address_complete", checkLabel: "Complete Address",
    evidenceType: "local", priority: "high", maxScore: 3,
    status:       allThree ? "pass" : anyOne ? "warning" : "fail",
    score:        allThree ? 3 : anyOne ? 1 : 0,
    currentValue: p ? [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ") || null : null,
    recommendation: allThree ? null : "Complete your full business address (street, city, state) for better local ranking.",
    rawData: { address: p?.address, city: p?.city, state: p?.state, zip: p?.zip },
  };
}

function checkReviewCount(input: GbpAuditInput): GbpCheckResult {
  const count = input.reviewStats?.reviewCount ?? 0;
  const pass  = count >= 10;
  const warn  = count >= 5;
  return {
    category: "reviews", checkKey: "review_count", checkLabel: "Review Count (10+)",
    evidenceType: "local", priority: "critical", maxScore: 5,
    status:       pass ? "pass" : warn ? "warning" : "fail",
    score:        pass ? 5 : warn ? 2 : 0,
    currentValue: count > 0 ? `${count} review${count === 1 ? "" : "s"}` : "No reviews",
    recommendation: pass ? null : "Aim for 25+ Google reviews. Use the Reviews Engine to send review requests after every job.",
    rawData: { reviewCount: count },
  };
}

function checkAverageRating(input: GbpAuditInput): GbpCheckResult {
  const rating = input.reviewStats?.averageRating ?? 0;
  const pass   = rating >= 4.0;
  const warn   = rating >= 3.5;
  const noData = rating === 0;
  return {
    category: "reviews", checkKey: "average_rating", checkLabel: "Average Rating (4.0+)",
    evidenceType: "local", priority: "critical", maxScore: 5,
    status:       noData ? "fail" : pass ? "pass" : warn ? "warning" : "fail",
    score:        pass && !noData ? 5 : warn && !noData ? 2 : 0,
    currentValue: noData ? "No rating data" : `${Number(rating).toFixed(1)} ★`,
    recommendation: (pass && !noData) ? null : "Respond to all reviews and focus on service quality to raise your rating above 4.0.",
    rawData: { averageRating: rating },
  };
}

function checkRecentPost(input: GbpAuditInput): GbpCheckResult {
  const posts    = input.googlePosts;
  const recent14 = posts?.totalLast14Days ?? 0;
  const recent30 = posts?.totalLast30Days ?? 0;
  const pass     = recent14 >= 1;
  const warn     = recent30 >= 1;
  return {
    category: "posts", checkKey: "recent_post", checkLabel: "Recent Post (14 days)",
    evidenceType: "local", priority: "high", maxScore: 5,
    status:       pass ? "pass" : warn ? "warning" : "fail",
    score:        pass ? 5 : warn ? 2 : 0,
    currentValue: pass
      ? `${recent14} post${recent14 === 1 ? "" : "s"} in last 14 days`
      : warn
      ? `${recent30} post${recent30 === 1 ? "" : "s"} in last 30 days (none in 14)`
      : "No recent posts",
    recommendation: pass ? null : "Post on Google Business Profile at least once per week. Use the Publishing Center to schedule posts.",
    rawData: { totalLast14Days: recent14, totalLast30Days: recent30 },
  };
}

function checkPostFrequency(input: GbpAuditInput): GbpCheckResult {
  const count = input.googlePosts?.totalLast30Days ?? 0;
  const pass  = count >= 4;
  const warn  = count >= 2;
  return {
    category: "posts", checkKey: "post_frequency", checkLabel: "Post Frequency (4+/mo)",
    evidenceType: "local", priority: "medium", maxScore: 3,
    status:       pass ? "pass" : warn ? "warning" : "fail",
    score:        pass ? 3 : warn ? 1 : 0,
    currentValue: count > 0 ? `${count} post${count === 1 ? "" : "s"} in last 30 days` : "No posts in last 30 days",
    recommendation: pass ? null : "Increase posting frequency to 4+ Google posts per month. The Content Autopilot can handle this automatically.",
    rawData: { totalLast30Days: count },
  };
}

function checkPostsWithMedia(input: GbpAuditInput): GbpCheckResult {
  const total      = input.googlePosts?.totalLast30Days ?? 0;
  const withImage  = input.googlePosts?.postsWithImageLast30Days ?? 0;
  const pct        = total > 0 ? withImage / total : 0;
  const pass       = total > 0 && pct >= 0.5;
  const warn       = total > 0 && withImage > 0;
  return {
    category: "posts", checkKey: "posts_with_media", checkLabel: "Posts Include Photos",
    evidenceType: "local", priority: "low", maxScore: 2,
    status:       total === 0 ? "fail" : pass ? "pass" : warn ? "warning" : "fail",
    score:        pass ? 2 : warn ? 1 : 0,
    currentValue: total === 0 ? "No posts" : `${withImage}/${total} posts include a photo`,
    recommendation: pass ? null : "Add photos to your Google posts — posts with images get significantly higher engagement.",
    rawData: { totalLast30Days: total, postsWithImageLast30Days: withImage, imagePct: Math.round(pct * 100) },
  };
}

function checkVerificationStatus(input: GbpAuditInput): GbpCheckResult {
  const conn = input.googleConnection;
  const hasLocation = !!(conn?.locationName);
  const hasToken    = !!(conn?.tokenExists);
  const pass        = !!conn?.connected && hasLocation;
  const warn        = hasToken && !hasLocation;
  return {
    category: "authority", checkKey: "verification_status", checkLabel: "Google-Verified Listing",
    evidenceType: "local", priority: "critical", maxScore: 8,
    status:       pass ? "pass" : warn ? "warning" : "fail",
    score:        pass ? 8 : warn ? 4 : 0,
    currentValue: pass
      ? conn?.locationTitle ?? conn?.locationName ?? "Verified"
      : warn
      ? "Connected but location not confirmed"
      : "No Google Business Profile connection",
    recommendation: pass
      ? null
      : warn
      ? "Your Google account is connected but the business location could not be confirmed. Go to Connected Accounts → Refresh GBP Location."
      : "Connect your Google Business Profile in Connected Accounts to verify your listing.",
    rawData: {
      connected:    conn?.connected ?? false,
      locationName: conn?.locationName ?? null,
      accountName:  conn?.accountName ?? null,
      tokenExists:  conn?.tokenExists ?? false,
    },
  };
}

// ── Data-pending stubs for GBP API checks ────────────────────────────────────

const PENDING_CHECKS: Array<[string, CheckDefinition]> = GBP_CHECK_REGISTRY
  .filter(d => d.evidenceType === "gbp_api")
  .map(d => [d.checkKey, d]);

const PENDING_BY_KEY = new Map<string, CheckDefinition>(PENDING_CHECKS);

// ── Main evaluation function ──────────────────────────────────────────────────

/**
 * Evaluate a full GBP audit from locally-available data.
 *
 * Phase 1: 10 local checks evaluated, 15 gbp_api checks returned as
 * data_pending. Call this function from the audit route after gathering
 * data from the DB — no async operations here.
 */
export function evaluateGbpAudit(input: GbpAuditInput): GbpAuditResult {
  const localChecks: GbpCheckResult[] = [
    checkBusinessName(input),
    checkPhoneNumber(input),
    checkWebsiteUrl(input),
    checkAddressComplete(input),
    checkReviewCount(input),
    checkAverageRating(input),
    checkRecentPost(input),
    checkPostFrequency(input),
    checkPostsWithMedia(input),
    checkVerificationStatus(input),
  ];

  const pendingChecks: GbpCheckResult[] = [];
  for (const def of GBP_CHECK_REGISTRY) {
    if (def.evidenceType !== "gbp_api") continue;
    const fullDef = PENDING_BY_KEY.get(def.checkKey)!;
    pendingChecks.push(pending(fullDef));
  }

  const allChecks = [
    // Interleave in registry order for correct category grouping
    ...localChecks,
    ...pendingChecks,
  ].sort((a, b) => {
    const catOrder: GbpCheckCategory[] = ["information", "media", "reviews", "posts", "authority"];
    const catDiff = catOrder.indexOf(a.category) - catOrder.indexOf(b.category);
    if (catDiff !== 0) return catDiff;
    const ai = GBP_CHECK_REGISTRY.findIndex(d => d.checkKey === a.checkKey);
    const bi = GBP_CHECK_REGISTRY.findIndex(d => d.checkKey === b.checkKey);
    return ai - bi;
  });

  const localScore    = localChecks.reduce((s, c) => s + c.score, 0);
  const localMaxScore = GBP_LOCAL_MAX_SCORE;
  const overallScore  = localScore; // Phase 1: no GBP API scores yet

  let checksPassed  = 0;
  let checksWarning = 0;
  let checksFailed  = 0;
  let checksPending = 0;

  for (const c of allChecks) {
    if (c.status === "pass")         checksPassed++;
    else if (c.status === "warning") checksWarning++;
    else if (c.status === "fail")    checksFailed++;
    else if (c.status === "data_pending") checksPending++;
  }

  return {
    localScore,
    localMaxScore,
    overallScore,
    maxScore: GBP_MAX_SCORE,
    checksPassed,
    checksWarning,
    checksFailed,
    checksPending,
    checks: allChecks,
  };
}
