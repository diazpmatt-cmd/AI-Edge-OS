/**
 * Phase C2 — Tests F & G
 *
 * F. Signal normalization (correct field mapping, determinism)
 * G. Missing-data preservation (null volume/difficulty stays null — never fabricated)
 */

import { describe, it, expect } from "vitest";
import {
  normalizeText,
  deriveSignalId,
  inferGeographicScope,
  normalizeKeywordResult,
  normalizePAAResult,
  normalizeRedditResult,
  normalizeAIProbeResult,
} from "../../../../../lib/db/src/discovery-normalizer";
import type { RawKeywordResult } from "../../../../../lib/db/src/discovery-providers";

// ── Shared fixtures ────────────────────────────────────────────────────────────

const CLIENT_ID = "bbb-test-01";
const CREATED_AT = new Date("2026-07-12T10:00:00.000Z");

function makeRawKeyword(overrides: Partial<RawKeywordResult> = {}): RawKeywordResult {
  return {
    keyword:       "bed bug treatment Foley AL",
    volumeMonthly: 320,
    difficulty:    45,
    intent:        "local",
    cpc:           4.20,
    relatedQueries: ["bed bug exterminator Foley", "bed bug inspection near me"],
    providerRaw:   { source: "test" },
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// F. Signal normalization
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-F-1: normalizeText — text normalization rules", () => {
  it("lowercases the text", () => {
    expect(normalizeText("Bed Bug TREATMENT")).toBe("bed bug treatment");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeText("  bed bug inspection  ")).toBe("bed bug inspection");
  });

  it("removes special characters (punctuation)", () => {
    expect(normalizeText("pest control! #1 in Alabama?")).toBe("pest control 1 in alabama");
  });

  it("collapses multiple spaces to one", () => {
    expect(normalizeText("bed   bug   treatment")).toBe("bed bug treatment");
  });

  it("preserves hyphens", () => {
    expect(normalizeText("do-it-yourself pest control")).toBe("do-it-yourself pest control");
  });

  it("is deterministic: same input → same output", () => {
    const text = "Bed Bug Inspection Foley AL!";
    expect(normalizeText(text)).toBe(normalizeText(text));
  });

  it("handles empty string", () => {
    expect(normalizeText("")).toBe("");
  });
});

describe("T-C2-F-2: deriveSignalId — deterministic ID derivation", () => {
  it("produces a stable ID for (clientId, source, normalizedValue)", () => {
    const id1 = deriveSignalId("bbb-01", "test_fixture", "bed bug inspection foley al");
    const id2 = deriveSignalId("bbb-01", "test_fixture", "bed bug inspection foley al");
    expect(id1).toBe(id2);
  });

  it("different clientIds produce different IDs", () => {
    const id1 = deriveSignalId("bbb-01", "test_fixture", "bed bug inspection");
    const id2 = deriveSignalId("lakeside-01", "test_fixture", "bed bug inspection");
    expect(id1).not.toBe(id2);
  });

  it("different sources produce different IDs", () => {
    const id1 = deriveSignalId("bbb-01", "gpt_simulated", "bed bug inspection");
    const id2 = deriveSignalId("bbb-01", "dataforseo", "bed bug inspection");
    expect(id1).not.toBe(id2);
  });

  it("ID contains the clientId (tenant isolation embedded in ID)", () => {
    const id = deriveSignalId("bbb-test-01", "test_fixture", "test");
    expect(id).toContain("bbb-test-01");
  });

  it("ID contains 'sig::' prefix", () => {
    const id = deriveSignalId("bbb-01", "test_fixture", "test");
    expect(id.startsWith("sig::")).toBe(true);
  });
});

describe("T-C2-F-3: inferGeographicScope — local vs national", () => {
  it("'near me' keywords → local", () => {
    expect(inferGeographicScope("bed bug treatment near me")).toBe("local");
  });

  it("Foley reference → local", () => {
    expect(inferGeographicScope("pest control foley")).toBe("local");
  });

  it("general keyword → national", () => {
    expect(inferGeographicScope("how to get rid of bed bugs")).toBe("national");
  });

  it("'in al' → local", () => {
    expect(inferGeographicScope("pest control in al")).toBe("local");
  });

  it("generic commercial query → national", () => {
    expect(inferGeographicScope("best pest control company")).toBe("national");
  });
});

describe("T-C2-F-4: normalizeKeywordResult — field mapping", () => {
  it("maps signalType to 'keyword'", () => {
    const signal = normalizeKeywordResult({ raw: makeRawKeyword(), clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    expect(signal.signalType).toBe("keyword");
  });

  it("maps intent from raw.intent", () => {
    const signal = normalizeKeywordResult({ raw: makeRawKeyword({ intent: "commercial" }), clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    expect(signal.intent).toBe("commercial");
  });

  it("sets clientId from input", () => {
    const signal = normalizeKeywordResult({ raw: makeRawKeyword(), clientId: "bbb-test-01", source: "test_fixture", createdAt: CREATED_AT });
    expect(signal.clientId).toBe("bbb-test-01");
  });

  it("sets source from input", () => {
    const signal = normalizeKeywordResult({ raw: makeRawKeyword(), clientId: CLIENT_ID, source: "dataforseo", createdAt: CREATED_AT });
    expect(signal.source).toBe("dataforseo");
  });

  it("preserves rawValue as-is (pre-normalization text)", () => {
    const signal = normalizeKeywordResult({ raw: makeRawKeyword({ keyword: "Bed Bug Treatment Foley AL" }), clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    expect(signal.rawValue).toBe("Bed Bug Treatment Foley AL");
  });

  it("normalizedValue is lowercased and cleaned", () => {
    const signal = normalizeKeywordResult({ raw: makeRawKeyword({ keyword: "Bed Bug Treatment Foley AL!" }), clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    expect(signal.normalizedValue).toBe("bed bug treatment foley al");
  });

  it("ID is deterministic from (clientId + source + normalizedValue)", () => {
    const raw = makeRawKeyword({ keyword: "bed bug treatment foley al" });
    const sig1 = normalizeKeywordResult({ raw, clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    const sig2 = normalizeKeywordResult({ raw, clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    expect(sig1.id).toBe(sig2.id);
  });

  it("snapshotId defaults to 'pending'", () => {
    const signal = normalizeKeywordResult({ raw: makeRawKeyword(), clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    expect(signal.snapshotId).toBe("pending");
  });

  it("sets snapshotId from input when provided", () => {
    const signal = normalizeKeywordResult({ raw: makeRawKeyword(), clientId: CLIENT_ID, source: "test_fixture", snapshotId: "snap-001", createdAt: CREATED_AT });
    expect(signal.snapshotId).toBe("snap-001");
  });

  it("evidenceStrength for dataforseo is 90", () => {
    const signal = normalizeKeywordResult({ raw: makeRawKeyword(), clientId: CLIENT_ID, source: "dataforseo", createdAt: CREATED_AT });
    expect(signal.evidenceStrength).toBe(90);
  });

  it("evidenceStrength for gpt_simulated is 40", () => {
    const signal = normalizeKeywordResult({ raw: makeRawKeyword(), clientId: CLIENT_ID, source: "gpt_simulated", createdAt: CREATED_AT });
    expect(signal.evidenceStrength).toBe(40);
  });

  it("evidenceStrength for test_fixture is 50", () => {
    const signal = normalizeKeywordResult({ raw: makeRawKeyword(), clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    expect(signal.evidenceStrength).toBe(50);
  });
});

describe("T-C2-F-5: normalizePAAResult — field mapping", () => {
  it("sets signalType to 'paa'", () => {
    const signal = normalizePAAResult({
      raw: { question: "How do I know if I have bed bugs?", snippet: null, rank: 1, providerRaw: {} },
      clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT,
    });
    expect(signal.signalType).toBe("paa");
  });

  it("PAA intent is always 'informational'", () => {
    const signal = normalizePAAResult({
      raw: { question: "Buy bed bug treatment near me", snippet: null, rank: 1, providerRaw: {} },
      clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT,
    });
    expect(signal.intent).toBe("informational");
  });
});

describe("T-C2-F-6: normalizeRedditResult — field mapping", () => {
  it("sets signalType to 'reddit_thread'", () => {
    const signal = normalizeRedditResult({
      raw: {
        title: "Finally got rid of bed bugs after 3 months",
        body: null, score: 245, commentCount: 67,
        subreddit: "r/pestcontrol", url: "https://reddit.com/test",
        createdAt: new Date(), providerRaw: {},
      },
      clientId: CLIENT_ID, source: "reddit_api", createdAt: CREATED_AT,
    });
    expect(signal.signalType).toBe("reddit_thread");
    expect(signal.intent).toBe("informational");
  });
});

describe("T-C2-F-7: normalizeAIProbeResult — field mapping", () => {
  it("sets signalType to 'ai_citation'", () => {
    const signal = normalizeAIProbeResult({
      raw: { isCited: true, citationRank: 1, responseExcerpt: "...", competitorsCited: [], providerRaw: {} },
      clientId: CLIENT_ID, query: "best pest control Foley AL", platform: "chatgpt", createdAt: CREATED_AT,
    });
    expect(signal.signalType).toBe("ai_citation");
    expect(signal.source).toBe("llm_probe");
    expect(signal.citationFound).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// G. Missing-data preservation (null must never be fabricated)
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-G-1: volumeEstimate null preservation", () => {
  it("null volumeMonthly stays null after normalization", () => {
    const raw = makeRawKeyword({ volumeMonthly: null });
    const signal = normalizeKeywordResult({ raw, clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    expect(signal.volumeEstimate).toBeNull();
  });

  it("a real volume value is preserved", () => {
    const raw = makeRawKeyword({ volumeMonthly: 1500 });
    const signal = normalizeKeywordResult({ raw, clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    expect(signal.volumeEstimate).toBe(1500);
  });

  it("zero volume is preserved (not converted to null)", () => {
    const raw = makeRawKeyword({ volumeMonthly: 0 });
    const signal = normalizeKeywordResult({ raw, clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    expect(signal.volumeEstimate).toBe(0);
  });
});

describe("T-C2-G-2: difficultyScore null preservation", () => {
  it("null difficulty stays null after normalization", () => {
    const raw = makeRawKeyword({ difficulty: null });
    const signal = normalizeKeywordResult({ raw, clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    expect(signal.difficultyScore).toBeNull();
  });

  it("a real difficulty value is preserved", () => {
    const raw = makeRawKeyword({ difficulty: 62 });
    const signal = normalizeKeywordResult({ raw, clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    expect(signal.difficultyScore).toBe(62);
  });
});

describe("T-C2-G-3: PAA and Reddit signals have null volume by design", () => {
  it("PAA result always has null volumeEstimate", () => {
    const signal = normalizePAAResult({
      raw: { question: "How do bed bugs spread?", snippet: null, rank: 2, providerRaw: {} },
      clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT,
    });
    expect(signal.volumeEstimate).toBeNull();
  });

  it("Reddit result always has null volumeEstimate", () => {
    const signal = normalizeRedditResult({
      raw: {
        title: "Bed bugs in my apartment", body: null, score: 150, commentCount: 30,
        subreddit: "r/pestcontrol", url: "https://reddit.com/test",
        createdAt: new Date(), providerRaw: {},
      },
      clientId: CLIENT_ID, source: "reddit_api", createdAt: CREATED_AT,
    });
    expect(signal.volumeEstimate).toBeNull();
  });

  it("AI probe result always has null volumeEstimate", () => {
    const signal = normalizeAIProbeResult({
      raw: { isCited: false, citationRank: null, responseExcerpt: null, competitorsCited: [], providerRaw: {} },
      clientId: CLIENT_ID, query: "best pest control near me", platform: "gemini", createdAt: CREATED_AT,
    });
    expect(signal.volumeEstimate).toBeNull();
  });
});

describe("T-C2-G-4: rawProviderData preservation", () => {
  it("rawProviderData from provider is carried through unchanged", () => {
    const providerRaw = { someKey: "someValue", nestedObj: { a: 1 } };
    const raw = makeRawKeyword({ providerRaw });
    const signal = normalizeKeywordResult({ raw, clientId: CLIENT_ID, source: "test_fixture", createdAt: CREATED_AT });
    expect(signal.rawProviderData).toEqual(providerRaw);
  });
});
