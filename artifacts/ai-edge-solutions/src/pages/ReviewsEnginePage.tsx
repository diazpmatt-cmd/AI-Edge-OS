import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/app-shell";
import { useTheme } from "@/contexts/theme-context";
import { useApiFetch } from "../lib/api";

interface ReviewSummary {
  id: string;
  clientId: string;
  platform: string;
  reviewCount: number;
  averageRating: number;
  targetReviewCount: number | null;
  geography: string;
  sourceConnectionId?: string;
  observedAt: string;
}

interface ReviewOverview {
  clientId: string;
  clientSlug: string;
  clientName: string;
  source: "tenant_safe_review_summaries";
  automationStatus: "not_activated";
  summaries: ReviewSummary[];
}

const TABS = ["Overview", "Templates", "Response Library"] as const;
type Tab = (typeof TABS)[number];

const TEMPLATE_LIBRARY = [
  {
    id: "post_service_sms",
    label: "Post-Service SMS",
    timing: "Use only after a verified completed job",
    body:
      "Hi [First Name]! Thanks for choosing [Business Name]. If our team took good care of you, a quick Google review would mean a lot and helps other local customers find a business they can trust.\n\n[Verified Google Review Link]\n\nThanks again — [Business Name]",
  },
  {
    id: "post_service_email",
    label: "Post-Service Email",
    timing: "Use only after a verified completed job",
    body:
      "Hi [First Name],\n\nThank you for choosing [Business Name]. If you were happy with your service, would you take a moment to leave a Google review? Your feedback helps other local customers make a confident choice.\n\n[Verified Google Review Link]\n\nIf anything was not right, please contact us directly so we can make it right.\n\nThank you,\n[Business Name]",
  },
];

const RESPONSE_LIBRARY = [
  {
    label: "Positive review",
    body:
      "Thank you, [Name]! We appreciate you taking the time to share your experience. We are glad we could help and we are here whenever you need us again. — [Business Name]",
  },
  {
    label: "Constructive review",
    body:
      "Thank you for the feedback, [Name]. We appreciate your honesty and would welcome the opportunity to discuss anything we could have done better. Please contact us directly so we can make it right. — [Business Name]",
  },
  {
    label: "Critical review",
    body:
      "Hi [Name], thank you for bringing this to our attention. We take your feedback seriously and would like the opportunity to address your concerns directly. Please contact us so we can work toward a resolution. — [Business Name]",
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      style={{
        border: "1px solid #334155",
        background: copied ? "#064E3B" : "#172033",
        color: copied ? "#6EE7B7" : "#CBD5E1",
        borderRadius: 8,
        padding: "7px 12px",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function formatObservedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export default function ReviewsEnginePage() {
  const { colors: t } = useTheme();
  const apiFetch = useApiFetch();
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<ReviewOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<ReviewOverview>("/reviews/overview");
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review intelligence.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const summaries = data?.summaries ?? [];
    return {
      platformCount: summaries.length,
      reviewCount: summaries.reduce((sum, row) => sum + row.reviewCount, 0),
      latestObservedAt: summaries
        .map(row => new Date(row.observedAt).getTime())
        .filter(Number.isFinite)
        .sort((a, b) => b - a)[0] ?? null,
    };
  }, [data]);

  const panel: React.CSSProperties = {
    background: "#0B1220",
    border: "1px solid #1E293B",
    borderRadius: 14,
  };

  return (
    <AppShell>
      <div style={{ padding: "26px 30px", maxWidth: 1120, margin: "0 auto", color: t.text }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ color: "#22C55E", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
            Evidence-backed review intelligence
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 850 }}>⭐ Reviews Engine</h1>
          <p style={{ color: t.text2, fontSize: 14, margin: "6px 0 0" }}>
            {data?.clientName ?? "Your business"} — verified review observations and safe response resources.
          </p>
        </div>

        <div style={{ ...panel, padding: 16, marginBottom: 20, borderColor: "rgba(245,158,11,0.35)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ fontSize: 22 }}>🛡️</div>
            <div>
              <div style={{ fontWeight: 800, color: "#FBBF24", marginBottom: 4 }}>Automated review requests are not activated yet</div>
              <div style={{ color: "#94A3B8", fontSize: 13, lineHeight: 1.55 }}>
                AI Edge will not message a customer from this page. The next automation phase must prove a verified completed job,
                tenant-specific review link, deduplication, and one-message delivery before live sending is enabled.
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
          {TABS.map(item => (
            <button
              key={item}
              onClick={() => setTab(item)}
              style={{
                border: `1px solid ${tab === item ? "#00AEEF" : "#334155"}`,
                background: tab === item ? "rgba(0,174,239,0.14)" : "transparent",
                color: tab === item ? "#38BDF8" : t.text2,
                borderRadius: 9,
                padding: "8px 14px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === "Overview" && (
          <>
            {loading && <div style={{ ...panel, padding: 24, color: "#94A3B8" }}>Loading verified review observations…</div>}

            {!loading && error && (
              <div style={{ ...panel, padding: 22, borderColor: "rgba(239,68,68,0.4)" }}>
                <div style={{ color: "#F87171", fontWeight: 800, marginBottom: 6 }}>Review intelligence unavailable</div>
                <div style={{ color: "#94A3B8", fontSize: 13, marginBottom: 14 }}>{error}</div>
                <button onClick={() => void load()} style={{ background: "#00AEEF", color: "white", border: 0, borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 700 }}>
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && data && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 18 }}>
                  {[
                    ["Verified platforms", String(totals.platformCount)],
                    ["Observed reviews", String(totals.reviewCount)],
                    ["Automation", "Not activated"],
                    ["Last observation", totals.latestObservedAt ? new Date(totals.latestObservedAt).toLocaleDateString() : "No data yet"],
                  ].map(([label, value]) => (
                    <div key={label} style={{ ...panel, padding: "16px 18px" }}>
                      <div style={{ color: "#38BDF8", fontSize: 22, fontWeight: 850 }}>{value}</div>
                      <div style={{ color: "#CBD5E1", fontSize: 12, marginTop: 4 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {data.summaries.length === 0 ? (
                  <div style={{ ...panel, padding: 28, textAlign: "center" }}>
                    <div style={{ fontSize: 30, marginBottom: 8 }}>○</div>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>No verified review observations yet</div>
                    <div style={{ color: "#94A3B8", fontSize: 13, maxWidth: 620, margin: "0 auto" }}>
                      This is intentionally not replaced with demo numbers. Review intelligence appears here only after an authorized Google Business connection has produced tenant-safe review summary evidence.
                    </div>
                  </div>
                ) : (
                  <div style={{ ...panel, overflow: "hidden" }}>
                    <div style={{ padding: "16px 18px", borderBottom: "1px solid #1E293B", fontWeight: 800 }}>Verified platform observations</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                        <thead>
                          <tr>
                            {["Platform", "Reviews", "Rating", "Geography", "Observed"].map(header => (
                              <th key={header} style={{ textAlign: "left", color: "#64748B", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", padding: "11px 16px", borderBottom: "1px solid #1E293B" }}>{header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.summaries.map(row => (
                            <tr key={row.id}>
                              <td style={{ padding: "13px 16px", borderBottom: "1px solid rgba(30,41,59,0.7)", fontWeight: 750, textTransform: "capitalize" }}>{row.platform.replace(/_/g, " ")}</td>
                              <td style={{ padding: "13px 16px", borderBottom: "1px solid rgba(30,41,59,0.7)" }}>{row.reviewCount}</td>
                              <td style={{ padding: "13px 16px", borderBottom: "1px solid rgba(30,41,59,0.7)" }}>{row.averageRating > 0 ? `${row.averageRating.toFixed(1)} ★` : "—"}</td>
                              <td style={{ padding: "13px 16px", borderBottom: "1px solid rgba(30,41,59,0.7)", color: "#94A3B8" }}>{row.geography}</td>
                              <td style={{ padding: "13px 16px", borderBottom: "1px solid rgba(30,41,59,0.7)", color: "#94A3B8" }}>{formatObservedAt(row.observedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === "Templates" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ ...panel, padding: 16, color: "#94A3B8", fontSize: 13 }}>
              These are copy references only. They do not send messages. Live templates will be tenant-generated after completed-job and verified-review-link controls are implemented.
            </div>
            {TEMPLATE_LIBRARY.map(template => (
              <div key={template.id} style={{ ...panel, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 850, marginBottom: 3 }}>{template.label}</div>
                    <div style={{ color: "#FBBF24", fontSize: 12 }}>{template.timing}</div>
                  </div>
                  <CopyButton text={template.body} />
                </div>
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", color: "#CBD5E1", lineHeight: 1.6, fontSize: 13, margin: 0 }}>{template.body}</pre>
              </div>
            ))}
          </div>
        )}

        {tab === "Response Library" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ ...panel, padding: 16, color: "#94A3B8", fontSize: 13 }}>
              Human-review response starters. Copy and personalize before posting; AI Edge does not auto-post review responses from this screen.
            </div>
            {RESPONSE_LIBRARY.map(item => (
              <div key={item.label} style={{ ...panel, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <div style={{ fontWeight: 850 }}>{item.label}</div>
                  <CopyButton text={item.body} />
                </div>
                <div style={{ color: "#CBD5E1", lineHeight: 1.6, fontSize: 13 }}>{item.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
