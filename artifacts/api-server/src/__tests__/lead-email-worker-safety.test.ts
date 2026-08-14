import { describe, expect, it } from "vitest";

describe("marketplace Gmail worker source boundary", () => {
  it("is disabled by default and binds a canonical client before intake", async () => {
    const source = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("../lead-email-worker.ts", import.meta.url), "utf8"),
    );
    expect(source).toContain('process.env.LEAD_EMAIL_WORKER_ENABLED === "true"');
    expect(source).toContain("MARKETPLACE_EMAIL_CLIENT_ID");
    expect(source).toContain("SELECT client_name, is_active FROM clients WHERE id = $1 LIMIT 1");
    expect(source).toContain("intakeLead");
  });

  it("contains no Gmail or customer outbound mutation path", async () => {
    const source = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("../lead-email-worker.ts", import.meta.url), "utf8"),
    );
    for (const forbidden of ["messages.send", "messages.modify", "messages.delete", "messages.trash", "sendSms", "sendEmail", "telnyx"] ) {
      expect(source.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
