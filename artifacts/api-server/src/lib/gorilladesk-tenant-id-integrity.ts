export type ProviderIdOwner = {
  externalId: string | null;
  projectId: string;
};

export function classifyProviderIds(
  requestedIds: readonly string[],
  existingRows: readonly ProviderIdOwner[],
  projectId: string,
) {
  const requested = new Set(requestedIds);
  const owned = new Set<string>();
  const foreign = new Set<string>();

  for (const row of existingRows) {
    if (!row.externalId || !requested.has(row.externalId)) continue;
    if (row.projectId === projectId) owned.add(row.externalId);
    else foreign.add(row.externalId);
  }

  return { owned, foreign };
}
