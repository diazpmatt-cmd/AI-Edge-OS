import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  APOLLOS_CLIENT_MCP_TOOLS,
  ApollosClientMcpRuntime,
} from "../lib/apollos-client-mcp.js";

const dispatchSource = readFileSync(
  new URL("../lib/apollos-referral-dispatch.ts", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");
const statusSource = readFileSync(
  new URL("../lib/apollos-referral-pilot-status.ts", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");

describe("Apollos Referral pilot MCP boundary", () => {
  it("exposes a read-only status tool and a truthful external-write dispatch tool", () => {
    const status = APOLLOS_CLIENT_MCP_TOOLS.find(
      (tool) => tool.name === "apollos_get_referral_pilot_status",
    );
    const dispatch = APOLLOS_CLIENT_MCP_TOOLS.find(
      (tool) => tool.name === "apollos_dispatch_approved_referral_invitation",
    );

    expect(status?.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: false,
    });
    expect(dispatch?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    });
  });

  it("does not accept recipient, message, cohort, or arbitrary payload fields", () => {
    const dispatch = APOLLOS_CLIENT_MCP_TOOLS.find(
      (tool) => tool.name === "apollos_dispatch_approved_referral_invitation",
    );
    expect(dispatch).toBeDefined();
    const schema = dispatch!.inputSchema as any;
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties).sort()).toEqual([
      "clientId",
      "confirmDispatch",
      "idempotencyKey",
      "invitationId",
      "requestedMode",
    ]);
    expect(schema.required).toEqual([
      "invitationId",
      "requestedMode",
      "confirmDispatch",
      "idempotencyKey",
    ]);
    expect(schema.properties.confirmDispatch.const).toBe(true);
    expect(schema.properties.requestedMode.enum).toEqual(["dry_run", "live"]);
  });

  it("rejects viewer dispatch before coverage or any dispatch side effect can run", async () => {
    const buildLiveCoverage = vi.fn();
    const resolveTarget = vi.fn().mockResolvedValue({
      ok: true,
      target: {
        clientId: "client-1",
        clientName: "Test Client",
        ownerUserId: "owner-1",
        accessLevel: "viewer",
      },
    });
    const runtime = new ApollosClientMcpRuntime(
      buildLiveCoverage as any,
      vi.fn() as any,
      resolveTarget as any,
    );

    await expect(runtime.execute({
      context: { userId: "viewer-1", actorReference: "test" },
      toolName: "apollos_dispatch_approved_referral_invitation",
      arguments: {
        clientId: "client-1",
        invitationId: "11111111-1111-4111-8111-111111111111",
        requestedMode: "live",
        confirmDispatch: true,
        idempotencyKey: "pilot:test-0001",
      },
    })).rejects.toThrow("APOLLOS_MCP_CLIENT_WRITE_UNAUTHORIZED");
    expect(resolveTarget).toHaveBeenCalledTimes(1);
    expect(buildLiveCoverage).not.toHaveBeenCalled();
  });

  it("rejects extra destination or message fields before resolving a tenant", async () => {
    const resolveTarget = vi.fn();
    const runtime = new ApollosClientMcpRuntime(
      vi.fn() as any,
      vi.fn() as any,
      resolveTarget as any,
    );

    await expect(runtime.execute({
      context: { userId: "operator-1", actorReference: "test" },
      toolName: "apollos_dispatch_approved_referral_invitation",
      arguments: {
        invitationId: "11111111-1111-4111-8111-111111111111",
        requestedMode: "live",
        confirmDispatch: true,
        idempotencyKey: "pilot:test-0002",
        destination: "+12515550101",
      },
    })).rejects.toThrow("APOLLOS_MCP_ARGUMENTS_INVALID");
    expect(resolveTarget).not.toHaveBeenCalled();
  });
});

describe("Apollos Referral pilot implementation safety", () => {
  it("preserves canonical delivery approval, consent, allowlist, rate, duplicate, and idempotency gates", () => {
    expect(dispatchSource).toContain("evaluateReferralDeliveryGate");
    expect(dispatchSource).toContain('invitation.status !== "approved"');
    expect(dispatchSource).toContain('invitation.contactStatus !== "opted_in"');
    expect(dispatchSource).toContain("config.hourlyLimit");
    expect(dispatchSource).toContain("requested_mode = 'live'");
    expect(dispatchSource).toContain("idempotency_key = $2");
    expect(dispatchSource).toContain("pg_advisory_xact_lock");
    expect(dispatchSource).toContain("dispatchReferralDelivery");
  });

  it("keeps readiness non-PII and local GorillaDesk inspection read-only", () => {
    expect(statusSource).toContain("COUNT(*)::int");
    expect(statusSource).toContain("FROM gorilladesk_customers WHERE project_id = $1");
    expect(statusSource).toContain("externalCalls: false");
    expect(statusSource).toContain("sideEffects: false");
    expect(statusSource).not.toContain("referred_phone");
    expect(statusSource).not.toContain("referred_email");
    expect(statusSource).not.toContain("external_id");
  });

  it("selects at most ten opaque invitations only when approval and consent are still valid", () => {
    expect(statusSource).toContain("SELECT ri.id");
    expect(statusSource).toContain("LIMIT 10");
    expect(statusSource).toContain("ri.status = 'approved'");
    expect(statusSource).toContain("ri.delivery_state = 'not_dispatched'");
    expect(statusSource).toContain("ri.consent_source IS NOT NULL");
    expect(statusSource).toContain("ri.consent_at IS NOT NULL");
    expect(statusSource).toContain("rcp.status = 'opted_in'");
    expect(statusSource).toContain("rcp.consent_source IS NOT NULL");
    expect(statusSource).toContain("rcp.consent_at IS NOT NULL");
    expect(statusSource).toContain("rda.requested_mode = 'live'");
    expect(statusSource).toContain("rda.status IN ('dispatching', 'delivered')");
    expect(statusSource).toContain("eligibleInvitationIds");
    expect(statusSource).not.toContain("recipientName:");
    expect(statusSource).not.toContain("recipientDestination:");
    expect(statusSource).not.toContain("initialMessage:");
  });
});
