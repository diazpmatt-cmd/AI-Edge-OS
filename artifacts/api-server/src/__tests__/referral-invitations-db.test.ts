import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";

const CLIENT_ID = "rge2-disposable-db-test";
let programId = 0;

async function insertInvitation(options: {
  idempotencyKey: string;
  deliveryState?: string;
  sequenceStep?: number;
  status?: string;
}) {
  return pool.query(
    `
    INSERT INTO referral_invitations (
      client_id,
      program_id,
      channel,
      recipient_name,
      recipient_destination,
      initial_message,
      follow_up_delay_days,
      status,
      delivery_state,
      sequence_step,
      consent_source,
      consent_at,
      idempotency_key,
      created_by_user_id
    )
    VALUES ($1, $2, 'sms', 'Test Customer', '2515550101', 'A consent-backed referral invitation.',
            3, $3, $4, $5, 'written_form', NOW(), $6, 'test-user')
    RETURNING id, status, delivery_state, sequence_step
  `,
    [
      CLIENT_ID,
      programId,
      options.status ?? "draft",
      options.deliveryState ?? "not_dispatched",
      options.sequenceStep ?? 0,
      options.idempotencyKey,
    ],
  );
}

beforeAll(async () => {
  await pool.query(`DELETE FROM referral_invitations WHERE client_id = $1`, [
    CLIENT_ID,
  ]);
  await pool.query(
    `DELETE FROM referral_contact_preferences WHERE client_id = $1`,
    [CLIENT_ID],
  );
  await pool.query(
    `DELETE FROM referral_invitation_templates WHERE client_id = $1`,
    [CLIENT_ID],
  );
  await pool.query(`DELETE FROM referral_programs WHERE client_id = $1`, [
    CLIENT_ID,
  ]);
  const result = await pool.query(
    `
    INSERT INTO referral_programs (
      client_id, name, reward_type, reward_value, status, referral_code
    )
    VALUES ($1, 'Disposable RGE-2 Program', 'credit', 25, 'active', 'REF-RGE2TEST1')
    RETURNING id
  `,
    [CLIENT_ID],
  );
  programId = result.rows[0].id;
});

beforeEach(async () => {
  await pool.query(`DELETE FROM referral_invitations WHERE client_id = $1`, [
    CLIENT_ID,
  ]);
  await pool.query(
    `DELETE FROM referral_contact_preferences WHERE client_id = $1`,
    [CLIENT_ID],
  );
  await pool.query(
    `DELETE FROM referral_invitation_templates WHERE client_id = $1`,
    [CLIENT_ID],
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM referral_invitations WHERE client_id = $1`, [
    CLIENT_ID,
  ]);
  await pool.query(
    `DELETE FROM referral_contact_preferences WHERE client_id = $1`,
    [CLIENT_ID],
  );
  await pool.query(
    `DELETE FROM referral_invitation_templates WHERE client_id = $1`,
    [CLIENT_ID],
  );
  await pool.query(`DELETE FROM referral_programs WHERE client_id = $1`, [
    CLIENT_ID,
  ]);
});

describe("RGE-2 database invariants", () => {
  it("persists a valid invitation only as not-dispatched step zero", async () => {
    const result = await insertInvitation({ idempotencyKey: "db-valid-0001" });
    expect(result.rows[0]).toMatchObject({
      status: "draft",
      delivery_state: "not_dispatched",
      sequence_step: 0,
    });
  });

  it("rejects any delivered-looking state", async () => {
    await expect(
      insertInvitation({
        idempotencyKey: "db-invalid-delivery-0001",
        deliveryState: "sent",
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects sequence advancement", async () => {
    await expect(
      insertInvitation({
        idempotencyKey: "db-invalid-step-0001",
        sequenceStep: 1,
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces tenant-scoped idempotency keys", async () => {
    await insertInvitation({ idempotencyKey: "db-duplicate-0001" });
    await expect(
      insertInvitation({
        idempotencyKey: "db-duplicate-0001",
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces canonical contact-preference values", async () => {
    await expect(
      pool.query(
        `
      INSERT INTO referral_contact_preferences (
        client_id, channel, destination, status
      )
      VALUES ($1, 'carrier_pigeon', 'somewhere', 'maybe')
    `,
        [CLIENT_ID],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
