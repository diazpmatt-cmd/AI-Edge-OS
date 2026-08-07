import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { migrateSchema } from "./schema-migrate.js";
import { migrateAuthorityTargetContacts } from "./authority-target-contact-migrate.js";
import {
  actOnAuthorityTargetContact,
  createAuthorityTargetContact,
  listAuthorityTargetContacts,
  updateAuthorityTargetContact,
} from "./authority-target-contact-store.js";

const suffix = randomUUID().replace(/-/g, "");
const clientId = `contact-test-${suffix}`;
const prospectId = `blpr::${suffix.slice(0, 8)}`;
const opportunityId = `blop::${suffix.slice(8, 16)}`;
const workflowId = `blwf::${suffix.slice(16, 24)}`;

async function seedAuthorityOpportunity() {
  await pool.query(
    `INSERT INTO backlink_prospects (
       id, client_id, prospect_type, domain, page_url, display_name
     ) VALUES ($1,$2,'domain',$3,NULL,$4)`,
    [prospectId, clientId, `contact-${suffix}.example`, "Contact Test Publisher"],
  );
  await pool.query(
    `INSERT INTO backlink_opportunities (
       id, client_id, prospect_id, category, service_id,
       potential_value, attainability, rationale, recommended_action, evidence_ids
     ) VALUES ($1,$2,$3,'local_partnership',NULL,75,80,$4,$5,'[]'::jsonb)`,
    [opportunityId, clientId, prospectId, "Contact test rationale", "Research contact path"],
  );
  await pool.query(
    `INSERT INTO backlink_workflows (
       id, client_id, opportunity_id, status, version
     ) VALUES ($1,$2,$3,'approved',1)`,
    [workflowId, clientId, opportunityId],
  );
}

async function cleanup() {
  await pool.query(`DELETE FROM authority_target_contacts WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_workflow_events WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_workflows WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_opportunities WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_evidence WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM backlink_prospects WHERE client_id = $1`, [clientId]);
}

beforeAll(async () => {
  await migrateSchema();
  await migrateAuthorityTargetContacts();
  await seedAuthorityOpportunity();
}, 30_000);

afterAll(async () => {
  await cleanup();
}, 30_000);

describe("Authority target contact PostgreSQL contract", () => {
  it("preserves human verification semantics and rejects stale actions", async () => {
    const created = await createAuthorityTargetContact({
      clientId,
      opportunityId,
      prospectId,
      actorId: "user-create",
      contact: {
        organizationName: "Local Chamber",
        contactMethod: "contact_form",
        contactUrl: "https://example.org/contact",
        sourceUrl: "https://example.org/staff",
        notes: "Use the organization contact form.",
      },
    });
    expect(created.verificationStatus).toBe("unverified");
    expect(created.version).toBe(1);

    const verified = await actOnAuthorityTargetContact({
      id: created.id,
      clientId,
      actorId: "user-verify",
      expectedVersion: 1,
      action: "verify",
    });
    expect(verified.verificationStatus).toBe("human_verified");
    expect(verified.version).toBe(2);
    expect(verified.verifiedBy).toBe("user-verify");
    expect(verified.verifiedAt).not.toBeNull();

    await expect(actOnAuthorityTargetContact({
      id: created.id,
      clientId,
      actorId: "stale-user",
      expectedVersion: 1,
      action: "invalidate",
    })).rejects.toThrow("version_conflict");

    const edited = await updateAuthorityTargetContact({
      id: created.id,
      clientId,
      actorId: "user-edit",
      expectedVersion: 2,
      contact: {
        organizationName: "Local Chamber",
        contactName: "Partnership Team",
        contactMethod: "email",
        email: "partners@example.org",
        sourceUrl: "https://example.org/staff",
      },
    });
    expect(edited.verificationStatus).toBe("unverified");
    expect(edited.version).toBe(3);
    expect(edited.verifiedBy).toBeNull();
    expect(edited.verifiedAt).toBeNull();

    const invalid = await actOnAuthorityTargetContact({
      id: created.id,
      clientId,
      actorId: "user-invalid",
      expectedVersion: 3,
      action: "invalidate",
    });
    expect(invalid.verificationStatus).toBe("invalid");
    expect(invalid.version).toBe(4);

    await expect(updateAuthorityTargetContact({
      id: created.id,
      clientId,
      actorId: "user-edit-invalid",
      expectedVersion: 4,
      contact: {
        organizationName: "Local Chamber",
        contactMethod: "email",
        email: "new@example.org",
        sourceUrl: "https://example.org/staff",
      },
    })).rejects.toThrow("invalid_must_reopen");

    const reopened = await actOnAuthorityTargetContact({
      id: created.id,
      clientId,
      actorId: "user-reopen",
      expectedVersion: 4,
      action: "reopen",
    });
    expect(reopened.verificationStatus).toBe("unverified");
    expect(reopened.version).toBe(5);

    const contacts = await listAuthorityTargetContacts(opportunityId, clientId);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.id).toBe(created.id);
    expect(contacts[0]?.verificationStatus).toBe("unverified");
  });
}, 30_000);
