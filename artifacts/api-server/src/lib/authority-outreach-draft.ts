import type { BacklinkOpportunityCategory } from "@workspace/db";
import type { BacklinkEvidencePreview } from "./backlink-opportunity-intelligence.js";

export type AuthorityOutreachDraftType =
  | "backlink_request"
  | "local_partnership"
  | "sponsorship"
  | "citation_request"
  | "guest_post_pitch";

export interface AuthorityOutreachDraftInput {
  opportunityId: string;
  category: BacklinkOpportunityCategory;
  recommendedAction: string;
  clientName: string;
  industryLabel: string;
  region: string;
  serviceId: string | null;
  serviceName: string | null;
  evidence: readonly BacklinkEvidencePreview[];
}

export interface AuthorityOutreachDraft {
  draftType: AuthorityOutreachDraftType;
  subject: string;
  body: string;
  generatedBy: "deterministic_template_v1";
  externalActionAllowed: false;
  provenance: {
    opportunityId: string;
    category: BacklinkOpportunityCategory;
    recommendedAction: string;
    client: {
      name: string;
      industryLabel: string;
      region: string;
    };
    service: {
      id: string;
      name: string;
    } | null;
    evidence: Array<{
      id: string;
      sourceDomain: string;
      sourceUrl: string;
      competitorUrl: string | null;
      targetUrl: string | null;
    }>;
  };
}

export function classifyAuthorityOutreachDraftType(
  category: BacklinkOpportunityCategory,
): AuthorityOutreachDraftType {
  switch (category) {
    case "local_partnership":
      return "local_partnership";
    case "sponsorship_organization":
      return "sponsorship";
    case "citation_directory":
      return "citation_request";
    case "guest_post":
    case "linkable_asset_content_gap":
      return "guest_post_pitch";
    case "competitor_link_gap":
    case "niche_industry_link":
    case "resource_page":
    case "broken_link":
    case "unlinked_mention":
      return "backlink_request";
  }
}

function servicePhrase(serviceName: string | null): string {
  return serviceName ? `, with services including ${serviceName}` : "";
}

function buildSubject(
  type: AuthorityOutreachDraftType,
  clientName: string,
  sourceDomain: string,
): string {
  switch (type) {
    case "local_partnership":
      return `Local partnership idea with ${clientName}`;
    case "sponsorship":
      return `Community sponsorship conversation with ${clientName}`;
    case "citation_request":
      return `${clientName} listing review for ${sourceDomain}`;
    case "guest_post_pitch":
      return `Content contribution idea from ${clientName}`;
    case "backlink_request":
      return `Resource suggestion from ${clientName}`;
  }
}

function buildAsk(
  type: AuthorityOutreachDraftType,
  clientName: string,
  serviceName: string | null,
  competitorUrl: string | null,
): string {
  const resource = serviceName
    ? `${clientName} as a ${serviceName} resource`
    : `${clientName} as a local industry resource`;

  switch (type) {
    case "local_partnership":
      return `Would you be open to exploring a useful local partnership with ${clientName} where it genuinely benefits the people we both serve?`;
    case "sponsorship":
      return `Would you be open to a conversation about whether ${clientName} could be a relevant local sponsor or community partner?`;
    case "citation_request":
      return `Would you be open to reviewing ${clientName} for an appropriate business listing or resource mention on your site?`;
    case "guest_post_pitch":
      return `Would you be open to reviewing a practical, non-promotional content contribution from ${clientName} for your audience?`;
    case "backlink_request":
      return competitorUrl
        ? `We noticed the referenced page already includes another provider in this space. Would you be open to reviewing ${resource} for possible inclusion where it would genuinely help your readers?`
        : `Would you be open to reviewing ${resource} for possible inclusion where it would genuinely help your readers?`;
  }
}

export function buildAuthorityOutreachDraft(
  input: AuthorityOutreachDraftInput,
): AuthorityOutreachDraft {
  const primaryEvidence = input.evidence[0];
  if (!primaryEvidence) {
    throw new Error("authority_outreach_evidence_required");
  }

  const draftType = classifyAuthorityOutreachDraftType(input.category);
  const subject = buildSubject(draftType, input.clientName, primaryEvidence.sourceDomain);
  const contextLine = `I’m reaching out on behalf of ${input.clientName}, a ${input.industryLabel} business serving ${input.region}${servicePhrase(input.serviceName)}.`;
  const evidenceLine = `While reviewing ${primaryEvidence.sourceDomain}, we came across ${primaryEvidence.sourceUrl}.`;
  const ask = buildAsk(
    draftType,
    input.clientName,
    input.serviceName,
    primaryEvidence.competitorUrl,
  );

  const body = [
    "Hello,",
    "",
    contextLine,
    "",
    evidenceLine,
    ask,
    "",
    "Thanks for considering it,",
    input.clientName,
  ].join("\n");

  return Object.freeze({
    draftType,
    subject,
    body,
    generatedBy: "deterministic_template_v1" as const,
    externalActionAllowed: false as const,
    provenance: Object.freeze({
      opportunityId: input.opportunityId,
      category: input.category,
      recommendedAction: input.recommendedAction,
      client: Object.freeze({
        name: input.clientName,
        industryLabel: input.industryLabel,
        region: input.region,
      }),
      service: input.serviceId && input.serviceName
        ? Object.freeze({ id: input.serviceId, name: input.serviceName })
        : null,
      evidence: input.evidence.map((record) => Object.freeze({
        id: record.id,
        sourceDomain: record.sourceDomain,
        sourceUrl: record.sourceUrl,
        competitorUrl: record.competitorUrl,
        targetUrl: record.targetUrl,
      })),
    }),
  });
}
