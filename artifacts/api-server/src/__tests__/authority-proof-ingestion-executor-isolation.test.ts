import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(here, "../app.ts"), "utf8");
const routesIndexSource = readFileSync(resolve(here, "../routes/index.ts"), "utf8");
const executorSource = readFileSync(resolve(here, "../lib/authority-proof-ingestion-executor.ts"), "utf8");

describe("Authority proof ingestion executor isolation", () => {
  it("is not mounted in the API app or shared route tree", () => {
    expect(appSource).not.toContain("authority-proof-ingestion-executor");
    expect(appSource).not.toContain("createAuthorityProofIngestionExecutor");
    expect(routesIndexSource).not.toContain("authority-proof-ingestion-executor");
    expect(routesIndexSource).not.toContain("createAuthorityProofIngestionExecutor");
  });

  it("has no route, scheduler, MCP registration, or credential lookup", () => {
    expect(executorSource).not.toMatch(/router\.(post|put|patch|delete|get)\(/);
    expect(executorSource).not.toContain("process.env");
    expect(executorSource).not.toContain("setInterval(");
    expect(executorSource).not.toContain("SCHEDULER_SECRET");
    expect(executorSource).not.toContain("registerTool");
  });

  it("reuses canonical ingestion and explicitly enables strict proof failures", () => {
    expect(executorSource).toContain("ingestBacklinks");
    expect(executorSource).toContain("buildAuthorityProofDataForSEOConfig");
    expect(executorSource).toContain("strictFailures: true");
    expect(executorSource).toContain("getIngestionRun(plan.runId, plan.clientId)");
  });
});
