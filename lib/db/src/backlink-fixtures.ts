import type { RawBacklinkEvidence } from "./backlink-types";

export const BBB_BACKLINK_CLIENT_ID = "client::bed-bugs-and-beyond";
export const BBB_BACKLINK_ALLOWED_SERVICES = Object.freeze(new Set([
  "bed_bug_inspection", "bed_bug_treatment", "residential_pest_control", "commercial_pest_control",
  "roaches", "rodents", "mosquitoes", "fumigation", "ants", "fleas", "ticks", "wasps_hornets", "spiders", "moles",
]));
export const BBB_BACKLINK_BLOCKED_PHRASES = Object.freeze(["termite-service", "termite-treatment", "whole-home-bed-bug-heat", "bed-bug-heat-treatment"]);

export const BBB_BACKLINK_FIXTURES: readonly RawBacklinkEvidence[] = Object.freeze([
  {
    sourceDomain: "southbaldwinchamber.com", sourceUrl: "https://southbaldwinchamber.com/member-directory/pest-control",
    category: "partnership_organization", opportunityCategory: "local_partnership", serviceId: "commercial_pest_control",
    discoveredAt: "2026-07-10T12:00:00.000Z", localRelevance: 100, serviceRelevance: 85, competitorFrequency: 60,
    relationshipAccessibility: 90, editorialRequirements: 15, estimatedEffort: 25, authority: 68,
    metadata: { county: "Baldwin County", relationship: "chamber membership" },
  },
  {
    sourceDomain: "gulfshores.com", sourceUrl: "https://gulfshores.com/business-resources/vendor-directory",
    category: "citation_directory", opportunityCategory: "citation_directory", serviceId: "fumigation",
    discoveredAt: "2026-07-09T12:00:00.000Z", localRelevance: 95, serviceRelevance: 80, competitorFrequency: 55,
    relationshipAccessibility: 75, editorialRequirements: 20, estimatedEffort: 30, authority: 72,
    metadata: { area: "Gulf Shores, Baldwin County", positioning: "licensed professional fumigation" },
  },
  {
    sourceDomain: "baldwincountytoday.com", sourceUrl: "https://baldwincountytoday.com/resources/bed-bug-help",
    category: "resource_page", opportunityCategory: "resource_page", serviceId: "bed_bug_treatment",
    discoveredAt: "2026-07-08T12:00:00.000Z", localRelevance: 98, serviceRelevance: 100, competitorFrequency: 40,
    relationshipAccessibility: 65, editorialRequirements: 45, estimatedEffort: 45, authority: 62,
    metadata: { differentiator: "targeted treatment of affected furniture and items" },
  },
]);

