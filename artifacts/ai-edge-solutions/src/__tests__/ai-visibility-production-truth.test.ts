import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "src/pages/AIVisibilityEnginePage.tsx"),
  "utf8",
);

describe("AI Visibility production truth surface", () => {
  it("does not ship the legacy hard-coded demo audit or static readiness scores", () => {
    expect(pageSource).not.toContain("const DEMO");
    expect(pageSource).not.toContain("AUTHORITY_ITEMS");
    expect(pageSource).not.toContain("AI_READINESS");
    expect(pageSource).not.toContain("overallScore: 34");
    expect(pageSource).not.toContain("competitorGapScore: 27");
  });

  it("does not silently replace failed production evidence with demo data", () => {
    expect(pageSource).not.toContain("setAudit(DEMO)");
    expect(pageSource).toContain("No demo data has been substituted");
    expect(pageSource).toContain("No demo scan has been substituted");
  });

  it("centers the canonical evidence-backed surfaces", () => {
    expect(pageSource).toContain("AiVisibilityReadModelView");
    expect(pageSource).toContain("AiVisibilityQueryEvidencePanel");
    expect(pageSource).toContain("AiVisibilityHistoryPanel");
    expect(pageSource).toContain("/ai-visibility/read-model/${clientId}");
    expect(pageSource).toContain("/ai-visibility/query-scan/${clientId}");
  });

  it("does not expose legacy fake report generation from the production page", () => {
    expect(pageSource).not.toContain("generate-report");
    expect(pageSource).not.toContain("download-pdf");
    expect(pageSource).not.toContain("email-report");
  });
});
