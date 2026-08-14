import { describe, expect, it } from "vitest";
import {
  AUTHORITY_PROOF_ARM_TTL_MS,
  AUTHORITY_PROOF_MAX_COST_USD,
  AUTHORITY_PROOF_MAX_REQUESTS,
  AUTHORITY_PROOF_MAX_RESULTS,
  buildAuthorityProofPayloadHash,
  buildAuthorityProofRunPreflight,
  validateAuthorityProofArm,
  type AuthorityProofRunMaterial,
} from "./authority-proof-run-policy";

const now = new Date("2026-08-14T04:00:00.000Z");

function material(overrides: Partial<AuthorityProofRunMaterial> = {}): AuthorityProofRunMaterial {
  return {
    clientId: "00000000-0000-4000-8000-000000000001",
    providerId: "dataforseo_backlinks",
    providerRevision: "dataforseo-backlinks-v1",
    runId: "authority-proof-run-001",
    fingerprint: "fingerprint-001",
    competitorDomains: ["competitor-a.example", "competitor-b.example"],
    serviceIds: ["bed-bug-treatment", "pest-control"],
    geography: "Baldwin County, Alabama",
    resultLimit: 50,
    requestCount: 1,
    estimatedCostUsd: 0.03,
    ...overrides,
  };
}

describe("Authority one-shot proof arm policy", () => {
  it("allows a canonical bounded preflight without executing anything", () => {
    const result = buildAuthorityProofRunPreflight(material(), now);
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.confirmationText).toBe(`ARM AUTHORITY ${result.payloadHash.slice(0, 12)}`);
    expect(result.expiresAt).toBe(new Date(now.getTime() + AUTHORITY_PROOF_ARM_TTL_MS).toISOString());
    expect(result.limits).toEqual({
      maxCostUsd: AUTHORITY_PROOF_MAX_COST_USD,
      maxRequests: AUTHORITY_PROOF_MAX_REQUESTS,
      maxResults: AUTHORITY_PROOF_MAX_RESULTS,
    });
  });

  it("builds a stable canonical hash across competitor/service ordering and competitor case", () => {
    const first = buildAuthorityProofPayloadHash(material());
    const second = buildAuthorityProofPayloadHash(material({
      competitorDomains: [" COMPETITOR-B.EXAMPLE ", "Competitor-A.Example"],
      serviceIds: ["pest-control", "bed-bug-treatment"],
    }));
    expect(second).toBe(first);
  });

  it("changes the hash when material execution scope changes", () => {
    const first = buildAuthorityProofPayloadHash(material());
    expect(buildAuthorityProofPayloadHash(material({ resultLimit: 25 }))).not.toBe(first);
    expect(buildAuthorityProofPayloadHash(material({ geography: "Mobile County, Alabama" }))).not.toBe(first);
  });

  it("blocks every provider except the canonical DataForSEO backlinks provider", () => {
    const result = buildAuthorityProofRunPreflight(material({ providerId: "fixture" }), now);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("provider_not_allowlisted");
  });

  it("requires canonical tenant, provider revision, run identity, competitors, services, and geography", () => {
    const result = buildAuthorityProofRunPreflight(material({
      clientId: "",
      providerRevision: "",
      runId: "",
      fingerprint: "",
      competitorDomains: [],
      serviceIds: [],
      geography: "",
    }), now);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "client_required",
      "provider_revision_required",
      "canonical_run_identity_required",
      "canonical_competitors_required",
      "canonical_services_required",
      "canonical_geography_required",
    ]));
  });

  it("blocks result counts above the 50-row proof ceiling", () => {
    const result = buildAuthorityProofRunPreflight(material({ resultLimit: 51 }), now);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("result_limit_exceeded");
  });

  it("requires exactly one provider request and also trips the shared budget guard above one", () => {
    const result = buildAuthorityProofRunPreflight(material({ requestCount: 2 }), now);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("request_count_must_equal_one");
    expect(result.blockers).toContain("budget_max_request_count_exceeded");
  });

  it("blocks an estimated cost above the hard $0.25 ceiling", () => {
    const result = buildAuthorityProofRunPreflight(material({ estimatedCostUsd: 0.251 }), now);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("budget_per_run_ceiling_exceeded");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01])("blocks invalid cost %s", (estimatedCostUsd) => {
    const result = buildAuthorityProofRunPreflight(material({ estimatedCostUsd }), now);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("estimated_cost_invalid");
  });

  it("validates only the exact payload hash and exact confirmation before expiration", () => {
    const preflight = buildAuthorityProofRunPreflight(material(), now);
    expect(validateAuthorityProofArm({
      expectedPayloadHash: preflight.payloadHash,
      submittedPayloadHash: preflight.payloadHash,
      submittedConfirmation: preflight.confirmationText,
      expiresAt: preflight.expiresAt,
      now: new Date(now.getTime() + 1_000),
    })).toEqual({ ok: true });
  });

  it("fails closed on payload mismatch", () => {
    const preflight = buildAuthorityProofRunPreflight(material(), now);
    expect(validateAuthorityProofArm({
      expectedPayloadHash: preflight.payloadHash,
      submittedPayloadHash: "0".repeat(64),
      submittedConfirmation: preflight.confirmationText,
      expiresAt: preflight.expiresAt,
      now,
    })).toEqual({ ok: false, code: "AUTHORITY_PROOF_PAYLOAD_HASH_MISMATCH" });
  });

  it("fails closed on confirmation mismatch", () => {
    const preflight = buildAuthorityProofRunPreflight(material(), now);
    expect(validateAuthorityProofArm({
      expectedPayloadHash: preflight.payloadHash,
      submittedPayloadHash: preflight.payloadHash,
      submittedConfirmation: "ARM AUTHORITY wrong",
      expiresAt: preflight.expiresAt,
      now,
    })).toEqual({ ok: false, code: "AUTHORITY_PROOF_CONFIRMATION_MISMATCH" });
  });

  it("fails closed once the preflight expires", () => {
    const preflight = buildAuthorityProofRunPreflight(material(), now);
    expect(validateAuthorityProofArm({
      expectedPayloadHash: preflight.payloadHash,
      submittedPayloadHash: preflight.payloadHash,
      submittedConfirmation: preflight.confirmationText,
      expiresAt: preflight.expiresAt,
      now: new Date(Date.parse(preflight.expiresAt)),
    })).toEqual({ ok: false, code: "AUTHORITY_PROOF_PREFLIGHT_EXPIRED" });
  });
});
