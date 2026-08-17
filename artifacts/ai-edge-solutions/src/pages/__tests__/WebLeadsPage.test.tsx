import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/WebLeadsPage.tsx", "utf8");

describe("Web Leads production acceptance boundaries", () => {
  it("never renders a read failure as a confirmed zero-lead state", () => {
    expect(source).toContain("isError, refetch");
    expect(source).toContain("Web Leads could not be loaded.");
    expect(source).toContain("this is not a confirmed zero-lead state");
    expect(source).toContain('role="alert"');
    expect(source).toContain("Retry");
  });

  it("uses the company-sales mutation boundary and keeps note editing open until success", () => {
    expect(source).toContain("/leads/web/");
    expect(source).toContain("setEditingNotes(false);");
    const saveBlock = source.slice(source.indexOf("function saveNotes"), source.indexOf("return ("));
    expect(saveBlock).not.toContain("setEditingNotes(false)");
  });
});
