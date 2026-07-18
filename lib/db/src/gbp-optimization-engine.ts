/**
 * GBP Optimization Engine — Phase 3
 *
 * Pure functions only. Zero side effects. Zero database imports.
 *
 * generateOptimizations(result, prevChecks?) converts a GbpAuditResult into a
 * GbpOptimizationResult: priority-scored opportunities, group buckets,
 * category breakdown, trend summary, and dashboard metrics.
 *
 * Extensibility: each opportunity carries an `aiFixAvailable` flag so future
 * phases can attach AI-generated fixes, one-click publishing, review responses,
 * and content generation without changing this engine.
 */

import {
  type GbpAuditResult,
  type GbpCheckResult,
  type GbpCheckStatus,
} from "./gbp-audit-engine";

// ── Opportunity types ──────────────────────────────────────────────────────────

export type OptimizationCategory =
  | "Business Information" | "Primary Category"  | "Secondary Categories"
  | "Description"          | "Services"           | "Photos"
  | "Videos"               | "Logo"               | "Cover Photo"
  | "Business Hours"       | "Holiday Hours"      | "Website"
  | "Phone"                | "Reviews"            | "Review Responses"
  | "Review Velocity"      | "Google Posts"       | "Local SEO"
  | "NAP Consistency"      | "Citations"          | "AI Visibility Signals";

export type OpportunitySeverity   = "Critical" | "High" | "Medium" | "Low";
export type OpportunityDifficulty = "Easy"     | "Moderate" | "Advanced";
export type OpportunityGroup      = "quick_win" | "high_impact" | "needs_attention" | "long_term" | "optimized";
export type OpportunityTrend      = "improved" | "regressed" | "new_issue" | "resolved" | "unchanged";

export interface GbpOpportunity {
  id:                       string;                     // deterministic = checkKey
  category:                 OptimizationCategory;
  title:                    string;
  description:              string;
  severity:                 OpportunitySeverity;
  estimatedImpact:          number;                     // 0-100
  implementationDifficulty: OpportunityDifficulty;
  confidence:               number;                     // 0-100
  evidence:                 string;
  recommendedAction:        string;
  supportingGoogleGuideline:string | null;
  group:                    OpportunityGroup;
  priorityScore:            number;                     // 0-100
  timeEstimate:             string;
  aiFixAvailable:           boolean;                    // extensibility hook
  trend:                    OpportunityTrend | null;    // null = no prev audit
  resolved:                 boolean;
  checkStatus:              GbpCheckStatus;
}

export interface CategoryScore {
  category:  OptimizationCategory;
  score:     number;                                    // 0-100
  total:     number;                                    // opportunity count in category
  resolved:  number;                                    // pass count in category
}

export interface TrendSummary {
  improved:   number;
  regressed:  number;
  newIssues:  number;
  resolved:   number;
  unchanged:  number;
  scoreDelta: number;
}

export interface GbpOptimizationResult {
  optimizationScore:            number;                 // 0-100
  criticalCount:                number;
  highCount:                    number;
  estimatedRankingImprovement:  number;                 // 0-100
  estimatedCustomerImpact:      number;                 // 0-100
  topActions:                   GbpOpportunity[];       // top 5 by priorityScore, not optimized
  opportunities:                GbpOpportunity[];       // all 25+
  groups: {
    quickWins:      GbpOpportunity[];
    highImpact:     GbpOpportunity[];
    needsAttention: GbpOpportunity[];
    longTerm:       GbpOpportunity[];
    optimized:      GbpOpportunity[];
  };
  categoryBreakdown:  CategoryScore[];
  trend:              TrendSummary | null;
}

// ── Per-check configuration ────────────────────────────────────────────────────

interface CheckOptConfig {
  category:                 OptimizationCategory;
  title:                    string;
  description:              string;
  severity:                 OpportunitySeverity;
  estimatedImpact:          number;
  implementationDifficulty: OpportunityDifficulty;
  timeEstimate:             string;
  supportingGoogleGuideline:string | null;
  aiFixAvailable:           boolean;
  baseConfidence:           number;
}

const CHECK_OPT_CONFIG: Record<string, CheckOptConfig> = {
  business_name: {
    category: "Business Information",
    title: "Add Your Business Name",
    description: "Your business name is the primary identifier Google uses for your listing. It must be present and accurate for all ranking signals to fire.",
    severity: "Critical", estimatedImpact: 90, implementationDifficulty: "Easy",
    timeEstimate: "5 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/3038177",
    aiFixAvailable: false, baseConfidence: 100,
  },
  primary_category: {
    category: "Primary Category",
    title: "Set Your Primary Business Category",
    description: "Primary category is the single most important ranking signal — it determines which local searches your listing appears in.",
    severity: "Critical", estimatedImpact: 95, implementationDifficulty: "Easy",
    timeEstimate: "5 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/3038177#category",
    aiFixAvailable: false, baseConfidence: 88,
  },
  additional_categories: {
    category: "Secondary Categories",
    title: "Add Secondary Service Categories",
    description: "Additional categories expand visibility across more searches by telling Google every service type you offer.",
    severity: "High", estimatedImpact: 75, implementationDifficulty: "Easy",
    timeEstimate: "10 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/3038177#category",
    aiFixAvailable: false, baseConfidence: 82,
  },
  business_description: {
    category: "Description",
    title: "Write a Business Description",
    description: "A keyword-rich description (50–750 chars) helps AI search engines like ChatGPT and Perplexity identify and cite your business.",
    severity: "High", estimatedImpact: 80, implementationDifficulty: "Easy",
    timeEstimate: "20 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/9157481",
    aiFixAvailable: true, baseConfidence: 82,
  },
  services_listed: {
    category: "Services",
    title: "Add Your Services Catalog",
    description: "Listing your services helps customers understand your offering and gives Google more indexable text about your business.",
    severity: "Medium", estimatedImpact: 65, implementationDifficulty: "Easy",
    timeEstimate: "15 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/9831927",
    aiFixAvailable: false, baseConfidence: 78,
  },
  logo_photo: {
    category: "Logo",
    title: "Upload a Professional Logo",
    description: "Your logo appears in search results, Maps, and knowledge panels. It signals a legitimate, established brand.",
    severity: "Critical", estimatedImpact: 85, implementationDifficulty: "Easy",
    timeEstimate: "10 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/6103862",
    aiFixAvailable: false, baseConfidence: 82,
  },
  cover_photo: {
    category: "Cover Photo",
    title: "Upload a Cover Photo",
    description: "Your cover photo is the banner displayed prominently in your GBP. High-quality covers drive significantly more profile clicks.",
    severity: "High", estimatedImpact: 78, implementationDifficulty: "Easy",
    timeEstimate: "10 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/6103862",
    aiFixAvailable: false, baseConfidence: 82,
  },
  photo_count: {
    category: "Photos",
    title: "Add 10+ Business Photos",
    description: "Businesses with 10+ photos receive 35% more click-throughs and 42% more direction requests than those with fewer.",
    severity: "High", estimatedImpact: 78, implementationDifficulty: "Moderate",
    timeEstimate: "1–2 hours",
    supportingGoogleGuideline: "https://support.google.com/business/answer/6103862",
    aiFixAvailable: false, baseConfidence: 88,
  },
  video_present: {
    category: "Videos",
    title: "Add a Business Video",
    description: "Listings with video content see 3× higher engagement. Short 30-second videos showcasing your service or team work best.",
    severity: "Medium", estimatedImpact: 60, implementationDifficulty: "Moderate",
    timeEstimate: "2–4 hours",
    supportingGoogleGuideline: null,
    aiFixAvailable: false, baseConfidence: 72,
  },
  regular_hours: {
    category: "Business Hours",
    title: "Set Complete Business Hours",
    description: "Missing hours cause customers to distrust your listing. Google deprioritizes listings without complete operational data.",
    severity: "High", estimatedImpact: 82, implementationDifficulty: "Easy",
    timeEstimate: "10 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/3038177#hours",
    aiFixAvailable: false, baseConfidence: 88,
  },
  holiday_hours: {
    category: "Holiday Hours",
    title: "Add Holiday Hours",
    description: "Customers searching during holidays see 'hours might differ' on listings without holiday hours, causing lost calls.",
    severity: "Medium", estimatedImpact: 55, implementationDifficulty: "Easy",
    timeEstimate: "15 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/6303076",
    aiFixAvailable: false, baseConfidence: 78,
  },
  website_url: {
    category: "Website",
    title: "Add Your Website URL",
    description: "Your website URL links Google's understanding of your online presence to your physical business, strengthening all local signals.",
    severity: "High", estimatedImpact: 88, implementationDifficulty: "Easy",
    timeEstimate: "5 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/3038177",
    aiFixAvailable: false, baseConfidence: 100,
  },
  phone_number: {
    category: "Phone",
    title: "Add a Local Phone Number",
    description: "A local area code phone number signals to Google that you are a genuine local business and improves customer call conversion.",
    severity: "High", estimatedImpact: 85, implementationDifficulty: "Easy",
    timeEstimate: "5 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/3038177",
    aiFixAvailable: false, baseConfidence: 100,
  },
  address_complete: {
    category: "Business Information",
    title: "Complete Your Business Address",
    description: "A full address (street, city, state) is required for local pack ranking. Incomplete addresses restrict your local search radius.",
    severity: "Critical", estimatedImpact: 92, implementationDifficulty: "Easy",
    timeEstimate: "5 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/2853879",
    aiFixAvailable: false, baseConfidence: 100,
  },
  service_areas: {
    category: "Business Information",
    title: "Define Your Service Areas",
    description: "Service area businesses need service areas set to appear in searches across their full territory, not just their registered address.",
    severity: "High", estimatedImpact: 80, implementationDifficulty: "Easy",
    timeEstimate: "15 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/9157481",
    aiFixAvailable: false, baseConfidence: 82,
  },
  review_count: {
    category: "Reviews",
    title: "Build Your Review Count to 25+",
    description: "Review count is a top-3 local ranking factor. Businesses with 25+ reviews rank significantly higher in the local pack.",
    severity: "Critical", estimatedImpact: 93, implementationDifficulty: "Moderate",
    timeEstimate: "Ongoing",
    supportingGoogleGuideline: "https://support.google.com/business/answer/3474050",
    aiFixAvailable: true, baseConfidence: 95,
  },
  average_rating: {
    category: "Reviews",
    title: "Improve Average Rating to 4.0+",
    description: "57% of consumers won't use a business rated below 4 stars. A sub-4.0 rating creates a hard conversion barrier.",
    severity: "Critical", estimatedImpact: 90, implementationDifficulty: "Advanced",
    timeEstimate: "Ongoing",
    supportingGoogleGuideline: null,
    aiFixAvailable: false, baseConfidence: 95,
  },
  response_rate: {
    category: "Review Responses",
    title: "Respond to All Google Reviews",
    description: "Responding to all reviews within 24 hours signals professionalism to Google and converts fence-sitters who read your responses.",
    severity: "High", estimatedImpact: 78, implementationDifficulty: "Easy",
    timeEstimate: "Ongoing",
    supportingGoogleGuideline: "https://support.google.com/business/answer/3474050",
    aiFixAvailable: true, baseConfidence: 88,
  },
  review_velocity: {
    category: "Review Velocity",
    title: "Maintain 2+ New Reviews Per Month",
    description: "Review recency matters as much as volume. Steady new reviews signal an active, trustworthy business to Google's algorithm.",
    severity: "High", estimatedImpact: 82, implementationDifficulty: "Moderate",
    timeEstimate: "Ongoing",
    supportingGoogleGuideline: "https://support.google.com/business/answer/3474050",
    aiFixAvailable: true, baseConfidence: 88,
  },
  recent_post: {
    category: "Google Posts",
    title: "Publish a Google Post This Week",
    description: "Posts within 14 days show your listing is actively managed. Active listings receive 50% more views in Google Maps.",
    severity: "High", estimatedImpact: 72, implementationDifficulty: "Easy",
    timeEstimate: "15 minutes",
    supportingGoogleGuideline: "https://support.google.com/business/answer/7662907",
    aiFixAvailable: true, baseConfidence: 95,
  },
  post_frequency: {
    category: "Google Posts",
    title: "Increase Posting to 4+ Times Per Month",
    description: "Consistent posting frequency is a freshness signal. 4+ posts/month shows Google your listing is maintained and relevant.",
    severity: "Medium", estimatedImpact: 68, implementationDifficulty: "Moderate",
    timeEstimate: "Ongoing",
    supportingGoogleGuideline: "https://support.google.com/business/answer/7662907",
    aiFixAvailable: true, baseConfidence: 90,
  },
  posts_with_media: {
    category: "Google Posts",
    title: "Add Photos to Google Posts",
    description: "Posts with images receive 5× higher engagement than text-only posts, driving more profile views and clicks.",
    severity: "Low", estimatedImpact: 52, implementationDifficulty: "Easy",
    timeEstimate: "Ongoing",
    supportingGoogleGuideline: null,
    aiFixAvailable: true, baseConfidence: 85,
  },
  verification_status: {
    category: "NAP Consistency",
    title: "Connect and Verify Your GBP Listing",
    description: "Unverified listings cannot rank in the local pack. Verification is the foundational requirement for all GBP optimization.",
    severity: "Critical", estimatedImpact: 100, implementationDifficulty: "Moderate",
    timeEstimate: "1–7 days",
    supportingGoogleGuideline: "https://support.google.com/business/answer/7107242",
    aiFixAvailable: false, baseConfidence: 100,
  },
  suspension_free: {
    category: "Local SEO",
    title: "Resolve Listing Suspension or Flags",
    description: "A suspended or flagged listing is invisible in search results. Resolve this before any other optimization work.",
    severity: "Critical", estimatedImpact: 100, implementationDifficulty: "Advanced",
    timeEstimate: "1–14 days",
    supportingGoogleGuideline: "https://support.google.com/business/answer/4569145",
    aiFixAvailable: false, baseConfidence: 82,
  },
  duplicate_listings: {
    category: "Local SEO",
    title: "Remove Duplicate Listings",
    description: "Duplicate listings split ranking signals and confuse customers. They also violate Google's policies and risk suspension.",
    severity: "High", estimatedImpact: 75, implementationDifficulty: "Advanced",
    timeEstimate: "1–3 days",
    supportingGoogleGuideline: "https://support.google.com/business/answer/6041109",
    aiFixAvailable: false, baseConfidence: 72,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const EFFORT_MULT: Record<OpportunityDifficulty, number> = {
  Easy:     1.0,
  Moderate: 0.8,
  Advanced: 0.6,
};

function computePriorityScore(
  estimatedImpact: number,
  difficulty:      OpportunityDifficulty,
  confidence:      number,
): number {
  return Math.round(estimatedImpact * EFFORT_MULT[difficulty] * (confidence / 100));
}

function assignGroup(
  opp: Pick<GbpOpportunity, "severity" | "estimatedImpact" | "implementationDifficulty" | "checkStatus">,
): OpportunityGroup {
  if (opp.checkStatus === "pass") return "optimized";
  if (opp.checkStatus === "data_pending") return "long_term"; // can't evaluate
  if (
    opp.implementationDifficulty === "Easy" &&
    opp.estimatedImpact >= 60
  ) return "quick_win";
  if (opp.estimatedImpact >= 75) return "high_impact";
  if (opp.severity === "Critical" || opp.severity === "High") return "needs_attention";
  return "long_term";
}

function computeTrend(
  curr:      GbpCheckResult,
  prevMap:   Map<string, GbpCheckResult>,
): OpportunityTrend | null {
  const prev = prevMap.get(curr.checkKey);
  if (!prev) return null;
  if (prev.status !== "pass" && curr.status === "pass") return "resolved";
  if (prev.status === "pass" && curr.status !== "pass") return "new_issue";
  if (curr.score > prev.score) return "improved";
  if (curr.score < prev.score) return "regressed";
  return "unchanged";
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Generate a full optimization analysis from an audit result.
 *
 * @param result     — output of evaluateGbpAudit()
 * @param prevChecks — checks from the immediately preceding audit (for trend)
 */
export function generateOptimizations(
  result:      GbpAuditResult,
  prevChecks?: GbpCheckResult[],
): GbpOptimizationResult {
  const prevMap = new Map<string, GbpCheckResult>(
    (prevChecks ?? []).map(c => [c.checkKey, c])
  );

  // ── 1. Build opportunities ───────────────────────────────────────────────────

  const opportunities: GbpOpportunity[] = result.checks.map(check => {
    const cfg = CHECK_OPT_CONFIG[check.checkKey] ?? {
      category:                 "Business Information" as OptimizationCategory,
      title:                    check.checkLabel,
      description:              check.recommendation ?? "Review this check and take corrective action.",
      severity:                 (check.priority === "critical" ? "Critical"
        : check.priority === "high"   ? "High"
        : check.priority === "medium" ? "Medium"
        : "Low") as OpportunitySeverity,
      estimatedImpact:          check.maxScore * 4,  // rough proxy
      implementationDifficulty: "Moderate" as OpportunityDifficulty,
      timeEstimate:             "30 minutes",
      supportingGoogleGuideline: null,
      aiFixAvailable:           false,
      baseConfidence:           70,
    };

    // Lower confidence for data_pending checks — we know the optimization exists
    // but cannot verify current state without the GBP API.
    const confidence =
      check.status === "data_pending" ? Math.round(cfg.baseConfidence * 0.6)
      : check.status === "pass"       ? cfg.baseConfidence
      : cfg.baseConfidence;

    const estimatedImpact = Math.min(100, cfg.estimatedImpact);
    const priorityScore   = computePriorityScore(estimatedImpact, cfg.implementationDifficulty, confidence);

    const groupInput = {
      severity:                 cfg.severity,
      estimatedImpact,
      implementationDifficulty: cfg.implementationDifficulty,
      checkStatus:              check.status,
    };
    const group = assignGroup(groupInput);

    const evidence =
      check.status === "data_pending"
        ? "GBP Business Information API required to evaluate this check"
        : check.currentValue ?? "No data available";

    const recommendedAction =
      check.recommendation ??
      (check.status === "pass" ? "This check is already passing — maintain current state." : cfg.title);

    return {
      id:                       check.checkKey,
      category:                 cfg.category,
      title:                    cfg.title,
      description:              cfg.description,
      severity:                 cfg.severity,
      estimatedImpact,
      implementationDifficulty: cfg.implementationDifficulty,
      confidence,
      evidence,
      recommendedAction,
      supportingGoogleGuideline: cfg.supportingGoogleGuideline,
      group,
      priorityScore,
      timeEstimate:             cfg.timeEstimate,
      aiFixAvailable:           cfg.aiFixAvailable,
      trend:                    computeTrend(check, prevMap),
      resolved:                 check.status === "pass",
      checkStatus:              check.status,
    };
  });

  // ── 2. Group opportunities ───────────────────────────────────────────────────

  const groups = {
    quickWins:      opportunities.filter(o => o.group === "quick_win")
                                  .sort((a, b) => b.priorityScore - a.priorityScore),
    highImpact:     opportunities.filter(o => o.group === "high_impact")
                                  .sort((a, b) => b.priorityScore - a.priorityScore),
    needsAttention: opportunities.filter(o => o.group === "needs_attention")
                                  .sort((a, b) => b.priorityScore - a.priorityScore),
    longTerm:       opportunities.filter(o => o.group === "long_term")
                                  .sort((a, b) => b.priorityScore - a.priorityScore),
    optimized:      opportunities.filter(o => o.group === "optimized"),
  };

  // ── 3. Top 5 actions (non-optimized, sorted by priority) ─────────────────────

  const topActions = opportunities
    .filter(o => o.group !== "optimized")
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5);

  // ── 4. Optimization score ─────────────────────────────────────────────────────
  // Based on actionable checks only (data_pending excluded from denominator).

  const actionable     = result.checks.filter(c => c.status !== "data_pending");
  const earnedPoints   = actionable.reduce((s, c) => s + c.score, 0);
  const possiblePoints = actionable.reduce((s, c) => s + c.maxScore, 0);
  const optimizationScore = possiblePoints > 0
    ? Math.round((earnedPoints / possiblePoints) * 100)
    : 0;

  // ── 5. Severity counts ────────────────────────────────────────────────────────

  const notOptimized = opportunities.filter(o => o.group !== "optimized");
  const criticalCount = notOptimized.filter(o => o.severity === "Critical").length;
  const highCount     = notOptimized.filter(o => o.severity === "High").length;

  // ── 6. Estimated impact metrics ──────────────────────────────────────────────

  const estimatedRankingImprovement = Math.min(100,
    criticalCount * 10 + highCount * 5
  );
  const hasReviewGap = notOptimized.some(o =>
    ["review_count", "average_rating", "review_velocity"].includes(o.id)
  );
  const estimatedCustomerImpact = Math.min(100,
    criticalCount * 12 + highCount * 6 + (hasReviewGap ? 12 : 0)
  );

  // ── 7. Category breakdown ─────────────────────────────────────────────────────

  const catMap = new Map<OptimizationCategory, { pass: number; total: number; scoreSum: number; maxSum: number }>();
  for (const opp of opportunities) {
    const entry = catMap.get(opp.category) ?? { pass: 0, total: 0, scoreSum: 0, maxSum: 0 };
    entry.total++;
    if (opp.checkStatus === "pass") entry.pass++;
    const check = result.checks.find(c => c.checkKey === opp.id);
    if (check && check.status !== "data_pending") {
      entry.scoreSum += check.score;
      entry.maxSum   += check.maxScore;
    }
    catMap.set(opp.category, entry);
  }
  const categoryBreakdown: CategoryScore[] = Array.from(catMap.entries()).map(([cat, v]) => ({
    category: cat,
    score:    v.maxSum > 0 ? Math.round((v.scoreSum / v.maxSum) * 100) : 0,
    total:    v.total,
    resolved: v.pass,
  }));

  // ── 8. Trend summary ─────────────────────────────────────────────────────────

  let trend: TrendSummary | null = null;
  if (prevChecks && prevChecks.length > 0) {
    let improved = 0, regressed = 0, newIssues = 0, resolved = 0, unchanged = 0;
    for (const opp of opportunities) {
      switch (opp.trend) {
        case "improved":   improved++;  break;
        case "regressed":  regressed++; break;
        case "new_issue":  newIssues++; break;
        case "resolved":   resolved++;  break;
        case "unchanged":  unchanged++; break;
      }
    }
    const prevScore = prevChecks.filter(c => c.status !== "data_pending").reduce((s, c) => s + c.score, 0);
    const prevMax   = prevChecks.filter(c => c.status !== "data_pending").reduce((s, c) => s + c.maxScore, 0);
    const prevOpt   = prevMax > 0 ? Math.round((prevScore / prevMax) * 100) : 0;
    trend = { improved, regressed, newIssues, resolved, unchanged, scoreDelta: optimizationScore - prevOpt };
  }

  return {
    optimizationScore,
    criticalCount,
    highCount,
    estimatedRankingImprovement,
    estimatedCustomerImpact,
    topActions,
    opportunities,
    groups,
    categoryBreakdown,
    trend,
  };
}
