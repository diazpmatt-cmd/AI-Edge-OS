import express from "express";
import type { Server } from "node:http";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "operator-1" as string | null,
  poolQuery: vi.fn(async () => ({ rows: [] })),
  insertedValues: null as Record<string, unknown> | null,
  lastWhere: null as any,
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: mocks.userId }),
}));

vi.mock("@workspace/db", () => ({
  pool: { query: mocks.poolQuery },
  db: {
    select: (...args: unknown[]) => mocks.select(...args),
    insert: (...args: unknown[]) => mocks.insert(...args),
    update: (...args: unknown[]) => mocks.update(...args),
    delete: (...args: unknown[]) => mocks.delete(...args),
  },
}));

import onboardingRouter from "../routes/client-onboarding.js";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(onboardingRouter);

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  mocks.userId = "operator-1";
  mocks.insertedValues = null;
  mocks.lastWhere = null;
  mocks.select.mockReset();
  mocks.insert.mockReset();
  mocks.update.mockReset();
  mocks.delete.mockReset();
});

async function request(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("Client Onboarding operator ownership", () => {
  it("bootstraps the ownership column and partial index idempotently", () => {
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
    const sql = String(mocks.poolQuery.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS created_by_user_id TEXT");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS client_onboarding_created_by_user_id_idx");
  });

  it("rejects unauthenticated staging access before touching the database", async () => {
    mocks.userId = null;
    const response = await request("GET", "/client-onboarding");
    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("server-stamps the authenticated operator and ignores caller ownership/status", async () => {
    mocks.insert.mockImplementation(() => ({
      values: (values: Record<string, unknown>) => {
        mocks.insertedValues = values;
        return {
          returning: async () => [{ id: "draft-1", ...values }],
        };
      },
    }));

    const response = await request("POST", "/client-onboarding", {
      businessName: "Second Client Test",
      createdByUserId: "attacker-controlled",
      status: "active",
      modulesEnabled: ["lead_recovery"],
    });

    expect(response.status).toBe(201);
    expect(mocks.insertedValues).toMatchObject({
      createdByUserId: "operator-1",
      businessName: "Second Client Test",
      status: "draft",
      modulesEnabled: JSON.stringify(["lead_recovery"]),
    });
  });

  it("scopes list SQL to the authenticated operator", async () => {
    mocks.select.mockImplementation(() => ({
      from: () => ({
        where: (predicate: unknown) => {
          mocks.lastWhere = predicate;
          return { orderBy: async () => [] };
        },
      }),
    }));

    const response = await request("GET", "/client-onboarding");
    expect(response.status).toBe(200);

    const query = new PgDialect().sqlToQuery(mocks.lastWhere);
    expect(query.sql).toContain("created_by_user_id");
    expect(query.params).toContain("operator-1");
  });

  it("keeps canonical provisioning disabled with no database write", async () => {
    const response = await request("POST", "/client-onboarding/draft-1/deploy", {});
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "CLIENT_PROVISIONING_NOT_ACCEPTED",
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
