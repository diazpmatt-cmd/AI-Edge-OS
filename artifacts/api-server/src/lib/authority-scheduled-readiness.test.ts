import { describe, expect, it } from "vitest";

import { evaluateAuthorityScheduledReadiness } from "./authority-scheduled-readiness.js";

describe("evaluateAuthorityScheduledReadiness", () => {
  const readyContext = {
    ok: true as const,
    discovery: {
      clientId: "client-1",
      clientDomain: "example.com",
      competitorDomains: ["competitor.com"],
      serviceIds: ["service-a"],
      city: "Foley",
      region: "Baldwin County, Alabama",
      limit: 50,
    },
  };

  it("fails closed for an inactive client", () => {
    expect(evaluateAuthorityScheduledReadiness({
      clientActive: false,
      discoveryContext: readyContext,
      scheduledModeSchemaReady: true,
      liveProviderHealth: { provider: "dataforseo_backlinks", status: "configured", reason: null, login: "configured@example.com" },
    })).toMatchObject({ ready: false, code: "AUTHORITY_SCHEDULED_CLIENT_UNAVAILABLE" });
  });

  it("preserves the discovery-context failure code", () => {
    expect(evaluateAuthorityScheduledReadiness({
      clientActive: true,
      discoveryContext: { ok: false, code: "AUTHORITY_DISCOVERY_DISABLED", message: "disabled" },
      scheduledModeSchemaReady: true,
      liveProviderHealth: { provider: "dataforseo_backlinks", status: "configured", reason: null, login: "configured@example.com" },
    })).toMatchObject({ ready: false, code: "AUTHORITY_DISCOVERY_DISABLED" });
  });

  it("requires the ledger schema to represent scheduled runs", () => {
    expect(evaluateAuthorityScheduledReadiness({
      clientActive: true,
      discoveryContext: readyContext,
      scheduledModeSchemaReady: false,
      liveProviderHealth: { provider: "dataforseo_backlinks", status: "configured", reason: null, login: "configured@example.com" },
    })).toMatchObject({ ready: false, code: "AUTHORITY_SCHEDULED_MODE_SCHEMA_NOT_READY" });
  });

  it("requires a configured live provider", () => {
    expect(evaluateAuthorityScheduledReadiness({
      clientActive: true,
      discoveryContext: readyContext,
      scheduledModeSchemaReady: true,
      liveProviderHealth: { provider: "dataforseo_backlinks", status: "disabled", reason: "feature flag off", login: null },
    })).toMatchObject({ ready: false, code: "AUTHORITY_LIVE_BACKLINK_PROVIDER_NOT_READY" });
  });

  it("reports ready without activating execution", () => {
    expect(evaluateAuthorityScheduledReadiness({
      clientActive: true,
      discoveryContext: readyContext,
      scheduledModeSchemaReady: true,
      liveProviderHealth: { provider: "dataforseo_backlinks", status: "configured", reason: null, login: "configured@example.com" },
    })).toEqual({
      ready: true,
      code: "AUTHORITY_SCHEDULED_READY_NOT_ACTIVATED",
      message: "Tenant context, scheduled-mode persistence, and the live backlink provider are ready. Scheduled provider execution remains intentionally disabled until activation is explicitly authorized.",
      executionActivated: false,
    });
  });
});
