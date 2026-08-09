export type ApollosCapabilityPillar =
  | "discovery"
  | "content"
  | "authority"
  | "optimization"
  | "measurement"
  | "lead_conversion"
  | "commerce";

export type ApollosCapabilityStatus =
  | "ACTIVE"
  | "CONNECTED_NOT_ACTIVE"
  | "CONFIGURATION_REQUIRED"
  | "AUTHORIZATION_REQUIRED"
  | "MISCONFIGURED"
  | "DEGRADED"
  | "AVAILABLE"
  | "BLOCKED"
  | "NOT_APPLICABLE";

export type ApollosActionGate =
  | "SAFE_AUTOMATIC_ACTION"
  | "HUMAN_APPROVAL_REQUIRED"
  | "OAUTH_AUTHORIZATION_REQUIRED"
  | "EXTERNAL_CONFIGURATION_REQUIRED"
  | "BLOCKED";

export type ApollosBusinessKind = "local_service" | "commerce" | "any";
export type ApollosProductStage = "active" | "preview" | "planned";

export interface ApollosCapabilityDefinition {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly pillar: ApollosCapabilityPillar;
  readonly category: string;
  readonly appliesTo: readonly ApollosBusinessKind[];
  readonly productStage: ApollosProductStage;
  readonly scoreWeight: number;
  readonly requiredIntegration?: string;
  readonly activationFeature?: string;
  readonly dependencies?: readonly string[];
  readonly authorization?: "oauth" | "external" | "none";
  readonly activationGate: ApollosActionGate;
  readonly benefit: string;
  readonly recommendedAction: string;
}

export interface ApollosCapabilityBlocker {
  readonly reason: string;
  readonly gate?: ApollosActionGate;
}

export interface ApollosClientEvidence {
  readonly connectedIntegrations?: readonly string[];
  readonly activeFeatures?: readonly string[];
  readonly degradedFeatures?: readonly string[];
  readonly misconfiguredFeatures?: readonly string[];
  readonly blockedCapabilities?: Readonly<Record<string, ApollosCapabilityBlocker>>;
  readonly notApplicableCapabilities?: readonly string[];
}

export interface ApollosClientDescriptor {
  readonly id: string;
  readonly name: string;
  readonly industry: string;
  readonly businessKind?: ApollosBusinessKind;
}

export interface ApollosCapabilityCoverage {
  readonly capability: ApollosCapabilityDefinition;
  readonly status: ApollosCapabilityStatus;
  readonly scoreEligible: boolean;
  readonly scoreContribution: number;
  readonly blockedReason: string | null;
  readonly nextAction: string | null;
  readonly actionGate: ApollosActionGate | null;
}

export interface ApollosClientCoverage {
  readonly client: ApollosClientDescriptor & { readonly businessKind: ApollosBusinessKind };
  readonly score: number;
  readonly scoreEligibleCapabilities: number;
  readonly activeCapabilities: number;
  readonly applicableCapabilities: number;
  readonly opportunities: number;
  readonly authorizationRequired: number;
  readonly blocked: number;
  readonly capabilities: readonly ApollosCapabilityCoverage[];
}

export interface ApollosActivationPlanItem {
  readonly id: string;
  readonly capabilityKey: string;
  readonly capabilityName: string;
  readonly pillar: ApollosCapabilityPillar;
  readonly priority: number;
  readonly reason: string;
  readonly expectedBenefit: string;
  readonly dependencies: readonly string[];
  readonly gate: ApollosActionGate;
  readonly executionStatus:
    | "ready"
    | "approval_required"
    | "authorization_required"
    | "external_configuration_required"
    | "blocked";
  readonly blocker: string | null;
  readonly recommendedAction: string;
}

export interface ApollosActivationPlan {
  readonly clientId: string;
  readonly clientName: string;
  readonly coverageScore: number;
  readonly items: readonly ApollosActivationPlanItem[];
}

const BOTH: readonly ApollosBusinessKind[] = ["any"];
const LOCAL: readonly ApollosBusinessKind[] = ["local_service"];
const COMMERCE: readonly ApollosBusinessKind[] = ["commerce"];

export const APOLLOS_CAPABILITY_REGISTRY: readonly ApollosCapabilityDefinition[] = Object.freeze([
  {
    key: "google_business_profile",
    name: "Google Business Profile",
    description: "Local search and Maps presence through Google Business Profile.",
    pillar: "discovery",
    category: "local_presence",
    appliesTo: LOCAL,
    productStage: "active",
    scoreWeight: 10,
    requiredIntegration: "google_business",
    authorization: "oauth",
    activationGate: "OAUTH_AUTHORIZATION_REQUIRED",
    benefit: "Improves Google Search and Maps discovery for local-intent customers.",
    recommendedAction: "Connect and verify Google Business Profile, then confirm the correct location is selected.",
  },
  {
    key: "facebook_social",
    name: "Facebook",
    description: "Facebook connection plus active content distribution.",
    pillar: "content",
    category: "social",
    appliesTo: BOTH,
    productStage: "active",
    scoreWeight: 7,
    requiredIntegration: "facebook",
    activationFeature: "publishing:facebook",
    authorization: "oauth",
    activationGate: "OAUTH_AUTHORIZATION_REQUIRED",
    benefit: "Creates consistent social reach and a reusable distribution channel.",
    recommendedAction: "Connect Facebook and include it in the active publishing strategy.",
  },
  {
    key: "instagram_social",
    name: "Instagram",
    description: "Instagram connection plus active content distribution.",
    pillar: "content",
    category: "social",
    appliesTo: BOTH,
    productStage: "active",
    scoreWeight: 7,
    requiredIntegration: "instagram",
    activationFeature: "publishing:instagram",
    authorization: "oauth",
    activationGate: "OAUTH_AUTHORIZATION_REQUIRED",
    benefit: "Extends visual and short-form content reach to Instagram audiences.",
    recommendedAction: "Connect Instagram and include it in the active publishing strategy.",
  },
  {
    key: "youtube_content",
    name: "YouTube",
    description: "YouTube connection and an active video publishing lane.",
    pillar: "content",
    category: "video",
    appliesTo: BOTH,
    productStage: "active",
    scoreWeight: 6,
    requiredIntegration: "youtube",
    activationFeature: "publishing:youtube",
    authorization: "oauth",
    activationGate: "OAUTH_AUTHORIZATION_REQUIRED",
    benefit: "Builds durable video discovery and reusable authority content.",
    recommendedAction: "Connect YouTube and activate a recurring video or Shorts publishing plan.",
  },
  {
    key: "content_autopilot",
    name: "Content Autopilot",
    description: "Automated content generation and approval workflow using the canonical client service registry.",
    pillar: "content",
    category: "automation",
    appliesTo: BOTH,
    productStage: "active",
    scoreWeight: 9,
    activationFeature: "content_autopilot",
    authorization: "none",
    activationGate: "HUMAN_APPROVAL_REQUIRED",
    benefit: "Maintains a reliable content cadence without losing human approval controls.",
    recommendedAction: "Configure Content Autopilot with approved services, platforms, cadence, and approval mode.",
  },
  {
    key: "review_automation",
    name: "Review Automation",
    description: "Review request and reputation workflow.",
    pillar: "authority",
    category: "reviews",
    appliesTo: BOTH,
    productStage: "active",
    scoreWeight: 8,
    activationFeature: "review_automation",
    authorization: "none",
    activationGate: "HUMAN_APPROVAL_REQUIRED",
    benefit: "Builds trust signals that improve conversion and local authority.",
    recommendedAction: "Activate the review request workflow and verify eligible-customer coverage.",
  },
  {
    key: "ai_receptionist",
    name: "AI Receptionist",
    description: "24/7 call handling, qualification, and routing.",
    pillar: "lead_conversion",
    category: "call_capture",
    appliesTo: LOCAL,
    productStage: "active",
    scoreWeight: 10,
    activationFeature: "ai_receptionist",
    authorization: "external",
    activationGate: "EXTERNAL_CONFIGURATION_REQUIRED",
    benefit: "Reduces missed-call leakage and captures intent while the team is unavailable.",
    recommendedAction: "Configure the receptionist routing and transfer destination, then verify the call flow.",
  },
  {
    key: "lead_recovery",
    name: "Lead Recovery",
    description: "Missed-call text-back, lead follow-up, and pipeline recovery.",
    pillar: "lead_conversion",
    category: "lead_recovery",
    appliesTo: LOCAL,
    productStage: "active",
    scoreWeight: 10,
    activationFeature: "lead_recovery",
    authorization: "external",
    activationGate: "HUMAN_APPROVAL_REQUIRED",
    benefit: "Recovers leads that would otherwise go cold after a missed call or incomplete follow-up.",
    recommendedAction: "Activate lead recovery rules and verify the approved messaging and escalation path.",
  },
  {
    key: "local_presence_engine",
    name: "Local Presence Engine",
    description: "Coordinates visibility across high-value local directories and map ecosystems.",
    pillar: "discovery",
    category: "local_presence",
    appliesTo: LOCAL,
    productStage: "active",
    scoreWeight: 8,
    activationFeature: "local_presence_engine",
    authorization: "external",
    activationGate: "HUMAN_APPROVAL_REQUIRED",
    benefit: "Expands local discovery beyond a single search or map provider.",
    recommendedAction: "Run the local presence audit and complete the highest-value missing listings first.",
  },
  {
    key: "discovery_engine",
    name: "Discovery Engine",
    description: "Finds search, competitor, local, and AI-visibility opportunities.",
    pillar: "discovery",
    category: "intelligence",
    appliesTo: BOTH,
    productStage: "active",
    scoreWeight: 8,
    activationFeature: "discovery_engine",
    authorization: "none",
    activationGate: "SAFE_AUTOMATIC_ACTION",
    benefit: "Continuously surfaces the highest-value growth opportunities instead of relying on manual research.",
    recommendedAction: "Run Discovery for the client and persist the prioritized opportunity set.",
  },
  {
    key: "authority_engine",
    name: "Authority Engine",
    description: "Backlink gaps, citations, partnerships, and authority opportunities.",
    pillar: "authority",
    category: "off_page_authority",
    appliesTo: BOTH,
    productStage: "active",
    scoreWeight: 8,
    activationFeature: "authority_engine",
    dependencies: ["discovery_engine"],
    authorization: "none",
    activationGate: "HUMAN_APPROVAL_REQUIRED",
    benefit: "Builds durable external trust through citations, links, partnerships, and competitive gap closure.",
    recommendedAction: "Generate the prioritized authority opportunity list and prepare outreach for human review.",
  },
  {
    key: "optimization_engine",
    name: "Optimization Engine",
    description: "Schema, internal linking, technical SEO, service/city refreshes, and AI crawler optimization.",
    pillar: "optimization",
    category: "on_site_optimization",
    appliesTo: BOTH,
    productStage: "active",
    scoreWeight: 8,
    activationFeature: "optimization_engine",
    dependencies: ["discovery_engine"],
    authorization: "none",
    activationGate: "HUMAN_APPROVAL_REQUIRED",
    benefit: "Turns discovered opportunities into stronger pages and machine-readable business authority.",
    recommendedAction: "Generate the prioritized optimization queue and prepare safe site changes for review.",
  },
  {
    key: "measurement_engine",
    name: "Measurement Engine",
    description: "Tracks rankings, leads, ROI, competitor gap, authority, and AI visibility.",
    pillar: "measurement",
    category: "analytics",
    appliesTo: BOTH,
    productStage: "active",
    scoreWeight: 8,
    activationFeature: "measurement_engine",
    authorization: "none",
    activationGate: "SAFE_AUTOMATIC_ACTION",
    benefit: "Shows whether AI Edge activity is producing visibility, leads, and revenue instead of just activity.",
    recommendedAction: "Establish the measurement baseline and begin recurring score and outcome tracking.",
  },
  {
    key: "ai_visibility_monitoring",
    name: "AI Visibility Monitoring",
    description: "Tracks business recommendation and citation visibility across major AI assistants.",
    pillar: "measurement",
    category: "ai_search",
    appliesTo: BOTH,
    productStage: "active",
    scoreWeight: 8,
    activationFeature: "ai_visibility_monitoring",
    dependencies: ["discovery_engine"],
    authorization: "none",
    activationGate: "SAFE_AUTOMATIC_ACTION",
    benefit: "Makes AI-search visibility measurable so optimization can target actual gaps.",
    recommendedAction: "Run the AI visibility baseline and schedule recurring monitoring.",
  },
  {
    key: "seller_edge_commerce",
    name: "Seller Edge Commerce",
    description: "Commerce content and marketplace optimization for ecommerce clients.",
    pillar: "commerce",
    category: "commerce_growth",
    appliesTo: COMMERCE,
    productStage: "preview",
    scoreWeight: 8,
    activationFeature: "seller_edge_commerce",
    authorization: "external",
    activationGate: "EXTERNAL_CONFIGURATION_REQUIRED",
    benefit: "Connects product data to content, listing optimization, and commerce growth workflows.",
    recommendedAction: "Connect the supported store/catalog source and configure the commerce content plan.",
  },
  {
    key: "apple_business_connect",
    name: "Apple Business Connect",
    description: "Apple Maps and Siri local business presence.",
    pillar: "discovery",
    category: "local_presence",
    appliesTo: LOCAL,
    productStage: "preview",
    scoreWeight: 4,
    activationFeature: "local_presence:apple",
    authorization: "external",
    activationGate: "EXTERNAL_CONFIGURATION_REQUIRED",
    benefit: "Improves discovery across Apple Maps and Siri experiences.",
    recommendedAction: "Complete Apple Business Connect ownership and listing verification.",
  },
  {
    key: "bing_places",
    name: "Bing Places",
    description: "Bing and Microsoft local business presence.",
    pillar: "discovery",
    category: "local_presence",
    appliesTo: LOCAL,
    productStage: "preview",
    scoreWeight: 4,
    activationFeature: "local_presence:bing",
    authorization: "external",
    activationGate: "EXTERNAL_CONFIGURATION_REQUIRED",
    benefit: "Adds Microsoft/Bing local discovery coverage and another trusted business citation.",
    recommendedAction: "Claim or sync the Bing Places listing and complete verification.",
  },
  {
    key: "nextdoor_presence",
    name: "Nextdoor",
    description: "Neighborhood discovery and local referral presence.",
    pillar: "discovery",
    category: "local_presence",
    appliesTo: LOCAL,
    productStage: "preview",
    scoreWeight: 4,
    activationFeature: "local_presence:nextdoor",
    authorization: "external",
    activationGate: "EXTERNAL_CONFIGURATION_REQUIRED",
    benefit: "Adds neighborhood-level visibility and referral potential.",
    recommendedAction: "Claim or verify the Nextdoor business presence and configure the local workflow.",
  },
  {
    key: "tiktok_social",
    name: "TikTok",
    description: "Short-form video distribution through TikTok when the adapter is available.",
    pillar: "content",
    category: "social",
    appliesTo: BOTH,
    productStage: "planned",
    scoreWeight: 0,
    requiredIntegration: "tiktok",
    activationFeature: "publishing:tiktok",
    authorization: "oauth",
    activationGate: "BLOCKED",
    benefit: "Adds short-form video distribution to another discovery surface.",
    recommendedAction: "Keep the client prepared for TikTok authorization when the production adapter is enabled.",
  },
  {
    key: "linkedin_social",
    name: "LinkedIn",
    description: "Professional social distribution when the production adapter is available.",
    pillar: "content",
    category: "social",
    appliesTo: BOTH,
    productStage: "planned",
    scoreWeight: 0,
    requiredIntegration: "linkedin",
    activationFeature: "publishing:linkedin",
    authorization: "oauth",
    activationGate: "BLOCKED",
    benefit: "Adds professional-network visibility for applicable businesses.",
    recommendedAction: "Prepare the client profile for LinkedIn authorization when the production adapter is enabled.",
  },
  {
    key: "pinterest_social",
    name: "Pinterest",
    description: "Visual discovery and commerce distribution when the production adapter is available.",
    pillar: "content",
    category: "social",
    appliesTo: BOTH,
    productStage: "planned",
    scoreWeight: 0,
    requiredIntegration: "pinterest",
    activationFeature: "publishing:pinterest",
    authorization: "oauth",
    activationGate: "BLOCKED",
    benefit: "Adds evergreen visual discovery for service ideas and products.",
    recommendedAction: "Prepare assets and account ownership for Pinterest when the production adapter is enabled.",
  },
]);

const STATUS_SCORE: Readonly<Record<ApollosCapabilityStatus, number>> = Object.freeze({
  ACTIVE: 1,
  CONNECTED_NOT_ACTIVE: 0.5,
  CONFIGURATION_REQUIRED: 0,
  AUTHORIZATION_REQUIRED: 0,
  MISCONFIGURED: 0,
  DEGRADED: 0.35,
  AVAILABLE: 0,
  BLOCKED: 0,
  NOT_APPLICABLE: 0,
});

function setOf(values: readonly string[] | undefined): ReadonlySet<string> {
  return new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function inferApollosBusinessKind(industry: string): ApollosBusinessKind {
  const normalized = industry.trim().toLowerCase();
  return /(ecommerce|e-commerce|retail|seller|shop|store|product)/.test(normalized)
    ? "commerce"
    : "local_service";
}

function appliesToClient(
  capability: ApollosCapabilityDefinition,
  businessKind: ApollosBusinessKind,
): boolean {
  return capability.appliesTo.includes("any") || capability.appliesTo.includes(businessKind);
}

function reasonForStatus(status: ApollosCapabilityStatus, capability: ApollosCapabilityDefinition): string {
  switch (status) {
    case "CONNECTED_NOT_ACTIVE": return `${capability.name} is connected but is not part of the active client strategy.`;
    case "CONFIGURATION_REQUIRED": return `${capability.name} is supported but still needs client configuration.`;
    case "AUTHORIZATION_REQUIRED": return `${capability.name} requires account authorization before AI Edge can use it.`;
    case "MISCONFIGURED": return `${capability.name} has configuration evidence that must be repaired before activation.`;
    case "DEGRADED": return `${capability.name} is configured but currently degraded.`;
    case "AVAILABLE": return `${capability.name} is available to this client but is not active yet.`;
    case "BLOCKED": return `${capability.name} cannot be activated yet.`;
    case "ACTIVE": return `${capability.name} is active.`;
    case "NOT_APPLICABLE": return `${capability.name} is not applicable to this client.`;
  }
}

function gateForStatus(
  status: ApollosCapabilityStatus,
  capability: ApollosCapabilityDefinition,
): ApollosActionGate | null {
  if (status === "ACTIVE" || status === "NOT_APPLICABLE") return null;
  if (status === "AUTHORIZATION_REQUIRED") return "OAUTH_AUTHORIZATION_REQUIRED";
  if (status === "BLOCKED") return "BLOCKED";
  return capability.activationGate;
}

export function evaluateApollosCapability(input: {
  readonly capability: ApollosCapabilityDefinition;
  readonly businessKind: ApollosBusinessKind;
  readonly evidence?: ApollosClientEvidence;
}): ApollosCapabilityCoverage {
  const { capability, businessKind, evidence = {} } = input;
  const connected = setOf(evidence.connectedIntegrations);
  const active = setOf(evidence.activeFeatures);
  const degraded = setOf(evidence.degradedFeatures);
  const misconfigured = setOf(evidence.misconfiguredFeatures);
  const notApplicable = setOf(evidence.notApplicableCapabilities);
  const blocker = evidence.blockedCapabilities?.[capability.key];

  let status: ApollosCapabilityStatus;
  let blockedReason: string | null = null;

  if (notApplicable.has(capability.key) || !appliesToClient(capability, businessKind)) {
    status = "NOT_APPLICABLE";
  } else if (blocker) {
    status = "BLOCKED";
    blockedReason = blocker.reason;
  } else if (capability.productStage === "planned") {
    status = "BLOCKED";
    blockedReason = "AI Edge production adapter is not active yet.";
  } else if (capability.activationFeature && misconfigured.has(capability.activationFeature)) {
    status = "MISCONFIGURED";
  } else if (capability.activationFeature && degraded.has(capability.activationFeature)) {
    status = "DEGRADED";
  } else if (capability.activationFeature && active.has(capability.activationFeature)) {
    status = "ACTIVE";
  } else if (capability.requiredIntegration) {
    const isConnected = connected.has(capability.requiredIntegration);
    if (!isConnected) {
      status = capability.authorization === "oauth" ? "AUTHORIZATION_REQUIRED" : "CONFIGURATION_REQUIRED";
    } else if (capability.activationFeature) {
      status = "CONNECTED_NOT_ACTIVE";
    } else {
      status = "ACTIVE";
    }
  } else if (capability.activationFeature) {
    status = "CONFIGURATION_REQUIRED";
  } else {
    status = "AVAILABLE";
  }

  const scoreEligible =
    capability.productStage !== "planned" &&
    status !== "NOT_APPLICABLE" &&
    capability.scoreWeight > 0;
  const scoreContribution = scoreEligible
    ? capability.scoreWeight * STATUS_SCORE[status]
    : 0;
  const actionGate = blocker?.gate ?? gateForStatus(status, capability);

  return Object.freeze({
    capability,
    status,
    scoreEligible,
    scoreContribution,
    blockedReason,
    nextAction: status === "ACTIVE" || status === "NOT_APPLICABLE" ? null : capability.recommendedAction,
    actionGate,
  });
}

export function buildApollosClientCoverage(input: {
  readonly client: ApollosClientDescriptor;
  readonly evidence?: ApollosClientEvidence;
  readonly registry?: readonly ApollosCapabilityDefinition[];
}): ApollosClientCoverage {
  const businessKind = input.client.businessKind ?? inferApollosBusinessKind(input.client.industry);
  const registry = input.registry ?? APOLLOS_CAPABILITY_REGISTRY;
  const capabilities = registry.map((capability) => evaluateApollosCapability({
    capability,
    businessKind,
    evidence: input.evidence,
  }));

  const eligible = capabilities.filter((item) => item.scoreEligible);
  const totalWeight = eligible.reduce((sum, item) => sum + item.capability.scoreWeight, 0);
  const earned = eligible.reduce((sum, item) => sum + item.scoreContribution, 0);
  const score = totalWeight === 0 ? 0 : Math.round((earned / totalWeight) * 100);
  const applicable = capabilities.filter((item) => item.status !== "NOT_APPLICABLE");
  const opportunityStatuses = new Set<ApollosCapabilityStatus>([
    "CONNECTED_NOT_ACTIVE",
    "CONFIGURATION_REQUIRED",
    "AUTHORIZATION_REQUIRED",
    "MISCONFIGURED",
    "DEGRADED",
    "AVAILABLE",
  ]);

  return Object.freeze({
    client: Object.freeze({ ...input.client, businessKind }),
    score,
    scoreEligibleCapabilities: eligible.length,
    activeCapabilities: applicable.filter((item) => item.status === "ACTIVE").length,
    applicableCapabilities: applicable.length,
    opportunities: applicable.filter((item) => opportunityStatuses.has(item.status)).length,
    authorizationRequired: applicable.filter((item) => item.status === "AUTHORIZATION_REQUIRED").length,
    blocked: applicable.filter((item) => item.status === "BLOCKED").length,
    capabilities: Object.freeze(capabilities),
  });
}

function executionStatusForGate(gate: ApollosActionGate): ApollosActivationPlanItem["executionStatus"] {
  switch (gate) {
    case "SAFE_AUTOMATIC_ACTION": return "ready";
    case "HUMAN_APPROVAL_REQUIRED": return "approval_required";
    case "OAUTH_AUTHORIZATION_REQUIRED": return "authorization_required";
    case "EXTERNAL_CONFIGURATION_REQUIRED": return "external_configuration_required";
    case "BLOCKED": return "blocked";
  }
}

const STATUS_PRIORITY: Readonly<Record<Exclude<ApollosCapabilityStatus, "ACTIVE" | "NOT_APPLICABLE">, number>> = Object.freeze({
  MISCONFIGURED: 100,
  DEGRADED: 90,
  CONNECTED_NOT_ACTIVE: 80,
  AUTHORIZATION_REQUIRED: 70,
  CONFIGURATION_REQUIRED: 60,
  AVAILABLE: 50,
  BLOCKED: 10,
});

export function buildApollosActivationPlan(coverage: ApollosClientCoverage): ApollosActivationPlan {
  const items = coverage.capabilities
    .filter((item) => item.status !== "ACTIVE" && item.status !== "NOT_APPLICABLE")
    .map((item): ApollosActivationPlanItem => {
      const status = item.status as Exclude<ApollosCapabilityStatus, "ACTIVE" | "NOT_APPLICABLE">;
      const gate = item.actionGate ?? item.capability.activationGate;
      const blocker = item.blockedReason ?? (status === "BLOCKED" ? reasonForStatus(status, item.capability) : null);
      return Object.freeze({
        id: `activate:${item.capability.key}`,
        capabilityKey: item.capability.key,
        capabilityName: item.capability.name,
        pillar: item.capability.pillar,
        priority: STATUS_PRIORITY[status] + item.capability.scoreWeight,
        reason: item.blockedReason ?? reasonForStatus(status, item.capability),
        expectedBenefit: item.capability.benefit,
        dependencies: Object.freeze([...(item.capability.dependencies ?? [])]),
        gate,
        executionStatus: executionStatusForGate(gate),
        blocker,
        recommendedAction: item.capability.recommendedAction,
      });
    })
    .sort((a, b) => b.priority - a.priority || a.capabilityKey.localeCompare(b.capabilityKey));

  return Object.freeze({
    clientId: coverage.client.id,
    clientName: coverage.client.name,
    coverageScore: coverage.score,
    items: Object.freeze(items),
  });
}

export function explainApollosCoverageGap(
  coverage: ApollosClientCoverage,
  capabilityKey: string,
): ApollosActivationPlanItem | null {
  return buildApollosActivationPlan(coverage).items.find((item) => item.capabilityKey === capabilityKey) ?? null;
}
