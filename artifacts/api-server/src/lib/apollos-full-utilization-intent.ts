import type { ApollosAuthorizedClient } from "./apollos-client-access.js";

export function isApollosFullUtilizationCommand(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;

  return (
    /\bfull[ -]?utili[sz]ation\b/.test(normalized) ||
    /\b(use|using|utili[sz]e|utili[sz]ing|take advantage of)\b.{0,80}\b(everything|every tool|all (?:the )?(?:tools|capabilities|features))\b/.test(normalized) ||
    /\b(make sure|ensure)\b.{0,120}\b(everything|every tool|all (?:the )?(?:tools|capabilities|features)|every platform)\b/.test(normalized) ||
    /\bmake sure\b.{0,120}\b(getting|gets?|is)\b.{0,60}\brecognized\b.{0,80}\b(every|all)\b.{0,30}\bplatform/.test(normalized)
  );
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function matchAuthorizedClientFromMessage(
  message: string,
  clients: readonly ApollosAuthorizedClient[],
): ApollosAuthorizedClient | null {
  const normalizedMessage = ` ${normalizeName(message)} `;
  const matches = clients.filter((client) => {
    const names = [client.clientName, client.slug]
      .map(normalizeName)
      .filter((value) => value.length >= 3);
    return names.some((name) => normalizedMessage.includes(` ${name} `));
  });

  if (matches.length === 1) return matches[0]!;
  return null;
}
