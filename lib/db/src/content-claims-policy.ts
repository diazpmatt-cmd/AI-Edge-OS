export const PROHIBITED_CONTENT_CLAIMS = [
  "guaranteed results", "bed bug free", "certified clean", "same-day elimination", "same-week elimination",
  "whole-home heat treatment", "termite treatment", "wildlife removal",
] as const;

export interface ContentClaimsDecision { allowed: boolean; violations: string[]; }
const normalize = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, " ").trim();
export function evaluateContentClaims(text: string, additionalProhibited: readonly string[] = []): ContentClaimsDecision {
  const searchable = normalize(text);
  const violations = [...PROHIBITED_CONTENT_CLAIMS, ...additionalProhibited]
    .filter((claim, index, values) => values.indexOf(claim) === index)
    .filter(claim => searchable.includes(normalize(claim)));
  return { allowed: violations.length === 0, violations };
}
export function assertContentClaimsAllowed(text: string, additionalProhibited: readonly string[] = []): void {
  const decision = evaluateContentClaims(text, additionalProhibited);
  if (!decision.allowed) throw new Error(`Content blocked by claims policy: ${decision.violations.join(", ")}`);
}
