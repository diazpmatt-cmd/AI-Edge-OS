import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BACKLINK_INGESTION_FAILURE_CODES, BACKLINK_INGESTION_FAILURE_STAGES, BACKLINK_REPLAY_ID_LIMIT, BacklinkIngestionPersistenceError,
  assertBacklinkIngestionRunTransition, canTransitionBacklinkIngestionRun, deriveBacklinkIngestionFingerprint,
  deriveBacklinkIngestionRunId, isTerminalBacklinkIngestionRun, validateBacklinkPersistencePlan, validateStoredBacklinkReplaySummary,
} from "../../../../../lib/db/src/backlink-ingestion-run";
import { FixtureBacklinkDataProvider } from "../../../../../lib/db/src/backlink-fixture-provider";
import { BBB_FIXTURE_BACKLINK_OBSERVATIONS, type FixtureBacklinkObservation } from "../../../../../lib/db/src/backlink-provider-fixtures";
import { BBB_BACKLINK_ALLOWED_SERVICES, BBB_BACKLINK_BLOCKED_PHRASES, BBB_BACKLINK_CLIENT_ID } from "../../../../../lib/db/src/backlink-fixtures";
import { ingestFixtureBacklinks } from "../../../../../lib/db/src/backlink-ingestion";
import { DrizzleBacklinkRepository, InMemoryBacklinkRepository, deriveBacklinkOpportunityId, deriveBacklinkProspectId,
  deriveBacklinkWorkflowEventId, deriveBacklinkWorkflowId } from "../../../../../lib/db/src/backlink-repository";
import { normalizeBacklinkEvidence } from "../../../../../lib/db/src/backlink-normalizer";
import { scoreBacklinkEvidence } from "../../../../../lib/db/src/backlink-scorer";
import type { BacklinkDataProvider, BacklinkDiscoveryInput } from "../../../../../lib/db/src/backlink-providers";
import type { RawBacklinkEvidence } from "../../../../../lib/db/src/backlink-types";
import type { BacklinkIngestionPersistencePlan } from "../../../../../lib/db/src/backlink-persistence-types";

const NOW = new Date("2026-07-12T12:00:00.000Z");
const LATER = new Date("2026-07-13T12:00:00.000Z");
const services = [...BBB_BACKLINK_ALLOWED_SERVICES, "termites"];
const discovery: BacklinkDiscoveryInput = { clientId: BBB_BACKLINK_CLIENT_ID, clientDomain: "bedbugsbeyond.com",
  competitorDomains: ["competitor.example.com"], serviceIds: services, city: "Foley", region: "Baldwin County, Alabama", limit: 100 };
const policy = { allowedServiceIds: BBB_BACKLINK_ALLOWED_SERVICES, blockedPhrases: BBB_BACKLINK_BLOCKED_PHRASES, now: NOW };
const providerRevision = "bbb-fixtures-v1";
const fingerprintInput = { trustedClientId: BBB_BACKLINK_CLIENT_ID, providerId: "fixture_backlink", providerRevision, mode: "manual" as const,
  capabilities: [...new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS).capabilities].sort(),
  clientDomain: discovery.clientDomain, competitorDomains: discovery.competitorDomains, serviceIds: discovery.serviceIds,
  city: discovery.city, region: discovery.region, limit: discovery.limit, allowedServiceIds: policy.allowedServiceIds, blockedPhrases: policy.blockedPhrases };
const fingerprint = () => deriveBacklinkIngestionFingerprint(fingerprintInput);
const runId = () => deriveBacklinkIngestionRunId(fingerprint());

class CountingProvider implements BacklinkDataProvider {
  readonly name: string; readonly capabilities; calls = 0;
  constructor(private readonly delegate: FixtureBacklinkDataProvider, private readonly gate?: Promise<void>) {
    this.name = delegate.name; this.capabilities = delegate.capabilities;
  }
  async discover(input: BacklinkDiscoveryInput): Promise<RawBacklinkEvidence[]> { this.calls++; await this.gate; return this.delegate.discover(input); }
}

class FailOnceRepository extends InMemoryBacklinkRepository {
  constructor(private stage: string | null) { super(); }
  protected override failTransactionalStage(stage: string): void {
    if (this.stage === stage) { this.stage = null; throw new BacklinkIngestionPersistenceError(stage as never); }
  }
  stateCounts() { return { prospects: this.prospects.size, evidence: this.evidence.size, opportunities: this.opportunities.size,
    workflows: this.workflows.size, events: this.events.size }; }
}

const ingest = (repository: InMemoryBacklinkRepository, provider: BacklinkDataProvider = new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS), now = NOW) =>
  ingestFixtureBacklinks({ trustedClientId: BBB_BACKLINK_CLIENT_ID, provider, providerRevision, discovery, normalizationPolicy: { ...policy, now }, repository, now });

function minimalPlan(clientId = BBB_BACKLINK_CLIENT_ID): BacklinkIngestionPersistencePlan {
  const evidence = normalizeBacklinkEvidence(BBB_FIXTURE_BACKLINK_OBSERVATIONS[0].evidence, "fixture_backlink", clientId, policy)!;
  const pageUrl = evidence.sourceUrl; const prospectId = deriveBacklinkProspectId(clientId, evidence.sourceDomain, pageUrl);
  const prospect = { id: prospectId, clientId, prospectType: "partnership" as const, domain: evidence.sourceDomain, pageUrl, displayName: null, createdAt: NOW, updatedAt: NOW };
  const scores = scoreBacklinkEvidence(evidence); const opportunityId = deriveBacklinkOpportunityId(clientId, prospectId, evidence.opportunityCategory, evidence.serviceId);
  const opportunity = { id: opportunityId, clientId, prospectId, category: evidence.opportunityCategory, serviceId: evidence.serviceId,
    potentialValue: scores.potentialValue, attainability: scores.attainability, rationale: "Bounded rationale", recommendedAction: "Bounded action",
    evidenceIds: [evidence.id], createdAt: NOW, updatedAt: NOW };
  const workflowId = deriveBacklinkWorkflowId(clientId, opportunityId);
  const workflow = { id: workflowId, clientId, opportunityId, status: "discovered" as const, ownerId: null, nextAction: null, dueAt: null,
    outcomeSummary: null, version: 1, createdAt: NOW, updatedAt: NOW, completedAt: null };
  const event = { id: deriveBacklinkWorkflowEventId(workflowId, 1), clientId, workflowId, opportunityId, sequence: 1, fromStatus: null,
    toStatus: "discovered" as const, actorId: null, reason: "workflow_created", createdAt: NOW };
  return { prospects: [prospect], evidence: [{ prospectId, evidence }], opportunities: [opportunity], workflows: [workflow], initialEvents: [event],
    summary: { observed: 1, accepted: 1, rejected: 0, mergedEvidence: 1, prospectCount: 1, evidenceCount: 1, opportunityCount: 1, workflowCount: 1,
      prospectIds: [prospectId], evidenceIds: [evidence.id], opportunityIds: [opportunityId], workflowIds: [workflowId] } };
}

const claimInput = (clientId = BBB_BACKLINK_CLIENT_ID, now = NOW) => {
  const material = { ...fingerprintInput, trustedClientId: clientId }; const inputFingerprint = deriveBacklinkIngestionFingerprint(material);
  return { id: deriveBacklinkIngestionRunId(inputFingerprint), clientId, providerId: "fixture_backlink", providerRevision, mode: "manual" as const,
    capabilities: fingerprintInput.capabilities, inputFingerprint, now };
};

describe("C8R-4 deterministic run identity and lifecycle", () => {
  it("derives stable fingerprints and IDs independent of input ordering", () => {
    const a = fingerprint();
    const b = deriveBacklinkIngestionFingerprint({ ...fingerprintInput, capabilities: [...fingerprintInput.capabilities].reverse(),
      competitorDomains: [...fingerprintInput.competitorDomains].reverse(), serviceIds: [...fingerprintInput.serviceIds].reverse(),
      allowedServiceIds: new Set([...fingerprintInput.allowedServiceIds].reverse()), blockedPhrases: [...fingerprintInput.blockedPhrases].reverse() });
    expect(b).toBe(a); expect(deriveBacklinkIngestionRunId(a)).toMatch(/^blrun::[0-9a-f]{32}$/);
  });

  it("excludes time, correlation, metadata, credentials, and raw observations", () => {
    const extended = { ...fingerprintInput, now: LATER, correlationId: "different", metadata: { apiKey: "not-stored" }, raw: [{ secret: "none" }] };
    expect(deriveBacklinkIngestionFingerprint(extended)).toBe(fingerprint());
  });

  it("isolates tenants and provider revisions", () => {
    expect(deriveBacklinkIngestionFingerprint({ ...fingerprintInput, trustedClientId: "client::other" })).not.toBe(fingerprint());
    expect(deriveBacklinkIngestionFingerprint({ ...fingerprintInput, providerRevision: "bbb-fixtures-v2" })).not.toBe(fingerprint());
  });

  it("permits only running terminalization and failed retry", () => {
    expect(canTransitionBacklinkIngestionRun("running", "succeeded")).toBe(true);
    expect(canTransitionBacklinkIngestionRun("running", "failed")).toBe(true);
    expect(canTransitionBacklinkIngestionRun("failed", "running")).toBe(true);
    expect(isTerminalBacklinkIngestionRun("succeeded")).toBe(true);
    expect(() => assertBacklinkIngestionRunTransition("succeeded", "running")).toThrow("invalid");
    expect(() => assertBacklinkIngestionRunTransition("running", "running")).toThrow("invalid");
  });

  it("uses only bounded failure classifications", () => {
    expect(BACKLINK_INGESTION_FAILURE_STAGES).toEqual(["provider", "preparation", "prospect", "evidence", "opportunity", "workflow", "initial_event", "finalization"]);
    expect(BACKLINK_INGESTION_FAILURE_CODES).toEqual(["provider_failed", "validation_failed", "persistence_failed", "finalization_failed"]);
  });
});

describe("C8R-4 claims, replay, retry, and tenant isolation", () => {
  it("claims once and returns in-progress to a concurrent duplicate", async () => {
    const repository = new InMemoryBacklinkRepository();
    const claim = { id: runId(), clientId: BBB_BACKLINK_CLIENT_ID, providerId: "fixture_backlink", providerRevision, mode: "manual" as const,
      capabilities: fingerprintInput.capabilities, inputFingerprint: fingerprint(), now: NOW };
    expect((await repository.claimIngestionRun(claim)).outcome).toBe("started");
    expect((await repository.claimIngestionRun(claim)).outcome).toBe("in_progress");
  });

  it("replays success without invoking the provider again", async () => {
    const repository = new InMemoryBacklinkRepository(); const provider = new CountingProvider(new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS));
    const first = await ingest(repository, provider); const second = await ingest(repository, provider, LATER);
    expect(second).toEqual(first); expect(provider.calls).toBe(1);
  });

  it("allows only one failed-run reclaimer and preserves first started time", async () => {
    const repository = new FailOnceRepository("prospect"); await expect(ingest(repository)).rejects.toThrow("prospect");
    const failed = (await repository.getIngestionRun(runId(), BBB_BACKLINK_CLIENT_ID))!;
    const claim = { id: runId(), clientId: BBB_BACKLINK_CLIENT_ID, providerId: "fixture_backlink", providerRevision, mode: "manual" as const,
      capabilities: fingerprintInput.capabilities, inputFingerprint: fingerprint(), now: LATER };
    const [a, b] = await Promise.all([repository.claimIngestionRun(claim), repository.claimIngestionRun(claim)]);
    expect([a.outcome, b.outcome].sort()).toEqual(["in_progress", "reclaimed"]);
    const current = (await repository.getIngestionRun(runId(), BBB_BACKLINK_CLIENT_ID))!;
    expect(current.attemptCount).toBe(2); expect(current.startedAt).toEqual(failed.startedAt); expect(current.attemptStartedAt).toEqual(LATER);
  });

  it("denies tenant-scoped run reads and isolates equivalent identities", async () => {
    const repository = new InMemoryBacklinkRepository(); await ingest(repository);
    expect(await repository.getIngestionRun(runId(), "client::other")).toBeNull();
    const otherFingerprint = deriveBacklinkIngestionFingerprint({ ...fingerprintInput, trustedClientId: "client::other" });
    const other = await repository.claimIngestionRun({ id: deriveBacklinkIngestionRunId(otherFingerprint), clientId: "client::other", providerId: "fixture_backlink",
      providerRevision, mode: "manual", capabilities: fingerprintInput.capabilities, inputFingerprint: otherFingerprint, now: NOW });
    expect(other.outcome).toBe("started"); expect(other.run.id).not.toBe(runId());
  });

  it("permits only one provider execution for concurrent identical ingestion", async () => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const repository = new InMemoryBacklinkRepository(); const provider = new CountingProvider(new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS), gate);
    const first = ingest(repository, provider); await Promise.resolve();
    const second = await ingest(repository, provider); expect(second).toMatchObject({ outcome: "in_progress", runId: runId() });
    release(); await first; expect(provider.calls).toBe(1);
  });
});

describe("C8R-4 full-run rollback and retry", () => {
  it.each(["prospect", "evidence", "opportunity", "workflow", "initial_event", "finalization"])("rolls back %s failure and retry converges", async stage => {
    const repository = new FailOnceRepository(stage);
    await expect(ingest(repository)).rejects.toThrow(stage);
    expect(repository.stateCounts()).toEqual({ prospects: 0, evidence: 0, opportunities: 0, workflows: 0, events: 0 });
    const failed = (await repository.getIngestionRun(runId(), BBB_BACKLINK_CLIENT_ID))!;
    expect(failed).toMatchObject({ status: "failed", failureStage: stage,
      failureCode: stage === "finalization" ? "finalization_failed" : "persistence_failed" });
    expect(failed.counts.prospectCount).toBeNull(); expect(failed.resultSummary).toBeNull();
    const result = await ingest(repository, undefined, LATER); expect("outcome" in result).toBe(false);
    const succeeded = (await repository.getIngestionRun(runId(), BBB_BACKLINK_CLIENT_ID))!;
    expect(succeeded.status).toBe("succeeded"); expect(succeeded.attemptCount).toBe(2); expect(succeeded.startedAt).toEqual(NOW);
    if ("opportunityIds" in result) for (const id of result.opportunityIds) expect(await repository.listWorkflowEvents(id, BBB_BACKLINK_CLIENT_ID)).toHaveLength(1);
  });

  it("records provider failure without canonical persistence", async () => {
    const provider: BacklinkDataProvider = { name: "fixture_backlink", capabilities: new Set(), discover: async () => { throw new Error("raw secret must not persist"); } };
    const repository = new InMemoryBacklinkRepository(); await expect(ingest(repository, provider)).rejects.toThrow("provider");
    expect((await repository.listOpportunities(BBB_BACKLINK_CLIENT_ID)).items).toHaveLength(0);
    const providerFingerprint = deriveBacklinkIngestionFingerprint({ ...fingerprintInput, capabilities: [] });
    const run = await repository.getIngestionRun(deriveBacklinkIngestionRunId(providerFingerprint), BBB_BACKLINK_CLIENT_ID);
    expect(run).toMatchObject({ status: "failed", failureStage: "provider", failureCode: "provider_failed" });
    expect(JSON.stringify(run)).not.toContain("raw secret");
  });
});

describe("C8R-4 adversarial plan and replay validation", () => {
  it.each([
    ["prospect", (plan: BacklinkIngestionPersistencePlan) => { (plan.prospects[0] as { clientId: string }).clientId = "client::other"; }],
    ["evidence", (plan: BacklinkIngestionPersistencePlan) => { (plan.evidence[0].evidence as { clientId: string }).clientId = "client::other"; }],
    ["opportunity", (plan: BacklinkIngestionPersistencePlan) => { (plan.opportunities[0] as { clientId: string }).clientId = "client::other"; }],
    ["workflow", (plan: BacklinkIngestionPersistencePlan) => { (plan.workflows[0] as { clientId: string }).clientId = "client::other"; }],
    ["event", (plan: BacklinkIngestionPersistencePlan) => { (plan.initialEvents[0] as { clientId: string }).clientId = "client::other"; }],
  ] as const)("rejects cross-tenant %s before persistence", async (_label, mutate) => {
    const repository = new FailOnceRepository(null); const claim = claimInput(); await repository.claimIngestionRun(claim);
    const plan = structuredClone(minimalPlan()); mutate(plan);
    await expect(repository.commitIngestionRun({ runId: claim.id, clientId: claim.clientId, plan, completedAt: NOW })).rejects.toThrow(/cross-tenant|invalid/);
    expect(repository.stateCounts()).toEqual({ prospects: 0, evidence: 0, opportunities: 0, workflows: 0, events: 0 });
  });

  it("rejects mismatched event and workflow opportunity associations", () => {
    const plan = structuredClone(minimalPlan()); (plan.initialEvents[0] as { opportunityId: string }).opportunityId = "blop::ffffffff";
    expect(() => validateBacklinkPersistencePlan(runId(), BBB_BACKLINK_CLIENT_ID, plan)).toThrow("workflow event");
  });

  it("constructs an exact-key replay summary with plan-owned tenant-safe IDs", () => {
    const summary = validateBacklinkPersistencePlan(runId(), BBB_BACKLINK_CLIENT_ID, minimalPlan());
    expect(Object.keys(summary).sort()).toEqual(["accepted","evidenceCount","evidenceIds","mergedEvidence","observed","opportunityCount","opportunityIds",
      "prospectCount","prospectIds","rejected","workflowCount","workflowIds"].sort());
    expect(JSON.stringify(summary)).not.toContain(BBB_BACKLINK_CLIENT_ID); expect(JSON.stringify(summary)).not.toContain("fixture_backlink");
  });

  it("rejects unknown summary keys, count mismatch, and nonmember IDs", () => {
    const extra = structuredClone(minimalPlan()); (extra.summary as unknown as Record<string, unknown>).metadata = { unsafe: true };
    expect(() => validateBacklinkPersistencePlan(runId(), BBB_BACKLINK_CLIENT_ID, extra)).toThrow("unknown or missing");
    const mismatch = structuredClone(minimalPlan()); mismatch.summary.prospectCount = 2;
    expect(() => validateBacklinkPersistencePlan(runId(), BBB_BACKLINK_CLIENT_ID, mismatch)).toThrow("counts");
    const member = structuredClone(minimalPlan()); (member.summary as { prospectIds: string[] }).prospectIds = ["blpr::ffffffff"];
    expect(() => validateBacklinkPersistencePlan(runId(), BBB_BACKLINK_CLIENT_ID, member)).toThrow("do not match plan");
  });

  it("requires sorted unique bounded canonical identifier arrays", () => {
    const plan = minimalPlan(); const duplicate = { ...plan.summary, prospectCount: 2, prospectIds: [plan.summary.prospectIds[0], plan.summary.prospectIds[0]] };
    expect(() => validateStoredBacklinkReplaySummary(duplicate)).toThrow("sorted and unique");
    const tooMany = Array.from({ length: BACKLINK_REPLAY_ID_LIMIT + 1 }, (_, index) => `blpr::${index.toString(16).padStart(8, "0")}`);
    expect(() => validateStoredBacklinkReplaySummary({ ...plan.summary, prospectCount: tooMany.length, prospectIds: tooMany })).toThrow("bounded");
  });

  it("rejects malformed stored replay summaries", () => {
    expect(() => validateStoredBacklinkReplaySummary({ observed: 1 })).toThrow("unknown or missing");
    expect(() => validateStoredBacklinkReplaySummary({ ...minimalPlan().summary, evidenceIds: ["wrong::id"] })).toThrow("canonical");
  });
});

describe("C8R-4 claim bounds and timestamp safety", () => {
  it("rejects invalid, duplicate, or unsorted capabilities", async () => {
    const repo = new InMemoryBacklinkRepository(); const base = claimInput();
    await expect(repo.claimIngestionRun({ ...base, capabilities: ["not_real"] })).rejects.toThrow("capabilities");
    await expect(repo.claimIngestionRun({ ...base, capabilities: [base.capabilities[0], base.capabilities[0]] })).rejects.toThrow("sorted and unique");
    await expect(repo.claimIngestionRun({ ...base, capabilities: [...base.capabilities].reverse() })).rejects.toThrow("sorted and unique");
  });

  it("rejects provider bounds, malformed fingerprints, run IDs, and invalid dates", async () => {
    const repo = new InMemoryBacklinkRepository(); const base = claimInput();
    await expect(repo.claimIngestionRun({ ...base, providerId: "X" })).rejects.toThrow("providerId");
    await expect(repo.claimIngestionRun({ ...base, providerRevision: "x".repeat(101) })).rejects.toThrow("providerRevision");
    await expect(repo.claimIngestionRun({ ...base, inputFingerprint: "bad" })).rejects.toThrow("fingerprint");
    await expect(repo.claimIngestionRun({ ...base, id: "blrun::bad" })).rejects.toThrow("run ID");
    await expect(repo.claimIngestionRun({ ...base, now: new Date("invalid") })).rejects.toThrow("valid date");
  });

  it("rejects attempt and completion timestamps before their required predecessors", async () => {
    const repo = new InMemoryBacklinkRepository(); const claim = claimInput(); await repo.claimIngestionRun(claim);
    await repo.failIngestionRun({ runId: claim.id, clientId: claim.clientId, stage: "provider", code: "provider_failed",
      counts: { observed: 0, accepted: 0, rejected: 0, mergedEvidence: 0, prospectCount: null, evidenceCount: null, opportunityCount: null, workflowCount: null }, failedAt: NOW });
    await expect(repo.claimIngestionRun({ ...claim, now: new Date(NOW.getTime() - 1) })).rejects.toThrow("attemptStartedAt");
    const retry = await repo.claimIngestionRun({ ...claim, now: LATER }); expect(retry.outcome).toBe("reclaimed");
    await expect(repo.commitIngestionRun({ runId: claim.id, clientId: claim.clientId, plan: minimalPlan(), completedAt: NOW })).rejects.toThrow("completedAt");
  });
});

describe("C8R-4 SQL/Drizzle and transaction static contracts", () => {
  it("keeps approved constraints and index direction aligned", () => {
    const migration = readFileSync("../../lib/db/migrations/0007_c8r4_backlink_ingestion_runs.sql", "utf8");
    const schema = readFileSync("../../lib/db/src/schema/backlinks.ts", "utf8");
    for (const token of ["ck_backlink_ingestion_capabilities", "ck_backlink_ingestion_result_summary_bound", "ck_backlink_ingestion_timestamps",
      "ck_backlink_ingestion_failure_stage", "ck_backlink_ingestion_failure_code"]) { expect(migration).toContain(token); expect(schema).toContain(token); }
    expect(migration).toContain("started_at DESC"); expect(schema).toContain("table.startedAt.desc()");
    expect((migration.match(/^CREATE INDEX/gimu) ?? [])).toHaveLength(2);
  });

  it("uses only the transaction handle for canonical writes", () => {
    const source = readFileSync("../../lib/db/src/backlink-repository.ts", "utf8");
    const start = source.indexOf("return await this.db.transaction(async tx =>", source.indexOf("class DrizzleBacklinkRepository"));
    const end = source.indexOf("}); } catch", start); const transactionBody = source.slice(start, end);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start); expect(transactionBody.match(/this\.db\./g)).toEqual(["this.db."]);
    expect(transactionBody).toContain("tx.insert(backlinkProspectsTable)"); expect(transactionBody).toContain("tx.update(backlinkIngestionRunsTable)");
  });
});

describe("C8R-4 fixture-backed integration and parity", () => {
  it("records a complete BB&B result with safe counts and separate scores", async () => {
    const repository = new InMemoryBacklinkRepository(); const result = await ingest(repository);
    expect("opportunityIds" in result).toBe(true); const run = (await repository.getIngestionRun(runId(), BBB_BACKLINK_CLIENT_ID))!;
    expect(run.status).toBe("succeeded"); expect(run.counts).toMatchObject({ observed: 10, accepted: 7, rejected: 3 });
    expect(run.counts.prospectCount).toBe(run.resultSummary!.prospectIds.length);
    const rows = await repository.listOpportunities(BBB_BACKLINK_CLIENT_ID, { limit: 100 });
    expect(rows.items.some(({ opportunity }) => opportunity.potentialValue !== opportunity.attainability)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("termites"); expect(JSON.stringify(rows)).not.toContain("whole-home-bed-bug-heat");
  });

  it("allows equivalent provider data for a different tenant without association leakage", async () => {
    const otherId = "client::other"; const observations: FixtureBacklinkObservation[] = BBB_FIXTURE_BACKLINK_OBSERVATIONS
      .filter(value => value.clientId === BBB_BACKLINK_CLIENT_ID).map(value => ({ ...value, clientId: otherId }));
    const repository = new InMemoryBacklinkRepository(); const provider = new FixtureBacklinkDataProvider(observations);
    const otherDiscovery = { ...discovery, clientId: otherId };
    const result = await ingestFixtureBacklinks({ trustedClientId: otherId, provider, providerRevision, discovery: otherDiscovery,
      normalizationPolicy: policy, repository, now: NOW });
    expect("opportunityIds" in result).toBe(true); expect((await repository.listOpportunities(BBB_BACKLINK_CLIENT_ID)).items).toHaveLength(0);
  });

  it("keeps in-memory and Drizzle transactional method surfaces aligned", () => {
    for (const name of ["claimIngestionRun", "commitIngestionRun", "failIngestionRun", "getIngestionRun"])
      expect(typeof (InMemoryBacklinkRepository.prototype as unknown as Record<string, unknown>)[name]).toBe(typeof (DrizzleBacklinkRepository.prototype as unknown as Record<string, unknown>)[name]);
  });
});
