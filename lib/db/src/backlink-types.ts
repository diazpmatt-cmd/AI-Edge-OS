/** Phase C8R-1 provider-agnostic backlink contracts. Pure and serializable. */

export type BacklinkCapability =
  | "referring_domains"
  | "link_intersections"
  | "brand_mentions"
  | "broken_links"
  | "authority_metrics"
  | "resource_page_discovery"
  | "citation_directory_discovery"
  | "partnership_organization_discovery";

export type BacklinkEvidenceCategory =
  | "referring_domain"
  | "link_intersection"
  | "brand_mention"
  | "broken_link"
  | "authority_metric"
  | "resource_page"
  | "citation_directory"
  | "partnership_organization";

export type BacklinkOpportunityCategory =
  | "competitor_link_gap"
  | "citation_directory"
  | "local_partnership"
  | "sponsorship_organization"
  | "niche_industry_link"
  | "guest_post"
  | "resource_page"
  | "broken_link"
  | "unlinked_mention"
  | "linkable_asset_content_gap";

export type BacklinkProviderMetadataValue = string | number | boolean | null;
export type BacklinkProviderMetadata = Readonly<Record<string, BacklinkProviderMetadataValue>>;

export interface RawBacklinkEvidence {
  sourceDomain: string;
  sourceUrl: string;
  targetUrl?: string | null;
  competitorUrl?: string | null;
  category: BacklinkEvidenceCategory;
  opportunityCategory: BacklinkOpportunityCategory;
  serviceId?: string | null;
  discoveredAt: Date | string;
  localRelevance?: number | null;
  serviceRelevance?: number | null;
  competitorFrequency?: number | null;
  relationshipAccessibility?: number | null;
  editorialRequirements?: number | null;
  estimatedEffort?: number | null;
  authority?: number | null;
  metadata?: Record<string, unknown>;
}

export interface CanonicalBacklinkEvidence {
  id: string;
  clientId: string;
  sourceDomain: string;
  sourceUrl: string;
  targetUrl: string | null;
  competitorUrl: string | null;
  category: BacklinkEvidenceCategory;
  opportunityCategory: BacklinkOpportunityCategory;
  serviceId: string | null;
  providers: readonly string[];
  discoveredAt: string;
  freshnessDays: number;
  localRelevance: number;
  serviceRelevance: number;
  competitorFrequency: number;
  relationshipAccessibility: number;
  editorialRequirements: number;
  estimatedEffort: number;
  authority: number;
  providerMetadata: Readonly<Record<string, BacklinkProviderMetadata>>;
}

export interface BacklinkScore {
  potentialValue: number;
  attainability: number;
  potentialComponents: Readonly<Record<"authority" | "localRelevance" | "serviceRelevance" | "competitorFrequency", number>>;
  attainabilityComponents: Readonly<Record<"localRelevance" | "serviceRelevance" | "competitorFrequency" | "relationshipAccessibility" | "editorialEase" | "effortEase" | "freshness", number>>;
}

