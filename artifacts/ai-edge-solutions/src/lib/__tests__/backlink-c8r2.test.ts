import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BBB_BACKLINK_ALLOWED_SERVICES, BBB_BACKLINK_BLOCKED_PHRASES, BBB_BACKLINK_CLIENT_ID, BBB_BACKLINK_FIXTURES } from "../../../../../lib/db/src/backlink-fixtures";
import { mergeBacklinkEvidence, normalizeBacklinkEvidence } from "../../../../../lib/db/src/backlink-normalizer";
import { scoreBacklinkEvidence } from "../../../../../lib/db/src/backlink-scorer";
import {
  DrizzleBacklinkRepository, InMemoryBacklinkRepository, deriveBacklinkOpportunityId,
  deriveBacklinkProspectId, deriveBacklinkWorkflowEventId, deriveBacklinkWorkflowId,
} from "../../../../../lib/db/src/backlink-repository";
import { BACKLINK_WORKFLOW_TRANSITIONS, canTransitionBacklinkWorkflow } from "../../../../../lib/db/src/backlink-lifecycle";
import type { BacklinkOpportunity, BacklinkProspect, BacklinkRepository } from "../../../../../lib/db/src/backlink-persistence-types";

const NOW = new Date("2026-07-12T12:00:00.000Z");
const policy = { allowedServiceIds: BBB_BACKLINK_ALLOWED_SERVICES, blockedPhrases: BBB_BACKLINK_BLOCKED_PHRASES, now: NOW };

function fixtureEvidence(clientId = BBB_BACKLINK_CLIENT_ID, provider = "fixture", fixtureIndex = 0) {
  const evidence = normalizeBacklinkEvidence(BBB_BACKLINK_FIXTURES[fixtureIndex], provider, clientId, policy);
  if (!evidence) throw new Error("fixture rejected");
  return evidence;
}
function prospect(clientId = BBB_BACKLINK_CLIENT_ID, domain = "southbaldwinchamber.com"): BacklinkProspect {
  const pageUrl = `https://${domain}/member-directory/pest-control`;
  return { id: deriveBacklinkProspectId(clientId, domain, pageUrl), clientId, prospectType: "organization", domain, pageUrl, displayName: "South Baldwin Chamber", createdAt: NOW, updatedAt: NOW };
}
function opportunity(p: BacklinkProspect, evidenceId: string, overrides: Partial<BacklinkOpportunity> = {}): BacklinkOpportunity {
  const scores = scoreBacklinkEvidence(fixtureEvidence(p.clientId));
  const category = "local_partnership" as const; const serviceId = "commercial_pest_control";
  return { id: deriveBacklinkOpportunityId(p.clientId, p.id, category, serviceId), clientId: p.clientId, prospectId: p.id, category, serviceId,
    potentialValue: scores.potentialValue, attainability: scores.attainability, rationale: "Locally relevant Baldwin County organization.",
    recommendedAction: "Review membership requirements.", evidenceIds: [evidenceId], createdAt: NOW, updatedAt: NOW, ...overrides };
}
async function seeded(clientId = BBB_BACKLINK_CLIENT_ID) {
  const repo = new InMemoryBacklinkRepository(); const p = prospect(clientId); await repo.upsertProspect(p);
  const evidence = fixtureEvidence(clientId); await repo.persistEvidence({ prospectId: p.id, evidence });
  const o = opportunity(p, evidence.id); await repo.upsertOpportunity(o); await repo.createInitialWorkflow(o.id, clientId, NOW);
  return { repo, p, evidence, o };
}

describe("C8R-2 idempotent persistence", () => {
  it("upserts prospects idempotently", async () => {
    const repo = new InMemoryBacklinkRepository(); const p = prospect();
    const first = await repo.upsertProspect(p); const second = await repo.upsertProspect({ ...p, displayName: "Updated", updatedAt: new Date(NOW.getTime() + 1) });
    expect(second.id).toBe(first.id); expect(second.createdAt).toEqual(first.createdAt);
    expect((await repo.getProspectById(p.id, p.clientId))?.displayName).toBe("Updated");
  });
  it("persists immutable evidence idempotently", async () => {
    const repo = new InMemoryBacklinkRepository(); const p = prospect(); await repo.upsertProspect(p); const evidence = fixtureEvidence();
    const first = await repo.persistEvidence({ prospectId: p.id, evidence });
    const second = await repo.persistEvidence({ prospectId: p.id, evidence: { ...evidence, authority: 1 } });
    expect(second).toEqual(first); expect(second.authority).toBe(evidence.authority);
  });
  it("upserts opportunities idempotently with stable evidence IDs", async () => {
    const { repo, o } = await seeded(); const updated = { ...o, rationale: "Updated rationale", updatedAt: new Date(NOW.getTime() + 1) };
    expect((await repo.upsertOpportunity(updated)).rationale).toBe("Updated rationale");
    expect((await repo.getOpportunityById(o.id, o.clientId))?.createdAt).toEqual(NOW);
  });
  it("preserves merged duplicate provenance while hiding provider metadata from reads", async () => {
    const repo = new InMemoryBacklinkRepository(); const p = prospect(); await repo.upsertProspect(p);
    const merged = mergeBacklinkEvidence([fixtureEvidence(p.clientId, "zeta"), fixtureEvidence(p.clientId, "alpha")])[0];
    const stored = await repo.persistEvidence({ prospectId: p.id, evidence: merged });
    expect(stored.providers).toEqual(["alpha", "zeta"]);
    expect("providerMetadata" in stored).toBe(false);
  });
  it("prohibits evidence updates without globally blocking authorized deletion", () => {
    const migration = readFileSync("../../lib/db/migrations/0006_c8r2_backlink_persistence.sql", "utf8");
    expect(migration).toMatch(/CREATE TRIGGER trg_backlink_evidence_immutable BEFORE UPDATE ON backlink_evidence/);
    expect(migration).not.toMatch(/BEFORE UPDATE OR DELETE ON backlink_evidence/);
    expect(migration).not.toMatch(/BEFORE DELETE ON backlink_evidence/);
    const methods = Object.getOwnPropertyNames(InMemoryBacklinkRepository.prototype);
    expect(methods).not.toContain("updateEvidence");
    expect(methods).not.toContain("deleteEvidence");
    expect(Object.getOwnPropertyNames(DrizzleBacklinkRepository.prototype)).not.toContain("deleteEvidence");
  });
});

describe("C8R-2 workflow lifecycle", () => {
  it("defines only explicit transitions", () => {
    expect(BACKLINK_WORKFLOW_TRANSITIONS.discovered).toEqual(["reviewing", "rejected", "expired"]);
    expect(canTransitionBacklinkWorkflow("pursuing", "won")).toBe(true);
    expect(canTransitionBacklinkWorkflow("won", "reviewing")).toBe(false);
  });
  it("creates workflow and initial audit event atomically", async () => {
    const { repo, o } = await seeded(); const events = await repo.listWorkflowEvents(o.id, o.clientId);
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ sequence: 1, fromStatus: null, toStatus: "discovered" });
  });
  it("creates one event for every valid transition", async () => {
    const { repo, o } = await seeded(); await repo.transitionWorkflow(o.id, o.clientId, { toStatus: "reviewing", actorId: "owner", now: new Date(NOW.getTime()+1) });
    await repo.transitionWorkflow(o.id, o.clientId, { toStatus: "approved", now: new Date(NOW.getTime()+2) });
    expect((await repo.listWorkflowEvents(o.id, o.clientId)).map(x => x.toStatus)).toEqual(["discovered", "reviewing", "approved"]);
  });
  it("rejects invalid transitions without appending an event", async () => {
    const { repo, o } = await seeded(); await expect(repo.transitionWorkflow(o.id, o.clientId, { toStatus: "won" })).rejects.toThrow("Invalid");
    expect(await repo.listWorkflowEvents(o.id, o.clientId)).toHaveLength(1);
  });
  it("marks terminal workflow completion", async () => {
    const { repo, o } = await seeded(); const done = await repo.transitionWorkflow(o.id, o.clientId, { toStatus: "rejected", outcomeSummary: "Not aligned", now: new Date(NOW.getTime()+1) });
    expect(done.completedAt).toEqual(new Date(NOW.getTime()+1));
  });
});

describe("C8R-2 tenant isolation", () => {
  it("denies cross-client reads", async () => {
    const { repo, p, o } = await seeded(); expect(await repo.getProspectById(p.id, "other")).toBeNull(); expect(await repo.getOpportunityById(o.id, "other")).toBeNull();
  });
  it("denies cross-client opportunity association", async () => {
    const { repo, p, evidence } = await seeded(); await expect(repo.upsertOpportunity({ ...opportunity(p, evidence.id), clientId: "other" })).rejects.toThrow();
  });
  it("denies cross-client workflow transitions", async () => {
    const { repo, o } = await seeded(); await expect(repo.transitionWorkflow(o.id, "other", { toStatus: "reviewing" })).rejects.toThrow("not found");
  });
  it("denies cross-tenant foreign associations and event appends", async () => {
    const { repo, o } = await seeded(); const workflowId = deriveBacklinkWorkflowId("other", o.id);
    await expect(repo.appendWorkflowEvent({ id: deriveBacklinkWorkflowEventId(workflowId, 2), clientId: "other", workflowId, opportunityId: o.id, sequence: 2, fromStatus: "discovered", toStatus: "reviewing", actorId: null, reason: null, createdAt: NOW })).rejects.toThrow("cross-tenant");
  });
  it("isolates identical domains between clients", async () => {
    const repo = new InMemoryBacklinkRepository(); const a = prospect("a", "same.example"); const b = prospect("b", "same.example");
    expect(a.id).not.toBe(b.id); await repo.upsertProspect(a); await repo.upsertProspect(b);
    expect((await repo.getProspectById(a.id, "a"))?.domain).toBe("same.example"); expect(await repo.getProspectById(a.id, "b")).toBeNull();
  });
});

describe("C8R-2 listing and bounds", () => {
  it("uses stable ranking and bounded pagination", async () => {
    const repo = new InMemoryBacklinkRepository();
    for (let i=0;i<4;i++) { const clientId="paging"; const p=prospect(clientId,`d${i}.example`); await repo.upsertProspect(p); const e=fixtureEvidence(clientId); const unique={...e,id:`${e.id}-${i}`,sourceDomain:p.domain,sourceUrl:`https://${p.domain}`}; await repo.persistEvidence({prospectId:p.id,evidence:unique}); const o=opportunity(p,unique.id,{id:`opp-${i}`,attainability:50+i}); await repo.upsertOpportunity(o); await repo.createInitialWorkflow(o.id,clientId,NOW); }
    const first=await repo.listOpportunities("paging",{limit:2}); const second=await repo.listOpportunities("paging",{limit:2,offset:2});
    expect(first.items.map(x=>x.opportunity.id)).toEqual(["opp-3","opp-2"]); expect(second.items.map(x=>x.opportunity.id)).toEqual(["opp-1","opp-0"]);
    expect((await repo.listOpportunities("paging",{limit:999})).limit).toBe(100);
  });
  it("filters by category and workflow status", async () => {
    const {repo,o}=await seeded(); await repo.transitionWorkflow(o.id,o.clientId,{toStatus:"reviewing"});
    expect((await repo.listOpportunities(o.clientId,{category:"local_partnership",workflowStatus:"reviewing"})).items).toHaveLength(1);
    expect((await repo.listOpportunities(o.clientId,{category:"broken_link"})).items).toHaveLength(0);
  });
  it("rejects unbounded workflow text", async () => {
    const {repo,o}=await seeded(); await expect(repo.transitionWorkflow(o.id,o.clientId,{toStatus:"reviewing",nextAction:"x".repeat(1001)})).rejects.toThrow("exceeds");
  });
});

describe("C8R-2 BB&B safety and implementation parity", () => {
  it("retains active Baldwin County fixtures, fumigation, and blocks termites/whole-home heat", () => {
    expect(BBB_BACKLINK_FIXTURES.map(x=>normalizeBacklinkEvidence(x,"fixture",BBB_BACKLINK_CLIENT_ID,policy)).every(Boolean)).toBe(true);
    expect(normalizeBacklinkEvidence({...BBB_BACKLINK_FIXTURES[0],serviceId:"termites"},"fixture",BBB_BACKLINK_CLIENT_ID,policy)).toBeNull();
    expect(normalizeBacklinkEvidence({...BBB_BACKLINK_FIXTURES[0],sourceUrl:"https://example.com/whole-home-bed-bug-heat"},"fixture",BBB_BACKLINK_CLIENT_ID,policy)).toBeNull();
    expect(BBB_BACKLINK_FIXTURES.some(x=>x.serviceId==="fumigation")).toBe(true);
  });
  it("keeps in-memory and Drizzle repository method contracts aligned", () => {
    const methods: Array<keyof BacklinkRepository> = ["upsertProspect","persistEvidence","upsertOpportunity","createInitialWorkflow","transitionWorkflow","appendWorkflowEvent","getProspectById","getOpportunityById","listOpportunities","listEvidenceForProspect","listWorkflowEvents"];
    for(const method of methods){ expect(typeof InMemoryBacklinkRepository.prototype[method]).toBe("function"); expect(typeof DrizzleBacklinkRepository.prototype[method]).toBe("function"); }
  });
});
