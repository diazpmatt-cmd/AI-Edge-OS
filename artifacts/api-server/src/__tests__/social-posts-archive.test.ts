import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Condition =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "and"; conditions: Condition[] }
  | { kind: "isNull" | "isNotNull"; column: string };

const { columns, db } = vi.hoisted(() => ({
  columns: new Proxy({}, { get: (_target, property) => String(property) }),
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@workspace/db", () => ({ db }));
vi.mock("@workspace/db/schema", () => ({
  socialPostsTable: columns,
  socialConnectionsTable: {},
  imageAssetsTable: {},
  platformDeliveriesTable: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: unknown): Condition => ({ kind: "eq", column, value }),
  and: (...conditions: Condition[]): Condition => ({ kind: "and", conditions }),
  desc: (column: string) => column,
  isNull: (column: string): Condition => ({ kind: "isNull", column }),
  isNotNull: (column: string): Condition => ({ kind: "isNotNull", column }),
}));
vi.mock("@clerk/express", () => ({ getAuth: () => ({ userId: "user-1" }) }));
vi.mock("../lib/publishing-service", () => ({
  bootstrapPlatformDeliveries: vi.fn(() => Promise.resolve()),
  publishingService: { publishPost: vi.fn() },
}));
vi.mock("../lib/scheduler-secret", () => ({ SCHEDULER_SECRET: "" }));
vi.mock("../lib/objectStorage", () => ({ ObjectStorageService: class {} }));
vi.mock("../lib/google-token.js", () => ({ resolveGoogleToken: vi.fn() }));

import socialPostsRouter from "../routes/social-posts";

type Row = Record<string, unknown> & {
  id: string;
  userId: string;
  status: string;
  archivedAt: Date | null;
  archivedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const originalCreatedAt = new Date("2026-07-01T12:00:00.000Z");
const originalPublishedAt = new Date("2026-07-02T12:00:00.000Z");

function makePost(overrides: Partial<Row> = {}): Row {
  return {
    id: "post-1",
    userId: "user-1",
    clientName: "Bed Bugs & Beyond",
    platforms: "[\"facebook\",\"google\"]",
    imageData: null,
    caption: "Furniture-level bed bug treatment",
    ctaType: "call_now",
    ctaValue: "251-324-9090",
    scheduledAt: null,
    status: "published",
    publishedAt: originalPublishedAt,
    errorMessage: "google: provider warning retained",
    archivedAt: null,
    archivedBy: null,
    createdAt: originalCreatedAt,
    updatedAt: new Date("2026-07-03T12:00:00.000Z"),
    ...overrides,
  };
}

function matches(row: Row, condition: Condition): boolean {
  if (condition.kind === "and") return condition.conditions.every(part => matches(row, part));
  const value = row[condition.column];
  if (condition.kind === "eq") return value === condition.value;
  if (condition.kind === "isNull") return value === null || value === undefined;
  return value !== null && value !== undefined;
}

function promiseWithOrderBy<T>(value: T) {
  return Object.assign(Promise.resolve(value), { orderBy: vi.fn(() => Promise.resolve(value)) });
}

describe("Publishing Center archive API", () => {
  let rows: Row[];
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let baseUrl: string;

  beforeEach(async () => {
    rows = [
      makePost(),
      makePost({ id: "archived-1", archivedAt: new Date("2026-07-04T12:00:00.000Z"), archivedBy: "user-1" }),
      makePost({ id: "other-tenant", userId: "user-2" }),
    ];

    db.select.mockImplementation(() => ({
      from: () => ({
        where: (condition: Condition) => promiseWithOrderBy(rows.filter(row => matches(row, condition))),
      }),
    }));
    db.update.mockImplementation(() => ({
      set: (updates: Partial<Row>) => ({
        where: (condition: Condition) => ({
          returning: async () => {
            const matched = rows.filter(row => matches(row, condition));
            matched.forEach(row => Object.assign(row, updates));
            return matched;
          },
        }),
      }),
    }));

    const app = express();
    app.use(express.json());
    app.use(socialPostsRouter);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    vi.clearAllMocks();
  });

  it("excludes archived and cross-tenant posts from the default active list", async () => {
    const response = await fetch(`${baseUrl}/social-posts`);
    expect(response.status).toBe(200);
    const body = await response.json() as Array<{ id: string }>;
    expect(body.map(post => post.id)).toEqual(["post-1"]);
  });

  it("returns only tenant-owned archived posts in the archived view", async () => {
    const response = await fetch(`${baseUrl}/social-posts?view=archived`);
    expect(response.status).toBe(200);
    const body = await response.json() as Array<{ id: string }>;
    expect(body.map(post => post.id)).toEqual(["archived-1"]);
  });

  it("archives without deleting or changing status, timestamps, results, warnings, or history fields", async () => {
    const response = await fetch(`${baseUrl}/social-posts/post-1/archive`, { method: "POST" });
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(rows).toHaveLength(3);
    expect(body).toMatchObject({
      id: "post-1",
      status: "published",
      publishedAt: originalPublishedAt.toISOString(),
      errorMessage: "google: provider warning retained",
      archivedBy: "user-1",
    });
    expect(body.archivedAt).toEqual(expect.any(String));
    expect(body.createdAt).toBe(originalCreatedAt.toISOString());
    expect(body.platforms).toEqual(["facebook", "google"]);
  });

  it("restores an archived post without changing its publishing history", async () => {
    const response = await fetch(`${baseUrl}/social-posts/archived-1/restore`, { method: "POST" });
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      id: "archived-1",
      status: "published",
      publishedAt: originalPublishedAt.toISOString(),
      errorMessage: "google: provider warning retained",
      archivedAt: null,
      archivedBy: null,
    });
  });

  it("fails closed for pending-delivery states and cross-tenant post IDs", async () => {
    rows.push(makePost({ id: "scheduled-1", status: "scheduled" }));
    const scheduled = await fetch(`${baseUrl}/social-posts/scheduled-1/archive`, { method: "POST" });
    expect(scheduled.status).toBe(409);
    expect(rows.find(row => row.id === "scheduled-1")?.archivedAt).toBeNull();

    const crossTenant = await fetch(`${baseUrl}/social-posts/other-tenant/archive`, { method: "POST" });
    expect(crossTenant.status).toBe(404);
    expect(rows.find(row => row.id === "other-tenant")?.archivedAt).toBeNull();
  });
});
