import { useState, useEffect, useCallback } from "react";
import { useApiFetch } from "@/lib/api";
import { AdminLayout } from "@/components/AdminLayout";
import { buildReferralShareUrl } from "@/lib/referral-growth";
import { ReferralInvitationsPanel } from "@/components/referrals/ReferralInvitationsPanel";
import { ReferralRewardsPanel } from "@/components/referrals/ReferralRewardsPanel";

interface Program {
  id: number;
  name: string;
  description: string;
  rewardType: string;
  rewardValue: string;
  status: string;
  referralCode: string;
  promoMessage: string;
  usesCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  createdAt: string;
}

interface Referral {
  id: number;
  programId: number | null;
  programName: string | null;
  referrerName: string;
  referrerEmail: string | null;
  referrerPhone: string | null;
  referredName: string | null;
  referredPhone: string | null;
  status: string;
  rewardAmount: string | null;
  source: string;
  convertedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface Stats {
  total: number;
  converted: number;
  paid: number;
  pending: number;
  cancelled: number;
  conversionRate: number;
  totalPaidOut: string;
  pendingPayout: string;
  pendingRewardCount: number;
  fulfilledRewardCount: number;
}

type Tab = "overview" | "programs" | "invitations" | "referrals" | "payouts";

const STATUS_CFG: Record<string, { color: string; label: string; dot: string }> = {
  pending:   { color: "#F59E0B", label: "Pending",   dot: "○" },
  converted: { color: "#38BDF8", label: "Converted", dot: "●" },
  paid:      { color: "#22C55E", label: "Paid",      dot: "●" },
  cancelled: { color: "#475569", label: "Cancelled", dot: "✕" },
  active:    { color: "#22C55E", label: "Active",    dot: "●" },
  paused:    { color: "#F59E0B", label: "Paused",    dot: "⏸" },
  archived:  { color: "#475569", label: "Archived",  dot: "○" },
};

const REWARD_ICON: Record<string, string> = {
  credit: "💳",
  cash:   "💵",
  discount: "🏷️",
};

function fmt$(v: string | number | null | undefined) {
  if (!v) return "$0";
  return `$${parseFloat(String(v)).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color: string; icon: string }) {
  return (
    <div style={{
      background: "rgba(11,22,41,0.85)", borderRadius: 12, padding: "16px 20px",
      border: `1px solid ${color}20`, borderLeft: `3px solid ${color}`,
      flex: "1 1 160px",
    }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#CBD5E1", marginTop: 4, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { color: "#64748B", label: status, dot: "○" };
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: cfg.color,
      background: `${cfg.color}14`, border: `1px solid ${cfg.color}28`,
      borderRadius: 20, padding: "2px 8px",
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>
      {cfg.dot} {cfg.label}
    </span>
  );
}

function CreateReferralModal({ programs, onClose, onCreated }: {
  programs: Program[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const apiFetch = useApiFetch();
  const [form, setForm] = useState({
    programId: programs[0]?.id ?? "",
    referrerName: "", referrerEmail: "", referrerPhone: "",
    referredName: "", referredPhone: "", source: "manual", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.referrerName) return;
    setSaving(true);
    try {
      await apiFetch("/referrals", {
        method: "POST",
        body: JSON.stringify({ ...form, programId: form.programId ? Number(form.programId) : null }),
      });
      onCreated();
      onClose();
    } catch {
      /* noop */
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(11,22,41,0.9)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#E2E8F0",
    outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: "rgba(100,116,139,0.9)",
    textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4, display: "block",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      padding: 16,
    }}>
      <div style={{
        background: "#0D1829", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16, padding: 24, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#F1F5F9" }}>Add Referral</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Program</label>
            <select value={form.programId} onChange={e => setForm(f => ({ ...f, programId: Number(e.target.value) }))} style={{ ...inputStyle }}>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Referrer Name *</label>
              <input required value={form.referrerName} onChange={e => setForm(f => ({ ...f, referrerName: e.target.value }))} style={inputStyle} placeholder="Jane Smith" />
            </div>
            <div>
              <label style={labelStyle}>Referrer Phone</label>
              <input value={form.referrerPhone} onChange={e => setForm(f => ({ ...f, referrerPhone: e.target.value }))} style={inputStyle} placeholder="702-555-XXXX" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Referrer Email</label>
            <input type="email" value={form.referrerEmail} onChange={e => setForm(f => ({ ...f, referrerEmail: e.target.value }))} style={inputStyle} placeholder="jane@email.com" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Referred Name</label>
              <input value={form.referredName} onChange={e => setForm(f => ({ ...f, referredName: e.target.value }))} style={inputStyle} placeholder="Tom Jones" />
            </div>
            <div>
              <label style={labelStyle}>Referred Phone</label>
              <input value={form.referredPhone} onChange={e => setForm(f => ({ ...f, referredPhone: e.target.value }))} style={inputStyle} placeholder="702-555-XXXX" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Source</label>
            <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} style={inputStyle}>
              <option value="manual">Manual entry</option>
              <option value="link">Referral link</option>
              <option value="qr">QR code</option>
              <option value="phone">Phone call</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} placeholder="Any additional notes…" />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: "10px", borderRadius: 9, fontSize: 12, fontWeight: 600,
              cursor: "pointer", background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8",
            }}>Cancel</button>
            <button type="submit" disabled={saving} style={{
              flex: 1, padding: "10px", borderRadius: 9, fontSize: 12, fontWeight: 700,
              cursor: saving ? "default" : "pointer",
              background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22C55E",
            }}>
              {saving ? "Saving…" : "Add Referral"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateProgramModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const apiFetch = useApiFetch();
  const [form, setForm] = useState({
    name: "",
    description: "",
    rewardType: "credit",
    rewardValue: "25",
    promoMessage: "",
    maxUses: "",
    expiresAt: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(11,22,41,0.9)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#E2E8F0",
    outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: "rgba(100,116,139,0.9)",
    textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4, display: "block",
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/referrals/programs", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          rewardValue: Number(form.rewardValue),
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
        }),
      });
      onCreated();
      onClose();
    } catch {
      setError("The program could not be created. Please review the fields and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16,
    }}>
      <div style={{
        background: "#0D1829", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16, padding: 24, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#F1F5F9" }}>Create Referral Program</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={labelStyle}>Program Name *</label>
            <input required maxLength={120} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="Neighbor Referral Program" />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea maxLength={1000} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, minHeight: 70 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Reward Type</label>
              <select value={form.rewardType} onChange={e => setForm(f => ({ ...f, rewardType: e.target.value }))} style={inputStyle}>
                <option value="credit">Service credit</option>
                <option value="cash">Cash</option>
                <option value="discount">Discount</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Reward Value *</label>
              <input required type="number" min="0" max="10000" step="0.01" value={form.rewardValue} onChange={e => setForm(f => ({ ...f, rewardValue: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Share Message</label>
            <textarea maxLength={1000} value={form.promoMessage} onChange={e => setForm(f => ({ ...f, promoMessage: e.target.value }))} style={{ ...inputStyle, minHeight: 70 }} placeholder="Know someone who needs reliable pest control? Send them this link." />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Maximum Uses</label>
              <input type="number" min="1" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} style={inputStyle} placeholder="Unlimited" />
            </div>
            <div>
              <label style={labelStyle}>Expiration Date</label>
              <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          {error && <div style={{ fontSize: 11, color: "#F87171" }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: 10, borderRadius: 9, cursor: "pointer",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8",
            }}>Cancel</button>
            <button type="submit" disabled={saving} style={{
              flex: 1, padding: 10, borderRadius: 9, cursor: saving ? "wait" : "pointer",
              background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22C55E", fontWeight: 700,
            }}>{saving ? "Creating…" : "Create Program"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ReferralProgramPage() {
  const apiFetch = useApiFetch();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [showAddReferral, setShowAddReferral] = useState(false);
  const [showCreateProgram, setShowCreateProgram] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, r] = await Promise.all([
        apiFetch<Stats>("/referrals/stats"),
        apiFetch<Program[]>("/referrals/programs"),
        apiFetch<Referral[]>("/referrals"),
      ]);
      setStats(s);
      setPrograms(p);
      setReferrals(r);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadReferrals = useCallback(async (filter: string) => {
    try {
      const r = await apiFetch<Referral[]>(`/referrals${filter !== "all" ? `?status=${filter}` : ""}`);
      setReferrals(r);
    } catch {
      /* noop */
    }
  }, [apiFetch]);

  const updateStatus = async (id: number, status: string) => {
    try {
      await apiFetch(`/referrals/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      loadAll();
    } catch {
      /* noop */
    }
  };

  const toggleProgramStatus = async (p: Program) => {
    const next = p.status === "active" ? "paused" : "active";
    try {
      await apiFetch(`/referrals/programs/${p.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      loadAll();
    } catch {
      /* noop */
    }
  };

  const copyShareLink = async (program: Program) => {
    const link = buildReferralShareUrl(window.location.origin, program.referralCode);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Copy this referral link:", link);
    }
    setCopiedCode(program.referralCode);
    window.setTimeout(() => setCopiedCode(current => current === program.referralCode ? null : current), 1600);
  };

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "overview",  label: "Overview",   icon: "📊" },
    { id: "programs",  label: "Programs",   icon: "🎯" },
    { id: "invitations", label: "Invitations", icon: "✉️" },
    { id: "referrals", label: "Referrals",  icon: "👥" },
    { id: "payouts",   label: "Payouts",    icon: "💵" },
  ];

  return (
    <AdminLayout>
      {showAddReferral && (
        <CreateReferralModal
          programs={programs}
          onClose={() => setShowAddReferral(false)}
          onCreated={loadAll}
        />
      )}
      {showCreateProgram && (
        <CreateProgramModal
          onClose={() => setShowCreateProgram(false)}
          onCreated={loadAll}
        />
      )}

      <div style={{ minHeight: "100vh", background: "#030612", padding: "28px 24px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          {/* ── Header ── */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.8px",
                  color: "#22C55E", background: "rgba(34,197,94,0.1)",
                  border: "1px solid rgba(34,197,94,0.25)", borderRadius: 5, padding: "2px 8px",
                }}>REFERRAL ENGINE</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, color: "#F59E0B",
                  background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)",
                  borderRadius: 5, padding: "2px 8px",
                }}>BETA</span>
              </div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: "#F1F5F9", margin: 0, lineHeight: 1.15 }}>
                Referrals on Autopilot
              </h1>
              <p style={{ fontSize: 13, color: "#64748B", margin: "5px 0 0" }}>
                Turn customers &amp; partners into your top growth channel · Bed Bugs &amp; Beyond
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowCreateProgram(true)}
                style={{
                  padding: "9px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", background: "rgba(56,189,248,0.1)",
                  border: "1px solid rgba(56,189,248,0.28)", color: "#38BDF8",
                  letterSpacing: "0.3px",
                }}
              >
                + New Program
              </button>
              <button
                onClick={() => setShowAddReferral(true)}
                style={{
                  padding: "9px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", background: "rgba(34,197,94,0.12)",
                  border: "1px solid rgba(34,197,94,0.3)", color: "#22C55E",
                  letterSpacing: "0.3px",
                }}
              >
                + Add Referral
              </button>
              <button
                onClick={loadAll}
                disabled={loading}
                style={{
                  padding: "9px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                  cursor: loading ? "default" : "pointer",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(148,163,184,0.7)",
                }}
              >
                ↻
              </button>
            </div>
          </div>

          {/* ── KPI Cards ── */}
          {stats && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
              <KpiCard icon="👥" label="Total Referrals"   value={stats.total}                                    color="#38BDF8" />
              <KpiCard icon="✅" label="Conversion Rate"   value={`${stats.conversionRate}%`} sub={`${stats.converted + stats.paid} converted`} color="#22C55E" />
              <KpiCard icon="⏳" label="Pending Rewards"   value={fmt$(stats.pendingPayout)}  sub={`${stats.pendingRewardCount} awaiting fulfillment`} color="#F59E0B" />
              <KpiCard icon="💵" label="Fulfilled Rewards" value={fmt$(stats.totalPaidOut)}   sub={`${stats.fulfilledRewardCount} recorded`} color="#A78BFA" />
            </div>
          )}

          {/* ── Tabs ── */}
          <div style={{
            display: "flex", gap: 4, marginBottom: 20,
            background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 4,
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: "9px 14px", borderRadius: 7,
                  fontSize: 11, fontWeight: tab === t.id ? 700 : 500,
                  cursor: "pointer",
                  background: tab === t.id ? "rgba(34,197,94,0.1)" : "transparent",
                  border: tab === t.id ? "1px solid rgba(34,197,94,0.3)" : "1px solid transparent",
                  color: tab === t.id ? "#22C55E" : "rgba(148,163,184,0.7)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  whiteSpace: "nowrap",
                }}
              >
                <span>{t.icon}</span> {t.label}
                {t.id === "payouts" && stats && stats.pendingRewardCount > 0 && (
                  <span style={{
                    background: "#F59E0B", color: "#030612", borderRadius: 20,
                    fontSize: 9, fontWeight: 800, padding: "1px 6px",
                  }}>{stats.pendingRewardCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── Tab: Overview ── */}
          {tab === "overview" && (
            <div>
              {/* Program mini-cards */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#CBD5E1", marginBottom: 12 }}>Active Programs</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                  {programs.filter(p => p.status === "active").map(p => {
                    const pReferrals = referrals.filter(r => r.programId === p.id);
                    const converted  = pReferrals.filter(r => ["converted","paid"].includes(r.status)).length;
                    const rate       = pReferrals.length > 0 ? Math.round((converted / pReferrals.length) * 100) : 0;
                    return (
                      <div key={p.id} style={{
                        background: "rgba(11,22,41,0.85)", border: "1px solid rgba(34,197,94,0.15)",
                        borderTop: "3px solid #22C55E", borderRadius: 11, padding: "14px 16px",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>{p.name}</div>
                          <span style={{ fontSize: 16 }}>{REWARD_ICON[p.rewardType]}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.45, marginBottom: 10 }}>{p.description}</div>
                        <div style={{ display: "flex", gap: 16 }}>
                          {[
                            { label: "Reward",     value: fmt$(p.rewardValue)        },
                            { label: "Referrals",  value: String(p.usesCount)        },
                            { label: "Conv. Rate", value: `${rate}%`                 },
                          ].map(s => (
                            <div key={s.label}>
                              <div style={{ fontSize: 14, fontWeight: 800, color: "#22C55E" }}>{s.value}</div>
                              <div style={{ fontSize: 9, color: "#475569" }}>{s.label}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{
                          marginTop: 10, padding: "8px 10px",
                          background: "rgba(34,197,94,0.05)", borderRadius: 7,
                          border: "1px solid rgba(34,197,94,0.1)",
                        }}>
                          <div style={{ fontSize: 9, color: "#64748B", marginBottom: 2 }}>Share message</div>
                          <div style={{ fontSize: 10, color: "#94A3B8", lineHeight: 1.4 }}>
                            {p.promoMessage}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 9, color: "#22C55E", fontFamily: "monospace" }}>
                            Code: {p.referralCode}
                          </div>
                          <button
                            onClick={() => copyShareLink(p)}
                            style={{
                              marginTop: 8, width: "100%", padding: "6px 9px", borderRadius: 6,
                              cursor: "pointer", background: "rgba(56,189,248,0.08)",
                              border: "1px solid rgba(56,189,248,0.2)", color: "#38BDF8",
                              fontSize: 10, fontWeight: 700,
                            }}
                          >
                            {copiedCode === p.referralCode ? "✓ Link copied" : "🔗 Copy referral link"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent referrals */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#CBD5E1", marginBottom: 12 }}>Recent Referrals</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {referrals.slice(0, 8).map(r => (
                    <div key={r.id} style={{
                      background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 9, padding: "11px 16px",
                      display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                    }}>
                      <div style={{ fontSize: 22, flexShrink: 0 }}>
                        {r.source === "qr" ? "📱" : r.source === "link" ? "🔗" : "📞"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>
                          {r.referrerName}
                          <span style={{ color: "#475569", fontWeight: 400 }}> → </span>
                          {r.referredName ?? <span style={{ color: "#475569", fontStyle: "italic" }}>Pending booking</span>}
                        </div>
                        <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>
                          {r.programName ?? "No program"} · {fmtDate(r.createdAt)}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {r.rewardAmount && (
                          <span style={{ fontSize: 13, fontWeight: 800, color: "#22C55E" }}>
                            {fmt$(r.rewardAmount)}
                          </span>
                        )}
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Programs ── */}
          {tab === "programs" && (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {programs.map(p => {
                  const pReferrals = referrals.filter(r => r.programId === p.id);
                  const converted  = pReferrals.filter(r => ["converted","paid"].includes(r.status)).length;
                  const totalPaid  = pReferrals.filter(r => r.status === "paid").reduce((a, r) => a + parseFloat(r.rewardAmount ?? "0"), 0);
                  const rate       = pReferrals.length > 0 ? Math.round((converted / pReferrals.length) * 100) : 0;
                  return (
                    <div key={p.id} style={{
                      background: "rgba(11,22,41,0.85)", border: "1px solid rgba(255,255,255,0.07)",
                      borderLeft: `3px solid ${p.status === "active" ? "#22C55E" : "#475569"}`,
                      borderRadius: 12, padding: "18px 20px",
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 18 }}>{REWARD_ICON[p.rewardType]}</span>
                            <div style={{ fontSize: 14, fontWeight: 800, color: "#F1F5F9" }}>{p.name}</div>
                            <StatusBadge status={p.status} />
                          </div>
                          <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.45, marginBottom: 10 }}>{p.description}</div>
                          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                            {[
                              { label: "Reward",       value: `${fmt$(p.rewardValue)} ${p.rewardType}` },
                              { label: "Total Uses",   value: String(p.usesCount)                      },
                              { label: "Conversions",  value: `${converted} (${rate}%)`                },
                              { label: "Total Paid",   value: fmt$(totalPaid)                          },
                              { label: "Code",         value: p.referralCode                          },
                            ].map(s => (
                              <div key={s.label}>
                                <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.4px" }}>{s.label}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", fontFamily: s.label === "Code" ? "monospace" : "inherit" }}>{s.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 7 }}>
                          <button
                            onClick={() => copyShareLink(p)}
                            style={{
                              padding: "6px 12px", borderRadius: 7, fontSize: 10, fontWeight: 700,
                              cursor: "pointer", background: "rgba(56,189,248,0.08)",
                              border: "1px solid rgba(56,189,248,0.2)", color: "#38BDF8",
                            }}
                          >
                            {copiedCode === p.referralCode ? "✓ Copied" : "🔗 Copy Link"}
                          </button>
                          <button
                            onClick={() => toggleProgramStatus(p)}
                            style={{
                              padding: "6px 14px", borderRadius: 7, fontSize: 10, fontWeight: 700,
                              cursor: "pointer",
                              background: p.status === "active" ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)",
                              border: `1px solid ${p.status === "active" ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.2)"}`,
                              color: p.status === "active" ? "#F59E0B" : "#22C55E",
                            }}
                          >
                            {p.status === "active" ? "⏸ Pause" : "▶ Activate"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{
                marginTop: 18, background: "rgba(34,197,94,0.03)",
                border: "1px dashed rgba(34,197,94,0.2)", borderRadius: 12, padding: "18px 20px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>➕</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#CBD5E1", marginBottom: 4 }}>Create New Program</div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14 }}>Design a custom referral campaign for any customer segment</div>
                <button onClick={() => setShowCreateProgram(true)} style={{
                  padding: "8px 20px", borderRadius: 9, fontSize: 11, fontWeight: 700,
                  cursor: "pointer", background: "rgba(34,197,94,0.1)",
                  border: "1px solid rgba(34,197,94,0.3)", color: "#22C55E",
                }}>
                  + New Program
                </button>
              </div>
            </div>
          )}

          {/* ── Tab: Invitations ── */}
          {tab === "invitations" && (
            <ReferralInvitationsPanel programs={programs} />
          )}

          {/* ── Tab: Referrals ── */}
          {tab === "referrals" && (
            <div>
              {/* Filters */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                {["all", "pending", "converted", "paid", "cancelled"].map(s => (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s); loadReferrals(s); }}
                    style={{
                      padding: "5px 12px", borderRadius: 20, fontSize: 10, fontWeight: 600,
                      cursor: "pointer", textTransform: "capitalize",
                      background: statusFilter === s ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
                      border: statusFilter === s ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.08)",
                      color: statusFilter === s ? "#22C55E" : "rgba(148,163,184,0.65)",
                    }}
                  >{s}</button>
                ))}
                <button
                  onClick={() => setShowAddReferral(true)}
                  style={{
                    marginLeft: "auto", padding: "5px 14px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                    cursor: "pointer", background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.25)", color: "#22C55E",
                  }}
                >+ Add</button>
              </div>

              {/* Table */}
              <div style={{
                background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, overflow: "hidden",
              }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 100px 90px 80px 110px",
                  padding: "9px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)",
                  background: "rgba(255,255,255,0.02)",
                }}>
                  {["Referrer", "Referred", "Program", "Reward", "Source", "Status"].map(h => (
                    <div key={h} style={{ fontSize: 9, fontWeight: 700, color: "rgba(100,116,139,0.8)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</div>
                  ))}
                </div>
                {referrals.length === 0 && (
                  <div style={{ padding: "24px", textAlign: "center", fontSize: 12, color: "#475569" }}>No referrals found</div>
                )}
                {referrals.map((r, i) => (
                  <div key={r.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr 100px 90px 80px 110px",
                    padding: "11px 16px", alignItems: "center",
                    background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                  }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#CBD5E1" }}>{r.referrerName}</div>
                      <div style={{ fontSize: 9, color: "#475569" }}>{r.referrerPhone ?? r.referrerEmail ?? ""}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: r.referredName ? "#CBD5E1" : "#475569", fontStyle: r.referredName ? "normal" : "italic" }}>
                        {r.referredName ?? "Pending"}
                      </div>
                      <div style={{ fontSize: 9, color: "#475569" }}>{r.referredPhone ?? ""}</div>
                    </div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>{r.programName ?? "—"}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#22C55E" }}>{fmt$(r.rewardAmount)}</div>
                    <div style={{
                      fontSize: 9, color: "#64748B", background: "rgba(255,255,255,0.04)",
                      borderRadius: 5, padding: "2px 6px", textTransform: "capitalize",
                      display: "inline-block",
                    }}>{r.source}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <StatusBadge status={r.status} />
                      {r.status === "pending" && (
                        <button
                          onClick={() => updateStatus(r.id, "converted")}
                          title="Mark converted"
                          style={{
                            fontSize: 10, cursor: "pointer", background: "rgba(56,189,248,0.08)",
                            border: "1px solid rgba(56,189,248,0.2)", color: "#38BDF8",
                            borderRadius: 5, padding: "1px 6px",
                          }}
                        >✓</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tab: Payouts ── */}
          {tab === "payouts" && (
            <ReferralRewardsPanel />
          )}

        </div>
      </div>
    </AdminLayout>
  );
}
