import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {} }));

import { createLeadSendHandler } from "../routes/leads";

const clientId = "00000000-0000-4000-8000-000000000001";
const leadId = "00000000-0000-4000-8000-000000000999";

function makeResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn((code: number) => { response.statusCode = code; return response; }),
    json: vi.fn((body: unknown) => { response.body = body; return response; }),
  };
  return response;
}

const authenticated = vi.fn(() => ({ userId: "user_123" })) as any;
const resolveClient = vi.fn().mockResolvedValue({ found: true, client: { id: clientId } }) as any;

describe("Lead Intelligence tenant isolation", () => {
  it("returns 404 and never sends when the lead belongs to another tenant", async () => {
    const send = vi.fn();
    const denyOwnership = vi.fn().mockResolvedValue(false);
    const response = makeResponse();
    const handler = createLeadSendHandler(send as any, authenticated, resolveClient, denyOwnership);

    await handler({ params: { id: leadId } } as any, response);

    expect(denyOwnership).toHaveBeenCalledWith(clientId, leadId);
    expect(send).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: "lead_not_found" });
  });

  it("fails closed when canonical client resolution fails", async () => {
    const send = vi.fn();
    const unresolved = vi.fn().mockResolvedValue({ found: false, reason: "not_found" }) as any;
    const owns = vi.fn();
    const response = makeResponse();
    const handler = createLeadSendHandler(send as any, authenticated, unresolved, owns);

    await handler({ params: { id: leadId } } as any, response);

    expect(owns).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: "client_not_found" });
  });

  it("keeps local list and patch operations scoped by canonical clientId", () => {
    const source = readFileSync(new URL("../routes/leads.ts", import.meta.url), "utf8");
    expect(source).toContain("${leadsTable.clientId} = ${clientId}");
    expect(source).toContain("and(eq(leadsTable.id, req.params.id), eq(leadsTable.clientId, clientId))");
    expect(source).toContain("and(eq(leadsTable.id, leadId), eq(leadsTable.clientId, clientId))");
  });

  it("preserves the separate AI Edge corporate web-lead route", () => {
    const source = readFileSync(new URL("../routes/leads.ts", import.meta.url), "utf8");
    expect(source).toContain('router.get("/leads/web"');
    expect(source).toContain('${leadsTable.clientName} = ${"AI Edge Solutions"}');
    expect(source).toContain('${leadsTable.source} = ${"contact-form"}');
  });
});
