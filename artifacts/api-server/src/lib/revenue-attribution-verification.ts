export type VerifiedRevenueTransition = {
  status: "won";
  revenue: string;
  serviceType: string | null;
  gorilladeskJobId: string;
  matchedAt: Date;
  matchMethod: "human_verified";
  matchConfidence: 100;
  evidenceSource: "gorilladesk_tenant_snapshot";
  evidenceObservedAt: Date;
  verifiedAt: Date;
  verifiedByUserId: string;
};

export function buildVerifiedRevenueTransition(input: {
  current: { matchedAt: Date | null; serviceType: string | null };
  job: { externalId: string | null; status: string; amountCents: number; serviceType: string | null; completedAt: Date | null };
  actorUserId: string;
  now: Date;
}): { ok: true; updates: VerifiedRevenueTransition } | { ok: false; error: "completed_job_evidence_required" } {
  const { current, job, actorUserId, now } = input;
  if (!job.externalId || job.status !== "completed" || !job.completedAt) {
    return { ok: false, error: "completed_job_evidence_required" };
  }
  return {
    ok: true,
    updates: {
      status: "won",
      revenue: String(job.amountCents / 100),
      serviceType: job.serviceType ?? current.serviceType,
      gorilladeskJobId: job.externalId,
      matchedAt: current.matchedAt ?? now,
      matchMethod: "human_verified",
      matchConfidence: 100,
      evidenceSource: "gorilladesk_tenant_snapshot",
      evidenceObservedAt: job.completedAt,
      verifiedAt: now,
      verifiedByUserId: actorUserId,
    },
  };
}
