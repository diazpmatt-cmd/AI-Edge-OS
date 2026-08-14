import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(here, "../app.ts"), "utf8");
const routesIndexSource = readFileSync(resolve(here, "../routes/index.ts"), "utf8");
const executionSource = readFileSync(resolve(here, "../lib/authority-proof-execution.ts"), "utf8");

describe("Authority proof execution isolation", () => {
  it("does not mount the execution core in the API app or shared route tree", () => {
    expect(appSource).not.toContain("authority-proof-execution");
    expect(appSource).not.toContain("executeAuthorityProofOnce");
    expect(routesIndexSource).not.toContain("authority-proof-execution");
    expect(routesIndexSource).not.toContain("executeAuthorityProofOnce");
  });

  it("does not contain a route, scheduler, MCP registration, or credential lookup", () => {
    expect(executionSource).not.toMatch(/router\.(post|put|patch|delete|get)\(/);
    expect(executionSource).not.toContain("setInterval(");
    expect(executionSource).not.toContain("setTimeout(");
    expect(executionSource).not.toContain("process.env");
    expect(executionSource).not.toContain("DataForSEOBacklinkAdapter");
    expect(executionSource).not.toContain("DrizzleBacklinkRepository");
  });

  it("keeps one explicit effect dependency behind spend and arm gates", () => {
    expect(executionSource.match(/executeIngestion\(/g)?.length).toBe(2);
    expect(executionSource).toContain("AUTHORITY_PROOF_SPEND_AUTHORIZATION_REQUIRED");
    expect(executionSource).toContain("validateAuthorityProofArm");
    expect(executionSource).toContain("buildAuthorityProofPreflightFromCurrentPricing");
  });
});
