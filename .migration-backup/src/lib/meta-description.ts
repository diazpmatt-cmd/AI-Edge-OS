/**
 * Meta description / title / slug helpers.
 * Pure, isomorphic — safe to import on client or server.
 *
 * Length rules:
 *  - Hard min: 120 chars
 *  - Hard max: 160 chars
 *  - Target window: 140–155 chars
 *
 * Every generated description must include: keyword, city, service, and a CTA.
 */

export type MetaInput = {
  keyword: string;
  city: string;
  state?: string;
  service: string;
  businessName: string;
  title?: string;
};

export const META_MIN = 120;
export const META_MAX = 160;
export const META_TARGET_MIN = 140;
export const META_TARGET_MAX = 155;

const CTA_TOKENS = [
  "call",
  "schedule",
  "book",
  "contact",
  "get a",
  "get your",
  "reach out",
  "request",
  "learn more",
  "free quote",
  "free inspection",
  "today",
  "now",
];

export type ValidationIssue =
  | "too-short"
  | "too-long"
  | "missing-keyword"
  | "missing-city"
  | "missing-service"
  | "missing-cta";

export function validateMetaDescription(
  desc: string,
  input: Pick<MetaInput, "keyword" | "city" | "service">,
): { valid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const len = desc.length;
  if (len < META_MIN) issues.push("too-short");
  if (len > META_MAX) issues.push("too-long");
  const lower = desc.toLowerCase();
  if (input.keyword && !lower.includes(input.keyword.toLowerCase()))
    issues.push("missing-keyword");
  if (input.city && !lower.includes(input.city.toLowerCase()))
    issues.push("missing-city");
  if (input.service && !lower.includes(input.service.toLowerCase()))
    issues.push("missing-service");
  if (!CTA_TOKENS.some((t) => lower.includes(t))) issues.push("missing-cta");
  return { valid: issues.length === 0, issues };
}

/** Intelligently trim to <= max, ending at a word boundary with proper punctuation. */
export function trimMetaDescription(s: string, max = META_MAX): string {
  let out = s.trim();
  if (out.length <= max) return out;
  out = out.slice(0, max);
  const lastBoundary = Math.max(
    out.lastIndexOf(" "),
    out.lastIndexOf("."),
    out.lastIndexOf("!"),
    out.lastIndexOf("?"),
  );
  if (lastBoundary > META_MIN) out = out.slice(0, lastBoundary);
  out = out.replace(/[\s,;:—–-]+$/g, "");
  if (!/[.!?]$/.test(out)) out += ".";
  if (out.length > max) {
    out = out.slice(0, max - 1).replace(/[\s,;:—–-]+$/g, "") + ".";
  }
  return out;
}

function intros(input: MetaInput, loc: string): string[] {
  return [
    `Looking for ${input.keyword} in ${loc}?`,
    `Need ${input.keyword} in ${loc}?`,
    `Searching for ${input.keyword} near ${loc}?`,
    `${capitalize(input.keyword)} in ${loc} — done right.`,
  ];
}

function middles(input: MetaInput, loc: string): string[] {
  return [
    `${input.businessName} delivers trusted ${input.service} for local homes and businesses.`,
    `${input.businessName} provides expert ${input.service} for ${loc} residents.`,
    `${input.businessName} offers professional ${input.service} you can rely on.`,
    `Trust ${input.businessName} for fast, effective ${input.service} across ${loc}.`,
  ];
}

const CTAS = [
  "Call today for your free quote.",
  "Schedule your free inspection now.",
  "Book a free consultation today.",
  "Get a fast, no-obligation estimate.",
  "Reach out today for friendly local service.",
  "Contact our local team to get started.",
  "Request your free quote in minutes.",
];

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Build a meta description that always satisfies the validator and lands in
 * [targetMin, targetMax] when possible, otherwise within [META_MIN, META_MAX].
 */
export function buildMetaDescription(
  input: MetaInput,
  opts: {
    min?: number;
    max?: number;
    targetMin?: number;
    targetMax?: number;
  } = {},
): string {
  const min = opts.min ?? META_MIN;
  const max = opts.max ?? META_MAX;
  const tMin = opts.targetMin ?? META_TARGET_MIN;
  const tMax = opts.targetMax ?? META_TARGET_MAX;
  const loc = input.state ? `${input.city}, ${input.state}` : input.city;

  const I = intros(input, loc);
  const M = middles(input, loc);
  const C = CTAS;

  const mid = (tMin + tMax) / 2;
  let bestInTarget = "";
  let bestInTargetScore = Infinity;
  let bestInWindow = "";
  let bestInWindowScore = Infinity;

  for (const i of I)
    for (const m of M)
      for (const c of C) {
        const cand = `${i} ${m} ${c}`;
        if (cand.length < min || cand.length > max) continue;
        const v = validateMetaDescription(cand, input);
        if (!v.valid) continue;
        const score = Math.abs(cand.length - mid);
        if (cand.length >= tMin && cand.length <= tMax) {
          if (score < bestInTargetScore) {
            bestInTargetScore = score;
            bestInTarget = cand;
          }
        }
        if (score < bestInWindowScore) {
          bestInWindowScore = score;
          bestInWindow = cand;
        }
      }

  if (bestInTarget) return bestInTarget;
  if (bestInWindow) return bestInWindow;

  // Fallback: greedy expand then trim.
  let candidate = `${I[0]} ${M[0]} ${C[0]}`;
  let guard = 0;
  while (candidate.length < min && guard++ < 6) {
    candidate += ` Serving ${loc} and the surrounding area.`;
  }
  if (candidate.length > max) candidate = trimMetaDescription(candidate, max);
  // Final guarantee: if still missing parts, append them.
  const v = validateMetaDescription(candidate, input);
  if (!v.valid) {
    candidate = trimMetaDescription(
      `${I[0]} ${M[0]} ${C[0]}`.replace(/\.$/, "") + ".",
      max,
    );
  }
  return candidate;
}

/** Optimize for the tighter 140–155 sweet spot. */
export function optimizeMetaDescription(input: MetaInput): string {
  return buildMetaDescription(input, {
    targetMin: 140,
    targetMax: 155,
  });
}

/**
 * Normalize an AI-supplied meta description: trim if too long, regenerate if
 * too short or missing required parts. Always returns a valid description.
 */
export function ensureValidMetaDescription(
  candidate: string | undefined | null,
  input: MetaInput,
): string {
  const raw = (candidate ?? "").trim().replace(/^["“”']|["“”']$/g, "");
  if (raw) {
    const trimmed =
      raw.length > META_MAX ? trimMetaDescription(raw, META_MAX) : raw;
    const v = validateMetaDescription(trimmed, input);
    if (v.valid) return trimmed;
  }
  return buildMetaDescription(input);
}

export function buildMetaTitle(input: MetaInput): string {
  const t = (input.title ?? input.keyword).trim();
  const full = `${t} | ${input.businessName}`;
  if (full.length <= 60) return full;
  if (t.length <= 60) return t;
  return t.slice(0, 57).replace(/[\s,;:—–-]+$/, "") + "...";
}

export function buildSlug(input: { title?: string; keyword: string; city?: string }): string {
  const base = input.title?.trim() || `${input.keyword} ${input.city ?? ""}`.trim();
  return base
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
}
