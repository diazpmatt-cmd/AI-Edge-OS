import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiFetch } from "@/lib/api";

interface DiagnosticsHealthPost {
  id: string;
  status: string;
  platforms: string[];
  caption: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface DiagnosticsHealthResponse {
  recentPosts: DiagnosticsHealthPost[];
}

type LaneState = "verified_published" | "terminal_failure" | "receipt_missing" | "in_flight" | "missing_attempt";

interface PublishingLane {
  platform: string;
  deliveryId: string | null;
  state: LaneState;
  attemptNumber: number | null;
  status: string | null;
  receiptVerified: boolean;
  retryAllowed: boolean;
  diagnosticCode: string;
  message: string;
  updatedAt: string | null;
}

interface PublishingDiagnosticsResponse {
  postId: string;
  postStatus: string;
  postUpdatedAt: string | null;
  verificationRule: "external_post_id_or_url_required";
  summary: {
    total: number;
    verified: number;
    terminalFailures: number;
    receiptMissing: number;
    inFlight: number;
    missingAttempts: number;
    unresolved: number;
  };
  lanes: PublishingLane[];
}

interface PostDiagnosticResult {
  post: DiagnosticsHealthPost;
  diagnostics: PublishingDiagnosticsResponse | null;
  loadError: string | null;
}

interface RetryRequest {
  postId: string;
  deliveryId: string;
  platform: string;
}

interface RetryResponse {
  ok: boolean;
  postId: string;
  platform: string;
  retriedDeliveryId: string;
  delivery: {
    id: string;
    attemptNumber: number;
    status: string;
    externalPostId: string | null;
    externalPostUrl: string | null;
    errorMessage: string | null;
    apiResponseStatus: number | null;
  };
  post: {
    status: string;
    publishedAt: string | null;
    errorMessage: string | null;
  };
}

const STATE_STYLE: Record<LaneState, { label: string; color: string; icon: string; action: string }> = {
  verified_published: { label: "Verified", color: "#22C55E", icon: "✓", action: "No action" },
  terminal_failure: { label: "Failed", color: "#EF4444", icon: "✕", action: "Review failed lane only" },
  receipt_missing: { label: "Receipt missing", color: "#F59E0B", icon: "!", action: "Manual review required" },
  in_flight: { label: "In flight", color: "#00AEEF", icon: "…", action: "Wait for completion" },
  missing_attempt: { label: "Attempt missing", color: "#A78BFA", icon: "?", action: "Manual review required" },
};

function fmtTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function candidateStatus(status: string): boolean {
  return ["publishing", "published_with_warning", "failed"].includes(status);
}

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    google: "Google Business Profile",
    youtube: "YouTube",
    tiktok: "TikTok",
  };
  return labels[platform] ?? platform;
}

export function PublishingLaneDiagnosticsPanel() {
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<Record<string, { ok: boolean; message: string }>>({});

  const healthQuery = useQuery<DiagnosticsHealthResponse>({
    queryKey: ["publishing-lane-diagnostics-health"],
    queryFn: () => apiFetch<DiagnosticsHealthResponse>("/diagnostics/health"),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const candidates = useMemo(
    () => (healthQuery.data?.recentPosts ?? []).filter((post) => candidateStatus(post.status)).slice(0, 10),
    [healthQuery.data],
  );

  const diagnosticsQuery = useQuery<PostDiagnosticResult[]>({
    queryKey: ["publishing-lane-diagnostics", candidates.map((post) => `${post.id}:${post.status}`).join("|")],
    enabled: candidates.length > 0,
    refetchInterval: 15_000,
    staleTime: 5_000,
    queryFn: async () => Promise.all(candidates.map(async (post) => {
      try {
        const diagnostics = await apiFetch<PublishingDiagnosticsResponse>(`/social-posts/${post.id}/publishing-diagnostics`);
        return { post, diagnostics, loadError: null };
      } catch (error) {
        return { post, diagnostics: null, loadError: error instanceof Error ? error.message : "Diagnostics unavailable" };
      }
    })),
  });

  const retryMutation = useMutation<RetryResponse, Error, RetryRequest>({
    mutationFn: ({ postId, deliveryId }) => apiFetch<RetryResponse>(
      `/social-posts/${postId}/deliveries/${deliveryId}/retry`,
      { method: "POST" },
    ),
    onSuccess: (response, request) => {
      const key = `${request.postId}:${request.deliveryId}`;
      const succeeded = response.delivery.status === "published";
      setRetryNotice((current) => ({
        ...current,
        [key]: {
          ok: succeeded,
          message: succeeded
            ? `${platformLabel(request.platform)} retry published and receipt was recorded.`
            : `${platformLabel(request.platform)} retry finished as ${response.delivery.status.replaceAll("_", " ")}. Review the lane details.`,
        },
      }));
      void queryClient.invalidateQueries({ queryKey: ["publishing-lane-diagnostics"] });
      void queryClient.invalidateQueries({ queryKey: ["publishing-lane-diagnostics-health"] });
    },
    onError: (error, request) => {
      const key = `${request.postId}:${request.deliveryId}`;
      setRetryNotice((current) => ({
        ...current,
        [key]: { ok: false, message: error.message },
      }));
      void queryClient.invalidateQueries({ queryKey: ["publishing-lane-diagnostics"] });
      void queryClient.invalidateQueries({ queryKey: ["publishing-lane-diagnostics-health"] });
    },
  });

  const results = diagnosticsQuery.data ?? [];
  const totals = results.reduce((sum, result) => {
    if (!result.diagnostics) {
      sum.unavailable += 1;
      return sum;
    }
    sum.verified += result.diagnostics.summary.verified;
    sum.failed += result.diagnostics.summary.terminalFailures;
    sum.receiptMissing += result.diagnostics.summary.receiptMissing;
    sum.unresolved += result.diagnostics.summary.unresolved;
    return sum;
  }, { verified: 0, failed: 0, receiptMissing: 0, unresolved: 0, unavailable: 0 });

  const borderColor = totals.failed > 0 || totals.receiptMissing > 0
    ? "rgba(239,68,68,0.28)"
    : totals.unresolved > 0 || totals.unavailable > 0
      ? "rgba(245,158,11,0.28)"
      : "rgba(34,197,94,0.22)";

  return (
    <section style={{ marginBottom: 22, borderRadius: 14, border: `1px solid ${borderColor}`, background: "rgba(8,14,31,0.92)", overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.18)" }}>
      <button onClick={() => setOpen((value) => !value)} style={{ width: "100%", padding: "13px 16px", border: "none", cursor: "pointer", background: "rgba(0,174,239,0.045)", color: "#E2E8F0", display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
        <span style={{ fontSize: 16 }}>🧾</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 900, letterSpacing: ".6px", textTransform: "uppercase", color: "#00AEEF" }}>Publishing Lane Diagnostics</span>
          <span style={{ display: "block", marginTop: 2, fontSize: 10.5, color: "#64748B" }}>Receipt-verified platform truth · latest attempt per expected lane · isolated retries only</span>
        </span>
        {healthQuery.isLoading || diagnosticsQuery.isLoading ? (
          <span style={{ fontSize: 10, color: "#F59E0B" }}>checking…</span>
        ) : candidates.length === 0 ? (
          <span style={{ fontSize: 10, color: "#22C55E", fontWeight: 800 }}>No unresolved posts</span>
        ) : (
          <span style={{ fontSize: 10, color: totals.failed || totals.receiptMissing ? "#EF4444" : totals.unresolved ? "#F59E0B" : "#22C55E", fontWeight: 800 }}>{candidates.length} post{candidates.length === 1 ? "" : "s"} inspected</span>
        )}
        <span style={{ fontSize: 11, color: "#475569" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "12px 16px 15px" }}>
          {candidates.length === 0 ? (
            <div style={{ padding: "10px 2px", fontSize: 11.5, color: "#22C55E" }}>✓ No recent publishing, warning, or failed posts require lane inspection.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 11 }}>
                {[["Verified", totals.verified, "#22C55E"], ["Failed", totals.failed, "#EF4444"], ["Receipt missing", totals.receiptMissing, "#F59E0B"], ["Unresolved", totals.unresolved, "#00AEEF"], ["Unavailable", totals.unavailable, "#A78BFA"]].map(([label, value, color]) => (
                  <span key={String(label)} style={{ borderRadius: 20, padding: "4px 9px", fontSize: 9.5, fontWeight: 800, background: `${color}10`, border: `1px solid ${color}30`, color: String(color) }}>{label}: {value}</span>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {results.map((result) => {
                  const diagnostics = result.diagnostics;
                  const isExpanded = expandedPostId === result.post.id;
                  const headlineColor = !diagnostics ? "#A78BFA" : diagnostics.summary.receiptMissing > 0 || diagnostics.summary.terminalFailures > 0 ? "#EF4444" : diagnostics.summary.unresolved > 0 ? "#F59E0B" : "#22C55E";
                  return (
                    <div key={result.post.id} style={{ borderRadius: 9, border: `1px solid ${headlineColor}22`, background: `${headlineColor}07`, overflow: "hidden" }}>
                      <button onClick={() => setExpandedPostId(isExpanded ? null : result.post.id)} style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", display: "grid", gridTemplateColumns: "95px minmax(0,1fr) auto", gap: 9, alignItems: "center", padding: "8px 10px", textAlign: "left" }}>
                        <span style={{ fontSize: 9.5, fontWeight: 900, color: headlineColor, textTransform: "uppercase" }}>{result.post.status.replaceAll("_", " ")}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10.5, color: "#CBD5E1" }}>{result.post.caption || result.post.id}</span>
                          <span style={{ display: "block", marginTop: 2, fontSize: 9, color: "#475569" }}>{diagnostics ? `${diagnostics.summary.verified}/${diagnostics.summary.total} verified · ${diagnostics.summary.unresolved} unresolved` : result.loadError ?? "Diagnostics unavailable"}</span>
                        </span>
                        <span style={{ fontSize: 10, color: "#475569" }}>{isExpanded ? "▲" : "▼"}</span>
                      </button>

                      {isExpanded && diagnostics && (
                        <div style={{ borderTop: "1px solid rgba(255,255,255,.05)", padding: "7px 10px 9px", display: "grid", gap: 5 }}>
                          {diagnostics.lanes.map((lane) => {
                            const style = STATE_STYLE[lane.state];
                            const retryKey = lane.deliveryId ? `${result.post.id}:${lane.deliveryId}` : "";
                            const isRetrying = retryMutation.isPending && retryMutation.variables?.postId === result.post.id && retryMutation.variables?.deliveryId === lane.deliveryId;
                            const notice = retryKey ? retryNotice[retryKey] : undefined;
                            const canRetry = lane.state === "terminal_failure" && lane.retryAllowed && Boolean(lane.deliveryId);
                            return (
                              <div key={lane.platform} style={{ display: "grid", gridTemplateColumns: "20px 110px 125px minmax(0,1fr) auto", gap: 7, alignItems: "start", padding: "6px 7px", borderRadius: 7, background: "rgba(255,255,255,.018)", border: "1px solid rgba(255,255,255,.045)" }}>
                                <span style={{ color: style.color, fontWeight: 900 }}>{style.icon}</span>
                                <span style={{ fontSize: 9.5, color: "#CBD5E1", fontWeight: 800 }}>{lane.platform}</span>
                                <span style={{ fontSize: 8.5, color: style.color, fontWeight: 900, textTransform: "uppercase" }}>{style.label}</span>
                                <span style={{ fontSize: 8.8, color: "#64748B", lineHeight: 1.4 }}>
                                  {lane.message} <strong style={{ color: "#94A3B8" }}>{canRetry ? "Isolated retry available" : style.action}.</strong>{lane.attemptNumber ? ` Attempt ${lane.attemptNumber}.` : ""}{lane.updatedAt ? ` ${fmtTime(lane.updatedAt)}.` : ""}
                                  {notice && <span style={{ display: "block", marginTop: 4, color: notice.ok ? "#22C55E" : "#F59E0B", fontWeight: 800 }}>{notice.message}</span>}
                                </span>
                                {canRetry ? (
                                  <button
                                    type="button"
                                    disabled={retryMutation.isPending}
                                    onClick={() => {
                                      if (!lane.deliveryId) return;
                                      const confirmed = window.confirm(`Retry ${platformLabel(lane.platform)} only? Successful platforms will not be replayed.`);
                                      if (!confirmed) return;
                                      setRetryNotice((current) => {
                                        const next = { ...current };
                                        delete next[`${result.post.id}:${lane.deliveryId}`];
                                        return next;
                                      });
                                      retryMutation.mutate({
                                        postId: result.post.id,
                                        deliveryId: lane.deliveryId,
                                        platform: lane.platform,
                                      });
                                    }}
                                    style={{ borderRadius: 7, border: "1px solid rgba(239,68,68,.35)", background: "rgba(239,68,68,.10)", color: "#FCA5A5", padding: "5px 8px", fontSize: 8.5, fontWeight: 900, cursor: retryMutation.isPending ? "not-allowed" : "pointer", whiteSpace: "nowrap", opacity: retryMutation.isPending && !isRetrying ? 0.55 : 1 }}
                                  >
                                    {isRetrying ? "Retrying…" : "Retry this platform"}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 8.2, color: "#334155", whiteSpace: "nowrap" }}>No retry</span>
                                )}
                              </div>
                            );
                          })}
                          <div style={{ marginTop: 2, fontSize: 8.5, color: "#334155" }}>Verified publication requires an external provider post ID or URL. Retry actions are limited to the selected failed platform lane and require confirmation.</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
