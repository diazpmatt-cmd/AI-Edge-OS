export type PlatformAction = "generate" | "approve" | "queue" | "publish";
export type ReadinessState = "idle" | "ready" | "go" | "attention" | "failed";

export interface ActionReadinessEvidence {
  platform: string;
  action: PlatformAction;
  connected: boolean;
  configured: boolean;
  mediaReady?: boolean;
  approved?: boolean;
  failed?: boolean;
  observedAt: string;
  expiresAt?: string | null;
}

export interface ActionReadiness {
  state: ReadinessState;
  allowed: boolean;
  reasons: string[];
}

export function resolveActionReadiness(evidence: ActionReadinessEvidence, now = new Date()): ActionReadiness {
  if (evidence.failed) return { state: "failed", allowed: false, reasons: ["The last platform action failed."] };
  if (!Number.isFinite(Date.parse(evidence.observedAt))) return { state: "attention", allowed: false, reasons: ["Readiness evidence is invalid."] };
  if (evidence.expiresAt && Date.parse(evidence.expiresAt) <= now.getTime()) return { state: "attention", allowed: false, reasons: ["Readiness evidence has expired."] };
  const reasons: string[] = [];
  if (!evidence.connected) reasons.push("Platform is not connected.");
  if (!evidence.configured) reasons.push("Platform setup is incomplete.");
  if ((evidence.action === "queue" || evidence.action === "publish") && evidence.mediaReady === false) reasons.push("Required media is not ready.");
  if (evidence.action === "publish" && !evidence.approved) reasons.push("Human approval is required.");
  if (reasons.length) return { state: evidence.connected ? "attention" : "idle", allowed: false, reasons };
  return { state: evidence.action === "publish" ? "go" : "ready", allowed: true, reasons: [] };
}
