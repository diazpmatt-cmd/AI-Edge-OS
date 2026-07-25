/**
 * C9R-4: Pure mention detection and citation extraction.
 * No side-effects, no external dependencies.
 * All functions operate on plain strings and return serialisable value objects.
 */

import type {
  AiMentionType,
  AiQueryCitation,
  AiQueryCompetitorMention,
  AiQueryTenantContext,
} from "./ai-query-provider-types";

// ── Internal helpers ───────────────────────────────────────────────────────────

/** Normalise text to lower-case alphanumeric + spaces for fuzzy matching. */
function normalizeForDetection(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripProtocolAndWww(domain: string): string {
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

// ── Phone number normalisation ─────────────────────────────────────────────────

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Return common formatted variants for a 10-digit US phone number.
 * If the input starts with "1" and has 11 digits, strip the country code.
 */
function phoneVariants(raw: string): readonly string[] {
  let digits = digitsOnly(raw);
  if (digits.length === 11 && digits[0] === "1") digits = digits.slice(1);
  if (digits.length !== 10) return [raw];
  const area = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const line = digits.slice(6);
  return Object.freeze([
    `${area}-${prefix}-${line}`,
    `(${area}) ${prefix}-${line}`,
    `${area}.${prefix}.${line}`,
    digits,
  ]);
}

// ── Citation extraction ────────────────────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g;

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    const m = url.match(/https?:\/\/(?:www\.)?([^/\s]+)/);
    return m?.[1] ?? url;
  }
}

/**
 * Extract all HTTP/HTTPS URLs from an AI response text.
 * Returns unique citations in order of first appearance.
 */
export function extractCitations(responseText: string): readonly AiQueryCitation[] {
  const seen = new Set<string>();
  const citations: AiQueryCitation[] = [];

  for (const match of responseText.matchAll(new RegExp(URL_REGEX.source, "g"))) {
    const url = match[0];
    if (seen.has(url)) continue;
    seen.add(url);
    citations.push({
      url,
      domain: domainFromUrl(url),
      title: null,
      position: match.index ?? null,
    });
  }

  return Object.freeze(citations);
}

// ── Business mention detection ─────────────────────────────────────────────────

export interface BusinessMentionResult {
  mentioned: boolean;
  mentionType: AiMentionType;
  position: number | null;
}

/**
 * Detect whether the tenant's own business appears in an AI response.
 *
 * Priority order:
 * 1. Exact business name (case-insensitive substring)
 * 2. Normalised name (punctuation stripped, "&" → "and")
 * 3. Business domain (strip protocol + www)
 * 4. Business phone (any standard US format variant)
 *
 * Returns the first match found; stops at the highest-priority hit.
 */
export function detectBusinessMention(
  responseText: string,
  context: AiQueryTenantContext,
): BusinessMentionResult {
  const { businessName, businessDomain, businessPhone } = context;
  const textLower = responseText.toLowerCase();

  // 1. Exact name
  const exactLower = businessName.toLowerCase();
  const exactIdx = textLower.indexOf(exactLower);
  if (exactIdx !== -1) {
    return { mentioned: true, mentionType: "exact", position: exactIdx };
  }

  // 2. Normalised name
  const normName = normalizeForDetection(businessName);
  const normText = normalizeForDetection(responseText);
  const normIdx = normText.indexOf(normName);
  if (normIdx !== -1) {
    return { mentioned: true, mentionType: "normalized", position: normIdx };
  }

  // 3. Domain
  if (businessDomain) {
    const domainClean = stripProtocolAndWww(businessDomain);
    if (domainClean && textLower.includes(domainClean)) {
      return { mentioned: true, mentionType: "domain", position: textLower.indexOf(domainClean) };
    }
  }

  // 4. Phone
  if (businessPhone) {
    const variants = phoneVariants(businessPhone);
    for (const variant of variants) {
      const idx = responseText.indexOf(variant);
      if (idx !== -1) {
        return { mentioned: true, mentionType: "phone", position: idx };
      }
    }
  }

  return { mentioned: false, mentionType: "none", position: null };
}

// ── Competitor mention detection ───────────────────────────────────────────────

/**
 * Detect which competitors appear in an AI response text.
 * Checks exact name, normalised name, and domain for each competitor.
 * Returns one entry per competitor detected (first match wins per competitor).
 */
export function detectCompetitorMentions(
  responseText: string,
  context: AiQueryTenantContext,
): readonly AiQueryCompetitorMention[] {
  const textLower = responseText.toLowerCase();
  const normText = normalizeForDetection(responseText);
  const mentions: AiQueryCompetitorMention[] = [];

  for (const competitor of context.competitors) {
    // Exact name
    const exactLower = competitor.name.toLowerCase();
    const exactIdx = textLower.indexOf(exactLower);
    if (exactIdx !== -1) {
      mentions.push({ name: competitor.name, domain: competitor.domain, mentionType: "exact", position: exactIdx });
      continue;
    }

    // Normalised name
    const normName = normalizeForDetection(competitor.name);
    if (normName) {
      const normIdx = normText.indexOf(normName);
      if (normIdx !== -1) {
        mentions.push({ name: competitor.name, domain: competitor.domain, mentionType: "normalized", position: normIdx });
        continue;
      }
    }

    // Domain
    if (competitor.domain) {
      const domainClean = stripProtocolAndWww(competitor.domain);
      if (domainClean && textLower.includes(domainClean)) {
        mentions.push({
          name: competitor.name,
          domain: competitor.domain,
          mentionType: "domain",
          position: textLower.indexOf(domainClean),
        });
      }
    }
  }

  return Object.freeze(mentions);
}
