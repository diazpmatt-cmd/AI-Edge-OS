import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../routes/referrals.ts", import.meta.url), "utf8");
const compact = source.replace(/\s+/g, " ");

function routeSection(start: string, end: string): string {
  const startIndex = compact.indexOf(start);
  const endIndex = compact.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Unable to locate route section: ${start}`);
  return compact.slice(startIndex, endIndex);
}

describe("Referral Growth tenant-safety contract", () => {
  const createReferral = routeSection(
    'router.post("/referrals",',
    'router.patch("/referrals/:id",',
  );

  it("requires Clerk authentication and resolves the canonical client", () => {
    expect(source).toContain("const { userId } = getAuth(req)");
    expect(source).toContain("resolveClientContentContextFromDb(userId)");
    expect(source).toContain("return { userId, clientId: resolved.client.id }");
  });

  it("looks up a supplied program by both program ID and authenticated client ID", () => {
    expect(createReferral).toContain("eq(referralProgramsTable.id, Number(programId))");
    expect(createReferral).toContain("eq(referralProgramsTable.clientId, auth.clientId)");
  });

  it("fails closed when the supplied program is not owned by the authenticated client", () => {
    expect(createReferral).toContain('if (!prog.length)');
    expect(createReferral).toContain('res.status(404).json({ error: "Program not found" })');
    expect(createReferral.indexOf('if (!prog.length)')).toBeLessThan(
      createReferral.indexOf("db .insert(referralsTable)"),
    );
  });

  it("persists every referral under the authenticated client ID", () => {
    expect(createReferral).toContain("clientId: auth.clientId");
  });

  it("increments program usage only for the authenticated client", () => {
    expect(createReferral).toContain(
      "UPDATE referral_programs SET uses_count = uses_count + 1 WHERE id = $1 AND client_id = $2",
    );
    expect(createReferral).toContain("[Number(programId), auth.clientId]");
  });

  it("keeps referral status updates tenant-scoped", () => {
    const updateReferral = compact.slice(compact.indexOf('router.patch("/referrals/:id",'));
    expect(updateReferral).toContain("eq(referralsTable.id, id)");
    expect(updateReferral).toContain("eq(referralsTable.clientId, auth.clientId)");
  });

  it("keeps program status updates tenant-scoped", () => {
    const updateProgram = routeSection(
      'router.patch("/referrals/programs/:id",',
      'router.get("/referrals",',
    );
    expect(updateProgram).toContain("eq(referralProgramsTable.id, id)");
    expect(updateProgram).toContain("eq(referralProgramsTable.clientId, auth.clientId)");
  });
});

describe("Referral Growth production-data contract", () => {
  it("does not execute a demo-data bootstrap", () => {
    expect(source).not.toContain("seedDemoData(");
  });

  it("contains no fabricated demo referral identities or 555 phone numbers", () => {
    expect(source).not.toContain("Sandra M.");
    expect(source).not.toContain("Sunrise Realty");
    expect(source).not.toMatch(/\d{3}-555-\d{4}/);
  });

  it("creates empty idempotent tables without inserting customer records", () => {
    const bootstrap = compact.slice(0, compact.indexOf("async function resolveClient"));
    expect(bootstrap).toContain("CREATE TABLE IF NOT EXISTS referral_programs");
    expect(bootstrap).toContain("CREATE TABLE IF NOT EXISTS referrals");
    expect(bootstrap).not.toContain("INSERT INTO referral_programs");
    expect(bootstrap).not.toContain("INSERT INTO referrals");
  });
});

describe("Referral Growth public-attribution route contract", () => {
  const publicSubmission = routeSection(
    'router.post("/referrals/public/:code",',
    'router.get("/referrals/stats",',
  );

  it("derives client ownership from the locked referral program", () => {
    expect(publicSubmission).toContain('client_id AS "clientId"');
    expect(publicSubmission).toContain("program.clientId");
    expect(publicSubmission).not.toContain("req.body.clientId");
    expect(publicSubmission).toContain("JOIN clients c ON c.id::text = rp.client_id");
    expect(publicSubmission).toContain("AND c.is_active = TRUE");
  });

  it("serializes capacity checks and referral creation in one transaction", () => {
    expect(publicSubmission).toContain('client.query("BEGIN")');
    expect(publicSubmission).toContain("FOR UPDATE");
    expect(publicSubmission).toContain("getPublicProgramAvailability(program)");
    expect(publicSubmission).toContain('client.query("COMMIT")');
    expect(publicSubmission).toContain('client.query("ROLLBACK")');
  });

  it("stores link attribution and the exact referral code", () => {
    expect(publicSubmission).toContain("'pending', $9, 'link', $10, $11");
    expect(publicSubmission).toContain("code, submission.notes");
  });

  it("increments usage only for the program's canonical client", () => {
    expect(publicSubmission).toContain("WHERE id = $1 AND client_id = $2");
    expect(publicSubmission).toContain("[program.id, program.clientId]");
  });

  it("checks for duplicate referred contacts before insertion", () => {
    expect(publicSubmission).toContain("LOWER(referred_email) = $2");
    expect(publicSubmission).toContain("REGEXP_REPLACE(COALESCE(referred_phone, ''),");
    expect(publicSubmission.indexOf("referral_already_submitted")).toBeLessThan(
      publicSubmission.indexOf("INSERT INTO referrals"),
    );
  });

  it("rate-limits public submissions before parsing or database work", () => {
    expect(publicSubmission).toContain("referralSubmissionRateLimiter.check");
    expect(publicSubmission).toContain('res.status(429).json({ error: "rate_limit_exceeded"');
    expect(publicSubmission.indexOf("referralSubmissionRateLimiter.check")).toBeLessThan(
      publicSubmission.indexOf("publicReferralSubmissionSchema.safeParse"),
    );
    expect(publicSubmission.indexOf("referralSubmissionRateLimiter.check")).toBeLessThan(
      publicSubmission.indexOf("pool.connect()"),
    );
  });
});
