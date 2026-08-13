import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import legacyGuard from "../routes/ai-visibility-legacy-guard.js";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(legacyGuard);

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

async function request(method: string, path: string) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : "{}",
  });
}

describe("AI Visibility legacy endpoint retirement guard", () => {
  const retiredCases: Array<[string, string]> = [
    ["GET", "/ai-visibility"],
    ["GET", "/ai-visibility/bed-bugs-and-beyond"],
    ["POST", "/ai-visibility/audit"],
    ["PUT", "/ai-visibility/legacy-audit-id"],
    ["POST", "/ai-visibility/generate-report"],
    ["POST", "/ai-visibility/download-pdf"],
    ["POST", "/ai-visibility/export-pdf"],
    ["POST", "/ai-visibility/email-report"],
  ];

  it.each(retiredCases)("retires %s %s", async (method, path) => {
    const response = await request(method, path);
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      error: "legacy_visibility_endpoint_retired",
    });
  });

  it.each([
    "/ai-visibility/read-model/bed-bugs-and-beyond",
    "/ai-visibility/read-model/bed-bugs-and-beyond/history",
    "/ai-visibility/query-scan/bed-bugs-and-beyond/latest",
    "/ai-visibility/query-scan/evidence/example-scan-id",
    "/ai-visibility/schedule/bed-bugs-and-beyond",
  ])("does not intercept live evidence route %s", async (path) => {
    const response = await request("GET", path);
    expect(response.status).toBe(404);
  });

  it("does not intercept the live query-scan mutation route", async () => {
    const response = await request(
      "POST",
      "/ai-visibility/query-scan/bed-bugs-and-beyond",
    );
    expect(response.status).toBe(404);
  });
});
