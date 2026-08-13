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

interface ReviewConfiguration {
  status: "not_configured" | "owner_confirmed";
  reviewUrl: string | null;
  confirmedAt: string | null;
}

interface ReviewConfigurationResponse {
  clientId: string;
  clientSlug: string;
  clientName: string;
  configuration: ReviewConfiguration;
  sendPathStatus: "not_accepted";
  automationStatus: "not_activated";
}

interface ReviewEligibilityCandidate {
  jobExternalId: string;
  customerExternalId: string;
  customerName: string;
  serviceType: string | null;
  jobAmountCents: number;
  paidAmountCents: number;
  completedAt: string;
  lastPaidAt: string;
  contactChannels: {
    smsAvailable: boolean;
    emailAvailable: boolean;
  };
  evidence: {
    completedJob: true;
    paidInFull: true;
    sameTenantProject: true;
    priorReviewRequestEvidence: false;
    noActiveReservation: true;
    ownerConfirmedReviewUrl: boolean;
  };
  deliveryReady: false;
  blockers: string[];
}

interface ReviewEligibilityResponse {
  clientId: string;
  clientSlug: string;
  clientName: string;
  source: "gorilladesk_local_transaction_snapshots";
  windowDays: number;
  reservationLeaseMinutes: number;
  candidateCount: number;
  deliveryReadyCount: 0;
  automationStatus: "not_activated";
  reviewConfigurationStatus: ReviewConfiguration["status"];
  reviewConfigurationConfirmedAt: string | null;
  globalBlockers: string[];
  candidates: ReviewEligibilityCandidate[];
}

interface ReviewReservationResponse {
  reservation: {
    id: string;
    jobExternalId: string;
    reservedAt: string;
    expiresAt: string;
  };
  customer: {
    name: string;
    smsAvailable: boolean;
    emailAvailable: boolean;
  };
  evidence: {
    completedJob: true;
    paidInFull: true;
    sameTenantProject: true;
    noPriorActiveReservationOrDelivery: true;
    ownerConfirmedReviewUrl: true;
  };
  preview: {
    channel: "sms" | "email";
    message: string;
  };
  deliveryReady: false;
  sendPathStatus: "not_accepted";
  blockers: string[];
}

const TABS = ["Overview", "Eligibility Queue", "Templates", "Response Library"] as const;
type Tab = (typeof TABS)[number];

const TEMPLATE_LIBRARY = [
  {
    id: "post_service_sms",
    label: "Post-Service SMS",
    timing: "Use only after a verified completed and paid job",
    body:
      "Hi [First Name]! Thanks for choosing [Business Name]. If our team took good care of you, a quick Google review would mean a lot and helps other local customers find a business they can trust.\n\n[Verified Google Review Link]\n\nThanks again — [Business Name]",
  },
  {
    id: "post_service_email",
    label: "Post-Service Email",
    timing: "Use only after a verified completed and paid job",
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
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
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

function formatDateTime(value: string | null): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function blockerLabel(code: string): string {
  switch (code) {
    case "verified_review_url_not_configured": return "Verified review link required";
    case "controlled_send_path_not_accepted": return "Controlled send path not accepted";
    case "no_customer_contact_channel": return "No SMS/email contact available";
    default: return code.replace(/_/g, " ");
  }
}

function errorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  if (err.message.includes("invalid_google_review_url")) {
    return "Use the exact HTTPS Google review link for this business.";
  }
  if (err.message.includes("google_business_channel_not_initialized")) {
    return "Google Business must be initialized for this tenant before a review link can be verified.";
  }
  if (err.message.includes("review_request_already_reserved_or_processed")) {
    return "That job is already reserved or already has review-request evidence.";
  }
  return err.message || fallback;
}

export default function ReviewsEnginePage() {
  const { colors: t } = useTheme();
  const apiFetch = useApiFetch();
  const [tab, setTab] = useState<Tab>("Overview");

  const [data, setData] = useState<ReviewOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [configuration, setConfiguration] = useState<ReviewConfigurationResponse | null>(null);
  const [configurationLoading, setConfigurationLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [reviewUrlInput, setReviewUrlInput] = useState("");
  const [ownerConfirmed, setOwnerConfirmed] = useState(false);
  const [configurationSaving, setConfigurationSaving] = useState(false);
  const [configurationSaved, setConfigurationSaved] = useState(false);

  const [eligibility, setEligibility] = useState<ReviewEligibilityResponse | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);

  const [reservingJobId, setReservingJobId] = useState<string | null>(null);
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [latestReservation, setLatestReservation] = useState<ReviewReservationResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<ReviewOverview>("/reviews/overview");
      setData(response);
    } catch (err) {
      setError(errorMessage(err, "Failed to load review intelligence."));
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const loadConfiguration = useCallback(async () => {
    setConfigurationLoading(true);
    setConfigurationError(null);
    try {
      const response = await apiFetch<ReviewConfigurationResponse>("/reviews/configuration");
      setConfiguration(response);
      setReviewUrlInput(response.configuration.reviewUrl ?? "");
    } catch (err) {
      setConfigurationError(errorMessage(err, "Failed to load review configuration."));
    } finally {
      setConfigurationLoading(false);
    }
  }, [apiFetch]);

  const loadEligibility = useCallback(async () => {
    setEligibilityLoading(true);
    setEligibilityError(null);
    try {
      const response = await apiFetch<ReviewEligibilityResponse>("/reviews/eligibility");
      setEligibility(response);
    } catch (err) {
      setEligibilityError(errorMessage(err, "Failed to load review eligibility evidence."));
    } finally {
      setEligibilityLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
    void loadConfiguration();
  }, [load, loadConfiguration]);

  useEffect(() => {
    if (tab === "Eligibility Queue" && !eligibility && !eligibilityLoading) {
      void loadEligibility();
    }
  }, [tab, eligibility, eligibilityLoading, loadEligibility]);

  const saveConfiguration = useCallback(async () => {
    if (!ownerConfirmed || !reviewUrlInput.trim()) return;
    setConfigurationSaving(true);
    setConfigurationSaved(false);
    setConfigurationError(null);
    try {
      const response = await apiFetch<ReviewConfigurationResponse>("/reviews/configuration", {
        method: "PUT",
        body: JSON.stringify({
          reviewUrl: reviewUrlInput.trim(),
          ownerConfirmed: true,
        }),
      });
      setConfiguration(response);
      setReviewUrlInput(response.configuration.reviewUrl ?? reviewUrlInput.trim());
      setOwnerConfirmed(false);
      setConfigurationSaved(true);
      setLatestReservation(null);
      await loadEligibility();
    } catch (err) {
      setConfigurationError(errorMessage(err, "Failed to verify the review link."));
    } finally {
      setConfigurationSaving(false);
    }
  }, [apiFetch, loadEligibility, ownerConfirmed, reviewUrlInput]);

  const reservePreview = useCallback(async (candidate: ReviewEligibilityCandidate) => {
    setReservingJobId(candidate.jobExternalId);
    setReservationError(null);
    try {
      const response = await apiFetch<ReviewReservationResponse>(
        `/reviews/reservations/${encodeURIComponent(candidate.jobExternalId)}`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setLatestReservation(response);
      await loadEligibility();
    } catch (err) {
      setReservationError(errorMessage(err, "Failed to reserve the review preview."));
    } finally {
      setReservingJobId(null);
    }
  }, [apiFetch, loadEligibility]);

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

  const configurationReady = configuration?.configuration.status === "owner_confirmed";

  return (
    <AppShell>
      <div style={{ padding: "26px 30px", maxWidth: 1120, margin: "0 auto", color: t.text }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ color: "#22C55E", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
            Evidence-backed review intelligence
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 850 }}>⭐ Reviews Engine</h1>
          <p style={{ color: t.text2, fontSize: 14, margin: "6px 0 0" }}>
            {data?.clientName ?? configuration?.clientName ?? "Your business"} — verified review observations and completed-paid-job eligibility evidence.
          </p>
        </div>

        <div style={{ ...panel, padding: 16, marginBottom: 20, borderColor: "rgba(245,158,11,0.35)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ fontSize: 22 }}>🛡️</div>
            <div>
              <div style={{ fontWeight: 800, color: "#FBBF24", marginBottom: 4 }}>Customer delivery is still disabled</div>
              <div style={{ color: "#94A3B8", fontSize: 13, lineHeight: 1.55 }}>
                AI Edge can verify a tenant review link, identify completed-and-paid jobs, reserve one job at a time, and show the exact message preview. This screen has no SMS or email send action. Live delivery remains a separate acceptance stage.
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
          {TABS.map(item => (
            <button
              type="button"
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
                <button type="button" onClick={() => void load()} style={{ background: "#00AEEF", color: "white", border: 0, borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 700 }}>
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
                    ["Review link", configurationReady ? "Verified" : "Not configured"],
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
                              <td style={{ padding: "13px 16px", borderBottom: "1px solid rgba(30,41,59,0.7)", color: "#94A3B8" }}>{formatDateTime(row.observedAt)}</td>
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

        {tab === "Eligibility Queue" && (
          <>
            <div style={{ ...panel, padding: 18, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <div style={{ color: "#38BDF8", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Step 1</div>
                  <div style={{ fontWeight: 850, fontSize: 16, marginTop: 3 }}>Verify this tenant’s Google review link</div>
                  <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 5, maxWidth: 680 }}>
                    AI Edge never guesses a review URL. Paste the exact Google review link and explicitly confirm it belongs to this business.
                  </div>
                </div>
                <span style={{ border: `1px solid ${configurationReady ? "rgba(34,197,94,0.35)" : "rgba(245,158,11,0.35)"}`, background: configurationReady ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)", color: configurationReady ? "#6EE7B7" : "#FBBF24", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 800 }}>
                  {configurationReady ? "Owner confirmed" : "Not configured"}
                </span>
              </div>

              {configurationLoading ? (
                <div style={{ color: "#94A3B8", fontSize: 13 }}>Loading review-link configuration…</div>
              ) : (
                <>
                  {configurationReady && configuration?.configuration.reviewUrl && (
                    <div style={{ border: "1px solid rgba(34,197,94,0.22)", background: "rgba(34,197,94,0.06)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                      <div style={{ color: "#6EE7B7", fontWeight: 800, fontSize: 12 }}>Verified Google review link</div>
                      <div style={{ color: "#CBD5E1", fontSize: 12, marginTop: 4, overflowWrap: "anywhere" }}>{configuration.configuration.reviewUrl}</div>
                      <div style={{ color: "#64748B", fontSize: 11, marginTop: 4 }}>Confirmed {formatDateTime(configuration.configuration.confirmedAt)}</div>
                    </div>
                  )}

                  <div style={{ display: "grid", gap: 10 }}>
                    <input
                      aria-label="Google review link"
                      value={reviewUrlInput}
                      onChange={event => {
                        setReviewUrlInput(event.target.value);
                        setConfigurationSaved(false);
                      }}
                      placeholder="https://g.page/r/... or exact Google review URL"
                      style={{ width: "100%", boxSizing: "border-box", background: "#111827", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 9, padding: "10px 12px", fontSize: 13 }}
                    />

                    <label style={{ display: "flex", gap: 9, alignItems: "flex-start", color: "#CBD5E1", fontSize: 12, lineHeight: 1.45, cursor: "pointer" }}>
                      <input
                        aria-label="Confirm review link ownership"
                        type="checkbox"
                        checked={ownerConfirmed}
                        onChange={event => setOwnerConfirmed(event.target.checked)}
                        style={{ marginTop: 2 }}
                      />
                      I confirm this exact Google review link belongs to {configuration?.clientName ?? data?.clientName ?? "this tenant"}.
                    </label>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        disabled={configurationSaving || !ownerConfirmed || !reviewUrlInput.trim()}
                        onClick={() => void saveConfiguration()}
                        style={{ background: configurationSaving || !ownerConfirmed || !reviewUrlInput.trim() ? "#334155" : "#00AEEF", color: "white", border: 0, borderRadius: 8, padding: "9px 14px", cursor: configurationSaving || !ownerConfirmed || !reviewUrlInput.trim() ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 12 }}
                      >
                        {configurationSaving ? "Verifying…" : configurationReady ? "Re-confirm review link" : "Verify review link"}
                      </button>
                      {configurationSaved && <span style={{ color: "#6EE7B7", fontSize: 12, fontWeight: 700 }}>✓ Saved with owner confirmation</span>}
                    </div>
                  </div>
                </>
              )}

              {configurationError && <div role="alert" style={{ color: "#F87171", fontSize: 12, marginTop: 10 }}>{configurationError}</div>}
            </div>

            {latestReservation && (
              <div style={{ ...panel, padding: 18, marginBottom: 16, borderColor: "rgba(56,189,248,0.35)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ color: "#38BDF8", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Preview reservation created</div>
                    <div style={{ fontWeight: 850, marginTop: 4 }}>{latestReservation.customer.name}</div>
                    <div style={{ color: "#94A3B8", fontSize: 11, marginTop: 3 }}>
                      {latestReservation.preview.channel.toUpperCase()} preview · expires {formatDateTime(latestReservation.reservation.expiresAt)}
                    </div>
                  </div>
                  <span style={{ border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)", color: "#FBBF24", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 800 }}>
                    Preview only — nothing sent
                  </span>
                </div>

                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", color: "#E2E8F0", background: "#111827", border: "1px solid #1E293B", borderRadius: 10, padding: 14, lineHeight: 1.55, fontSize: 13, margin: "14px 0 10px" }}>{latestReservation.preview.message}</pre>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <CopyButton text={latestReservation.preview.message} />
                  {latestReservation.blockers.map(code => (
                    <span key={code} style={{ color: "#FBBF24", fontSize: 11, fontWeight: 700 }}>⚠ {blockerLabel(code)}</span>
                  ))}
                </div>
              </div>
            )}

            {reservationError && <div role="alert" style={{ ...panel, padding: 14, marginBottom: 16, color: "#F87171", borderColor: "rgba(239,68,68,0.35)", fontSize: 12 }}>{reservationError}</div>}

            {eligibilityLoading && <div style={{ ...panel, padding: 24, color: "#94A3B8" }}>Checking completed-and-paid job evidence…</div>}

            {!eligibilityLoading && eligibilityError && (
              <div style={{ ...panel, padding: 22, borderColor: "rgba(239,68,68,0.4)" }}>
                <div style={{ color: "#F87171", fontWeight: 800, marginBottom: 6 }}>Eligibility evidence unavailable</div>
                <div style={{ color: "#94A3B8", fontSize: 13, marginBottom: 14 }}>{eligibilityError}</div>
                <button type="button" onClick={() => void loadEligibility()} style={{ background: "#00AEEF", color: "white", border: 0, borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 700 }}>
                  Retry
                </button>
              </div>
            )}

            {!eligibilityLoading && !eligibilityError && eligibility && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
                  {[
                    ["Evidence window", `${eligibility.windowDays} days`],
                    ["Eligible paid jobs", String(eligibility.candidateCount)],
                    ["Reservation lease", `${eligibility.reservationLeaseMinutes} min`],
                    ["Ready to send", String(eligibility.deliveryReadyCount)],
                  ].map(([label, value]) => (
                    <div key={label} style={{ ...panel, padding: "16px 18px" }}>
                      <div style={{ color: label === "Ready to send" ? "#FBBF24" : "#38BDF8", fontSize: 22, fontWeight: 850 }}>{value}</div>
                      <div style={{ color: "#CBD5E1", fontSize: 12, marginTop: 4 }}>{label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ ...panel, padding: 16, marginBottom: 16, borderColor: "rgba(245,158,11,0.35)" }}>
                  <div style={{ fontWeight: 800, color: "#FBBF24", marginBottom: 6 }}>Current safety blockers</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {eligibility.globalBlockers.map(code => (
                      <span key={code} style={{ border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.06)", color: "#FBBF24", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 700 }}>
                        {blockerLabel(code)}
                      </span>
                    ))}
                  </div>
                </div>

                {eligibility.candidates.length === 0 ? (
                  <div style={{ ...panel, padding: 28, textAlign: "center" }}>
                    <div style={{ fontSize: 30, marginBottom: 8 }}>✓</div>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>No currently reservable completed-and-paid jobs found</div>
                    <div style={{ color: "#94A3B8", fontSize: 13, maxWidth: 650, margin: "0 auto" }}>
                      The queue only includes same-tenant GorillaDesk jobs with stable IDs, completed status, paid-in-full evidence, customer identity, and no prior active review-request reservation or delivery evidence.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {eligibility.candidates.map(candidate => {
                      const canReserve = configurationReady && (candidate.contactChannels.smsAvailable || candidate.contactChannels.emailAvailable);
                      return (
                        <div key={candidate.jobExternalId} style={{ ...panel, padding: 18 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontWeight: 850, fontSize: 15 }}>{candidate.customerName}</div>
                              <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 3 }}>
                                {candidate.serviceType ?? "Service"} · completed {new Date(candidate.completedAt).toLocaleDateString()}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ color: "#22C55E", fontWeight: 850 }}>{formatMoney(candidate.paidAmountCents)} paid</div>
                              <div style={{ color: "#64748B", fontSize: 11, marginTop: 2 }}>Job {candidate.jobExternalId}</div>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                            {["Completed job ✓", "Paid in full ✓", "Tenant match ✓", "No prior request ✓"].map(label => (
                              <span key={label} style={{ border: "1px solid rgba(34,197,94,0.25)", background: "rgba(34,197,94,0.08)", color: "#6EE7B7", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>{label}</span>
                            ))}
                            {candidate.contactChannels.smsAvailable && <span style={{ border: "1px solid #334155", borderRadius: 999, padding: "4px 8px", fontSize: 11, color: "#CBD5E1" }}>SMS available</span>}
                            {candidate.contactChannels.emailAvailable && <span style={{ border: "1px solid #334155", borderRadius: 999, padding: "4px 8px", fontSize: 11, color: "#CBD5E1" }}>Email available</span>}
                          </div>

                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1E293B", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {candidate.blockers.map(code => (
                                <span key={code} style={{ color: "#FBBF24", fontSize: 11, fontWeight: 700 }}>⚠ {blockerLabel(code)}</span>
                              ))}
                            </div>
                            <button
                              type="button"
                              disabled={!canReserve || reservingJobId === candidate.jobExternalId}
                              onClick={() => void reservePreview(candidate)}
                              style={{ background: canReserve ? "#0EA5E9" : "#334155", color: "white", border: 0, borderRadius: 8, padding: "8px 12px", cursor: canReserve && reservingJobId !== candidate.jobExternalId ? "pointer" : "not-allowed", fontWeight: 800, fontSize: 12 }}
                            >
                              {reservingJobId === candidate.jobExternalId ? "Reserving…" : "Reserve & Preview"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === "Templates" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ ...panel, padding: 16, color: "#94A3B8", fontSize: 13 }}>
              These are copy references only. They do not send messages. The controlled preview path uses the tenant name and owner-confirmed review link while customer delivery remains disabled.
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
