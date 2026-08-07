import { describe, expect, it } from "vitest";
import type { BacklinkOpportunityCategory } from "@workspace/db";
import type { BacklinkEvidencePreview } from "./backlink-opportunity-intelligence.js";
import {
  buildAuthorityOutreachDraft,
  classifyAuthorityOutreachDraftType,
} from "./authority-outreach-draft.js";

const evidence = (overrides: Partial<BacklinkEvidencePreview> = {}): BacklinkEvidencePreview => ({
  id: "evidence-1",
  sourceDomain: "publisher.example",
  sourceUrl: "https://publisher.example/resources/local-services",
  competitorUrl: "https://competitor.example/service",
  targetUrl: null,
  authority: 82,
  competitorFrequency: 70,
  relationshipAccessibility: 75,
  estimatedEffort: 30,
  discoveredAt: "2026-08-07T00:00:00.000Z",
  providers: ["fixture_backlinks"],
  ...overrides,
});

const categories: Array<[BacklinkOpportunityCategory, string]> = [
  ["competitor_link_gap", "backlink_request"],
  ["citation_directory", "citation_request"],
  ["local_partnership", "local_partnership"],
  ["sponsorship_organization", "sponsorship"],
  ["niche_industry_link", "backlink_request"],
  ["guest_post", "guest_post_pitch"],
  ["resource_page", "backlink_request"],
  ["broken_link", "backlink_request"],
  ["unlinked_mention", "backlink_request"],
  ["linkable_asset_content_gap", "guest_post_pitch"],
];

describe("Authority outreach draft foundation", () => {
  it.each(categories)("maps %s to %s", (category, expected) => {
    expect(classifyAuthorityOutreachDraftType(category)).toBe(expected);
  });

  it("requires persisted evidence before producing a draft", () => {
    expect(() => buildAuthorityOutreachDraft({
      opportunityId: "op-1",
      category: "competitor_link_gap",
      recommendedAction: "Review the source.",
      clientName: "Example Services",
      industryLabel: "home services",
      region: "Example County",
      serviceId: null,
      serviceName: null,
      evidence: [],
    })).toThrow("authority_outreach_evidence_required");
  });

  it("builds a deterministic competitor-gap draft from tenant context and evidence", () => {
    const draft = buildAuthorityOutreachDraft({
      opportunityId: "op-1",
      category: "competitor_link_gap",
      recommendedAction: "Ask the publisher to review our resource.",
      clientName: "Example Services",
      industryLabel: "home services",
      region: "Example County",
      serviceId: "service-1",
      serviceName: "Emergency Plumbing",
      evidence: [evidence()],
    });

    expect(draft.generatedBy).toBe("deterministic_template_v1");
    expect(draft.externalActionAllowed).toBe(false);
    expect(draft.subject).toBe("Resource suggestion from Example Services");
    expect(draft.body).toContain("Example Services");
    expect(draft.body).toContain("home services");
    expect(draft.body).toContain("Example County");
    expect(draft.body).toContain("publisher.example");
    expect(draft.body).toContain("Emergency Plumbing");
    expect(draft.body).toContain("another provider in this space");
    expect(draft.provenance.evidence[0]).toEqual({
      id: "evidence-1",
      sourceDomain: "publisher.example",
      sourceUrl: "https://publisher.example/resources/local-services",
      competitorUrl: "https://competitor.example/service",
      targetUrl: null,
    });
    expect(draft.provenance.service).toEqual({ id: "service-1", name: "Emergency Plumbing" });
  });

  it("does not invent competitor placement language when no competitor URL exists", () => {
    const draft = buildAuthorityOutreachDraft({
      opportunityId: "op-2",
      category: "resource_page",
      recommendedAction: "Suggest the resource.",
      clientName: "Example Services",
      industryLabel: "home services",
      region: "Example County",
      serviceId: null,
      serviceName: null,
      evidence: [evidence({ competitorUrl: null })],
    });

    expect(draft.body).not.toContain("another provider in this space");
    expect(draft.body).toContain("local industry resource");
  });

  it("keeps unsafe BB&B claims absent when they are not present in canonical inputs", () => {
    const draft = buildAuthorityOutreachDraft({
      opportunityId: "op-bbb",
      category: "local_partnership",
      recommendedAction: "Explore a local partnership.",
      clientName: "Bed Bugs & Beyond",
      industryLabel: "pest control",
      region: "Gulf Coast of Alabama (Baldwin County)",
      serviceId: "bed_bug_treatment",
      serviceName: "Bed Bug Treatment",
      evidence: [evidence({ competitorUrl: null })],
    });

    const text = `${draft.subject}\n${draft.body}`.toLowerCase();
    expect(text).not.toContain("heat treatment");
    expect(text).not.toContain("termite");
    expect(text).not.toContain("guaranteed elimination");
  });
});
