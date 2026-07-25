/**
 * GBP Audit Engine — Phase 2 unit tests
 *
 * Tests cover:
 *  - Backward compatibility: no liveData → all 15 gbp_api checks = data_pending
 *  - Full live data → all 15 checks evaluated with correct pass/warn/fail status
 *  - Individual API error fallback → only the affected checks degrade to data_pending
 *  - Score arithmetic: overallScore = localScore + liveScore
 */

import { describe, it, expect } from "vitest";
import {
  evaluateGbpAudit,
  type GbpAuditInput,
  type GbpLiveData,
  GBP_CHECK_REGISTRY,
} from "@workspace/db";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const minimalInput: GbpAuditInput = {
  profile: {
    businessName: "Bed Bugs & Beyond",
    phone: "555-123-4567",
    website: "https://bedbugsbeyond.com",
    address: "123 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
  },
  googleConnection: {
    connected: true,
    locationName: "accounts/123/locations/456",
    locationTitle: "Bed Bugs & Beyond",
    accountName: "accounts/123",
    tokenExists: true,
  },
  reviewStats: { reviewCount: 25, averageRating: 4.8 },
  googlePosts: { totalLast30Days: 6, totalLast14Days: 3, postsWithImageLast30Days: 4 },
};

const fullLiveData: GbpLiveData = {
  primaryCategory: "Pest Control Service",
  additionalCategories: ["Exterminator", "Bed Bug Exterminator"],
  regularHoursDaysCount: 6,
  profileDescription: "Professional bed bug treatment specialists serving Austin and surrounding areas. We use heat and chemical treatments.",
  hasServiceArea: true,
  specialHourPeriodsCount: 3,
  serviceItemsCount: 5,
  hasPendingVerification: false,
  mapsUri: "https://maps.google.com/?cid=12345",
  hasLogo: true,
  hasCover: true,
  totalPhotoCount: 15,
  hasVideo: true,
  reviewResponseRate: 0.95,
  reviewsLast30Days: 4,
  locationCount:  1,
  locationTitles: ["Bed Bugs & Beyond"],
  errors: {},
};

// ── Backward compatibility ────────────────────────────────────────────────────

describe("evaluateGbpAudit — Phase 1 compatibility (no liveData)", () => {
  it("returns 15 data_pending checks when liveData is omitted", () => {
    const result = evaluateGbpAudit(minimalInput);
    const pendingChecks = result.checks.filter(c => c.status === "data_pending");
    const gbpApiKeys = GBP_CHECK_REGISTRY.filter(d => d.evidenceType === "gbp_api").map(d => d.checkKey);
    expect(pendingChecks.length).toBe(gbpApiKeys.length);
    expect(pendingChecks.length).toBe(15);
  });

  it("returns 15 data_pending checks when liveData is null", () => {
    const result = evaluateGbpAudit(minimalInput, null);
    expect(result.checks.filter(c => c.status === "data_pending").length).toBe(15);
  });

  it("overallScore equals localScore when liveData is null", () => {
    const result = evaluateGbpAudit(minimalInput, null);
    expect(result.overallScore).toBe(result.localScore);
    expect(result.localScore).toBeGreaterThan(0);
  });

  it("checksPending equals 15 when liveData is null", () => {
    const result = evaluateGbpAudit(minimalInput, null);
    expect(result.checksPending).toBe(15);
  });
});

// ── Full live data — all checks evaluated ────────────────────────────────────

describe("evaluateGbpAudit — Phase 2 full live data", () => {
  it("has zero data_pending checks when all APIs succeed", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    expect(result.checks.filter(c => c.status === "data_pending").length).toBe(0);
    expect(result.checksPending).toBe(0);
  });

  it("overallScore > localScore when live checks pass", () => {
    const phase1 = evaluateGbpAudit(minimalInput, null);
    const phase2 = evaluateGbpAudit(minimalInput, fullLiveData);
    expect(phase2.overallScore).toBeGreaterThan(phase1.overallScore);
  });

  it("overallScore does not exceed maxScore (100)", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    expect(result.overallScore).toBeLessThanOrEqual(result.maxScore);
    expect(result.maxScore).toBe(100);
  });

  it("primary_category passes with displayName", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "primary_category")!;
    expect(check.status).toBe("pass");
    expect(check.score).toBe(5);
    expect(check.currentValue).toBe("Pest Control Service");
  });

  it("regular_hours passes with 6 days", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "regular_hours")!;
    expect(check.status).toBe("pass");
    expect(check.score).toBe(5);
  });

  it("regular_hours warns with 3 days", () => {
    const live: GbpLiveData = { ...fullLiveData, regularHoursDaysCount: 3 };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "regular_hours")!;
    expect(check.status).toBe("warning");
  });

  it("regular_hours fails with 0 days", () => {
    const live: GbpLiveData = { ...fullLiveData, regularHoursDaysCount: 0 };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "regular_hours")!;
    expect(check.status).toBe("fail");
    expect(check.score).toBe(0);
  });

  it("business_description passes with 50+ chars", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "business_description")!;
    expect(check.status).toBe("pass");
    expect(check.score).toBe(4);
  });

  it("business_description warns with short description", () => {
    const live: GbpLiveData = { ...fullLiveData, profileDescription: "Short" };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "business_description")!;
    expect(check.status).toBe("warning");
  });

  it("business_description fails with null description", () => {
    const live: GbpLiveData = { ...fullLiveData, profileDescription: null };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "business_description")!;
    expect(check.status).toBe("fail");
    expect(check.score).toBe(0);
  });

  it("additional_categories passes with 2 categories", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "additional_categories")!;
    expect(check.status).toBe("pass");
    expect(check.score).toBe(3);
  });

  it("additional_categories fails with empty array", () => {
    const live: GbpLiveData = { ...fullLiveData, additionalCategories: [] };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "additional_categories")!;
    expect(check.status).toBe("fail");
    expect(check.score).toBe(0);
  });

  it("service_areas passes when hasServiceArea is true", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "service_areas")!;
    expect(check.status).toBe("pass");
  });

  it("service_areas fails when hasServiceArea is false", () => {
    const live: GbpLiveData = { ...fullLiveData, hasServiceArea: false };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "service_areas")!;
    expect(check.status).toBe("fail");
    expect(check.score).toBe(0);
  });

  it("holiday_hours passes when specialHourPeriodsCount >= 1", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "holiday_hours")!;
    expect(check.status).toBe("pass");
  });

  it("services_listed passes when serviceItemsCount >= 1", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "services_listed")!;
    expect(check.status).toBe("pass");
  });

  it("logo_photo passes when hasLogo is true", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "logo_photo")!;
    expect(check.status).toBe("pass");
    expect(check.score).toBe(5);
  });

  it("logo_photo fails when hasLogo is false", () => {
    const live: GbpLiveData = { ...fullLiveData, hasLogo: false };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "logo_photo")!;
    expect(check.status).toBe("fail");
    expect(check.score).toBe(0);
  });

  it("cover_photo passes when hasCover is true", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "cover_photo")!;
    expect(check.status).toBe("pass");
  });

  it("photo_count passes with 15 photos", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "photo_count")!;
    expect(check.status).toBe("pass");
    expect(check.score).toBe(7);
  });

  it("photo_count warns with 7 photos", () => {
    const live: GbpLiveData = { ...fullLiveData, totalPhotoCount: 7 };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "photo_count")!;
    expect(check.status).toBe("warning");
  });

  it("photo_count fails with 2 photos", () => {
    const live: GbpLiveData = { ...fullLiveData, totalPhotoCount: 2 };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "photo_count")!;
    expect(check.status).toBe("fail");
    expect(check.score).toBe(0);
  });

  it("video_present passes when hasVideo is true", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "video_present")!;
    expect(check.status).toBe("pass");
  });

  it("response_rate passes at 95%", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "response_rate")!;
    expect(check.status).toBe("pass");
    expect(check.score).toBe(5);
  });

  it("response_rate warns at 60%", () => {
    const live: GbpLiveData = { ...fullLiveData, reviewResponseRate: 0.6 };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "response_rate")!;
    expect(check.status).toBe("warning");
  });

  it("response_rate fails at 20%", () => {
    const live: GbpLiveData = { ...fullLiveData, reviewResponseRate: 0.2 };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "response_rate")!;
    expect(check.status).toBe("fail");
    expect(check.score).toBe(0);
  });

  it("review_velocity passes at 4 reviews / 30 days", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "review_velocity")!;
    expect(check.status).toBe("pass");
    expect(check.score).toBe(5);
  });

  it("review_velocity warns at 1 review / 30 days", () => {
    const live: GbpLiveData = { ...fullLiveData, reviewsLast30Days: 1 };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "review_velocity")!;
    expect(check.status).toBe("warning");
  });

  it("review_velocity fails at 0 reviews / 30 days", () => {
    const live: GbpLiveData = { ...fullLiveData, reviewsLast30Days: 0 };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "review_velocity")!;
    expect(check.status).toBe("fail");
    expect(check.score).toBe(0);
  });

  it("suspension_free passes when on Maps and no pending verification", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "suspension_free")!;
    expect(check.status).toBe("pass");
    expect(check.score).toBe(5);
  });

  it("suspension_free warns when hasPendingVerification is true", () => {
    const live: GbpLiveData = { ...fullLiveData, hasPendingVerification: true };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "suspension_free")!;
    expect(check.status).toBe("warning");
  });

  it("suspension_free fails when mapsUri is null", () => {
    const live: GbpLiveData = { ...fullLiveData, mapsUri: null, hasPendingVerification: false };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "suspension_free")!;
    expect(check.status).toBe("fail");
    expect(check.score).toBe(0);
  });

  it("duplicate_listings passes with locationCount = 1", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const check = result.checks.find(c => c.checkKey === "duplicate_listings")!;
    expect(check.status).toBe("pass");
    expect(check.score).toBe(2);
  });

  it("duplicate_listings warns with locationCount = 3 (no titles — raw-count heuristic)", () => {
    const live: GbpLiveData = { ...fullLiveData, locationCount: 3, locationTitles: null };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "duplicate_listings")!;
    expect(check.status).toBe("warning");
  });

  it("duplicate_listings passes with 2 distinct titles (different businesses, no duplicate)", () => {
    const live: GbpLiveData = {
      ...fullLiveData, locationCount: 2,
      locationTitles: ["Bed Bugs & Beyond", "MainStreet Web Co."],
    };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "duplicate_listings")!;
    expect(check.status).toBe("pass");
    expect(check.score).toBe(2);
    expect(check.currentValue).toMatch(/distinct businesses/);
  });

  it("duplicate_listings warns with 2 identical titles (real duplicate)", () => {
    const live: GbpLiveData = {
      ...fullLiveData, locationCount: 2,
      locationTitles: ["Bed Bugs & Beyond", "Bed Bugs & Beyond"],
    };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "duplicate_listings")!;
    expect(check.status).toBe("warning");
    expect(check.score).toBeLessThan(2);
  });

  it("duplicate_listings treats same title with different casing/punctuation as duplicate", () => {
    const live: GbpLiveData = {
      ...fullLiveData, locationCount: 2,
      // Stripping non-alphanum and lowercasing makes these identical: "bed bugs beyond"
      locationTitles: ["Bed Bugs & Beyond", "BED BUGS & BEYOND"],
    };
    const result = evaluateGbpAudit(minimalInput, live);
    const check = result.checks.find(c => c.checkKey === "duplicate_listings")!;
    expect(check.status).toBe("warning");
  });
});

// ── Partial API failures — graceful degradation ───────────────────────────────

describe("evaluateGbpAudit — partial API failures", () => {
  it("degrades only businessInfo checks when businessInfo errors; media/reviews still score", () => {
    const live: GbpLiveData = {
      ...fullLiveData,
      errors: { businessInfo: "HTTP 429" },
    };
    const result = evaluateGbpAudit(minimalInput, live);

    const businessInfoKeys = [
      "primary_category", "regular_hours", "business_description",
      "additional_categories", "service_areas", "holiday_hours",
      "services_listed", "suspension_free",
    ];
    const mediaKeys = ["logo_photo", "cover_photo", "photo_count", "video_present"];
    const reviewKeys = ["response_rate", "review_velocity"];

    for (const key of businessInfoKeys) {
      const check = result.checks.find(c => c.checkKey === key)!;
      expect(check.status, `${key} should be data_pending`).toBe("data_pending");
    }

    for (const key of mediaKeys) {
      const check = result.checks.find(c => c.checkKey === key)!;
      expect(check.status, `${key} should NOT be data_pending`).not.toBe("data_pending");
    }

    for (const key of reviewKeys) {
      const check = result.checks.find(c => c.checkKey === key)!;
      expect(check.status, `${key} should NOT be data_pending`).not.toBe("data_pending");
    }
  });

  it("degrades only media checks when media errors; businessInfo/reviews still score", () => {
    const live: GbpLiveData = {
      ...fullLiveData,
      errors: { media: "HTTP 403" },
    };
    const result = evaluateGbpAudit(minimalInput, live);

    const mediaKeys = ["logo_photo", "cover_photo", "photo_count", "video_present"];
    for (const key of mediaKeys) {
      const check = result.checks.find(c => c.checkKey === key)!;
      expect(check.status, `${key} should be data_pending`).toBe("data_pending");
    }

    const biCheck = result.checks.find(c => c.checkKey === "primary_category")!;
    expect(biCheck.status).not.toBe("data_pending");
  });

  it("degrades only review checks when reviews errors", () => {
    const live: GbpLiveData = {
      ...fullLiveData,
      errors: { reviews: "HTTP 500" },
    };
    const result = evaluateGbpAudit(minimalInput, live);

    const check = result.checks.find(c => c.checkKey === "response_rate")!;
    expect(check.status).toBe("data_pending");

    const velCheck = result.checks.find(c => c.checkKey === "review_velocity")!;
    expect(velCheck.status).toBe("data_pending");

    const biCheck = result.checks.find(c => c.checkKey === "primary_category")!;
    expect(biCheck.status).not.toBe("data_pending");
  });

  it("still includes all 25 checks in the result regardless of errors", () => {
    const live: GbpLiveData = {
      ...fullLiveData,
      errors: { businessInfo: "err", media: "err", reviews: "err", duplicates: "err" },
    };
    const result = evaluateGbpAudit(minimalInput, live);
    expect(result.checks.length).toBe(25);
  });
});

// ── Output ordering ───────────────────────────────────────────────────────────

describe("evaluateGbpAudit — output ordering", () => {
  it("checks are sorted by category then registry order", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    const cats = result.checks.map(c => c.category);
    const expected = ["information", "media", "reviews", "posts", "authority"];
    let lastCatIdx = 0;
    for (const cat of cats) {
      const idx = expected.indexOf(cat);
      expect(idx).toBeGreaterThanOrEqual(lastCatIdx);
      lastCatIdx = idx;
    }
  });

  it("returns exactly 25 checks", () => {
    const result = evaluateGbpAudit(minimalInput, fullLiveData);
    expect(result.checks.length).toBe(25);
  });
});
