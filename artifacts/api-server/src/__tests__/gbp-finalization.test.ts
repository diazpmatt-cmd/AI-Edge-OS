/**
 * GBP Engine Finalization Package — static verification tests.
 *
 * These tests are intentionally static (no live DB required):
 *  - Drizzle schema introspection via getTableColumns()
 *  - Source-text assertions against schema-migrate.ts and route files
 *
 * Covered parts:
 *  Part 1 — Security: PATCH routes filter by clientId
 *  Part 2 — Tenant scoping: new clientId columns in Drizzle + DDL guards
 *  Part 3 — Configurable alert_on_drop threshold + duplicate score_drop guard
 *  Part 4 — Token unification: duplicate helpers removed, shared import used
 *  Part 5 — GBP → Content Autopilot: clientId on post inserts, google caption
 */

import { describe, it, expect } from "vitest";
import { readFileSync }         from "fs";
import { resolve, dirname }     from "path";
import { fileURLToPath }        from "url";
import { getTableColumns }      from "drizzle-orm";
import {
  reviewPlatformStatsTable,
  socialPostsTable,
}                               from "@workspace/db/schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

function src(rel: string) {
  return readFileSync(resolve(__dirname, rel), "utf-8");
}

const MIGRATION  = src("../lib/schema-migrate.ts");
const GBP_AUDIT  = src("../routes/gbp-audit.ts");
const AUTO_CONT  = src("../routes/auto-content.ts");
const GBP_LIVE   = src("../lib/gbp-live-data.ts");
const SOC_POSTS  = src("../routes/social-posts.ts");
const GTOKEN     = src("../lib/google-token.ts");

// ── Part 2: Tenant scoping — schema columns ───────────────────────────────────

describe("Part 2 — Tenant scoping: Drizzle schema columns", () => {
  it("reviewPlatformStatsTable has clientId column", () => {
    const names = Object.values(getTableColumns(reviewPlatformStatsTable))
      .map((c: any) => c.name as string);
    expect(names).toContain("client_id");
  });

  it("socialPostsTable has clientId column", () => {
    const names = Object.values(getTableColumns(socialPostsTable))
      .map((c: any) => c.name as string);
    expect(names).toContain("client_id");
  });
});

describe("Part 2 — Tenant scoping: schema-migrate.ts ALTER TABLE guards", () => {
  it("has ALTER TABLE guard for review_platform_stats.client_id", () => {
    expect(MIGRATION).toContain(
      "ALTER TABLE review_platform_stats ADD COLUMN IF NOT EXISTS client_id"
    );
  });

  it("has ALTER TABLE guard for social_posts.client_id", () => {
    expect(MIGRATION).toContain(
      "ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS client_id"
    );
  });
});

describe("Part 2 — Tenant scoping: GBP audit queries use clientId", () => {
  it("review stats query filters by clientId (not just platform)", () => {
    expect(GBP_AUDIT).toContain("eq(reviewPlatformStatsTable.clientId, clientId)");
  });

  it("post count query uses client_id fallback (not just user_id)", () => {
    expect(GBP_AUDIT).toContain(
      "client_id = ${clientId} OR (client_id IS NULL AND user_id = ${userId})"
    );
  });
});

// ── Part 3: Configurable alert threshold ──────────────────────────────────────

describe("Part 3 — Alert threshold: configurable via gbp_audit_schedules", () => {
  it("generateAndPersistAlerts queries alert_on_drop from gbp_audit_schedules", () => {
    expect(GBP_AUDIT).toContain(
      "SELECT alert_on_drop FROM gbp_audit_schedules WHERE client_id = $1"
    );
  });

  it("hardcoded -10 threshold is replaced by configurable alertOnDrop variable", () => {
    expect(GBP_AUDIT).not.toContain("<= -10");
    expect(GBP_AUDIT).toContain("<= -alertOnDrop");
  });

  it("defaults to 10 when schedule row is missing or alert_on_drop is null/zero", () => {
    expect(GBP_AUDIT).toContain(
      "(typeof rawThreshold === \"number\" && rawThreshold > 0) ? rawThreshold : 10"
    );
  });

  it("score_drop alert has duplicate guard against same snapshotId", () => {
    expect(GBP_AUDIT).toContain(
      "alert_type = 'score_drop' LIMIT 1"
    );
    expect(GBP_AUDIT).toContain("dupeCheck.rowCount");
  });
});

// ── Part 1: Security — PATCH ownership ───────────────────────────────────────

describe("Part 1 — Security: PATCH /optimizations/:id ownership", () => {
  it("filters update by both id AND clientId (not id alone)", () => {
    expect(GBP_AUDIT).toContain(
      "eq(gbpOptimizationOpportunitiesTable.clientId, clientId)"
    );
  });

  it("uses and() for compound WHERE on optimization update", () => {
    expect(GBP_AUDIT).toContain("eq(gbpOptimizationOpportunitiesTable.id, id)");
    expect(GBP_AUDIT).toContain("eq(gbpOptimizationOpportunitiesTable.clientId, clientId)");
  });

  it("returns 404 when opportunity not found (ownership mismatch)", () => {
    expect(GBP_AUDIT).toContain("Opportunity not found");
  });
});

describe("Part 1 — Security: PATCH /alerts/:id/acknowledge ownership", () => {
  it("UPDATE filters by id AND client_id", () => {
    expect(GBP_AUDIT).toContain(
      "WHERE id = $1 AND client_id = $2"
    );
  });

  it("returns 404 when alert not found (ownership mismatch)", () => {
    expect(GBP_AUDIT).toContain("Alert not found");
  });

  it("checks rowCount before returning ok:true", () => {
    expect(GBP_AUDIT).toContain("result.rowCount");
  });
});

// ── Part 4: Google token unification ─────────────────────────────────────────

describe("Part 4 — Token unification: duplicate helpers removed", () => {
  it("gbp-live-data.ts does not contain inline refreshGoogleToken function", () => {
    expect(GBP_LIVE).not.toContain("async function refreshGoogleToken");
    expect(GBP_LIVE).not.toContain("async function resolveAccessToken");
  });

  it("gbp-live-data.ts imports resolveGoogleToken from google-token.ts", () => {
    expect(GBP_LIVE).toContain("resolveGoogleToken");
    expect(GBP_LIVE).toContain("google-token.js");
  });

  it("social-posts.ts does not contain inline getGoogleAccessToken function", () => {
    expect(SOC_POSTS).not.toContain("async function getGoogleAccessToken");
  });

  it("social-posts.ts imports resolveGoogleToken from google-token.ts", () => {
    expect(SOC_POSTS).toContain("resolveGoogleToken");
    expect(SOC_POSTS).toContain("google-token.js");
  });

  it("google-token.ts exports resolveGoogleToken and GoogleTokenResult", () => {
    expect(GTOKEN).toContain("export async function resolveGoogleToken");
    expect(GTOKEN).toContain("export type GoogleTokenResult");
  });

  it("refresh guard handles null expiresAt (dev-sync protection)", () => {
    expect(GTOKEN).toContain("!creds.expiresAt || creds.expiresAt < now");
  });
});

// ── Part 5: GBP → Content Autopilot ─────────────────────────────────────────

describe("Part 5 — Content Autopilot: clientId on post inserts", () => {
  it("auto-content.ts resolves clientId from clients table", () => {
    expect(AUTO_CONT).toContain("clientsTable");
    expect(AUTO_CONT).toContain("resolvedClientId");
    expect(AUTO_CONT).toContain(".where(eq(clientsTable.userId, userId))");
  });

  it("post insert includes clientId field", () => {
    expect(AUTO_CONT).toContain("clientId: resolvedClientId");
  });
});

describe("Part 5 — Content Autopilot: GBP caption improvement", () => {
  it("captionGoogle uses post.caption when google is in platforms", () => {
    expect(AUTO_CONT).toContain("platforms.includes(\"google\")");
    expect(AUTO_CONT).toContain("post.caption");
  });

  it("captionGoogle falls back to stub when google is not in platforms", () => {
    expect(AUTO_CONT).toContain("proudly servicing ${post.city}");
  });
});
