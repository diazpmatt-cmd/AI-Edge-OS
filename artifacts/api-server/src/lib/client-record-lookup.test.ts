import { describe, expect, it, vi } from "vitest";
import {
  SELECT_CLIENT_BY_USER_ID_SQL,
  mapRawClientRecord,
  selectClientRecordByUserId,
  type RawClientRecordRow,
} from "./client-record-lookup.js";

const rawRow: RawClientRecordRow = {
  id: "fdf38f6b-36c2-472a-9aee-b2c4af8967c7",
  user_id: "user_3FKEVWFSuyNsJz3oQ9kPH5nzKDm",
  slug: "bed-bugs-and-beyond",
  client_name: "Bed Bugs & Beyond",
  industry: "pest_control",
  industry_label: "pest control",
  region: "Gulf Coast of Alabama (Baldwin County)",
  service_areas: '["Foley, AL"]',
  timezone: "America/Chicago",
  is_active: true,
  created_at: new Date("2026-07-26T00:00:00.000Z"),
  updated_at: new Date("2026-07-26T01:00:00.000Z"),
};

describe("selectClientRecordByUserId", () => {
  it("uses an exact parameterized Clerk user ID lookup", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [rawRow] });

    const result = await selectClientRecordByUserId(
      query,
      "user_3FKEVWFSuyNsJz3oQ9kPH5nzKDm",
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      SELECT_CLIENT_BY_USER_ID_SQL,
      ["user_3FKEVWFSuyNsJz3oQ9kPH5nzKDm"],
    );
    expect(result?.slug).toBe("bed-bugs-and-beyond");
    expect(result?.userId).toBe("user_3FKEVWFSuyNsJz3oQ9kPH5nzKDm");
  });

  it("returns null for an unknown user and does not substitute a default tenant", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    const result = await selectClientRecordByUserId(query, "user_unknown");

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledWith(SELECT_CLIENT_BY_USER_ID_SQL, ["user_unknown"]);
  });

  it("maps every database field to the canonical ClientRecord shape", () => {
    expect(mapRawClientRecord(rawRow)).toEqual({
      id: rawRow.id,
      userId: rawRow.user_id,
      slug: rawRow.slug,
      clientName: rawRow.client_name,
      industry: rawRow.industry,
      industryLabel: rawRow.industry_label,
      region: rawRow.region,
      serviceAreas: rawRow.service_areas,
      timezone: rawRow.timezone,
      isActive: rawRow.is_active,
      createdAt: rawRow.created_at,
      updatedAt: rawRow.updated_at,
    });
  });
});
