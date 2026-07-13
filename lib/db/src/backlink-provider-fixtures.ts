import type { BacklinkCapability, RawBacklinkEvidence } from "./backlink-types";
import { BBB_BACKLINK_CLIENT_ID } from "./backlink-fixtures";

export interface FixtureBacklinkObservation {
  clientId: string;
  cities: readonly string[];
  region: string;
  capability: BacklinkCapability;
  evidence: RawBacklinkEvidence;
}

const BALDWIN = "Baldwin County, Alabama";
const BASE_DATE = "2026-07-10T12:00:00.000Z";

export const BBB_FIXTURE_BACKLINK_OBSERVATIONS: readonly FixtureBacklinkObservation[] = Object.freeze([
  { clientId: BBB_BACKLINK_CLIENT_ID, cities: ["Foley", "Gulf Shores"], region: BALDWIN, capability: "partnership_organization_discovery", evidence: {
    sourceDomain: "southbaldwinchamber.com", sourceUrl: "https://southbaldwinchamber.com/member-directory/pest-control?utm_source=fixture",
    category: "partnership_organization", opportunityCategory: "local_partnership", serviceId: "commercial_pest_control", discoveredAt: BASE_DATE,
    localRelevance: 100, serviceRelevance: 85, competitorFrequency: 60, relationshipAccessibility: 90, editorialRequirements: 15, estimatedEffort: 25, authority: 68,
    metadata: { county: "Baldwin County", relationship: "chamber membership" },
  } },
  { clientId: BBB_BACKLINK_CLIENT_ID, cities: ["Gulf Shores"], region: BALDWIN, capability: "citation_directory_discovery", evidence: {
    sourceDomain: "gulfshores.com", sourceUrl: "https://gulfshores.com/business-resources/vendor-directory", category: "citation_directory",
    opportunityCategory: "citation_directory", serviceId: "fumigation", discoveredAt: BASE_DATE, localRelevance: 95, serviceRelevance: 80,
    competitorFrequency: 55, relationshipAccessibility: 75, editorialRequirements: 20, estimatedEffort: 30, authority: 72,
    metadata: { area: "Gulf Shores, Baldwin County", positioning: "licensed professional fumigation" },
  } },
  { clientId: BBB_BACKLINK_CLIENT_ID, cities: ["Foley", "Gulf Shores"], region: BALDWIN, capability: "resource_page_discovery", evidence: {
    sourceDomain: "baldwincountytoday.com", sourceUrl: "https://baldwincountytoday.com/resources/bed-bug-help", category: "resource_page",
    opportunityCategory: "resource_page", serviceId: "bed_bug_treatment", discoveredAt: BASE_DATE, localRelevance: 98, serviceRelevance: 100,
    competitorFrequency: 40, relationshipAccessibility: 65, editorialRequirements: 45, estimatedEffort: 45, authority: 62,
    metadata: { differentiator: "targeted treatment of affected furniture and items" },
  } },
  { clientId: BBB_BACKLINK_CLIENT_ID, cities: ["Foley"], region: BALDWIN, capability: "link_intersections", evidence: {
    sourceDomain: "baldwinpropertymanagers.org", sourceUrl: "https://baldwinpropertymanagers.org/preferred-vendors/pest-control",
    competitorUrl: "https://competitor.example.com/pest-control", category: "link_intersection", opportunityCategory: "competitor_link_gap",
    serviceId: "residential_pest_control", discoveredAt: BASE_DATE, localRelevance: 95, serviceRelevance: 90, competitorFrequency: 85,
    relationshipAccessibility: 55, editorialRequirements: 50, estimatedEffort: 55, authority: 70, metadata: { association: "property management" },
  } },
  { clientId: BBB_BACKLINK_CLIENT_ID, cities: ["Foley"], region: BALDWIN, capability: "brand_mentions", evidence: {
    sourceDomain: "baldwincountynews.example", sourceUrl: "https://baldwincountynews.example/local-business/bed-bugs-and-beyond",
    category: "brand_mention", opportunityCategory: "unlinked_mention", serviceId: "bed_bug_inspection", discoveredAt: BASE_DATE,
    localRelevance: 100, serviceRelevance: 85, competitorFrequency: 25, relationshipAccessibility: 80, editorialRequirements: 20, estimatedEffort: 15, authority: 58,
    metadata: { mention: "Bed Bugs & Beyond", linked: false },
  } },
  { clientId: BBB_BACKLINK_CLIENT_ID, cities: ["Foley"], region: BALDWIN, capability: "broken_links", evidence: {
    sourceDomain: "baldwinhomeowners.example", sourceUrl: "https://baldwinhomeowners.example/resources/pest-control",
    targetUrl: "https://retired-provider.example/broken-pest-guide", category: "broken_link", opportunityCategory: "broken_link",
    serviceId: "residential_pest_control", discoveredAt: BASE_DATE, localRelevance: 92, serviceRelevance: 90, competitorFrequency: 45,
    relationshipAccessibility: 65, editorialRequirements: 35, estimatedEffort: 40, authority: 55, metadata: { httpStatus: 404 },
  } },
  { clientId: BBB_BACKLINK_CLIENT_ID, cities: ["Gulf Shores", "Orange Beach"], region: BALDWIN, capability: "partnership_organization_discovery", evidence: {
    sourceDomain: "baldwinhospitality.example", sourceUrl: "https://baldwinhospitality.example/sponsors", category: "partnership_organization",
    opportunityCategory: "sponsorship_organization", serviceId: "commercial_pest_control", discoveredAt: BASE_DATE, localRelevance: 96,
    serviceRelevance: 88, competitorFrequency: 50, relationshipAccessibility: 72, editorialRequirements: 30, estimatedEffort: 45, authority: 65,
    metadata: { sector: "hospitality", sponsorship: "local association" },
  } },
  { clientId: BBB_BACKLINK_CLIENT_ID, cities: ["Foley"], region: BALDWIN, capability: "referring_domains", evidence: {
    sourceDomain: "alabamapestmanagement.example", sourceUrl: "https://alabamapestmanagement.example/resources/licensed-providers",
    category: "referring_domain", opportunityCategory: "niche_industry_link", serviceId: "fumigation", discoveredAt: BASE_DATE,
    localRelevance: 75, serviceRelevance: 95, competitorFrequency: 70, relationshipAccessibility: 45, editorialRequirements: 65,
    estimatedEffort: 60, authority: 82, metadata: { industry: "pest management", state: "Alabama" },
  } },
  { clientId: BBB_BACKLINK_CLIENT_ID, cities: ["Foley", "Gulf Shores"], region: BALDWIN, capability: "authority_metrics", evidence: {
    sourceDomain: "baldwincountytoday.com", sourceUrl: "https://baldwincountytoday.com/resources/bed-bug-preparation",
    category: "authority_metric", opportunityCategory: "linkable_asset_content_gap", serviceId: "bed_bug_treatment", discoveredAt: BASE_DATE,
    localRelevance: 95, serviceRelevance: 100, competitorFrequency: 65, relationshipAccessibility: 50, editorialRequirements: 55,
    estimatedEffort: 65, authority: 74, metadata: { missingAsset: "bed bug preparation guide", differentiator: "furniture and item-level treatment" },
  } },
  // Negative fixtures are intentionally present to prove filtering and safety.
  { clientId: BBB_BACKLINK_CLIENT_ID, cities: ["Foley"], region: BALDWIN, capability: "resource_page_discovery", evidence: {
    sourceDomain: "unsafe.example", sourceUrl: "https://unsafe.example/termite-service", category: "resource_page", opportunityCategory: "resource_page",
    serviceId: "termites", discoveredAt: BASE_DATE,
  } },
  { clientId: BBB_BACKLINK_CLIENT_ID, cities: ["Foley"], region: BALDWIN, capability: "resource_page_discovery", evidence: {
    sourceDomain: "unsafe.example", sourceUrl: "https://unsafe.example/whole-home-bed-bug-heat", category: "resource_page", opportunityCategory: "resource_page",
    serviceId: "bed_bug_treatment", discoveredAt: BASE_DATE,
  } },
  { clientId: "client::other", cities: ["Foley"], region: BALDWIN, capability: "brand_mentions", evidence: {
    sourceDomain: "other.example", sourceUrl: "https://other.example/mention", category: "brand_mention", opportunityCategory: "unlinked_mention",
    serviceId: "bed_bug_inspection", discoveredAt: BASE_DATE,
  } },
  { clientId: BBB_BACKLINK_CLIENT_ID, cities: ["Mobile"], region: "Mobile County, Alabama", capability: "citation_directory_discovery", evidence: {
    sourceDomain: "mobile.example", sourceUrl: "https://mobile.example/directory", category: "citation_directory", opportunityCategory: "citation_directory",
    serviceId: "fumigation", discoveredAt: BASE_DATE,
  } },
  { clientId: BBB_BACKLINK_CLIENT_ID, cities: ["Foley"], region: BALDWIN, capability: "resource_page_discovery", evidence: {
    sourceDomain: "malformed", sourceUrl: "://not-a-url", category: "resource_page", opportunityCategory: "resource_page",
    serviceId: "bed_bug_inspection", discoveredAt: BASE_DATE,
  } },
]);
