import { useState, useEffect, useCallback } from "react";
import { AppShell } from "../components/app-shell";
import { useApiFetch } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PlatformStat {
  id: number;
  platform: string;
  reviewCount: number;
  averageRating: string;
  lastUpdated: string;
}

interface ReviewRequest {
  id: number;
  customerName: string;
  contact: string;
  contactType: string;
  platform: string;
  templateId: string | null;
  sentAt: string;
  status: string;
  notes: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS = ["Overview", "Request Center", "Templates", "Response Library"] as const;
type Tab = (typeof TABS)[number];

const PLATFORM_META: Record<string, { label: string; icon: string; color: string; note: string }> = {
  google:   { label: "Google",   icon: "🔍", color: "#4285F4", note: "Primary review platform — highest SEO impact" },
  yelp:     { label: "Yelp",     icon: "⭐", color: "#D32323", note: "Pending Yelp verification" },
  facebook: { label: "Facebook", icon: "👍", color: "#1877F2", note: "Social proof for local community" },
  nextdoor: { label: "Nextdoor", icon: "🏘", color: "#8DBD40", note: "Neighborhood recommendations (not star ratings)" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  sent:      { bg: "#1E3A5F", text: "#60A5FA" },
  delivered: { bg: "#1A3A2A", text: "#4ADE80" },
  clicked:   { bg: "#2D2A0F", text: "#FCD34D" },
  reviewed:  { bg: "#1A2D3A", text: "#00AEEF" },
};

const SMS_TEMPLATES = [
  {
    id: "sms_post_service",
    label: "Post-Service (Primary)",
    timing: "Send within 2 hours of job completion",
    body: `Hi [First Name]! Thanks for choosing Bed Bugs & Beyond today. We hope everything went smoothly! If our team took good care of you, a quick Google review would mean a lot and helps other Baldwin County homeowners find trusted pest control.

[Google Review Link]

Thanks again — Bed Bugs & Beyond
(251) 324-9090`,
  },
  {
    id: "sms_followup",
    label: "3-Day Follow-Up",
    timing: "Send 3 days after service",
    body: `Hi [First Name], checking in from Bed Bugs & Beyond — hope you're pest-free! 🐛

If you're happy with our service, we'd really appreciate a quick Google review. It only takes a minute:

[Google Review Link]

— BB&B Team | (251) 324-9090`,
  },
  {
    id: "sms_reengagement",
    label: "Re-Engagement",
    timing: "Send 2–4 weeks after service (if no review yet)",
    body: `Hi [First Name]! It's been a few weeks since your service with Bed Bugs & Beyond. Still enjoying a pest-free home?

If we earned your trust, we'd love a quick Google review — it helps families in Foley, Gulf Shores, and across Baldwin County find reliable pest control:

[Google Review Link]

Questions? Call us: (251) 324-9090`,
  },
];

const EMAIL_TEMPLATES = [
  {
    id: "email_post_service",
    label: "Post-Service Email",
    timing: "Send within 4 hours of job completion",
    subject: "How did we do today, [First Name]?",
    body: `Hi [First Name],

Thank you for choosing Bed Bugs & Beyond! We're glad we could help protect your home in [City].

Our team works hard to provide reliable, professional pest control across Baldwin County — and hearing from customers like you is what keeps us going.

If you're happy with today's service, would you take 60 seconds to leave us a Google review? It helps other homeowners in the area find pest control they can trust.

👉 [Google Review Link]

If anything wasn't right, please reply to this email or call us at (251) 324-9090 — we'll make it right.

Thank you,
The Bed Bugs & Beyond Team
bedbugsandbeyond.net | (251) 324-9090`,
  },
  {
    id: "email_followup",
    label: "Follow-Up Email",
    timing: "Send 5 days after service (if no review yet)",
    subject: "Still enjoying a pest-free home, [First Name]?",
    body: `Hi [First Name],

Just checking in from Bed Bugs & Beyond — we hope your pest issue is fully resolved!

If our team delivered the service you needed, we'd be grateful for a quick Google review. Reviews from customers in Gulf Shores, Foley, Fairhope, and across Baldwin County help other families find pest control they can count on.

⭐ Leave a review (60 seconds): [Google Review Link]

As always, if you ever need us again — whether it's a follow-up visit or a new concern — don't hesitate to reach out.

Best,
Bed Bugs & Beyond
(251) 324-9090 | bedbugsandbeyond.net`,
  },
];

const RESPONSE_TEMPLATES = [
  {
    type: "5-star",
    label: "5-Star Review",
    icon: "⭐⭐⭐⭐⭐",
    color: "#F59E0B",
    body: `Thank you so much, [Name]! We really appreciate you taking the time to share your experience. It means a great deal to our team to know we could help protect your home. We're here any time you need us — don't hesitate to call! — Bed Bugs & Beyond, (251) 324-9090`,
  },
  {
    type: "4-star",
    label: "4-Star Review",
    icon: "⭐⭐⭐⭐",
    color: "#60A5FA",
    body: `Thank you, [Name]! We're glad the service met your expectations and we appreciate the honest feedback. If there's anything we can do to improve your experience, please don't hesitate to give us a call at (251) 324-9090 — we'd love the chance to earn that fifth star next time!`,
  },
  {
    type: "3-star",
    label: "3-Star Review",
    icon: "⭐⭐⭐",
    color: "#94A3B8",
    body: `Thank you for the feedback, [Name]. We appreciate your honest review and we're sorry to hear that your experience wasn't everything it could have been. We'd welcome the opportunity to discuss this further — please feel free to call us at (251) 324-9090 or email us through bedbugsandbeyond.net so we can make things right.`,
  },
  {
    type: "negative",
    label: "Critical / Negative Review",
    icon: "🔴",
    color: "#EF4444",
    body: `Hi [Name], thank you for bringing this to our attention. We take all feedback seriously and we're sorry your experience didn't reflect the professional service we strive to provide. We would very much like to resolve this for you. Please contact us directly at (251) 324-9090 or through bedbugsandbeyond.net so we can address your concerns personally. — Bed Bugs & Beyond`,
  },
];

// ── Small components ──────────────────────────────────────────────────────────
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{
        padding: "6px 14px", borderRadius: 6, border: "1px solid #374151",
        background: copied ? "#064E3B" : "#1F2937", color: copied ? "#4ADE80" : "#9CA3AF",
        fontSize: 12, cursor: "pointer", transition: "all 0.15s",
      }}
    >
      {copied ? "✓ Copied" : `Copy ${label}`}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: "#1F2937", text: "#9CA3AF" };
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.text, textTransform: "uppercase", letterSpacing: "0.04em",
    }}>
      {status}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReviewsEnginePage() {
  const apiFetch = useApiFetch();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [stats, setStats]         = useState<PlatformStat[]>([]);
  const [requests, setRequests]   = useState<ReviewRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // edit-stat inline
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null);
  const [editCount, setEditCount]   = useState("");
  const [editRating, setEditRating] = useState("");
  const [saving, setSaving]         = useState(false);

  // log-request form
  const [form, setForm] = useState({
    customerName: "", contact: "", contactType: "sms",
    platform: "google", templateId: "", notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [statsRes, reqsRes] = await Promise.all([
        apiFetch("/api/reviews/stats"),
        apiFetch("/api/reviews/requests"),
      ]);
      const statsJson = await statsRes.json();
      const reqsJson  = await reqsRes.json();
      if (!statsRes.ok) throw new Error(statsJson.error ?? "Failed to load stats");
      if (!reqsRes.ok)  throw new Error(reqsJson.error  ?? "Failed to load requests");
      setStats(statsJson.stats ?? []);
      setRequests(reqsJson.requests ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSaveStat(platform: string) {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/reviews/stats/${platform}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewCount:   parseInt(editCount, 10),
          averageRating: editRating,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setEditingPlatform(null);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleLogRequest(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/reviews/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to log request");
      setForm({ customerName: "", contact: "", contactType: "sms", platform: "google", templateId: "", notes: "" });
      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 3000);
      await loadData();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteRequest(id: number) {
    if (!confirm("Delete this request log?")) return;
    await apiFetch(`/api/reviews/requests/${id}`, { method: "DELETE" });
    await loadData();
  }

  async function handleStatusChange(id: number, status: string) {
    await apiFetch(`/api/reviews/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadData();
  }

  const totalReviews = stats.reduce((s, r) => s + (r.reviewCount ?? 0), 0);
  const googleStat   = stats.find(s => s.platform === "google");
  const sentThisMonth = requests.filter(r => {
    const d = new Date(r.sentAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const reviewedCount = requests.filter(r => r.status === "reviewed").length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#FFFFFF", margin: 0 }}>
            ⭐ Reviews Engine
          </h1>
          <p style={{ color: "#6B7280", fontSize: 14, marginTop: 4 }}>
            Bed Bugs & Beyond — review requests, tracking, templates &amp; response library
          </p>
        </div>

        {/* KPI strip */}
        {!loading && !error && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
            {[
              { label: "Total Reviews (all platforms)", value: totalReviews, sub: "manually updated" },
              { label: "Google Rating", value: googleStat ? `${Number(googleStat.averageRating).toFixed(1)} ★` : "—", sub: "Google" },
              { label: "Requests This Month", value: sentThisMonth, sub: "logged requests" },
              { label: "Confirmed Reviews", value: reviewedCount, sub: "status = reviewed" },
            ].map(k => (
              <div key={k.label} style={{
                background: "#111827", border: "1px solid #1F2937", borderRadius: 10,
                padding: "16px 18px",
              }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#00AEEF" }}>{k.value}</div>
                <div style={{ fontSize: 13, color: "#FFFFFF", marginTop: 2 }}>{k.label}</div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid #1F2937", paddingBottom: 0 }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                padding: "8px 18px", borderRadius: "6px 6px 0 0", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600, transition: "all 0.15s",
                background: activeTab === t ? "#00AEEF" : "transparent",
                color:      activeTab === t ? "#000000" : "#9CA3AF",
                borderBottom: activeTab === t ? "2px solid #00AEEF" : "2px solid transparent",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Loading / Error */}
        {loading && (
          <div style={{ textAlign: "center", color: "#6B7280", padding: 48 }}>Loading reviews data…</div>
        )}
        {error && (
          <div style={{ background: "#1F0A0A", border: "1px solid #7F1D1D", borderRadius: 8, padding: 16, color: "#FCA5A5", marginBottom: 20 }}>
            ⚠ {error}
          </div>
        )}

        {/* ── OVERVIEW TAB ── */}
        {!loading && !error && activeTab === "Overview" && (
          <div>
            <p style={{ color: "#9CA3AF", fontSize: 13, marginBottom: 20 }}>
              Review counts are manually updated — enter real numbers from each platform. No estimates or auto-fills.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 32 }}>
              {["google", "yelp", "facebook", "nextdoor"].map(platform => {
                const stat = stats.find(s => s.platform === platform);
                const meta = PLATFORM_META[platform];
                const isEditing = editingPlatform === platform;
                const isNextdoor = platform === "nextdoor";
                return (
                  <div key={platform} style={{
                    background: "#111827", border: "1px solid #1F2937", borderRadius: 12, padding: "20px 22px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 22 }}>{meta.icon}</span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>{meta.label}</span>
                      </div>
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setEditingPlatform(platform);
                            setEditCount(String(stat?.reviewCount ?? 0));
                            setEditRating(stat?.averageRating ?? "0.00");
                          }}
                          style={{
                            padding: "4px 12px", borderRadius: 6, border: "1px solid #374151",
                            background: "transparent", color: "#9CA3AF", fontSize: 12, cursor: "pointer",
                          }}
                        >
                          Update
                        </button>
                      )}
                    </div>

                    {!isEditing ? (
                      <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
                        <div>
                          <div style={{ fontSize: 32, fontWeight: 700, color: meta.color, lineHeight: 1 }}>
                            {stat?.reviewCount ?? 0}
                          </div>
                          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                            {isNextdoor ? "recommendations" : "reviews"}
                          </div>
                        </div>
                        {!isNextdoor && (
                          <div>
                            <div style={{ fontSize: 22, fontWeight: 600, color: "#F59E0B", lineHeight: 1 }}>
                              {Number(stat?.averageRating ?? 0).toFixed(1)} ★
                            </div>
                            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>avg rating</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <div>
                          <label style={{ fontSize: 11, color: "#9CA3AF", display: "block", marginBottom: 4 }}>
                            {isNextdoor ? "Recommendations" : "Review count"}
                          </label>
                          <input
                            type="number" min="0" value={editCount}
                            onChange={e => setEditCount(e.target.value)}
                            style={{
                              width: 90, padding: "6px 10px", borderRadius: 6,
                              border: "1px solid #374151", background: "#1F2937",
                              color: "#FFFFFF", fontSize: 14,
                            }}
                          />
                        </div>
                        {!isNextdoor && (
                          <div>
                            <label style={{ fontSize: 11, color: "#9CA3AF", display: "block", marginBottom: 4 }}>Avg rating</label>
                            <input
                              type="number" min="0" max="5" step="0.1" value={editRating}
                              onChange={e => setEditRating(e.target.value)}
                              style={{
                                width: 80, padding: "6px 10px", borderRadius: 6,
                                border: "1px solid #374151", background: "#1F2937",
                                color: "#FFFFFF", fontSize: 14,
                              }}
                            />
                          </div>
                        )}
                        <button
                          onClick={() => handleSaveStat(platform)} disabled={saving}
                          style={{
                            padding: "7px 16px", borderRadius: 6, border: "none",
                            background: "#00AEEF", color: "#000", fontSize: 13,
                            fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
                          }}
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingPlatform(null)}
                          style={{
                            padding: "7px 12px", borderRadius: 6, border: "1px solid #374151",
                            background: "transparent", color: "#9CA3AF", fontSize: 13, cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    <p style={{ fontSize: 12, color: "#6B7280", margin: "10px 0 0", lineHeight: 1.5 }}>
                      {meta.note}
                    </p>
                    {stat && (
                      <p style={{ fontSize: 11, color: "#374151", margin: "6px 0 0" }}>
                        Last updated: {new Date(stat.lastUpdated).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Opportunities panel */}
            <div style={{ background: "#0A1628", border: "1px solid #1E3A5F", borderRadius: 12, padding: "20px 22px" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#00AEEF", margin: "0 0 14px" }}>
                💡 Review Opportunity Insights
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {[
                  { tip: "Ask within 2 hours of job completion — customer satisfaction is highest right after service." },
                  { tip: "SMS requests outperform email for pest control — most customers are on mobile." },
                  { tip: "Google reviews have the highest impact on local search rankings in Baldwin County." },
                  { tip: "Personalize with customer name and city — increases response rate significantly." },
                  { tip: "Follow up once at 3 days if no review — don't over-ask. One follow-up is enough." },
                  { tip: "Respond to every review within 24 hours — Google notices engagement." },
                ].map((o, i) => (
                  <div key={i} style={{
                    background: "#0D1F3A", border: "1px solid #1E3A5F", borderRadius: 8,
                    padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start",
                  }}>
                    <span style={{ color: "#00AEEF", fontSize: 14, flexShrink: 0 }}>→</span>
                    <span style={{ fontSize: 13, color: "#9CA3AF", lineHeight: 1.5 }}>{o.tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── REQUEST CENTER TAB ── */}
        {!loading && !error && activeTab === "Request Center" && (
          <div>
            {/* Log new request form */}
            <div style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 12, padding: "22px 24px", marginBottom: 28 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF", margin: "0 0 18px" }}>
                Log a Sent Review Request
              </h3>
              <form onSubmit={handleLogRequest}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, color: "#9CA3AF", display: "block", marginBottom: 5 }}>Customer Name *</label>
                    <input
                      required value={form.customerName}
                      onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                      placeholder="e.g. Jane Smith"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#9CA3AF", display: "block", marginBottom: 5 }}>Phone or Email *</label>
                    <input
                      required value={form.contact}
                      onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                      placeholder="e.g. (251) 555-0100 or jane@email.com"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#9CA3AF", display: "block", marginBottom: 5 }}>Contact Type *</label>
                    <select value={form.contactType} onChange={e => setForm(f => ({ ...f, contactType: e.target.value }))} style={inputStyle}>
                      <option value="sms">SMS / Text</option>
                      <option value="email">Email</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#9CA3AF", display: "block", marginBottom: 5 }}>Target Platform</label>
                    <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} style={inputStyle}>
                      <option value="google">Google</option>
                      <option value="yelp">Yelp</option>
                      <option value="facebook">Facebook</option>
                      <option value="nextdoor">Nextdoor</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#9CA3AF", display: "block", marginBottom: 5 }}>Template Used</label>
                    <select value={form.templateId} onChange={e => setForm(f => ({ ...f, templateId: e.target.value }))} style={inputStyle}>
                      <option value="">— None / Custom —</option>
                      {SMS_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label} (SMS)</option>)}
                      {EMAIL_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label} (Email)</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#9CA3AF", display: "block", marginBottom: 5 }}>Notes</label>
                    <input
                      value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Optional"
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <button
                    type="submit" disabled={submitting}
                    style={{
                      padding: "9px 22px", borderRadius: 8, border: "none",
                      background: "#00AEEF", color: "#000", fontWeight: 700,
                      fontSize: 14, cursor: submitting ? "not-allowed" : "pointer",
                    }}
                  >
                    {submitting ? "Saving…" : "Log Request"}
                  </button>
                  {formSuccess && <span style={{ color: "#4ADE80", fontSize: 13 }}>✓ Request logged successfully</span>}
                </div>
              </form>
            </div>

            {/* Request history */}
            <div style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 12, padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF", margin: 0 }}>
                  Request History ({requests.length})
                </h3>
              </div>

              {requests.length === 0 ? (
                <p style={{ color: "#6B7280", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
                  No review requests logged yet. Use the form above to log your first one.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1F2937" }}>
                        {["Customer", "Contact", "Type", "Platform", "Template", "Sent", "Status", ""].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "#6B7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map(r => (
                        <tr key={r.id} style={{ borderBottom: "1px solid #111827" }}>
                          <td style={{ padding: "10px 10px", color: "#FFFFFF", fontWeight: 500 }}>{r.customerName}</td>
                          <td style={{ padding: "10px 10px", color: "#9CA3AF" }}>{r.contact}</td>
                          <td style={{ padding: "10px 10px", color: "#9CA3AF", textTransform: "uppercase", fontSize: 11 }}>{r.contactType}</td>
                          <td style={{ padding: "10px 10px", color: "#9CA3AF" }}>{PLATFORM_META[r.platform]?.label ?? r.platform}</td>
                          <td style={{ padding: "10px 10px", color: "#6B7280", fontSize: 11 }}>{r.templateId ?? "Custom"}</td>
                          <td style={{ padding: "10px 10px", color: "#6B7280", whiteSpace: "nowrap" }}>
                            {new Date(r.sentAt).toLocaleDateString()}
                          </td>
                          <td style={{ padding: "10px 10px" }}>
                            <select
                              value={r.status}
                              onChange={e => handleStatusChange(r.id, e.target.value)}
                              style={{
                                background: "#1F2937", border: "1px solid #374151", borderRadius: 4,
                                color: "#FFFFFF", fontSize: 11, padding: "3px 6px", cursor: "pointer",
                              }}
                            >
                              <option value="sent">Sent</option>
                              <option value="delivered">Delivered</option>
                              <option value="clicked">Clicked</option>
                              <option value="reviewed">Reviewed</option>
                            </select>
                          </td>
                          <td style={{ padding: "10px 10px" }}>
                            <button
                              onClick={() => handleDeleteRequest(r.id)}
                              style={{ background: "transparent", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14 }}
                              title="Delete"
                            >✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TEMPLATES TAB ── */}
        {activeTab === "Templates" && (
          <div>
            {/* SMS */}
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF", margin: "0 0 14px" }}>📱 SMS Templates</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
              {SMS_TEMPLATES.map(t => (
                <div key={t.id} style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 12, padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>{t.label}</span>
                      <span style={{ fontSize: 11, color: "#6B7280", marginLeft: 10 }}>{t.timing}</span>
                    </div>
                    <CopyButton text={t.body} label="SMS" />
                  </div>
                  <pre style={{
                    background: "#0D1117", border: "1px solid #374151", borderRadius: 8,
                    padding: "14px 16px", fontSize: 13, color: "#D1D5DB", lineHeight: 1.6,
                    whiteSpace: "pre-wrap", fontFamily: "monospace", margin: 0,
                  }}>
                    {t.body}
                  </pre>
                </div>
              ))}
            </div>

            {/* Email */}
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF", margin: "0 0 14px" }}>📧 Email Templates</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {EMAIL_TEMPLATES.map(t => (
                <div key={t.id} style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 12, padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>{t.label}</span>
                      <span style={{ fontSize: 11, color: "#6B7280", marginLeft: 10 }}>{t.timing}</span>
                    </div>
                    <CopyButton text={`Subject: ${t.subject}\n\n${t.body}`} label="Email" />
                  </div>
                  <div style={{ background: "#0D1117", border: "1px solid #374151", borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>
                      <strong style={{ color: "#9CA3AF" }}>Subject:</strong> {t.subject}
                    </div>
                    <pre style={{
                      fontSize: 13, color: "#D1D5DB", lineHeight: 1.6,
                      whiteSpace: "pre-wrap", fontFamily: "monospace", margin: 0,
                    }}>
                      {t.body}
                    </pre>
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              background: "#0A1628", border: "1px solid #1E3A5F", borderRadius: 10,
              padding: "14px 18px", marginTop: 24,
            }}>
              <p style={{ fontSize: 13, color: "#60A5FA", margin: 0, lineHeight: 1.6 }}>
                <strong>Note:</strong> Replace <code style={{ background: "#1E3A5F", padding: "1px 5px", borderRadius: 3 }}>[First Name]</code>, <code style={{ background: "#1E3A5F", padding: "1px 5px", borderRadius: 3 }}>[City]</code>, and <code style={{ background: "#1E3A5F", padding: "1px 5px", borderRadius: 3 }}>[Google Review Link]</code> with real values before sending. Google review links can be generated from your Google Business Profile dashboard under <em>Get more reviews</em>.
              </p>
            </div>
          </div>
        )}

        {/* ── RESPONSE LIBRARY TAB ── */}
        {activeTab === "Response Library" && (
          <div>
            <p style={{ color: "#9CA3AF", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
              Professionally crafted responses for each review type. Respond within 24 hours — Google rewards engagement.
              Replace <code style={{ background: "#1F2937", padding: "1px 5px", borderRadius: 3 }}>[Name]</code> with the reviewer's name before posting.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {RESPONSE_TEMPLATES.map(t => (
                <div key={t.type} style={{
                  background: "#111827", border: `1px solid #1F2937`,
                  borderLeft: `4px solid ${t.color}`,
                  borderRadius: 12, padding: "18px 20px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{t.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>{t.label}</span>
                    </div>
                    <CopyButton text={t.body} label="Response" />
                  </div>
                  <div style={{
                    background: "#0D1117", border: "1px solid #374151", borderRadius: 8,
                    padding: "14px 16px", fontSize: 13, color: "#D1D5DB", lineHeight: 1.7,
                  }}>
                    {t.body}
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              background: "#0A1628", border: "1px solid #1E3A5F", borderRadius: 10,
              padding: "14px 18px", marginTop: 24,
            }}>
              <p style={{ fontSize: 13, color: "#60A5FA", margin: 0, lineHeight: 1.6 }}>
                <strong>Tip:</strong> Customize responses with the specific service performed (e.g. "bed bug treatment," "termite inspection") and the customer's city when possible. Specific, authentic responses outperform generic ones.
              </p>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}

// ── Shared input style ────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8,
  border: "1px solid #374151", background: "#1F2937",
  color: "#FFFFFF", fontSize: 14, boxSizing: "border-box",
};
