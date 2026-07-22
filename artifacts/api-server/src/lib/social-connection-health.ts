export type SocialConnectionHealth = {
  statusLabel: "connected" | "needs_reauthorization";
  needsReauthorization: boolean;
};

export function deriveSocialConnectionHealth(metadataJson: string | null): SocialConnectionHealth {
  let metadata: Record<string, unknown> = {};
  try { metadata = metadataJson ? JSON.parse(metadataJson) : {}; } catch {}
  const needsReauthorization = metadata.needsReauthorization === true;
  return {
    statusLabel: needsReauthorization ? "needs_reauthorization" : "connected",
    needsReauthorization,
  };
}
