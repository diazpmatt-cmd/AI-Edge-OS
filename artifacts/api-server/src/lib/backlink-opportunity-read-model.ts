import {
  db,
  DrizzleBacklinkRepository,
  BACKLINK_MAX_PAGE_SIZE,
} from "@workspace/db";
import {
  rankBacklinkOpportunities,
  selectBacklinkEvidencePreview,
} from "./backlink-opportunity-intelligence.js";

const repo = new DrizzleBacklinkRepository(db);

export interface BacklinkOpportunityReadModel {
  readonly clientId: string;
  readonly scoring: {
    readonly potentialValueWeight: number;
    readonly attainabilityWeight: number;
    readonly terminalWorkflowsExcluded: true;
  };
  readonly summary: {
    readonly totalActionable: number;
    readonly topPriority: number;
    readonly highPriority: number;
    readonly competitorGaps: number;
    readonly easyWins: number;
  };
  readonly items: readonly unknown[];
}

export async function buildBacklinkOpportunityReadModel(
  clientId: string,
  requestedLimit = 20,
): Promise<BacklinkOpportunityReadModel> {
  const normalizedClientId = clientId.trim();
  if (!normalizedClientId) throw new Error("client_id_required");

  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(BACKLINK_MAX_PAGE_SIZE, Math.floor(requestedLimit)))
    : 20;

  const listed = await repo.listOpportunities(normalizedClientId, {
    limit: BACKLINK_MAX_PAGE_SIZE,
    offset: 0,
  });

  const hydrated = await Promise.all(
    listed.items.map(async ({ opportunity, workflow }) => ({
      opportunity,
      workflow,
      prospect: await repo.getProspectById(opportunity.prospectId, normalizedClientId),
    })),
  );

  const ranked = rankBacklinkOpportunities(hydrated, BACKLINK_MAX_PAGE_SIZE);
  const opportunityById = new Map(
    listed.items.map(({ opportunity }) => [opportunity.id, opportunity] as const),
  );
  const selected = ranked.slice(0, limit);
  const competitorProspectIds = [
    ...new Set(
      selected
        .filter((item) => item.reasonCodes.includes("competitor_gap"))
        .map((item) => item.prospectId),
    ),
  ];
  const evidenceByProspect = new Map(
    await Promise.all(
      competitorProspectIds.map(async (prospectId) => [
        prospectId,
        await repo.listEvidenceForProspect(prospectId, normalizedClientId),
      ] as const),
    ),
  );

  const items = selected.map((item) => {
    if (!item.reasonCodes.includes("competitor_gap")) {
      return { ...item, evidencePreview: [] };
    }

    const opportunity = opportunityById.get(item.opportunityId);
    const evidence = evidenceByProspect.get(item.prospectId);
    if (!opportunity || !evidence) {
      return { ...item, evidencePreview: [] };
    }

    return {
      ...item,
      evidencePreview: selectBacklinkEvidencePreview(opportunity, evidence, 3),
    };
  });

  return Object.freeze({
    clientId: normalizedClientId,
    scoring: Object.freeze({
      potentialValueWeight: 0.55,
      attainabilityWeight: 0.45,
      terminalWorkflowsExcluded: true as const,
    }),
    summary: Object.freeze({
      totalActionable: ranked.length,
      topPriority: ranked.filter((item) => item.priorityTier === "top").length,
      highPriority: ranked.filter((item) => item.priorityTier === "high").length,
      competitorGaps: ranked.filter((item) => item.reasonCodes.includes("competitor_gap")).length,
      easyWins: ranked.filter((item) => item.reasonCodes.includes("easy_win")).length,
    }),
    items: Object.freeze(items),
  });
}
