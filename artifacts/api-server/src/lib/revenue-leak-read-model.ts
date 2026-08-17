import type { Lead, RevenueAttribution } from "@workspace/db";
import { needsFollowUp } from "../services/lead-delivery.js";

export type RevenueLeakKind = "follow_up_due" | "attribution_unresolved";
export type RevenueLeakClass = "revenue_risk" | "proof_gap";

export type RevenueLeakItem = {
  id: string;
  kind: RevenueLeakKind;
  classification: RevenueLeakClass;
  priority: "high" | "medium";
  title: string;
  observedAt: string;
  leadId: string | null;
  source: string | null;
  customerName: string | null;
  verifiedRevenue: number | null;
  evidence: Record<string, string | number | boolean | null>;
  recommendedAction: string;
};

export type RevenueLeakReadModel = {
  generatedAt: string;
  summary: {
    total: number;
    revenueRisks: number;
    proofGaps: number;
    verifiedRevenueAtIssue: number;
  };
  items: RevenueLeakItem[];
};

function asMoney(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildRevenueLeakReadModel(
  leads: readonly Lead[],
  attributions: readonly RevenueAttribution[],
  now: Date = new Date(),
): RevenueLeakReadModel {
  const items: RevenueLeakItem[] = [];

  for (const lead of leads) {
    if (!needsFollowUp(lead, now)) continue;
    items.push({
      id: `follow_up_due:${lead.id}`,
      kind: "follow_up_due",
      classification: "revenue_risk",
      priority: "high",
      title: "Lead follow-up is due",
      observedAt: (lead.lastFollowUpAt ?? lead.updatedAt).toISOString(),
      leadId: lead.id,
      source: lead.source,
      customerName: lead.customerName,
      verifiedRevenue: null,
      evidence: {
        status: lead.status,
        responseStatus: lead.responseStatus,
        lastFollowUpAt: lead.lastFollowUpAt?.toISOString() ?? null,
        outcome: lead.outcome,
      },
      recommendedAction: "Review the lead and complete the next approved follow-up action.",
    });
  }

  for (const attribution of attributions) {
    if (!new Set(["pending", "unmatched"]).has(attribution.status)) continue;
    const verifiedRevenue = asMoney(attribution.revenue);
    items.push({
      id: `attribution_unresolved:${attribution.id}`,
      kind: "attribution_unresolved",
      classification: "proof_gap",
      priority: "medium",
      title: "Revenue attribution is unresolved",
      observedAt: attribution.updatedAt.toISOString(),
      leadId: attribution.leadId,
      source: attribution.leadSource,
      customerName: attribution.customerName,
      verifiedRevenue,
      evidence: {
        attributionStatus: attribution.status,
        matchedAt: attribution.matchedAt?.toISOString() ?? null,
        gorilladeskJobId: attribution.gorilladeskJobId,
        hasVerifiedRevenue: verifiedRevenue != null,
      },
      recommendedAction: "Reconcile this attribution record against tenant-scoped job evidence before reporting ROI.",
    });
  }

  items.sort((a, b) => {
    const priority = { high: 0, medium: 1 } as const;
    return priority[a.priority] - priority[b.priority] || a.observedAt.localeCompare(b.observedAt);
  });

  return {
    generatedAt: now.toISOString(),
    summary: {
      total: items.length,
      revenueRisks: items.filter(item => item.classification === "revenue_risk").length,
      proofGaps: items.filter(item => item.classification === "proof_gap").length,
      verifiedRevenueAtIssue: items.reduce((sum, item) => sum + (item.verifiedRevenue ?? 0), 0),
    },
    items,
  };
}
