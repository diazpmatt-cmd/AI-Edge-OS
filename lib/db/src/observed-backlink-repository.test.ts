import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  InMemoryObservedBacklinkRepository,
  deriveBacklinkInventoryFingerprint,
  deriveBacklinkInventoryRunRecordId,
  deriveObservedBacklinkRecordId,
} from "./observed-backlink-repository";
import type { BacklinkInventoryScan } from "./observed-backlink-lifecycle";

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT_A = "client-a";
const CLIENT_B = "client-b";

function link(source = "https://Example.com/listing/client/", domain = "example.com") {
  return { sourceUrl: source, sourceDomain: domain, targetUrl: "https://client.example.com/services/pest-control/" };
}

function scan(
  runId: string,
  completedAt: string,
  links: BacklinkInventoryScan["links"],
  overrides: Partial<BacklinkInventoryScan> = {},
): BacklinkInventoryScan {
  return {
    clientId: CLIENT_A,
    runId,
    providerId: "inventory-provider",
    providerRevision: "v1",
    status: "succeeded",
    completeness: "complete",
    completedAt,
    links,
    ...overrides,
  };
}

describe("observed backlink persistence contract", () => {
  it("derives deterministic IDs and fingerprints from canonical input", () => {
    const first = scan("run-1", "2026-08-14T10:00:00Z", [link()]);
    const equivalent = scan("run-1", "2026-08-14T10:00:00.000Z", [
      link("https://example.com/listing/client", "WWW.EXAMPLE.COM."),
      link("https://example.com/listing/client/", "example.com"),
    ]);

    expect(deriveBacklinkInventoryFingerprint(first)).toBe(deriveBacklinkInventoryFingerprint(equivalent));
    expect(deriveBacklinkInventoryRunRecordId(CLIENT_A, "run-1")).toBe(deriveBacklinkInventoryRunRecordId(CLIENT_A, "run-1"));
    expect(deriveBacklinkInventoryRunRecordId(CLIENT_A, "run-1")).not.toBe(deriveBacklinkInventoryRunRecordId(CLIENT_B, "run-1"));
    expect(deriveObservedBacklinkRecordId(CLIENT_A, link())).not.toBe(deriveObservedBacklinkRecordId(CLIENT_B, link()));
  });

  it("persists first observation and replays the exact run idempotently", async () => {
    const repo = new InMemoryObservedBacklinkRepository();
    const input = scan("run-1", "2026-08-14T10:00:00Z", [link()]);

    const first = await repo.applyInventoryScan(input);
    const replay = await repo.applyInventoryScan(input);

    expect(first.outcome).toBe("applied");
    expect(replay.outcome).toBe("replayed");
    expect(replay.receipt).toEqual(first.receipt);
    expect(first.receipt.metrics).toMatchObject({ activeBacklinkCount: 1, referringDomainCount: 1, newCount: 1, lostCount: 0 });
    expect(await repo.listStates(CLIENT_A)).toHaveLength(1);
    expect((await repo.listTransitions(CLIENT_A)).filter(entry => entry.type === "new")).toHaveLength(1);
  });

  it("rejects conflicting reuse of the same tenant/run ID", async () => {
    const repo = new InMemoryObservedBacklinkRepository();
    await repo.applyInventoryScan(scan("run-1", "2026-08-14T10:00:00Z", [link()]));

    await expect(repo.applyInventoryScan(scan("run-1", "2026-08-14T10:00:00Z", [
      link("https://different.example.org/client", "different.example.org"),
    ]))).rejects.toThrow("inventory_run_conflict");
  });

  it("persists failed scans without advancing absence or lifecycle state", async () => {
    const repo = new InMemoryObservedBacklinkRepository();
    await repo.applyInventoryScan(scan("run-1", "2026-08-14T10:00:00Z", [link()]));
    const failed = await repo.applyInventoryScan(scan("run-2", "2026-08-14T11:00:00Z", [], { status: "failed" }));

    expect(failed.receipt.absenceEvaluationApplied).toBe(false);
    expect(failed.receipt.observedCount).toBe(0);
    expect(failed.transitions).toEqual([]);
    expect((await repo.listStates(CLIENT_A))[0]).toMatchObject({ status: "active", consecutiveSuccessfulMisses: 0 });
  });

  it("records incomplete positives but never treats omitted links as misses", async () => {
    const repo = new InMemoryObservedBacklinkRepository();
    await repo.applyInventoryScan(scan("run-1", "2026-08-14T10:00:00Z", [link()]));
    const second = link("https://directory.example.org/client", "directory.example.org");
    const result = await repo.applyInventoryScan(scan("run-2", "2026-08-14T11:00:00Z", [second], { completeness: "incomplete" }));

    expect(result.receipt.absenceEvaluationApplied).toBe(false);
    expect(await repo.listStates(CLIENT_A)).toHaveLength(2);
    expect((await repo.listStates(CLIENT_A)).find(state => state.sourceDomain === "example.com")?.consecutiveSuccessfulMisses).toBe(0);
  });

  it("confirms loss only on the second successful complete miss and preserves the transition", async () => {
    const repo = new InMemoryObservedBacklinkRepository();
    await repo.applyInventoryScan(scan("run-1", "2026-08-14T10:00:00Z", [link()]));
    const firstMiss = await repo.applyInventoryScan(scan("run-2", "2026-08-14T11:00:00Z", []));
    const secondMiss = await repo.applyInventoryScan(scan("run-3", "2026-08-14T12:00:00Z", []));

    expect(firstMiss.receipt.metrics.lostCount).toBe(0);
    expect(firstMiss.transitions.map(entry => entry.type)).toEqual(["possibly_missing"]);
    expect(secondMiss.receipt.metrics.lostCount).toBe(1);
    expect(secondMiss.transitions.map(entry => entry.type)).toEqual(["lost"]);
    expect((await repo.listStates(CLIENT_A))[0]).toMatchObject({ status: "lost", consecutiveSuccessfulMisses: 2, lastLostRunId: "run-3" });
  });

  it("restores a lost backlink while preserving original first-seen provenance", async () => {
    const repo = new InMemoryObservedBacklinkRepository();
    await repo.applyInventoryScan(scan("run-1", "2026-08-14T10:00:00Z", [link()]));
    await repo.applyInventoryScan(scan("run-2", "2026-08-14T11:00:00Z", []));
    await repo.applyInventoryScan(scan("run-3", "2026-08-14T12:00:00Z", []));
    const restored = await repo.applyInventoryScan(scan("run-4", "2026-08-14T13:00:00Z", [link()]));

    expect(restored.receipt.metrics.restoredCount).toBe(1);
    expect(restored.transitions.map(entry => entry.type)).toEqual(["restored"]);
    expect((await repo.listStates(CLIENT_A))[0]).toMatchObject({ status: "active", firstSeenRunId: "run-1", lastSeenRunId: "run-4", lastLostRunId: "run-3", reacquiredCount: 1 });
  });

  it("keeps tenant inventories and transition histories isolated", async () => {
    const repo = new InMemoryObservedBacklinkRepository();
    await repo.applyInventoryScan(scan("run-a", "2026-08-14T10:00:00Z", [link()]));
    await repo.applyInventoryScan(scan("run-b", "2026-08-14T10:00:00Z", [link()], { clientId: CLIENT_B }));

    expect(await repo.listStates(CLIENT_A)).toHaveLength(1);
    expect(await repo.listStates(CLIENT_B)).toHaveLength(1);
    expect((await repo.listTransitions(CLIENT_A)).every(entry => entry.clientId === CLIENT_A)).toBe(true);
    expect((await repo.listTransitions(CLIENT_B)).every(entry => entry.clientId === CLIENT_B)).toBe(true);
  });

  it("counts distinct active referring domains truthfully", async () => {
    const repo = new InMemoryObservedBacklinkRepository();
    const sameDomainSecondPage = {
      sourceUrl: "https://example.com/another/client",
      sourceDomain: "example.com",
      targetUrl: "https://client.example.com/",
    };
    const otherDomain = {
      sourceUrl: "https://directory.example.org/client",
      sourceDomain: "directory.example.org",
      targetUrl: "https://client.example.com/",
    };
    const result = await repo.applyInventoryScan(scan("run-1", "2026-08-14T10:00:00Z", [link(), sameDomainSecondPage, otherDomain]));

    expect(result.receipt.metrics.activeBacklinkCount).toBe(3);
    expect(result.receipt.metrics.referringDomainCount).toBe(2);
  });
});

describe("observed backlink migration contract", () => {
  it("is additive and aligned with the three Measurement-owned tables", () => {
    const migration = readFileSync(resolve(here, "../migrations/0012_observed_backlink_lifecycle.sql"), "utf8");
    const schemaSource = readFileSync(resolve(here, "schema/observed-backlinks.ts"), "utf8");

    for (const table of ["backlink_inventory_runs", "observed_backlinks", "observed_backlink_transitions"]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(schemaSource).toContain(`pgTable(\"${table}\"`);
    }
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE)\b/i);
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+(backlink_evidence|backlink_opportunities|backlink_ingestion_runs)/i);
    expect(migration).toContain("status = 'failed' AND absence_evaluation_applied = FALSE");
    expect(migration).toContain("completeness = 'complete' AND absence_evaluation_applied = TRUE");
  });
});
