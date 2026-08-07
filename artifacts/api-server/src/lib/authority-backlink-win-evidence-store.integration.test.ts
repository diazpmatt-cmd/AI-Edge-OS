import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool, DrizzleBacklinkRepository, deriveBacklinkWorkflowId } from "@workspace/db";
import { migrateAuthorityTestBaseSchema } from "./authority-test-schema-bootstrap.js";
import { migrateAuthorityBacklinkWinEvidence } from "./authority-backlink-win-evidence-migrate.js";
import { withVerifiedAuthorityBacklinkWinEvidenceGate } from "./authority-backlink-win-evidence-gate.js";
import {
  actOnAuthorityBacklinkWinEvidence,
  createAuthorityBacklinkWinEvidence,
  hasVerifiedAuthorityBacklinkWinEvidence,
  updateAuthorityBacklinkWinEvidence,
} from "./authority-backlink-win-evidence-store.js";

const suffix = randomUUID().replace(/-/g, "");
const clientId = `win-test-${suffix}`;
const prospectId = `blpr::${suffix.slice(0, 8)}`;
const opportunityId = `blop::${suffix.slice(8, 16)}`;
const workflowId = deriveBacklinkWorkflowId(clientId, opportunityId);
const repo = new DrizzleBacklinkRepository(db);
let evidenceId: string;

async function seed() {
  await pool.query(
    `INSERT INTO backlink_prospects (id, client_id, prospect_type, domain, page_url, display_name)
     VALUES ($1,$2,'domain',$3,NULL,$4)`,
    [prospectId, clientId, `win-${suffix}.example`, "Win Evidence Test"],
  );
  await pool.query(
    `INSERT INTO backlink_opportunities (
       id, client_id, prospect_id, category, service_id,
       potential_value, attainability, rationale, recommended_action, evidence_ids
     ) VALUES ($1,$2,$3,'competitor_link_gap',NULL,90,80,$4,$5,'[]'::jsonb)`,
    [opportunityId, clientId, prospectId, "Win evidence test", "Verify acquired link"],
  );
  await pool.query(
    `INSERT INTO backlink_workflows (id, client_id, opportunity_id, status, version)
     VALUES ($1,$2,$3,'pursuing',1)`,
    [workflowId, clientId, opportunityId],
  );
}

async function cleanup() {
  await pool.query(`DELETE FROM authority_backlink_win_evidence WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_workflow_events WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_workflows WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_opportunities WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_evidence WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_prospects WHERE client_id = $1`, [clientId]);
}

beforeAll(async () => {
  await migrateAuthorityTestBaseSchema();
  await migrateAuthorityBacklinkWinEvidence();
  await seed();
}, 30_000);

afterAll(async () => {
  await cleanup();
}, 30_000);

describe("Authority backlink win evidence PostgreSQL contract", () => {
  it("requires fresh human verification after edits and rejects stale actions", async () => {
    const created = await createAuthorityBacklinkWinEvidence({
      clientId,
      opportunityId,
      prospectId,
      actorId: "user-create",
      evidence: {
        sourceUrl: "https://publisher.example/article",
        targetUrl: "https://client.example/service",
        notes: "Observed the backlink on the publisher page.",
      },
    });
    evidenceId = created.id;
    expect(created.verificationStatus).toBe("unverified");
    expect(await hasVerifiedAuthorityBacklinkWinEvidence(opportunityId, clientId)).toBe(false);

    const verified = await actOnAuthorityBacklinkWinEvidence({
      id: created.id,
      clientId,
      actorId: "user-verify",
      expectedVersion: 1,
      action: "verify",
    });
    expect(verified.verificationStatus).toBe("human_verified");
    expect(verified.verifiedBy).toBe("user-verify");
    expect(await hasVerifiedAuthorityBacklinkWinEvidence(opportunityId, clientId)).toBe(true);

    await expect(actOnAuthorityBacklinkWinEvidence({
      id: created.id,
      clientId,
      actorId: "stale-user",
      expectedVersion: 1,
      action: "invalidate",
    })).rejects.toThrow("version_conflict");

    const edited = await updateAuthorityBacklinkWinEvidence({
      id: created.id,
      clientId,
      actorId: "user-edit",
      expectedVersion: 2,
      evidence: {
        sourceUrl: "https://publisher.example/revised-article",
        targetUrl: "https://client.example/service",
        notes: "Publisher moved the link.",
      },
    });
    expect(edited.verificationStatus).toBe("unverified");
    expect(edited.verifiedAt).toBeNull();
    expect(edited.verifiedBy).toBeNull();
    expect(await hasVerifiedAuthorityBacklinkWinEvidence(opportunityId, clientId)).toBe(false);
  });

  it("serializes proof revocation with Mark Won and freezes verified evidence after Won", async () => {
    const verified = await actOnAuthorityBacklinkWinEvidence({
      id: evidenceId,
      clientId,
      actorId: "final-verifier",
      expectedVersion: 3,
      action: "verify",
    });
    expect(verified.version).toBe(4);
    expect(verified.verificationStatus).toBe("human_verified");

    let gateEnteredResolve!: () => void;
    const gateEntered = new Promise<void>((resolve) => { gateEnteredResolve = resolve; });
    let releaseMarkWon!: () => void;
    const markWonRelease = new Promise<void>((resolve) => { releaseMarkWon = resolve; });

    const markWon = withVerifiedAuthorityBacklinkWinEvidenceGate(
      opportunityId,
      clientId,
      async () => {
        gateEnteredResolve();
        await markWonRelease;
        return repo.transitionWorkflow(opportunityId, clientId, {
          toStatus: "won",
          actorId: "workflow-actor",
          reason: "authority_human_action:mark_won",
        });
      },
    );

    await gateEntered;

    let revocationSettled = false;
    const revocation = actOnAuthorityBacklinkWinEvidence({
      id: evidenceId,
      clientId,
      actorId: "proof-revoker",
      expectedVersion: 4,
      action: "invalidate",
    }).then(
      (record) => { revocationSettled = true; return { ok: true as const, record }; },
      (error: unknown) => { revocationSettled = true; return { ok: false as const, error }; },
    );

    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(revocationSettled).toBe(false);

    releaseMarkWon();
    const workflow = await markWon;
    expect(workflow.status).toBe("won");

    const revocationOutcome = await revocation;
    expect(revocationOutcome.ok).toBe(false);
    if (!revocationOutcome.ok) {
      expect(revocationOutcome.error).toBeInstanceOf(Error);
      expect((revocationOutcome.error as Error).message).toBe("won_evidence_immutable");
    }

    await expect(updateAuthorityBacklinkWinEvidence({
      id: evidenceId,
      clientId,
      actorId: "post-win-editor",
      expectedVersion: 4,
      evidence: {
        sourceUrl: "https://publisher.example/post-win-change",
        targetUrl: "https://client.example/service",
        notes: "This must not rewrite the proof behind a completed win.",
      },
    })).rejects.toThrow("won_evidence_immutable");
  });
}, 30_000);
