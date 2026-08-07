import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { migrateSchema } from "./schema-migrate.js";
import { migrateAuthorityOutreachDrafts } from "./authority-outreach-draft-migrate.js";
import {
  createAuthorityOutreachDraft,
  getAuthorityOutreachDraft,
  listAuthorityOutreachDraftVersions,
  mutateAuthorityOutreachDraft,
} from "./authority-outreach-draft-store.js";

const suffix = randomUUID().replace(/-/g, "");
const clientId = `draft-test-${suffix}`;
const prospectId = `blpr::${suffix.slice(0, 8)}`;
const opportunityId = `blop::${suffix.slice(8, 16)}`;
const workflowId = `blwf::${suffix.slice(16, 24)}`;

async function seedAuthorityOpportunity() {
  await pool.query(
    `INSERT INTO backlink_prospects (
       id, client_id, prospect_type, domain, page_url, display_name
     ) VALUES ($1,$2,'domain',$3,NULL,$4)`,
    [prospectId, clientId, `publisher-${suffix}.example`, "Draft Test Publisher"],
  );
  await pool.query(
    `INSERT INTO backlink_opportunities (
       id, client_id, prospect_id, category, service_id,
       potential_value, attainability, rationale, recommended_action, evidence_ids
     ) VALUES ($1,$2,$3,'competitor_link_gap',NULL,80,70,$4,$5,'[]'::jsonb)`,
    [opportunityId, clientId, prospectId, "Test rationale", "Test recommended action"],
  );
  await pool.query(
    `INSERT INTO backlink_workflows (
       id, client_id, opportunity_id, status, version
     ) VALUES ($1,$2,$3,'approved',1)`,
    [workflowId, clientId, opportunityId],
  );
}

async function cleanup() {
  await pool.query(`DELETE FROM authority_outreach_draft_versions WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM authority_outreach_drafts WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_workflow_events WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_workflows WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_opportunities WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_evidence WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_prospects WHERE client_id = $1`, [clientId]);
}

beforeAll(async () => {
  await migrateSchema();
  await migrateAuthorityOutreachDrafts();
  await seedAuthorityOpportunity();
});

afterAll(async () => {
  await cleanup();
});

describe("Authority outreach draft store PostgreSQL contract", () => {
  it("persists atomic immutable versions and rejects stale human actions", async () => {
    const created = await createAuthorityOutreachDraft({
      clientId,
      opportunityId,
      workflowId,
      actorId: "user-create",
      subject: "Initial subject",
      body: "Initial body",
      provenance: {
        opportunityId,
        evidence: [{ id: "evidence-1", sourceUrl: "https://publisher.example/page" }],
      },
      generatedBy: "deterministic_template_v1",
    });
    expect(created.status).toBe("draft");
    expect(created.version).toBe(1);

    const saved = await mutateAuthorityOutreachDraft({
      clientId,
      opportunityId,
      actorId: "user-save",
      action: "save",
      expectedVersion: 1,
      subject: "Edited subject",
      body: "Edited body",
    });
    expect(saved.version).toBe(2);
    expect(saved.status).toBe("draft");

    await expect(mutateAuthorityOutreachDraft({
      clientId,
      opportunityId,
      actorId: "stale-user",
      action: "approve",
      expectedVersion: 1,
    })).rejects.toThrow("version_conflict");

    const afterConflict = await getAuthorityOutreachDraft(opportunityId, clientId);
    expect(afterConflict?.version).toBe(2);
    expect(afterConflict?.status).toBe("draft");

    const approved = await mutateAuthorityOutreachDraft({
      clientId,
      opportunityId,
      actorId: "user-approve",
      action: "approve",
      expectedVersion: 2,
    });
    expect(approved.status).toBe("approved");
    expect(approved.version).toBe(3);
    expect(approved.approvedBy).toBe("user-approve");
    expect(approved.approvedAt).not.toBeNull();

    const editedAfterApproval = await mutateAuthorityOutreachDraft({
      clientId,
      opportunityId,
      actorId: "user-edit-after-approval",
      action: "save",
      expectedVersion: 3,
      subject: "Fresh approval required",
      body: "This content changed after approval.",
    });
    expect(editedAfterApproval.status).toBe("draft");
    expect(editedAfterApproval.version).toBe(4);
    expect(editedAfterApproval.approvedBy).toBeNull();
    expect(editedAfterApproval.approvedAt).toBeNull();

    const history = await listAuthorityOutreachDraftVersions(opportunityId, clientId);
    expect(history.map((entry) => [entry.version, entry.action, entry.status])).toEqual([
      [4, "save", "draft"],
      [3, "approve", "approved"],
      [2, "save", "draft"],
      [1, "create", "draft"],
    ]);
    expect(history.find((entry) => entry.version === 3)?.actorId).toBe("user-approve");
    expect(history.find((entry) => entry.version === 1)?.provenance).toMatchObject({
      opportunityId,
    });
  });
});
