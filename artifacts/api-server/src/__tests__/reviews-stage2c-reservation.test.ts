import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReviewRequestPreview } from "../routes/reviews-reservations.js";

const apiRoot = resolve(process.cwd(), "src");
const reservationSource = readFileSync(
  resolve(apiRoot, "routes/reviews-reservations.ts"),
  "utf8",
);
const eligibilitySource = readFileSync(
  resolve(apiRoot, "routes/reviews-safe.ts"),
  "utf8",
);
const configurationRouteSource = readFileSync(
  resolve(apiRoot, "routes/reviews-configuration.ts"),
  "utf8",
);
const routeIndexSource = readFileSync(
  resolve(apiRoot, "routes/index.ts"),
  "utf8",
);

describe("Reviews Stage 2C atomic reservation preview", () => {
  it("builds tenant-branded preview copy from explicit inputs", () => {
    const preview = buildReviewRequestPreview({
      customerName: "Jane Customer",
      businessName: "Lakeside Plumbing",
      reviewUrl: "https://g.page/r/example/review",
    });

    expect(preview).toContain("Hi Jane!");
    expect(preview).toContain("Lakeside Plumbing");
    expect(preview).toContain("https://g.page/r/example/review");
    expect(preview).not.toContain("Bed Bugs & Beyond");
  });

  it("requires explicit owner confirmation before configuration can become verified", () => {
    expect(configurationRouteSource).toContain("const ownerConfirmed = req.body?.ownerConfirmed");
    expect(configurationRouteSource).toContain("if (ownerConfirmed !== true)");
    expect(configurationRouteSource).toContain('error: "owner_confirmation_required"');
    expect(configurationRouteSource).toContain("Explicit owner confirmation is required");
  });

  it("requires owner-confirmed review configuration before reservation", () => {
    expect(reservationSource).toContain("getReviewRequestConfiguration(tenant.slug)");
    expect(reservationSource).toContain('configuration.status !== "owner_confirmed"');
    expect(reservationSource).toContain('error: "verified_review_url_not_configured"');
  });

  it("uses a transaction-scoped advisory lock per tenant and job", () => {
    expect(reservationSource).toContain('await client.query("BEGIN")');
    expect(reservationSource).toContain("pg_advisory_xact_lock(hashtextextended($1, 0))");
    expect(reservationSource).toContain("`${tenant.clientId}:review_request:${jobExternalId}`");
    expect(reservationSource).toContain('await client.query("COMMIT")');
    expect(reservationSource).toContain('await client.query("ROLLBACK")');
  });

  it("rechecks permanent delivery evidence and active reservations under the lock", () => {
    expect(reservationSource).toContain("review_request_reserved");
    expect(reservationSource).toContain("review_request_sent");
    expect(reservationSource).toContain("review_request_delivered");
    expect(reservationSource).toContain("review_request_completed");
    expect(reservationSource).toContain("RESERVATION_MINUTES = 15");
    expect(reservationSource).toContain("review_request_already_reserved_or_processed");
  });

  it("re-proves same-tenant completed and paid-in-full job evidence", () => {
    expect(reservationSource).toContain("WHERE j.project_id = $1");
    expect(reservationSource).toContain("j.external_id = $2");
    expect(reservationSource).toContain("j.status = 'completed'");
    expect(reservationSource).toContain("c.project_id = j.project_id");
    expect(reservationSource).toContain("p.project_id = j.project_id");
    expect(reservationSource).toContain("p.status = 'collected'");
    expect(reservationSource).toContain("HAVING COALESCE(SUM(p.amount_cents), 0) >= j.amount_cents");
  });

  it("writes only an internal reservation journey event", () => {
    expect(reservationSource).toContain("INSERT INTO customer_journey_events");
    expect(reservationSource).toContain("'review_request_reserved'");
    expect(reservationSource).toContain("'review_request_engine'");
    expect(reservationSource).toContain("'gorilladesk_job'");
    expect(reservationSource).toContain("reservationExpiresAt");
  });

  it("never sends externally and never exposes raw contact values", () => {
    expect(reservationSource).not.toContain("sendSMS");
    expect(reservationSource).not.toContain("telnyx");
    expect(reservationSource).not.toContain("nodemailer");
    expect(reservationSource).not.toContain("transporter.sendMail");
    expect(reservationSource).not.toContain("phone: job.");
    expect(reservationSource).not.toContain("email: job.");
    expect(reservationSource).toContain("deliveryReady: false");
    expect(reservationSource).toContain('sendPathStatus: "not_accepted"');
  });

  it("removes active reservations from the eligibility queue but lets leases expire", () => {
    expect(eligibilitySource).toContain("ACTIVE_RESERVATION_MINUTES = 15");
    expect(eligibilitySource).toContain("e.event_type = 'review_request_reserved'");
    expect(eligibilitySource).toContain("e.occurred_at >= NOW() - ($4::int * INTERVAL '1 minute')");
    expect(eligibilitySource).toContain("noActiveReservation: true");
  });

  it("mounts the reservation route ahead of the legacy Reviews router", () => {
    const reservationIndex = routeIndexSource.indexOf("router.use(reviewsReservationsRouter)");
    const legacyIndex = routeIndexSource.indexOf("router.use(reviewsRouter)");
    expect(reservationIndex).toBeGreaterThan(-1);
    expect(legacyIndex).toBeGreaterThan(-1);
    expect(reservationIndex).toBeLessThan(legacyIndex);
  });
});
