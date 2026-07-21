/**
 * GBP Audit & Optimization Engine — Phase 1 + Phase 2
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
 *   gbp_api  — 15 checks (59 pts) — Phase 2: evaluated from GbpLiveData
 *                                    when liveData is null → data_pending
 *
 * CHECK STATUSES:
 *   pass         — fully met; full points awarded
 *   warning      — partially met; half points awarded
 *   fail         — not met; 0 points
 *   data_pending — GBP API data not available (no token / API error)
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

// ── Phase 2: Live data from GBP APIs ─────────────────────────────────────────
//
// Produced by artifacts/api-server/src/lib/gbp-live-data.ts and passed as
// the optional second argument to evaluateGbpAudit().
// All fields are nullable — individual API failures leave their fields null
// and the corresponding checks stay data_pending rather than erroring out.

export interface GbpLiveData {
  // Business Information API — readMask: categories, regularHours, profile,
  //                                     serviceArea, specialHours, serviceItems, metadata
  primaryCategory:         string | null;   // displayName of primaryCategory
  additionalCategories:    string[];        // displayNames of additionalCategories
  regularHoursDaysCount:   number | null;   // distinct open-day count (null if field absent)
  profileDescription:      string | null;   // profile.description text
  hasServiceArea:          boolean | null;  // any service area defined
  specialHourPeriodsCount: number | null;   // number of specialHourPeriods entries
  serviceItemsCount:       number | null;   // number of serviceItems entries
  hasPendingVerification:  boolean | null;  // metadata.hasPendingVerification
  mapsUri:                 string | null;   // metadata.mapsUri (null = not on Maps)

  // Media API (mybusiness.googleapis.com/v4)
  hasLogo:         boolean | null;   // LOGO category photo present
  hasCover:        boolean | null;   // COVER_PHOTO category photo present
  hasVideo:        boolean | null;   // any VIDEO format items
  totalPhotoCount: number | null;    // total PHOTO format items

  // Reviews API (mybusiness.googleapis.com/v4)
  reviewResponseRate:   number | null;  // fraction 0-1 of reviews with owner reply
  reviewsLast30Days:    number | null;  // reviews created in the last 30 days

  // Account Management API — location count + titles for duplicate-listings heuristic
  locationCount:  number | null;
  locationTitles: string[] | null;

  // Which sub-API calls failed (allows per-check data_pending fallback)
  errors: {
    businessInfo?: string;
    media?:        string;
    reviews?:      string;
    duplicates?:   string;
  };
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
  apiScore:      number;
  apiMaxScore:   number;
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
// GBP API max score = 100 - 41 = 59
export const GBP_API_MAX_SCORE = 59;
// Total max = 100
export const GBP_MAX_SCORE = 100;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return a `fail` result for a GBP API check when the user has not connected
 * their Google Business Profile. Score is 0 (out of maxScore) so the overall
 * score is still meaningful. `data_pending` is never emitted by this engine.
 */
function notConnected(def: CheckDefinition): GbpCheckResult {
  return {
    category:       def.category,
    checkKey:       def.checkKey,
    checkLabel:     def.checkLabel,
    evidenceType:   "gbp_api",
    status:         "fail",
    score:          0,
    maxScore:       def.maxScore,
    priority:       def.priority,
    currentValue:   null,
    recommendation: def.phase2Notes ?? "Connect the GBP Business Information API to evaluate this check.",
    rawData:        { phase2Notes: def.phase2Notes ?? null },
  };
}

function pending(def: CheckDefinition, apiError?: string): GbpCheckResult {
  return {
    category:       def.category,
    checkKey:       def.checkKey,
    checkLabel:     def.checkLabel,
    evidenceType:   "gbp_api",
    status:         "data_pending",
    score:          0,
    maxScore:       def.maxScore,
    priority:       def.priority,
    currentValue:   apiError ? `API error: ${apiError}` : null,
    recommendation: "Connect the GBP Business Information API to evaluate this check.",
    rawData:        { phase2Notes: def.phase2Notes ?? null, apiError: apiError ?? null },
  };
}

// ── Local-evidence check evaluators ──────────────────────────────────────────

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

// ── Phase 2: GBP API check evaluators ────────────────────────────────────────
// Each evaluator returns data_pending when liveData is null or the relevant
// sub-API errored out, so individual failures don't cascade.

function checkPrimaryCategory(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.businessInfo) {
    return pending(def, live?.errors.businessInfo ? `API error: ${live.errors.businessInfo}` : undefined);
  }
  const cat = live.primaryCategory;
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       cat ? "pass" : "fail",
    score:        cat ? def.maxScore : 0,
    currentValue: cat ?? "No primary category set",
    recommendation: cat ? null : "Add a primary business category to your GBP listing to help customers find you in relevant searches.",
    rawData: { primaryCategory: cat },
  };
}

function checkRegularHours(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.businessInfo) {
    return pending(def, live?.errors.businessInfo ? `API error: ${live.errors.businessInfo}` : undefined);
  }
  if (live.regularHoursDaysCount === null) return pending(def);
  const days = live.regularHoursDaysCount;
  const pass = days >= 5;
  const warn = days >= 1;
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       pass ? "pass" : warn ? "warning" : "fail",
    score:        pass ? def.maxScore : warn ? Math.round(def.maxScore / 2) : 0,
    currentValue: days === 0 ? "No business hours set" : `Hours set for ${days} day${days === 1 ? "" : "s"}`,
    recommendation: pass ? null : "Set business hours for all days you are open. Complete hours build trust and improve local ranking.",
    rawData: { regularHoursDaysCount: days },
  };
}

function checkBusinessDescription(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.businessInfo) {
    return pending(def, live?.errors.businessInfo ? `API error: ${live.errors.businessInfo}` : undefined);
  }
  const desc = live.profileDescription?.trim() ?? null;
  const len  = desc?.length ?? 0;
  const pass = len >= 50;
  const warn = len >= 1;
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       pass ? "pass" : warn ? "warning" : "fail",
    score:        pass ? def.maxScore : warn ? Math.round(def.maxScore / 2) : 0,
    currentValue: pass
      ? `${len} characters`
      : warn
      ? `${len} characters (too short — aim for 50+)`
      : "No business description",
    recommendation: pass
      ? null
      : "Write a compelling business description (50–750 characters) highlighting your services, service area, and what makes you unique.",
    rawData: { descriptionLength: len },
  };
}

function checkAdditionalCategories(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.businessInfo) {
    return pending(def, live?.errors.businessInfo ? `API error: ${live.errors.businessInfo}` : undefined);
  }
  const count = live.additionalCategories.length;
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       count >= 1 ? "pass" : "fail",
    score:        count >= 1 ? def.maxScore : 0,
    currentValue: count >= 1
      ? `${count} additional categor${count === 1 ? "y" : "ies"}: ${live.additionalCategories.slice(0, 3).join(", ")}`
      : "No additional categories",
    recommendation: count >= 1
      ? null
      : "Add up to 9 additional service categories (e.g. Exterminator, Pest Control Service) to appear in more local searches.",
    rawData: { additionalCategoriesCount: count, categories: live.additionalCategories },
  };
}

function checkServiceAreas(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.businessInfo) {
    return pending(def, live?.errors.businessInfo ? `API error: ${live.errors.businessInfo}` : undefined);
  }
  if (live.hasServiceArea === null) return pending(def);
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       live.hasServiceArea ? "pass" : "fail",
    score:        live.hasServiceArea ? def.maxScore : 0,
    currentValue: live.hasServiceArea ? "Service area defined" : "No service area set",
    recommendation: live.hasServiceArea
      ? null
      : "Define your service area on Google Business Profile so you appear in searches for the cities and zip codes you serve.",
    rawData: { hasServiceArea: live.hasServiceArea },
  };
}

function checkHolidayHours(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.businessInfo) {
    return pending(def, live?.errors.businessInfo ? `API error: ${live.errors.businessInfo}` : undefined);
  }
  if (live.specialHourPeriodsCount === null) return pending(def);
  const count = live.specialHourPeriodsCount;
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       count >= 1 ? "pass" : "fail",
    score:        count >= 1 ? def.maxScore : 0,
    currentValue: count >= 1 ? `${count} special hour period${count === 1 ? "" : "s"} set` : "No holiday hours set",
    recommendation: count >= 1
      ? null
      : "Add holiday hours for major holidays to prevent customer frustration from outdated hours during holidays.",
    rawData: { specialHourPeriodsCount: count },
  };
}

function checkServicesListed(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.businessInfo) {
    return pending(def, live?.errors.businessInfo ? `API error: ${live.errors.businessInfo}` : undefined);
  }
  if (live.serviceItemsCount === null) return pending(def);
  const count = live.serviceItemsCount;
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       count >= 1 ? "pass" : "fail",
    score:        count >= 1 ? def.maxScore : 0,
    currentValue: count >= 1 ? `${count} service${count === 1 ? "" : "s"} listed` : "No services catalog",
    recommendation: count >= 1
      ? null
      : "Add your services to the Google Business Profile services catalog. This helps customers understand what you offer.",
    rawData: { serviceItemsCount: count },
  };
}

function checkLogoPhoto(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.media) {
    return pending(def, live?.errors.media ? `Media API error: ${live.errors.media}` : undefined);
  }
  if (live.hasLogo === null) return pending(def);
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       live.hasLogo ? "pass" : "fail",
    score:        live.hasLogo ? def.maxScore : 0,
    currentValue: live.hasLogo ? "Logo photo uploaded" : "No logo photo",
    recommendation: live.hasLogo
      ? null
      : "Upload a professional logo to your Google Business Profile. Logos improve brand recognition and click-through rates.",
    rawData: { hasLogo: live.hasLogo },
  };
}

function checkCoverPhoto(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.media) {
    return pending(def, live?.errors.media ? `Media API error: ${live.errors.media}` : undefined);
  }
  if (live.hasCover === null) return pending(def);
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       live.hasCover ? "pass" : "fail",
    score:        live.hasCover ? def.maxScore : 0,
    currentValue: live.hasCover ? "Cover photo uploaded" : "No cover photo",
    recommendation: live.hasCover
      ? null
      : "Upload a high-quality cover photo (1080×608 px minimum) showing your team or service area to make a strong first impression.",
    rawData: { hasCover: live.hasCover },
  };
}

function checkPhotoCount(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.media) {
    return pending(def, live?.errors.media ? `Media API error: ${live.errors.media}` : undefined);
  }
  if (live.totalPhotoCount === null) return pending(def);
  const count = live.totalPhotoCount;
  const pass  = count >= 10;
  const warn  = count >= 5;
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       pass ? "pass" : warn ? "warning" : "fail",
    score:        pass ? def.maxScore : warn ? Math.round(def.maxScore / 2) : 0,
    currentValue: count === 0 ? "No photos" : `${count} photo${count === 1 ? "" : "s"}`,
    recommendation: pass
      ? null
      : `Add more photos to reach 10+. Currently at ${count}. Businesses with 10+ photos receive significantly more clicks and direction requests.`,
    rawData: { totalPhotoCount: count },
  };
}

function checkVideoPresent(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.media) {
    return pending(def, live?.errors.media ? `Media API error: ${live.errors.media}` : undefined);
  }
  if (live.hasVideo === null) return pending(def);
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       live.hasVideo ? "pass" : "fail",
    score:        live.hasVideo ? def.maxScore : 0,
    currentValue: live.hasVideo ? "Video content present" : "No video content",
    recommendation: live.hasVideo
      ? null
      : "Add a short video (30 seconds–1 minute) showcasing your service or team. Videos dramatically increase engagement.",
    rawData: { hasVideo: live.hasVideo },
  };
}

function checkResponseRate(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.reviews) {
    return pending(def, live?.errors.reviews ? `Reviews API error: ${live.errors.reviews}` : undefined);
  }
  if (live.reviewResponseRate === null) return pending(def);
  const rate = live.reviewResponseRate;
  const pct  = Math.round(rate * 100);
  const pass = rate >= 0.9;
  const warn = rate >= 0.5;
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       pass ? "pass" : warn ? "warning" : "fail",
    score:        pass ? def.maxScore : warn ? Math.round(def.maxScore / 2) : 0,
    currentValue: `${pct}% response rate`,
    recommendation: pass
      ? null
      : "Respond to all reviews — both positive and negative. A 90%+ response rate signals excellent customer service to Google.",
    rawData: { reviewResponseRate: rate, responseRatePct: pct },
  };
}

function checkReviewVelocity(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.reviews) {
    return pending(def, live?.errors.reviews ? `Reviews API error: ${live.errors.reviews}` : undefined);
  }
  if (live.reviewsLast30Days === null) return pending(def);
  const count = live.reviewsLast30Days;
  const pass  = count >= 2;
  const warn  = count >= 1;
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       pass ? "pass" : warn ? "warning" : "fail",
    score:        pass ? def.maxScore : warn ? Math.round(def.maxScore / 2) : 0,
    currentValue: count === 0 ? "No new reviews in last 30 days" : `${count} new review${count === 1 ? "" : "s"} in last 30 days`,
    recommendation: pass
      ? null
      : "Ask satisfied customers for Google reviews immediately after completing each job. Consistent new reviews are a strong ranking signal.",
    rawData: { reviewsLast30Days: count },
  };
}

function checkSuspensionFree(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.businessInfo) {
    return pending(def, live?.errors.businessInfo ? `API error: ${live.errors.businessInfo}` : undefined);
  }
  if (live.hasPendingVerification === null && live.mapsUri === null) return pending(def);

  const onMaps  = !!live.mapsUri;
  const pending_ = live.hasPendingVerification === true;

  let status: GbpCheckStatus;
  let score: number;
  let currentValue: string;
  let recommendation: string | null;

  if (onMaps && !pending_) {
    status = "pass"; score = def.maxScore;
    currentValue = "Listed on Google Maps, no flags";
    recommendation = null;
  } else if (pending_) {
    status = "warning"; score = Math.round(def.maxScore / 2);
    currentValue = "Verification pending";
    recommendation = "Your listing has a pending verification. Complete the verification process in Google Business Profile to remove the flag.";
  } else {
    status = "fail"; score = 0;
    currentValue = "Not visible on Google Maps";
    recommendation = "Your listing may be suspended or unpublished. Log in to Google Business Profile and check for any alerts or suspension notices.";
  }

  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status, score, currentValue, recommendation,
    rawData: { hasPendingVerification: live.hasPendingVerification, mapsUri: live.mapsUri },
  };
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function checkDuplicateListings(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  if (!live || live.errors.duplicates) {
    return pending(def, live?.errors.duplicates ? `API error: ${live.errors.duplicates}` : undefined);
  }
  if (live.locationCount === null) return pending(def);
  const count = live.locationCount;

  if (count === 0) {
    return {
      category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
      evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
      status: "data_pending", score: 0,
      currentValue: "No locations found",
      recommendation: null,
      rawData: { locationCount: count },
    };
  }

  if (count === 1) {
    return {
      category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
      evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
      status: "pass", score: def.maxScore,
      currentValue: "Single location — no duplicates detected",
      recommendation: null,
      rawData: { locationCount: count },
    };
  }

  // Multiple locations — use title comparison to distinguish real duplicates from
  // separate businesses on the same account (e.g. owner manages 2 distinct companies).
  if (live.locationTitles && live.locationTitles.length >= 2) {
    const seen = new Set<string>();
    let hasDuplicate = false;
    for (const t of live.locationTitles) {
      const n = normalizeTitle(t);
      if (seen.has(n)) { hasDuplicate = true; break; }
      seen.add(n);
    }
    if (!hasDuplicate) {
      return {
        category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
        evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
        status: "pass", score: def.maxScore,
        currentValue: `${count} locations — distinct businesses, no duplicates detected`,
        recommendation: null,
        rawData: { locationCount: count, locationTitles: live.locationTitles },
      };
    }
    const warn = count <= 4;
    return {
      category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
      evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
      status: warn ? "warning" : "fail",
      score:  warn ? Math.round(def.maxScore / 2) : 0,
      currentValue: `${count} locations with duplicate names on this account`,
      recommendation: `${count} locations found with similar names. Verify none are duplicate listings for the same address, which can dilute your ranking.`,
      rawData: { locationCount: count, locationTitles: live.locationTitles },
    };
  }

  // No titles — fall back to raw-count heuristic
  const pass = count <= 1;
  const warn = count <= 4;
  return {
    category: def.category, checkKey: def.checkKey, checkLabel: def.checkLabel,
    evidenceType: "gbp_api", priority: def.priority, maxScore: def.maxScore,
    status:       pass ? "pass" : warn ? "warning" : "fail",
    score:        pass ? def.maxScore : warn ? Math.round(def.maxScore / 2) : 0,
    currentValue: `${count} locations on this account`,
    recommendation: pass
      ? null
      : `${count} locations found on this GBP account. Verify none are duplicate listings for the same address, which can dilute your ranking.`,
    rawData: { locationCount: count },
  };
}

// ── Live-check dispatcher ─────────────────────────────────────────────────────

function evaluateLiveCheck(def: CheckDefinition, live: GbpLiveData | null): GbpCheckResult {
  switch (def.checkKey) {
    case "primary_category":      return checkPrimaryCategory(def, live);
    case "regular_hours":         return checkRegularHours(def, live);
    case "business_description":  return checkBusinessDescription(def, live);
    case "additional_categories": return checkAdditionalCategories(def, live);
    case "service_areas":         return checkServiceAreas(def, live);
    case "holiday_hours":         return checkHolidayHours(def, live);
    case "services_listed":       return checkServicesListed(def, live);
    case "logo_photo":            return checkLogoPhoto(def, live);
    case "cover_photo":           return checkCoverPhoto(def, live);
    case "photo_count":           return checkPhotoCount(def, live);
    case "video_present":         return checkVideoPresent(def, live);
    case "response_rate":         return checkResponseRate(def, live);
    case "review_velocity":       return checkReviewVelocity(def, live);
    case "suspension_free":       return checkSuspensionFree(def, live);
    case "duplicate_listings":    return checkDuplicateListings(def, live);
    default:                      return pending(def);
  }
}

// ── Main evaluation function ──────────────────────────────────────────────────

/**
 * Evaluate a full GBP audit.
 *
 * Phase 1 (liveData omitted / null): 10 local checks evaluated; 15 gbp_api
 * checks returned as data_pending.
 *
 * Phase 2 (liveData provided): all 25 checks fully evaluated. Individual
 * sub-API failures leave only their checks as data_pending; others score
 * normally.
 */
export function evaluateGbpAudit(
  input:    GbpAuditInput,
  liveData?: GbpLiveData | null,
): GbpAuditResult {
  const live = liveData ?? null;

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

  const liveChecks: GbpCheckResult[] = [];
  for (const def of GBP_CHECK_REGISTRY) {
    if (def.evidenceType !== "gbp_api") continue;
    liveChecks.push(evaluateLiveCheck(def, live));
  }

  const allChecks = [...localChecks, ...liveChecks].sort((a, b) => {
    const catOrder: GbpCheckCategory[] = ["information", "media", "reviews", "posts", "authority"];
    const catDiff = catOrder.indexOf(a.category) - catOrder.indexOf(b.category);
    if (catDiff !== 0) return catDiff;
    const ai = GBP_CHECK_REGISTRY.findIndex(d => d.checkKey === a.checkKey);
    const bi = GBP_CHECK_REGISTRY.findIndex(d => d.checkKey === b.checkKey);
    return ai - bi;
  });

  const localScore    = localChecks.reduce((s, c) => s + c.score, 0);
  const liveScore     = liveChecks.reduce((s, c) => s + c.score, 0);
  const overallScore  = localScore + liveScore;


  let checksPassed  = 0;
  let checksWarning = 0;
  let checksFailed  = 0;
  let checksPending = 0;

  for (const c of allChecks) {
    if (c.status === "pass")              checksPassed++;
    else if (c.status === "warning")      checksWarning++;
    else if (c.status === "fail")         checksFailed++;
    else if (c.status === "data_pending") checksPending++;
    // "error" does not increment any counter (counted as neither pass nor fail)
  }

  return {
    localScore,
    localMaxScore: GBP_LOCAL_MAX_SCORE,
    apiScore:      liveScore,
    apiMaxScore:   GBP_API_MAX_SCORE,

    overallScore,
    maxScore:      GBP_MAX_SCORE,
    checksPassed,
    checksWarning,
    checksFailed,
    checksPending,
    checks:        allChecks,
  };
}
