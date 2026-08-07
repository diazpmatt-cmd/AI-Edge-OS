import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool, DrizzleBacklinkRepository } from "@workspace/db";
import { migrateAuthorityTestBaseSchema } from "./authority-test-schema-bootstrap.js";
import { migrateAuthorityAcquisitionProofs } from "./authority-acquisition-proof-migrate.js";
import {
  actOnAuthorityAcquisitionProof,
  createAuthorityAcquisitionProof,
  hasVerifiedAuthorityAcquisitionProof,
} from "./authority-acquisition-proof-store.js";

const repo = new DrizzleBacklinkRepository(db);
const suffix = randomUUID().replace(/-/g, "");
const clientId = `proof-test-${suffix}`;
const prospectId = `blpr::${suffix.slice(0, 8)}`;
const opportunityId = `blop::${suffix.slice(8, 16)}`;
const workflowId = `blwf::${suffix.slice(16, 24)}`;

async function seedPursuingOpportunity() {
  await pool.query(
    `INSERT INTO backlink_prospects (
       id, client_id, prospect_type, domain, page_url, display_name
     ) VALUES ($1,$2,'domain',$3,NULL,$4)`,
    [prospectId, clientId, `proof-${suffix}.example`, "Proof Test Publisher"],
  );
  await pool.query(
    `INSERT INTO backlink_opportunities (
       id, client_id, prospect_id, category, service_id,
       potential_value, attainability, rationale, recommended_action, evidence_ids
     ) VALUES ($1,$2,$3,'competitor_link_gap',NULL,90,80,$4,$5,'[]'::jsonb)`,
    [opportunityId, clientId, prospectId, "Proof test rationale", "Acquire verified link"],
  );
  await pool.query(
    `INSERT INTO backlink_workflows (
       id, client_id, opportunity_id, status, version
     ) VALUES ($1,$2,$3,'pursuing',1)`,
    [workflowId, clientId, opportunityId],
  );
}

async function cleanup() {
  await pool.query(`DELETE FROM authority_acquisition_proofs WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_workflow_events WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_workflows WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_opportunities WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_evidence WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_prospects WHERE client_id = $1`, [clientId]);
}

beforeAll(async () => {
  await migrateAuthorityTestBaseSchema();
  await migrateAuthorityAcquisitionProofs();
  await seedPursuingOpportunity();
}, 30_000);

afterAll(async () => {
  await cleanup();
}, 30_000);

describe("Authority acquisition proof PostgreSQL contract", () => {
  it("blocks outcome readiness until proof is human-verified and preserves proof attribution on Won", async () => {
    const proof = await createAuthorityAcquisitionProof({
      clientId,
      opportunityId,
      prospectId,
      workflowId,
      actorId: "user-create",
      proof: {
        proofType: "backlink_live",
        sourceUrl: "https://publisher.example/article",
        targetUrl: "https://client.example/service",
        notes: "Visible editorial link.",
      },
    });

    expect(await hasVerifiedAuthorityAcquisitionProof(opportunityId, clientId)).toEqual({
      ready: false,
      proofId: null,
    });

    const verified = await actOnAuthorityAcquisitionProof({
      id: proof.id,
      clientId,
      actorId: "user-verify",
      expectedVersion: 1,
      action: "verify",
    });
    expect(verified.verificationStatus).toBe("human_verified");
    expect(verified.version).toBe(2);

    await expect(actOnAuthorityAcquisitionProof({
      id: proof.id,
      clientId,
      actorId: "stale-user",
      expectedVersion: 1,
      action: "invalidate",
    })).rejects.toThrow("version_conflict");

    const gate = await hasVerifiedAuthorityAcquisitionProof(opportunityId, clientId);
    expect(gate).toEqual({ ready: true, proofId: proof.id });

    const won = await repo.transitionWorkflow(opportunityId, clientId, {
      toStatus: "won",
      actorId: "user-mark-won",
      reason: `authority_human_action:mark_won;proof_id:${proof.id}`,
    });
    expect(won.status).toBe("won");

    const events = await repo.listWorkflowEvents(workflowId, clientId);
    expect(events.at(-1)?.toStatus).toBe("won");
    expect(events.at(-1)?.reason).toContain(`proof_id:${proof.id}`);
  });
}, 30_000);
