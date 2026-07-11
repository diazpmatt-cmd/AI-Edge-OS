// ── Canonical BB&B Service Registry ──────────────────────────────────────────
// Single source of truth for every service Bed Bugs & Beyond offers, plans to
// offer, or explicitly does NOT offer.
//
// USAGE RULES
// ───────────
// • All content generation, scheduling, and CTA decisions MUST consult this
//   registry before acting. Do not maintain separate pest/service arrays.
// • A service with generationAllowed: false MUST NOT produce AI content.
// • A service with status "coming_soon" or "disabled" MUST NOT receive
//   booking CTAs, promotional copy, or be presented as available.
// • The termites record is a hard lock — it cannot be overridden by UI settings.
// • Never invent service details, pricing, or procedures not in this file.

export type ServiceStatus   = "active" | "seasonal" | "limited" | "coming_soon" | "disabled";
export type ServiceUrgency  = "low" | "medium" | "high";
export type ServiceCategory = "bed_bug" | "pest" | "rodent" | "wildlife" | "specialty";

export interface BBBService {
  serviceId:              string;
  displayName:            string;
  category:               ServiceCategory;
  status:                 ServiceStatus;
  priority:               number;   // 1 = highest priority in content mix
  revenueWeight:          number;   // 1-10 — relative revenue importance
  contentFrequencyWeight: number;   // 1-10 — how often to appear in generated plans
  urgency:                ServiceUrgency;
  seasonality:            string | null;  // null = year-round; otherwise describes active window
  generationAllowed:      boolean;  // may AI generate content for this service?
  bookingAllowed:         boolean;  // may we send booking CTAs?
  publishAllowed:         boolean;  // may we publish (queue) posts for this service?
  ctaAllowed:             boolean;  // may we include any CTA for this service?
  supportedAudiences:     string[]; // audience IDs that are relevant
  campaignGoals:          string[]; // which campaign goals this service supports
  allowedContentAngles:   string[]; // subset of global angles that make sense
  prohibitedClaims:       string[]; // claims the AI must never make for this service
  differentiators:        string[]; // factual competitive differentiators (for prompts)
  notes:                  string;
}

// ── Active / Seasonal Services ────────────────────────────────────────────────

export const BBB_SERVICES: BBBService[] = [

  // ── Bed Bug Services (highest revenue, top priority) ─────────────────────

  {
    serviceId:              "bed_bug_inspection",
    displayName:            "Bed Bug Inspection",
    category:               "bed_bug",
    status:                 "active",
    priority:               1,
    revenueWeight:          10,
    contentFrequencyWeight: 10,
    urgency:                "high",
    seasonality:            null,
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners","vacation_rental_owners","airbnb_hosts","vrbo_hosts","property_managers","hotels_motels"],
    campaignGoals:          ["inspection_booking","call_generation","vacation_rental_outreach","property_manager_outreach"],
    allowedContentAngles:   ["educational","warning","promotional","faq","prevention","emergency","testimonial"],
    prohibitedClaims:       [
      "guaranteed bed bug elimination on first visit",
      "we offer heat treatment",
      "whole-home heat treatment included",
      "100% guaranteed",
    ],
    differentiators:        [
      "fast same-week inspections available",
      "serving all of Baldwin County",
      "discreet, professional service",
    ],
    notes: "Primary lead driver. Inspection is the entry point to treatment revenue.",
  },

  {
    serviceId:              "bed_bug_treatment",
    displayName:            "Bed Bug Treatment",
    category:               "bed_bug",
    status:                 "active",
    priority:               1,
    revenueWeight:          10,
    contentFrequencyWeight: 10,
    urgency:                "high",
    seasonality:            null,
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners","vacation_rental_owners","airbnb_hosts","vrbo_hosts","property_managers","hotels_motels","condo_associations"],
    campaignGoals:          ["treatment_booking","call_generation","inspection_booking","vacation_rental_outreach","property_manager_outreach"],
    allowedContentAngles:   ["educational","warning","promotional","faq","prevention","emergency","testimonial"],
    prohibitedClaims:       [
      "we offer whole-home heat treatment",
      "heat treatment included",
      "guaranteed elimination",
      "one treatment always solves the problem",
      "exact cost savings without verified pricing",
      "heat treatment never works",
      "unsupported preparation or chemical instructions",
    ],
    differentiators:        [
      "targeted treatment of affected furniture and areas — not automatically requiring expensive whole-home heat treatment",
      "often more affordable than whole-home heat treatment",
      "professional inspection before treatment",
      "discreet and efficient service",
    ],
    notes: "Use targeted-treatment positioning. Never claim heat treatment is offered. Never claim savings without verified data.",
  },

  // ── General Pest Services ─────────────────────────────────────────────────

  {
    serviceId:              "residential_pest_control",
    displayName:            "Residential Pest Control",
    category:               "pest",
    status:                 "active",
    priority:               2,
    revenueWeight:          8,
    contentFrequencyWeight: 7,
    urgency:                "medium",
    seasonality:            null,
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners","condo_associations"],
    campaignGoals:          ["call_generation","inspection_booking","homeowner_education","local_visibility"],
    allowedContentAngles:   ["educational","promotional","seasonal","faq","prevention","testimonial"],
    prohibitedClaims:       [
      "specific quarterly subscription pricing not confirmed",
      "specific contract terms not confirmed",
      "guaranteed pest-free guarantee",
    ],
    differentiators:        ["locally owned Baldwin County company","fast response times"],
    notes: "Active service. Do not invent specific plan pricing or contract details.",
  },

  {
    serviceId:              "commercial_pest_control",
    displayName:            "Commercial Pest Control",
    category:               "pest",
    status:                 "active",
    priority:               2,
    revenueWeight:          8,
    contentFrequencyWeight: 7,
    urgency:                "medium",
    seasonality:            null,
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["restaurants","hotels_motels","commercial_businesses","condo_associations"],
    campaignGoals:          ["commercial_outreach","call_generation","inspection_booking"],
    allowedContentAngles:   ["educational","promotional","faq","testimonial","warning"],
    prohibitedClaims:       [
      "specific health-code compliance guarantee",
      "FDA or health department endorsement",
    ],
    differentiators:        ["serving restaurants, hotels, and commercial properties across Baldwin County"],
    notes: "Good for restaurants, hotels, property managers.",
  },

  {
    serviceId:              "roaches",
    displayName:            "Roach Control",
    category:               "pest",
    status:                 "active",
    priority:               2,
    revenueWeight:          8,
    contentFrequencyWeight: 8,
    urgency:                "high",
    seasonality:            null,
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners","restaurants","hotels_motels","commercial_businesses"],
    campaignGoals:          ["call_generation","inspection_booking","homeowner_education","commercial_outreach"],
    allowedContentAngles:   ["educational","warning","promotional","faq","prevention","emergency"],
    prohibitedClaims:       ["guaranteed permanent elimination","specific chemical names unless confirmed"],
    differentiators:        ["fast effective treatment","serving all of Baldwin County"],
    notes: "High-volume service. Good year-round urgency angle.",
  },

  {
    serviceId:              "rodents",
    displayName:            "Rodent Control (Rats & Mice)",
    category:               "rodent",
    status:                 "active",
    priority:               2,
    revenueWeight:          8,
    contentFrequencyWeight: 7,
    urgency:                "high",
    seasonality:            "Fall/winter uptick (October–February); year-round in coastal areas",
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners","restaurants","commercial_businesses","property_managers"],
    campaignGoals:          ["call_generation","inspection_booking","homeowner_education"],
    allowedContentAngles:   ["educational","warning","promotional","prevention","emergency","faq"],
    prohibitedClaims:       ["guaranteed elimination without inspection","specific toxicant names unless confirmed"],
    differentiators:        ["inspection + exclusion + treatment approach"],
    notes: "Seasonal uptick fall/winter. Restaurants and commercial are good audiences.",
  },

  {
    serviceId:              "mosquitoes",
    displayName:            "Mosquito Control",
    category:               "pest",
    status:                 "seasonal",
    priority:               2,
    revenueWeight:          8,
    contentFrequencyWeight: 7,
    urgency:                "medium",
    seasonality:            "Peak April–October on the Gulf Coast of Alabama",
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners","vacation_rental_owners","airbnb_hosts","vrbo_hosts","property_managers"],
    campaignGoals:          ["seasonal_alert","call_generation","vacation_rental_outreach","homeowner_education"],
    allowedContentAngles:   ["seasonal","educational","warning","promotional","prevention"],
    prohibitedClaims:       ["100% mosquito elimination","specific chemical names unless confirmed"],
    differentiators:        ["Gulf Coast expertise","vacation rental-friendly scheduling"],
    notes: "High seasonal content frequency April–October. Good for vacation rental angle.",
  },

  {
    serviceId:              "fumigation",
    displayName:            "Fumigation",
    category:               "specialty",
    status:                 "active",
    priority:               2,
    revenueWeight:          8,
    contentFrequencyWeight: 5,
    urgency:                "high",
    seasonality:            null,
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners","commercial_businesses","restaurants","hotels_motels"],
    campaignGoals:          ["call_generation","inspection_booking","commercial_outreach"],
    allowedContentAngles:   ["educational","warning","faq","promotional"],
    prohibitedClaims:       [
      "chemical dosage or specific fumigant names",
      "DIY fumigation instructions",
      "regulatory compliance guarantee",
      "exact preparation steps unless from approved BB&B documentation",
      "price guarantees",
      "guaranteed elimination",
      "dangerous procedural instructions",
    ],
    differentiators:        ["professional licensed fumigation service"],
    notes: "Active service. Do NOT confuse with whole-home bed bug heat treatment. Keep content educational/awareness focused.",
  },

  {
    serviceId:              "ants",
    displayName:            "Ant Control",
    category:               "pest",
    status:                 "active",
    priority:               3,
    revenueWeight:          6,
    contentFrequencyWeight: 6,
    urgency:                "medium",
    seasonality:            null,
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners","restaurants","commercial_businesses"],
    campaignGoals:          ["call_generation","homeowner_education","prevention"],
    allowedContentAngles:   ["educational","warning","promotional","prevention","faq"],
    prohibitedClaims:       ["guaranteed ant-free","specific chemical names unless confirmed"],
    differentiators:        [],
    notes: "Common service. Good for educational content.",
  },

  {
    serviceId:              "fleas",
    displayName:            "Flea Control",
    category:               "pest",
    status:                 "seasonal",
    priority:               3,
    revenueWeight:          6,
    contentFrequencyWeight: 5,
    urgency:                "medium",
    seasonality:            "Active March–November; peak summer",
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners","vacation_rental_owners","property_managers"],
    campaignGoals:          ["call_generation","seasonal_alert","homeowner_education"],
    allowedContentAngles:   ["educational","warning","seasonal","prevention","faq"],
    prohibitedClaims:       ["guaranteed elimination","specific product names unless confirmed"],
    differentiators:        [],
    notes: "Seasonal. Good paired with ticks in a 'flea & tick' content angle.",
  },

  {
    serviceId:              "ticks",
    displayName:            "Tick Control",
    category:               "pest",
    status:                 "seasonal",
    priority:               3,
    revenueWeight:          6,
    contentFrequencyWeight: 5,
    urgency:                "medium",
    seasonality:            "Active March–November; peak late spring/summer",
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners","vacation_rental_owners","property_managers"],
    campaignGoals:          ["call_generation","seasonal_alert","homeowner_education","prevention"],
    allowedContentAngles:   ["educational","warning","seasonal","prevention","faq"],
    prohibitedClaims:       ["guaranteed tick elimination","medical claims about tick-borne illness unless accurately stated"],
    differentiators:        [],
    notes: "Seasonal. Health-angle content requires care — no unsupported medical claims.",
  },

  {
    serviceId:              "wasps_hornets",
    displayName:            "Wasp & Hornet Control",
    category:               "pest",
    status:                 "seasonal",
    priority:               3,
    revenueWeight:          5,
    contentFrequencyWeight: 4,
    urgency:                "medium",
    seasonality:            "Active March–September",
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners","commercial_businesses"],
    campaignGoals:          ["call_generation","seasonal_alert","homeowner_education"],
    allowedContentAngles:   ["warning","seasonal","educational","emergency","faq"],
    prohibitedClaims:       ["guaranteed nest elimination in one visit","safe for self-removal"],
    differentiators:        ["professional nest removal — safer than DIY"],
    notes: "Seasonal. Good urgency/safety angle content.",
  },

  {
    serviceId:              "spiders",
    displayName:            "Spider Control",
    category:               "pest",
    status:                 "active",
    priority:               4,
    revenueWeight:          4,
    contentFrequencyWeight: 3,
    urgency:                "low",
    seasonality:            null,
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners"],
    campaignGoals:          ["call_generation","homeowner_education"],
    allowedContentAngles:   ["educational","warning","faq","prevention"],
    prohibitedClaims:       ["guaranteed spider-free","all spiders are dangerous"],
    differentiators:        [],
    notes: "Lower priority. Occasional content only.",
  },

  {
    serviceId:              "moles",
    displayName:            "Mole Control",
    category:               "pest",
    status:                 "active",
    priority:               5,
    revenueWeight:          2,
    contentFrequencyWeight: 1,
    urgency:                "low",
    seasonality:            null,
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners"],
    campaignGoals:          ["call_generation","homeowner_education"],
    allowedContentAngles:   ["educational","faq","prevention"],
    prohibitedClaims:       ["guaranteed mole elimination","specific trap or chemical names unless confirmed"],
    differentiators:        [],
    notes: "Low frequency. No more than occasional campaigns. Do not overuse.",
  },

  // ── Coming Soon ───────────────────────────────────────────────────────────

  {
    serviceId:              "termites",
    displayName:            "Termite Control",
    category:               "pest",
    status:                 "coming_soon",
    priority:               99,
    revenueWeight:          0,
    contentFrequencyWeight: 0,
    urgency:                "low",
    seasonality:            null,
    generationAllowed:      false,  // HARD LOCK — do not override
    bookingAllowed:         false,  // HARD LOCK
    publishAllowed:         false,  // HARD LOCK
    ctaAllowed:             false,  // HARD LOCK
    supportedAudiences:     [],
    campaignGoals:          [],
    allowedContentAngles:   [],
    prohibitedClaims:       [
      "BB&B offers termite service",
      "termite treatment available",
      "call to book termite service",
      "termite inspection available",
    ],
    differentiators:        [],
    notes: "BB&B does NOT currently offer termite service. Status: coming_soon. All generation flags are false. This is a hard business rule — do not enable without Matthew explicitly changing this record.",
  },

  // ── Disabled (not offered) ────────────────────────────────────────────────

  {
    serviceId:              "wildlife_removal",
    displayName:            "Wildlife Removal",
    category:               "wildlife",
    status:                 "disabled",
    priority:               99,
    revenueWeight:          0,
    contentFrequencyWeight: 0,
    urgency:                "low",
    seasonality:            null,
    generationAllowed:      false,  // Not offered
    bookingAllowed:         false,
    publishAllowed:         false,
    ctaAllowed:             false,
    supportedAudiences:     [],
    campaignGoals:          [],
    allowedContentAngles:   [],
    prohibitedClaims:       [
      "BB&B offers wildlife removal",
      "wildlife removal available",
    ],
    differentiators:        [],
    notes: "Wildlife removal is not confirmed or approved. Disabled. Do not enable without explicit instruction.",
  },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getBBBService(serviceId: string): BBBService | undefined {
  return BBB_SERVICES.find(s => s.serviceId === serviceId);
}

export function getGeneratableServices(): BBBService[] {
  return BBB_SERVICES.filter(s => s.generationAllowed);
}

export function getActiveServices(): BBBService[] {
  return BBB_SERVICES.filter(s => s.status === "active" || s.status === "seasonal");
}

export function getComingSoonServices(): BBBService[] {
  return BBB_SERVICES.filter(s => s.status === "coming_soon");
}

export function getDisabledServices(): BBBService[] {
  return BBB_SERVICES.filter(s => s.status === "disabled");
}

/** Canonical topic display names for generatable services, sorted by priority then revenue. */
export function getDefaultTopics(): string[] {
  return getGeneratableServices()
    .sort((a, b) => a.priority - b.priority || b.revenueWeight - a.revenueWeight)
    .map(s => s.displayName);
}

/**
 * Validate that a topic string refers to a service that can be generated.
 * Returns an error code string if invalid, or null if valid.
 */
export function validateTopicForGeneration(topic: string): string | null {
  const normalized = topic.trim().toLowerCase();

  // Hard-coded blocked keyword groups with explicit error codes.
  // These must never slip through regardless of registry state.
  const COMING_SOON_KEYWORDS = ["termite"];
  const DISABLED_KEYWORDS    = ["wildlife", "wildlife removal"];
  const NOT_GENERATABLE_KEYWORDS = [
    "heat treatment", "whole-home heat treatment", "bed bug heat treatment",
  ];

  if (COMING_SOON_KEYWORDS.some(t => normalized.includes(t))) return "SERVICE_COMING_SOON";
  if (DISABLED_KEYWORDS.some(t => normalized.includes(t)))     return "SERVICE_DISABLED";
  if (NOT_GENERATABLE_KEYWORDS.some(t => normalized.includes(t))) return "SERVICE_NOT_GENERATABLE";

  // Find matching service by displayName or serviceId (partial match OK for topic strings)
  const match = BBB_SERVICES.find(s =>
    normalized.includes(s.serviceId.replace(/_/g, " ")) ||
    normalized.includes(s.displayName.toLowerCase()) ||
    s.displayName.toLowerCase().includes(normalized)
  );

  if (!match) return null; // Unknown topic — allow (may be a valid pest not in registry yet)
  if (!match.generationAllowed) {
    if (match.status === "coming_soon") return "SERVICE_COMING_SOON";
    if (match.status === "disabled")   return "SERVICE_DISABLED";
    return "SERVICE_NOT_GENERATABLE";
  }
  return null;
}

/**
 * Normalize a list of topic strings against the registry.
 * - Removes hard-blocked topics (termites, wildlife, heat treatment)
 * - Returns a cleaned list safe for AI generation
 */
export function normalizeTopics(topics: string[]): string[] {
  return topics.filter(t => validateTopicForGeneration(t) === null);
}

/**
 * Find the matching BBBService for a topic display name (best effort).
 */
export function matchServiceByTopic(topic: string): BBBService | undefined {
  const normalized = topic.trim().toLowerCase();
  return BBB_SERVICES.find(s =>
    normalized.includes(s.serviceId.replace(/_/g, " ")) ||
    normalized.includes(s.displayName.toLowerCase()) ||
    s.displayName.toLowerCase().includes(normalized)
  );
}

// ── Service-specific prompt rules (for AI generation) ─────────────────────────

export function getServicePromptRules(topic: string): string {
  const service = matchServiceByTopic(topic);
  if (!service) return "";

  const lines: string[] = [];

  if (service.serviceId === "bed_bug_treatment" || service.serviceId === "bed_bug_inspection") {
    lines.push(
      "BED BUG TREATMENT POSITIONING:",
      "- BB&B uses targeted treatment of affected furniture and specific areas.",
      "- This approach is often more affordable than whole-home heat treatment.",
      "- DO NOT claim BB&B offers heat treatment.",
      "- DO NOT claim guaranteed elimination or exact cost savings.",
      "- ALLOWED: professional inspection, targeted treatment, often more affordable than whole-home heat.",
    );
  }

  if (service.serviceId === "fumigation") {
    lines.push(
      "FUMIGATION RULES:",
      "- Keep content at awareness/educational level.",
      "- DO NOT generate: chemical dosages, DIY instructions, regulatory compliance claims,",
      "  exact preparation steps, specific pricing, or guarantees.",
      "- ALLOWED: service awareness, general educational content, inspection/consultation CTA.",
    );
  }

  if (service.prohibitedClaims.length) {
    lines.push("PROHIBITED CLAIMS — never include:");
    service.prohibitedClaims.forEach(c => lines.push(`- ${c}`));
  }

  if (service.differentiators.length) {
    lines.push("COMPANY DIFFERENTIATORS you may reference:");
    service.differentiators.forEach(d => lines.push(`- ${d}`));
  }

  return lines.length ? lines.join("\n") : "";
}

// ── Campaign Goals ─────────────────────────────────────────────────────────────

export const CAMPAIGN_GOALS = [
  "call_generation",
  "inspection_booking",
  "treatment_booking",
  "vacation_rental_outreach",
  "property_manager_outreach",
  "commercial_outreach",
  "homeowner_education",
  "prevention",
  "seasonal_alert",
  "review_trust",
  "local_visibility",
] as const;

export type CampaignGoal = typeof CAMPAIGN_GOALS[number];

// ── Campaign Mix ──────────────────────────────────────────────────────────────

export const BBB_DEFAULT_CAMPAIGN_MIX = {
  revenue:   60,   // call_generation, inspection_booking, treatment_booking, outreach goals
  education: 25,   // homeowner_education, prevention, seasonal_alert
  trust:     15,   // review_trust, local_visibility
} as const;

export const REVENUE_GOALS    = new Set<CampaignGoal>(["call_generation","inspection_booking","treatment_booking","vacation_rental_outreach","property_manager_outreach","commercial_outreach"]);
export const EDUCATION_GOALS  = new Set<CampaignGoal>(["homeowner_education","prevention","seasonal_alert"]);
export const TRUST_GOALS      = new Set<CampaignGoal>(["review_trust","local_visibility"]);

// ── Audience Registry ─────────────────────────────────────────────────────────

export interface BBBAudience {
  audienceId:   string;
  displayName:  string;
  description:  string;
  priority:     number;  // 1 = highest value
}

export const BBB_AUDIENCES: BBBAudience[] = [
  {
    audienceId:  "homeowners",
    displayName: "Homeowners",
    description: "Residential property owners across Baldwin County",
    priority:    1,
  },
  {
    audienceId:  "vacation_rental_owners",
    displayName: "Vacation Rental Owners",
    description: "Short-term rental owners (non-platform-specific) in Gulf Shores / Orange Beach area",
    priority:    1,
  },
  {
    audienceId:  "airbnb_hosts",
    displayName: "Airbnb Hosts",
    description: "Hosts on Airbnb platform in Baldwin County",
    priority:    1,
  },
  {
    audienceId:  "vrbo_hosts",
    displayName: "VRBO Hosts",
    description: "Hosts on VRBO platform in Baldwin County",
    priority:    1,
  },
  {
    audienceId:  "property_managers",
    displayName: "Property Managers",
    description: "Managers overseeing multiple residential or vacation rental units",
    priority:    2,
  },
  {
    audienceId:  "hotels_motels",
    displayName: "Hotels & Motels",
    description: "Hospitality businesses along the Gulf Coast",
    priority:    2,
  },
  {
    audienceId:  "condo_associations",
    displayName: "Condo Associations",
    description: "HOAs and condo boards in Baldwin County",
    priority:    3,
  },
  {
    audienceId:  "restaurants",
    displayName: "Restaurants",
    description: "Food service establishments requiring commercial pest control",
    priority:    2,
  },
  {
    audienceId:  "commercial_businesses",
    displayName: "Commercial Businesses",
    description: "General commercial and retail businesses",
    priority:    3,
  },
];

export function getBBBAudience(audienceId: string): BBBAudience | undefined {
  return BBB_AUDIENCES.find(a => a.audienceId === audienceId);
}

// ── Approval Modes ─────────────────────────────────────────────────────────────

export type ApprovalMode = "draft_only" | "approval_required" | "auto_schedule";

export const APPROVAL_MODES: Record<ApprovalMode, { label: string; description: string }> = {
  draft_only: {
    label:       "Draft Only",
    description: "Generate drafts. Nothing enters the approval queue or schedule automatically.",
  },
  approval_required: {
    label:       "Approval Required",
    description: "Generate and queue for review. Each post requires explicit approval before scheduling.",
  },
  auto_schedule: {
    label:       "Full Autopilot",
    description: "Generate and schedule automatically on eligible connected platforms.",
  },
};

/** The default approval mode for the BB&B pilot. Must not be auto_schedule. */
export const BBB_DEFAULT_APPROVAL_MODE: ApprovalMode = "approval_required";

// ── Service → Operational Status Adapter ─────────────────────────────────────
// Maps canonical ServiceStatus values to the four-state operational color system
// shared with PlatformStateChip. Never derive colors from service category/brand.
//
// READY          = active or seasonal (content generation enabled, no blockers)
// ACTION_REQUIRED = would be available after an admin action (not used for services currently)
// BLOCKED        = not offered or disabled — fatal block on generation + CTAs
// PENDING        = coming_soon — future service, not active yet

export type OperationalState = "ready" | "action_required" | "blocked" | "pending";

export function serviceStatusToOperationalState(status: ServiceStatus): OperationalState {
  switch (status) {
    case "active":      return "ready";
    case "seasonal":    return "ready";       // generatable when in season
    case "limited":     return "action_required";
    case "coming_soon": return "pending";
    case "disabled":    return "blocked";
  }
}

// ── Weekly Plan Helpers ────────────────────────────────────────────────────────

/**
 * Creates a deterministic weeklyPlanId for a given userId and ISO week.
 * Format: week-YYYY-WW-{userId} — guarantees one plan per user per calendar week.
 * Idempotency: re-running generation in the same week yields the same ID,
 * so the caller can check for existing posts with this ID to prevent duplicates.
 */
export function createWeeklyPlanId(userId: string, date: Date = new Date()): string {
  // ISO week number (Monday-start)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // make Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  const shortId = userId.replace(/[^a-z0-9]/gi, "").slice(0, 8);
  return `week-${d.getUTCFullYear()}-${String(weekNum).padStart(2, "0")}-${shortId}`;
}

/**
 * Weighted random selection — returns a random item where each item's chance
 * is proportional to its weight. Never throws on empty input.
 */
function weightedRandom<T>(items: T[], weightFn: (item: T) => number): T | undefined {
  const total = items.reduce((sum, item) => sum + weightFn(item), 0);
  if (total === 0 || items.length === 0) return items[0];
  let rand = Math.random() * total;
  for (const item of items) {
    rand -= weightFn(item);
    if (rand <= 0) return item;
  }
  return items[items.length - 1];
}

export interface WeeklyServiceSlot {
  service:      BBBService;
  campaignGoal: CampaignGoal;
  audienceId:   string;
  bucket:       "revenue" | "education" | "trust";
}

/**
 * Select `count` weekly service slots using the 60/25/15 revenue/education/trust mix.
 * - Respects service weights (revenueWeight × contentFrequencyWeight)
 * - Excludes coming_soon and disabled services
 * - Moles appear rarely (contentFrequencyWeight=1)
 * - Returns slots in a shuffled order suitable for day assignment
 *
 * Example for count=7: 4 revenue, 2 education, 1 trust
 */
export function selectWeeklyServices(
  count: number,
  recentTopics: string[] = [],
): WeeklyServiceSlot[] {
  const generatable = getGeneratableServices();

  // Compute bucket sizes using floor + remainder
  const revCount  = Math.round(count * BBB_DEFAULT_CAMPAIGN_MIX.revenue   / 100);
  const eduCount  = Math.round(count * BBB_DEFAULT_CAMPAIGN_MIX.education / 100);
  const trustCount = count - revCount - eduCount; // absorb rounding remainder

  function pickService(pool: BBBService[], usedIds: Set<string>): BBBService | undefined {
    const available = pool.filter(s => !usedIds.has(s.serviceId));
    const candidates = available.length ? available : pool; // allow repeats when pool is small
    return weightedRandom(candidates, s => s.revenueWeight * s.contentFrequencyWeight);
  }

  function pickGoalForBucket(
    service: BBBService,
    bucket: "revenue" | "education" | "trust",
  ): CampaignGoal {
    const goalSet = bucket === "revenue"    ? REVENUE_GOALS
                  : bucket === "education"  ? EDUCATION_GOALS
                  : TRUST_GOALS;

    // Prefer goals the service explicitly supports, filtered by bucket
    const eligible = (service.campaignGoals as CampaignGoal[]).filter(g => goalSet.has(g));
    if (eligible.length) return eligible[Math.floor(Math.random() * eligible.length)];

    // Fallback to any goal in the bucket
    const bucketGoals = [...goalSet];
    return bucketGoals[Math.floor(Math.random() * bucketGoals.length)];
  }

  function pickAudience(service: BBBService): string {
    if (service.supportedAudiences.length) {
      return service.supportedAudiences[Math.floor(Math.random() * service.supportedAudiences.length)];
    }
    return "homeowners";
  }

  const usedServiceIds = new Set<string>(
    recentTopics.flatMap(t => {
      const s = matchServiceByTopic(t);
      return s ? [s.serviceId] : [];
    })
  );

  const slots: WeeklyServiceSlot[] = [];

  // Revenue bucket
  for (let i = 0; i < revCount; i++) {
    const svc = pickService(generatable, new Set([...usedServiceIds, ...slots.map(sl => sl.service.serviceId)]));
    if (!svc) break;
    slots.push({ service: svc, campaignGoal: pickGoalForBucket(svc, "revenue"), audienceId: pickAudience(svc), bucket: "revenue" });
  }

  // Education bucket
  for (let i = 0; i < eduCount; i++) {
    const svc = pickService(generatable, new Set(slots.map(sl => sl.service.serviceId)));
    if (!svc) break;
    slots.push({ service: svc, campaignGoal: pickGoalForBucket(svc, "education"), audienceId: pickAudience(svc), bucket: "education" });
  }

  // Trust bucket
  for (let i = 0; i < trustCount; i++) {
    const svc = pickService(generatable, new Set(slots.map(sl => sl.service.serviceId)));
    if (!svc) break;
    slots.push({ service: svc, campaignGoal: pickGoalForBucket(svc, "trust"), audienceId: pickAudience(svc), bucket: "trust" });
  }

  // Shuffle so revenue/education/trust don't cluster on sequential days
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  return slots;
}
