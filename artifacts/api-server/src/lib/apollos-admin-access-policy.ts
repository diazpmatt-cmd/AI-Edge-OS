const MAX_ADMIN_IDS = 100;

export function parseApollosAdminUserIds(raw: string | undefined): readonly string[] {
  if (!raw?.trim()) return Object.freeze([]);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const userId = part.trim();
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    unique.push(userId);
    if (unique.length >= MAX_ADMIN_IDS) break;
  }
  return Object.freeze(unique);
}

export function isApollosAdminUser(
  userId: string | null | undefined,
  rawAdminUserIds: string | undefined = process.env.APOLLOS_ADMIN_USER_IDS,
): boolean {
  const actor = userId?.trim();
  if (!actor) return false;
  return parseApollosAdminUserIds(rawAdminUserIds).includes(actor);
}
