import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../pages/AssessmentsInboxPage.tsx", import.meta.url), "utf8");

describe("Assessments Inbox persistence truth", () => {
  it("does not present failed status or notes mutations as saved", () => {
    expect(source).toContain('setMutationError("Update was not saved. Please retry.")');
    expect(source).toContain("if (updated) setSelected(prev => prev ? { ...prev, ...updated } : prev);");
    expect(source).toContain("if (updated) {");
    expect(source).not.toContain("await patchLead(selected.id, { status });\n    setSelected(prev => prev ? { ...prev, status } : prev);");
    expect(source).not.toContain("await patchLead(selected.id, { notes: notesDraft });\n    setSelected(prev => prev ? { ...prev, notes: notesDraft } : prev);");
  });

  it("keeps note editing available when the persistence call fails", () => {
    expect(source).toContain("setEditingNotes(false);");
    const saveNotesBlock = source.slice(source.indexOf("async function saveNotes"), source.indexOf("function openDetail"));
    expect(saveNotesBlock).toContain("if (updated) {");
    expect(saveNotesBlock).toContain("setEditingNotes(false);");
    expect(saveNotesBlock.indexOf("setEditingNotes(false);")).toBeGreaterThan(saveNotesBlock.indexOf("if (updated) {"));
  });
});
