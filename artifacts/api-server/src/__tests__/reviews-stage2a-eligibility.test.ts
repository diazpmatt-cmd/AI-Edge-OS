import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = resolve(process.cwd(), "src");
const repoRoot = resolve(process.cwd(), "../..");
const routeSource = readFileSync(resolve(apiRoot, "routes/reviews-safe.ts"), "utf8");
const pageSource = readFileSync(
  resolve(repoRoot, "ai-edge-solutions/src/pages/ReviewsEnginePage.tsx"),
  "utf8",
);

describe("Reviews Stage 2A zero-send eligibility", () => {
  it("derives candidates from the authenticated tenant slug and client id", () => {
    expect(routeSource).toContain("resolveClientActiveCheck");
    expect(routeSource).toContain("[tenant.slug, windowDays, tenant.clientId]");
    expect(routeSource).toContain("WHERE j.project_id = $1");
    expect(routeSource).toContain("WHERE e.client_id = $3");
  });

  it("requires completed jobs with stable job/customer identity", () => {
    expect(routeSource).toContain("j.status = 'completed'");
    expect(routeSource).toContain("j.completed_at IS NOT NULL");
    expect(routeSource).toContain("j.external_id IS NOT NULL");
    expect(routeSource).toContain("j.customer_id IS NOT NULL");
    expect(routeSource).toContain("j.amount_cents > 0");
  });

  it("requires matching tenant customer and collected paid transaction evidence", () => {
    expect(routeSource).toContain("c.external_id = j.customer_id");
    expect(routeSource).toContain("c.project_id = j.project_id");
    expect(routeSource).toContain("p.job_id = j.external_id");
    expect(routeSource).toContain("p.project_id = j.project_id");
    expect(routeSource).toContain("p.status = 'collected'");
    expect(routeSource).toContain("p.paid_at IS NOT NULL");
    expect(routeSource).toContain("HAVING COALESCE(SUM(p.amount_cents), 0) >= j.amount_cents");
  });

  it("excludes jobs with prior review request journey evidence", () => {
    expect(routeSource).toContain("customer_journey_events");
    expect(routeSource).toContain("canonical_record_type = 'gorilladesk_job'");
    expect(routeSource).toContain("review_request_sent");
    expect(routeSource).toContain("review_request_delivered");
    expect(routeSource).toContain("review_request_completed");
  });

  it("never exposes raw customer contact values in the eligibility response", () => {
    expect(routeSource).toContain("smsAvailable: row.has_phone");
    expect(routeSource).toContain("emailAvailable: row.has_email");
    expect(routeSource).not.toContain("phone: row.");
    expect(routeSource).not.toContain("email: row.");
  });

  it("fails closed until a verified review URL exists", () => {
    expect(routeSource).toContain('"verified_review_url_not_configured"');
    expect(routeSource).toContain("deliveryReady: false");
    expect(routeSource).toContain("deliveryReadyCount: 0");
    expect(routeSource).toContain('automationStatus: "not_activated"');
    expect(routeSource).not.toContain("sendSMS");
  });

  it("shows the evidence queue without adding a send action", () => {
    expect(pageSource).toContain('"Eligibility Queue"');
    expect(pageSource).toContain('apiFetch<ReviewEligibilityResponse>("/reviews/eligibility")');
    expect(pageSource).toContain("Ready to send");
    expect(pageSource).toContain("no message can be sent");
    expect(pageSource).not.toContain("Send Review Request");
    expect(pageSource).not.toContain("Send now");
  });
});
