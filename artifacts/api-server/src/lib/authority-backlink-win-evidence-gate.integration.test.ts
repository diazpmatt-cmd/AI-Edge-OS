import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool, DrizzleBacklinkRepository } from "@workspace/db";
import { migrateAuthorityTestBaseSchema } from "./authority-test-schema-bootstrap.js";
import { migrateAuthorityBacklinkWinEvidence } from "./authority-backlink-win-evidence-migrate.js";
import {
  actOnAuthorityBacklinkWinEvidence,
  createAuthorityBacklinkWinEvidence,
} from "./authority-backlink-win-evidence-store.js";
import { withVerifiedAuthorityBacklinkWinEvidenceGate } from "./authority-backlink-win-evidence-gate.js";

const suffix = randomUUID().replace(/-/g, "");
const clientId = `win-gate-test-${suffix}`;
const prospectId = `blpr::${suffix.slice(0, 8)}`;
const opportunityId = `blop::${suffix.slice(8, 16)}`;
const workflowId = `blwf::${suffix.slice(16, 24)}`;
const repo = new DrizzleBacklinkRepository(db);

async function seed() {
  await pool.query(
    `INSERT INTO backlink_prospects (id, client_id, prospect_type, domain, page_url, display_name)
     VALUES ($1,$2,'domain',$3,NULL,$4)`,
    [prospectId, clientId, `win-gate-${suffix}.example`, "Win Gate Test"],
  );
  await pool.query(
    `INSERT INTO backlink_opportunities (
       id, client_id, prospect_id, category, service_id,
       potential_value, attainability, rationale, recommended_action, evidence_ids
     ) VALUES ($1,$2,$3,'competitor_link_gap',NULL,90,80,$4,$5,'[]'::jsonb)`,
    [opportunityId, clientId, prospectId, "Atomic win-evidence gate test", "Verify acquired link"],
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

describe("Authority backlink win-evidence atomic gate", () => {
  it("serializes proof revocation with Mark Won and freezes the verified proof after Won", async () => {
    const created = await createAuthorityBacklinkWinEvidence({
      clientId,
      opportunityId,
      prospectId,
      actorId: "proof-author",
      evidence: {
        sourceUrl: "https://publisher.example/acquired-link",
        targetUrl: "https://client.example/service",
        notes: "Human-observed acquired backlink.",
      },
    });
    const verified = await actOnAuthorityBacklinkWinEvidence({
      id: created.id,
      clientId,
      actorId: "proof-verifier",
      expectedVersion: 1,
      action: "verify",
    });
    expect(verified.verificationStatus).toBe("human_verified");

    let markGateEntered!: () => void;
    const gateEntered = new Promise<void>((resolve) => { markGateEntered = resolve; });
    let releaseMarkWon!: () => void;
    const markWonRelease = new Promise<void>((resolve) => { releaseMarkWon = resolve; });

    const markWon = withVerifiedAuthorityBacklinkWinEvidenceGate(
      opportunityId,
      clientId,
      async () => {
        markGateEntered();
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
      id: created.id,
      clientId,
      actorId: "proof-revoker",
      expectedVersion: 2,
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
  });
}, 30_000);
