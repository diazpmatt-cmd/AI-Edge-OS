import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import onboardingGuard from "../routes/client-onboarding-legacy-guard.js";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(onboardingGuard);

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
    body: method === "GET" || method === "DELETE" ? undefined : "{}",
  });
}

describe("Client Onboarding legacy API retirement guard", () => {
  const retiredCases: Array<[string, string]> = [
    ["GET", "/client-onboarding"],
    ["POST", "/client-onboarding"],
    ["GET", "/client-onboarding/example-id"],
    ["PUT", "/client-onboarding/example-id"],
    ["DELETE", "/client-onboarding/example-id"],
    ["POST", "/client-onboarding/example-id/deploy"],
  ];

  it.each(retiredCases)("retires %s %s", async (method, path) => {
    const response = await request(method, path);
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      error: "legacy_client_onboarding_endpoint_retired",
    });
  });

  it("does not intercept neighboring routes", async () => {
    const response = await request("GET", "/client-onboarding-preview");
    expect(response.status).toBe(404);
  });
});
