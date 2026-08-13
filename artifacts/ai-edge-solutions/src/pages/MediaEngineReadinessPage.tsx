import { useEffect, useMemo, useState } from "react";
import { useApiFetch } from "../lib/api";
import MediaEnginePage from "./MediaEnginePage";

type MediaCapability = "image" | "video" | "audio";

interface MediaProviderStatus {
  id: string;
  displayName: string;
  capabilities: MediaCapability[];
  ready: boolean;
  reason: string | null;
}

interface MediaReadinessResponse {
  checkedAt: string;
  clientId: string;
  executionStatus: "provider_ready" | "blocked";
  blocker: string | null;
  readiness: {
    status: "not_configured" | "partial" | "ready";
    generationAllowed: boolean;
    capabilities: Record<MediaCapability, boolean>;
    providers: MediaProviderStatus[];
  };
  safety: {
    generationEndpointExposed: false;
    demoProviderRegistered: false;
    paidGenerationExecuted: false;
  };
}

const CAPABILITIES: Array<{ id: MediaCapability; label: string; icon: string }> = [
  { id: "image", label: "Image", icon: "🖼️" },
  { id: "video", label: "Video", icon: "🎬" },
  { id: "audio", label: "Audio", icon: "🎙️" },
];

export default function MediaEngineReadinessPage() {
  const apiFetch = useApiFetch();
  const [data, setData] = useState<MediaReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReadiness() {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch<MediaReadinessResponse>("/media-generation/readiness");
        if (!cancelled) setData(response);
      } catch {
        if (!cancelled) {
          setData(null);
          setError("Provider readiness could not be verified. Generation remains blocked.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReadiness();
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  const status = useMemo(() => {
    if (loading) return { label: "Checking provider readiness…", tone: "#94A3B8", border: "rgba(148,163,184,0.28)" };
    if (error || !data) return { label: "Generation blocked — readiness unverified", tone: "#FCA5A5", border: "rgba(248,113,113,0.35)" };
    if (!data.readiness.generationAllowed) return { label: "Generation blocked — no provider configured", tone: "#FBBF24", border: "rgba(251,191,36,0.35)" };
    return { label: "Provider-backed generation available", tone: "#34D399", border: "rgba(52,211,153,0.35)" };
  }, [data, error, loading]);

  return (
    <div style={{ position: "relative" }}>
      <div
        data-testid="media-generation-readiness"
        style={{
          position: "fixed",
          top: 14,
          right: 18,
          zIndex: 80,
          width: "min(420px, calc(100vw - 36px))",
          padding: "12px 14px",
          borderRadius: 12,
          background: "rgba(3,6,18,0.96)",
          border: `1px solid ${status.border}`,
          boxShadow: "0 12px 36px rgba(0,0,0,0.42)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span aria-hidden="true">🛡️</span>
          <strong style={{ color: status.tone, fontSize: 12 }}>{status.label}</strong>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CAPABILITIES.map((capability) => {
            const ready = data?.readiness.capabilities?.[capability.id] === true;
            return (
              <span
                key={capability.id}
                data-testid={`media-capability-${capability.id}`}
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: ready ? "#34D399" : "#94A3B8",
                  border: `1px solid ${ready ? "rgba(52,211,153,0.28)" : "rgba(148,163,184,0.2)"}`,
                  background: ready ? "rgba(52,211,153,0.08)" : "rgba(148,163,184,0.06)",
                }}
              >
                {capability.icon} {capability.label}: {ready ? "Provider ready" : "Not configured"}
              </span>
            );
          })}
        </div>

        <div style={{ marginTop: 8, color: "#64748B", fontSize: 10.5, lineHeight: 1.45 }}>
          {error ??
            (data?.readiness.generationAllowed
              ? "Only capabilities backed by a verified server-side provider are available."
              : "The studio can build prompts and scene plans, but it cannot generate paid media until a real provider is configured and verified.")}
        </div>
      </div>

      <MediaEnginePage />
    </div>
  );
}
