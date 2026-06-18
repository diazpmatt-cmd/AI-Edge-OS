import { describe, expect, test } from "bun:test";
import {
  META_MAX,
  META_MIN,
  buildMetaDescription,
  buildMetaTitle,
  buildSlug,
  ensureValidMetaDescription,
  optimizeMetaDescription,
  trimMetaDescription,
  validateMetaDescription,
  type MetaInput,
} from "../src/lib/meta-description";

const INPUT: MetaInput = {
  keyword: "bed bug treatment",
  city: "Foley",
  state: "Alabama",
  service: "bed bug extermination",
  businessName: "Bed Bugs and Beyond",
  title: "Bed Bug Treatment in Foley: A Complete Guide",
};

describe("buildMetaDescription", () => {
  test("lands in the 120–160 window", () => {
    const out = buildMetaDescription(INPUT);
    expect(out.length).toBeGreaterThanOrEqual(META_MIN);
    expect(out.length).toBeLessThanOrEqual(META_MAX);
  });

  test("targets the 140–155 sweet spot when possible", () => {
    const out = buildMetaDescription(INPUT);
    expect(out.length).toBeGreaterThanOrEqual(140);
    expect(out.length).toBeLessThanOrEqual(155);
  });

  test("contains keyword, city, service, and a CTA", () => {
    const out = buildMetaDescription(INPUT);
    const v = validateMetaDescription(out, INPUT);
    expect(v.valid).toBe(true);
    expect(v.issues).toEqual([]);
  });

  test("works for a short input combination", () => {
    const small: MetaInput = {
      keyword: "pest control",
      city: "Foley",
      state: "AL",
      service: "pest control",
      businessName: "BB&B",
    };
    const out = buildMetaDescription(small);
    expect(out.length).toBeGreaterThanOrEqual(META_MIN);
    expect(out.length).toBeLessThanOrEqual(META_MAX);
    expect(validateMetaDescription(out, small).valid).toBe(true);
  });

  test("works for a long business name and service", () => {
    const big: MetaInput = {
      keyword: "comprehensive residential bed bug extermination services",
      city: "Foley",
      state: "Alabama",
      service: "full-service residential and commercial bed bug extermination",
      businessName: "Bed Bugs and Beyond Pest Control of Baldwin County",
    };
    const out = buildMetaDescription(big);
    expect(out.length).toBeLessThanOrEqual(META_MAX);
  });
});

describe("optimizeMetaDescription", () => {
  test("hits the 140–155 sweet spot", () => {
    const out = optimizeMetaDescription(INPUT);
    expect(out.length).toBeGreaterThanOrEqual(140);
    expect(out.length).toBeLessThanOrEqual(155);
    expect(validateMetaDescription(out, INPUT).valid).toBe(true);
  });
});

describe("trimMetaDescription", () => {
  test("trims over-length input to <= 160 at a word boundary", () => {
    const long =
      "Looking for bed bug treatment in Foley, Alabama? Bed Bugs and Beyond delivers trusted bed bug extermination for local homes and businesses across the entire Gulf Coast region of Alabama.";
    expect(long.length).toBeGreaterThan(META_MAX);
    const out = trimMetaDescription(long);
    expect(out.length).toBeLessThanOrEqual(META_MAX);
    expect(/[.!?]$/.test(out)).toBe(true);
  });

  test("leaves a valid-length description unchanged", () => {
    const ok = buildMetaDescription(INPUT);
    expect(trimMetaDescription(ok)).toBe(ok);
  });
});

describe("validateMetaDescription", () => {
  test("flags under-length descriptions", () => {
    const v = validateMetaDescription("Too short. Call today.", INPUT);
    expect(v.valid).toBe(false);
    expect(v.issues).toContain("too-short");
  });

  test("flags over-length descriptions", () => {
    const huge = "x".repeat(200) + " call today";
    const v = validateMetaDescription(huge, INPUT);
    expect(v.issues).toContain("too-long");
  });

  test("flags missing keyword", () => {
    const desc =
      "Looking for help in Foley, Alabama? Bed Bugs and Beyond delivers trusted bed bug extermination services. Call today for your free quote.";
    const v = validateMetaDescription(desc, INPUT);
    expect(v.issues).toContain("missing-keyword");
  });

  test("flags missing city", () => {
    const desc =
      "Looking for bed bug treatment? Bed Bugs and Beyond delivers trusted bed bug extermination for local homes and businesses. Call today.";
    const v = validateMetaDescription(desc, INPUT);
    expect(v.issues).toContain("missing-city");
  });

  test("flags missing service", () => {
    const desc =
      "Looking for bed bug treatment in Foley, Alabama? Bed Bugs and Beyond delivers trusted help for local homes and businesses. Call today now.";
    const v = validateMetaDescription(desc, INPUT);
    expect(v.issues).toContain("missing-service");
  });
});

describe("ensureValidMetaDescription", () => {
  test("regenerates when AI returns an under-length description", () => {
    const out = ensureValidMetaDescription("Too short.", INPUT);
    expect(out.length).toBeGreaterThanOrEqual(META_MIN);
    expect(validateMetaDescription(out, INPUT).valid).toBe(true);
  });

  test("regenerates when AI returns nothing", () => {
    const out = ensureValidMetaDescription("", INPUT);
    expect(out.length).toBeGreaterThanOrEqual(META_MIN);
    expect(validateMetaDescription(out, INPUT).valid).toBe(true);
  });

  test("trims when AI returns an over-length but otherwise-valid description", () => {
    const huge =
      "Looking for bed bug treatment in Foley, Alabama? Bed Bugs and Beyond delivers trusted bed bug extermination for local homes and businesses across the entire Gulf Coast region. Call today for your free quote and schedule your inspection now.";
    const out = ensureValidMetaDescription(huge, INPUT);
    expect(out.length).toBeLessThanOrEqual(META_MAX);
    expect(validateMetaDescription(out, INPUT).valid).toBe(true);
  });

  test("keeps a valid AI description verbatim", () => {
    const good = buildMetaDescription(INPUT);
    expect(ensureValidMetaDescription(good, INPUT)).toBe(good);
  });
});

describe("buildMetaTitle / buildSlug", () => {
  test("meta title stays under 60 chars when possible", () => {
    const t = buildMetaTitle(INPUT);
    expect(t.length).toBeLessThanOrEqual(60);
  });

  test("slug is URL-safe", () => {
    const s = buildSlug({ title: INPUT.title, keyword: INPUT.keyword, city: INPUT.city });
    expect(/^[a-z0-9-]+$/.test(s)).toBe(true);
  });
});
