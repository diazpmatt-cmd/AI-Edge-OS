import { describe, expect, it } from "vitest";

import {
  applyBacklinkInventoryScan,
  canonicalizeObservedBacklink,
  summarizeObservedBacklinks,
  type BacklinkInventoryScan,
  type ObservedBacklinkIdentity,
  type ObservedBacklinkState,
} from "./observed-backlink-lifecycle";

const CLIENT_A = "client-a";
const CLIENT_B = "client-b";

function link(
  sourceUrl = "https://Example.com/resources/local-pest-control/",
  sourceDomain = "example.com",
  targetUrl = "https://client.example.com/services/pest-control/",
): ObservedBacklinkIdentity {
  return { sourceUrl, sourceDomain, targetUrl };
}

function scan(
  runId: string,
  completedAt: string,
  links: readonly ObservedBacklinkIdentity[],
  overrides: Partial<BacklinkInventoryScan> = {},
): BacklinkInventoryScan {
  return {
    clientId: CLIENT_A,
    runId,
    providerId: "provider-a",
    providerRevision: "v1",
    status: "succeeded",
    completeness: "complete",
    completedAt,
    links,
    ...overrides,
  };
}

function firstObserved(): ObservedBacklinkState {
  return applyBacklinkInventoryScan(
    [],
    scan("run-1", "2026-08-13T10:00:00Z", [link()]),
  ).states[0]!;
}

describe("observed backlink lifecycle", () => {
  it("canonicalizes stable identity inputs", () => {
    expect(canonicalizeObservedBacklink(link(
      "HTTPS://EXAMPLE.COM:443/resources/local-pest-control/#section",
      "WWW.EXAMPLE.COM.",
      "https://CLIENT.EXAMPLE.COM/services/pest-control/?b=2&a=1#top",
    ))).toEqual({
      sourceUrl: "https://example.com/resources/local-pest-control",
      sourceDomain: "example.com",
      targetUrl: "https://client.example.com/services/pest-control?a=1&b=2",
    });
  });

  it("creates a new active link on first successful observation", () => {
    const result = applyBacklinkInventoryScan(
      [],
      scan("run-1", "2026-08-13T10:00:00Z", [link()]),
    );

    expect(result.transitions.map((entry) => entry.type)).toEqual(["new"]);
    expect(result.states[0]).toMatchObject({
      clientId: CLIENT_A,
      status: "active",
      firstSeenRunId: "run-1",
      lastSeenRunId: "run-1",
      consecutiveSuccessfulMisses: 0,
    });
    expect(result.metrics).toMatchObject({ activeBacklinkCount: 1, newCount: 1, lostCount: 0 });
  });

  it("does not advance missing state on a failed provider run", () => {
    const existing = firstObserved();
    const result = applyBacklinkInventoryScan(
      [existing],
      scan("run-2", "2026-08-13T11:00:00Z", [], { status: "failed" }),
    );

    expect(result.states).toEqual([existing]);
    expect(result.transitions).toEqual([]);
    expect(result.absenceEvaluationApplied).toBe(false);
  });

  it("records positive observations from an incomplete scan without penalizing absent links", () => {
    const existing = firstObserved();
    const second = link(
      "https://directory.example.org/listing/client",
      "directory.example.org",
      "https://client.example.com/",
    );
    const result = applyBacklinkInventoryScan(
      [existing],
      scan("run-2", "2026-08-13T11:00:00Z", [second], { completeness: "incomplete" }),
    );

    expect(result.states).toHaveLength(2);
    expect(result.states.find((state) => state.sourceDomain === "example.com")?.consecutiveSuccessfulMisses).toBe(0);
    expect(result.transitions.map((entry) => entry.type)).toEqual(["new"]);
    expect(result.absenceEvaluationApplied).toBe(false);
  });

  it("marks one complete-scan absence as possibly missing, not lost", () => {
    const existing = firstObserved();
    const result = applyBacklinkInventoryScan(
      [existing],
      scan("run-2", "2026-08-13T11:00:00Z", []),
    );

    expect(result.states[0]).toMatchObject({ status: "active", consecutiveSuccessfulMisses: 1 });
    expect(result.transitions.map((entry) => entry.type)).toEqual(["possibly_missing"]);
    expect(result.metrics.lostCount).toBe(0);
  });

  it("confirms loss only after two consecutive successful complete misses", () => {
    const afterFirstMiss = applyBacklinkInventoryScan(
      [firstObserved()],
      scan("run-2", "2026-08-13T11:00:00Z", []),
    );
    const result = applyBacklinkInventoryScan(
      afterFirstMiss.states,
      scan("run-3", "2026-08-13T12:00:00Z", []),
    );

    expect(result.states[0]).toMatchObject({
      status: "lost",
      consecutiveSuccessfulMisses: 2,
      lastLostRunId: "run-3",
    });
    expect(result.transitions.map((entry) => entry.type)).toEqual(["lost"]);
    expect(result.metrics.lostCount).toBe(1);
  });

  it("restores a lost link without rewriting original first-seen history", () => {
    const first = firstObserved();
    const missOne = applyBacklinkInventoryScan([first], scan("run-2", "2026-08-13T11:00:00Z", [])).states;
    const lost = applyBacklinkInventoryScan(missOne, scan("run-3", "2026-08-13T12:00:00Z", [])).states;
    const result = applyBacklinkInventoryScan(
      lost,
      scan("run-4", "2026-08-13T13:00:00Z", [link()]),
    );

    expect(result.states[0]).toMatchObject({
      status: "active",
      firstSeenRunId: "run-1",
      lastSeenRunId: "run-4",
      lastLostRunId: "run-3",
      reacquiredCount: 1,
      consecutiveSuccessfulMisses: 0,
    });
    expect(result.transitions.map((entry) => entry.type)).toEqual(["restored"]);
    expect(result.metrics.restoredCount).toBe(1);
  });

  it("is idempotent when the same complete run is replayed", () => {
    const afterMiss = applyBacklinkInventoryScan(
      [firstObserved()],
      scan("run-2", "2026-08-13T11:00:00Z", []),
    );
    const replay = applyBacklinkInventoryScan(
      afterMiss.states,
      scan("run-2", "2026-08-13T11:00:00Z", []),
    );

    expect(replay.states).toEqual(afterMiss.states);
    expect(replay.transitions).toEqual([]);
    expect(replay.metrics.lostCount).toBe(0);
  });

  it("fails closed on cross-tenant state", () => {
    const foreign = { ...firstObserved(), clientId: CLIENT_B };
    expect(() => applyBacklinkInventoryScan(
      [foreign],
      scan("run-2", "2026-08-13T11:00:00Z", []),
    )).toThrow("tenant_mismatch");
  });

  it("fails closed on out-of-order scans", () => {
    const evaluated = applyBacklinkInventoryScan(
      [firstObserved()],
      scan("run-2", "2026-08-13T12:00:00Z", []),
    ).states;

    expect(() => applyBacklinkInventoryScan(
      evaluated,
      scan("run-old", "2026-08-13T11:00:00Z", [link()]),
    )).toThrow("out_of_order_scan");
  });

  it("counts distinct active referring domains", () => {
    const second = link(
      "https://example.com/second-resource",
      "example.com",
      "https://client.example.com/second",
    );
    const third = link(
      "https://other.example.net/resource",
      "other.example.net",
      "https://client.example.com/",
    );
    const result = applyBacklinkInventoryScan(
      [],
      scan("run-1", "2026-08-13T10:00:00Z", [link(), second, third]),
    );

    expect(summarizeObservedBacklinks(result.states).referringDomainCount).toBe(2);
  });
});
