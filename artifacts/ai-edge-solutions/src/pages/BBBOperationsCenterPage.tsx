import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Lead = {
  id: string;
  client_name: string;
  phone: string;
  event_type: string;
  status: string;
  message: string;
  created_at: string;
};

type SocialPost = {
  id: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  platforms: string;
};

type OpMetrics = {
  closeRate: string;
  revenueWon: string;
  pendingReviews: string;
  overdueReviews: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().slice(0, 10);

const isToday = (iso: string | null | undefined) => {
  if (!iso) return false;
  return iso.slice(0, 10) === todayStr();
};

const isThisWeek = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff < 7;
};

// ── Checklist ─────────────────────────────────────────────────────────────────

const CHECKLIST_ITEMS = [
  { icon: "📞", label: "Check missed calls",                link: "/admin/lead-recovery"     },
  { icon: "🤖", label: "Check AI receptionist logs",        link: "/admin/ai-receptionist"   },
  { icon: "📅", label: "Review scheduled posts",            link: "/admin/social-publishing" },
  { icon: "🌐", label: "Publish Apple/Bing/Nextdoor posts", link: "/admin/local-presence"    },
  { icon: "📋", label: "Check Yelp/Angi/Thumbtack leads",  link: "/admin/local-presence"    },
  { icon: "⭐", label: "Respond to reviews",                link: "/admin/reviews"           },
];

const LS_CHECKLIST = "bbb_ops_checklist_v1";
const LS_METRICS   = "bbb_ops_metrics_v1";

function loadChecklist(): boolean[] {
  try {
    const raw = localStorage.getItem(LS_CHECKLIST);
    if (!raw) return CHECKLIST_ITEMS.map(() => false);
    const parsed = JSON.parse(raw);
    if (parsed.date !== todayStr()) return CHECKLIST_ITEMS.map(() => false);
    return parsed.checked;
  } catch {
    return CHECKLIST_ITEMS.map(() => false);
  }
}

function saveChecklist(checked: boolean[]) {
  localStorage.setItem(LS_CHECKLIST, JSON.stringify({ date: todayStr(), checked }));
}

function loadMetrics(): OpMetrics {
  try {
    const raw = localStorage.getItem(LS_METRICS);
    if (!raw) return { closeRate: "", revenueWon: "", pendingReviews: "", overdueReviews: "" };
    return JSON.parse(raw);
  } catch {
    return { closeRate: "", revenueWon: "", pendingReviews: "", overdueReviews: "" };
  }
}

function saveMetrics(m: OpMetrics) {
  localStorage.setItem(LS_METRICS, JSON.stringify(m));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, accent }: { icon: string; title: string; accent: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
      paddingBottom: 10, borderBottom: `1px solid ${accent}20`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: `${accent}18`, border: `1px solid ${accent}30`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
      }}>{icon}</div>
      <span style={{ fontSize: 15, fontWeight: 700, color: "#E2E8F0" }}>{title}</span>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: {
  icon: string; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div style={{
      background: "rgba(11,22,41,0.8)", border: `1px solid ${color}22`,
      borderRadius: 12, padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#475569" }}>{sub}</div>}
    </div>
  );
}

function EditableStat({ icon, label, value, placeholder, color, prefix = "", suffix = "", onChange }: {
  icon: string; label: string; value: string; placeholder: string;
  color: string; prefix?: string; suffix?: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      style={{
        background: "rgba(11,22,41,0.8)", border: `1px solid ${color}22`,
        borderRadius: 12, padding: "16px 18px",
        display: "flex", flexDirection: "column", gap: 4, cursor: "pointer",
      }}
      onClick={() => setEditing(true)}
    >
      <div style={{ fontSize: 18 }}>{icon}</div>
      {editing ? (
        <input
          autoFocus
          defaultValue={value}
          placeholder={placeholder}
          onBlur={e  => { onChange(e.target.value); setEditing(false); }}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === "Escape") {
              onChange((e.target as HTMLInputElement).value);
              setEditing(false);
            }
          }}
          style={{
            fontSize: 20, fontWeight: 800, color,
            background: "transparent", border: "none",
            borderBottom: `1px solid ${color}60`, outline: "none",
            width: "100%", padding: "2px 0",
          }}
        />
      ) : (
        <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>
          {value
            ? `${prefix}${value}${suffix}`
            : <span style={{ color: "#334155", fontSize: 13 }}>— tap to set</span>
          }
        </div>
      )}
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      {!editing && <div style={{ fontSize: 10, color: "#334155" }}>Click to edit</div>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { icon: "📞", label: "Lead Recovery",      link: "/admin/lead-recovery",     color: "#22C55E" },
  { icon: "📍", label: "Local Presence",     link: "/admin/local-presence",    color: "#00AEEF" },
  { icon: "✈️",  label: "Publishing Center",  link: "/admin/social-publishing", color: "#F59E0B" },
  { icon: "🤖", label: "AI Receptionist",    link: "/admin/ai-receptionist",   color: "#3B82F6" },
];

export default function BBBOperationsCenterPage() {
  const apiFetch = useApiFetch();

  const [checked, setChecked]   = useState<boolean[]>(loadChecklist);
  const [metrics, setMetrics]   = useState<OpMetrics>(loadMetrics);

  const toggleCheck = (i: number) => {
    const next = [...checked];
    next[i] = !next[i];
    setChecked(next);
    saveChecklist(next);
  };

  const updateMetric = (key: keyof OpMetrics) => (v: string) => {
    const next = { ...metrics, [key]: v };
    setMetrics(next);
    saveMetrics(next);
  };

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["leads"],
    queryFn: async () => {
      const r = await apiFetch("/api/leads");
      if (!r.ok) throw new Error("leads fetch failed");
      return r.json();
    },
  });

  const { data: posts = [] } = useQuery<SocialPost[]>({
    queryKey: ["social-posts"],
    queryFn: async () => {
      const r = await apiFetch("/api/social-posts");
      if (!r.ok) throw new Error("posts fetch failed");
      return r.json();
    },
  });

  const leadsToday    = leads.filter(l => isToday(l.created_at)).length;
  const leadsWeek     = leads.filter(l => isThisWeek(l.created_at)).length;
  const scheduledToday = posts.filter(p => p.status === "scheduled" && isToday(p.scheduledAt)).length;
  const postedToday   = posts.filter(p => p.status === "published"  && isToday(p.publishedAt)).length;
  const pendingDrafts = posts.filter(p => p.status === "draft").length;

  const doneCount   = checked.filter(Boolean).length;
  const todayLabel  = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <AppShell>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 64px" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: "linear-gradient(135deg, rgba(0,174,239,0.15), rgba(0,174,239,0.3))",
              border: "1px solid rgba(0,174,239,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
            }}>🐛</div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0, lineHeight: 1.2 }}>
                BB&B Operations Center
              </h1>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                Bed Bugs &amp; Beyond · Baldwin County, AL
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#334155", paddingLeft: 58 }}>{todayLabel}</div>
        </div>

        {/* ── Main grid: checklist + summaries ── */}
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, marginBottom: 20 }}>

          {/* ── Daily Checklist ── */}
          <div style={{
            background: "rgba(11,22,41,0.7)", border: "1px solid rgba(0,174,239,0.12)",
            borderRadius: 16, padding: "22px",
          }}>
            <SectionHeader icon="✅" title="Daily Checklist" accent="#00AEEF" />

            {/* Progress */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#64748B" }}>{doneCount} of {CHECKLIST_ITEMS.length} done</span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: doneCount === CHECKLIST_ITEMS.length ? "#22C55E" : "#00AEEF",
                }}>
                  {Math.round((doneCount / CHECKLIST_ITEMS.length) * 100)}%
                </span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  width: `${(doneCount / CHECKLIST_ITEMS.length) * 100}%`,
                  background: doneCount === CHECKLIST_ITEMS.length ? "#22C55E" : "#00AEEF",
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>

            {/* Items */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {CHECKLIST_ITEMS.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                    background: checked[i] ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${checked[i] ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)"}`,
                    transition: "all 0.15s",
                  }}
                  onClick={() => toggleCheck(i)}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                    background: checked[i] ? "#22C55E" : "rgba(255,255,255,0.05)",
                    border: `1.5px solid ${checked[i] ? "#22C55E" : "rgba(255,255,255,0.15)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, color: "#fff", fontWeight: 700, transition: "all 0.15s",
                  }}>
                    {checked[i] && "✓"}
                  </div>

                  <span style={{ fontSize: 14 }}>{item.icon}</span>

                  <span style={{
                    fontSize: 13, flex: 1,
                    color: checked[i] ? "#475569" : "#CBD5E1",
                    textDecoration: checked[i] ? "line-through" : "none",
                  }}>
                    {item.label}
                  </span>

                  <Link to={item.link} onClick={e => e.stopPropagation()}>
                    <span style={{
                      fontSize: 10, color: "#475569",
                      padding: "2px 7px", background: "rgba(255,255,255,0.04)",
                      borderRadius: 4, transition: "color 0.15s",
                    }}>→</span>
                  </Link>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, fontSize: 10, color: "#1E293B", textAlign: "center" }}>
              Resets automatically at midnight each day
            </div>
          </div>

          {/* ── Right column: 3 summary cards ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Lead Summary */}
            <div style={{
              background: "rgba(11,22,41,0.7)", border: "1px solid rgba(34,197,94,0.12)",
              borderRadius: 16, padding: "22px",
            }}>
              <SectionHeader icon="📞" title="Lead Summary" accent="#22C55E" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <StatCard
                  icon="📅" label="Today" value={leadsToday} color="#22C55E"
                  sub={leadsToday === 0 ? "No leads yet" : undefined}
                />
                <StatCard
                  icon="📆" label="This Week" value={leadsWeek} color="#00AEEF"
                  sub={leadsWeek === 0 ? "No leads yet" : undefined}
                />
                <EditableStat
                  icon="🎯" label="Close Rate" value={metrics.closeRate}
                  placeholder="0" suffix="%" color="#F59E0B"
                  onChange={updateMetric("closeRate")}
                />
                <EditableStat
                  icon="💰" label="Revenue Won" value={metrics.revenueWon}
                  placeholder="0" prefix="$" color="#A78BFA"
                  onChange={updateMetric("revenueWon")}
                />
              </div>
            </div>

            {/* Publishing Summary */}
            <div style={{
              background: "rgba(11,22,41,0.7)", border: "1px solid rgba(245,158,11,0.12)",
              borderRadius: 16, padding: "22px",
            }}>
              <SectionHeader icon="✈️" title="Publishing Summary" accent="#F59E0B" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <StatCard
                  icon="📅" label="Scheduled Today" value={scheduledToday} color="#F59E0B"
                  sub={scheduledToday === 0 ? "Nothing scheduled" : undefined}
                />
                <StatCard
                  icon="✅" label="Posted Today" value={postedToday} color="#22C55E"
                  sub={postedToday === 0 ? "Nothing published yet" : undefined}
                />
                <StatCard
                  icon="✏️" label="Pending Drafts" value={pendingDrafts} color="#3B82F6"
                  sub="Awaiting publish"
                />
              </div>
            </div>

            {/* Review Summary */}
            <div style={{
              background: "rgba(11,22,41,0.7)", border: "1px solid rgba(251,191,36,0.12)",
              borderRadius: 16, padding: "22px",
            }}>
              <SectionHeader icon="⭐" title="Review Summary" accent="#FBBF24" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <EditableStat
                  icon="💬" label="Pending Responses" value={metrics.pendingReviews}
                  placeholder="0" color="#FBBF24"
                  onChange={updateMetric("pendingReviews")}
                />
                <EditableStat
                  icon="🚨" label="Overdue Responses" value={metrics.overdueReviews}
                  placeholder="0" color="#EF4444"
                  onChange={updateMetric("overdueReviews")}
                />
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: "#334155" }}>
                Click any number to update manually · Live review sync coming in v2
              </div>
            </div>

          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div style={{
          background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16, padding: "22px",
        }}>
          <SectionHeader icon="⚡" title="Quick Actions" accent="#00AEEF" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {QUICK_ACTIONS.map(qa => (
              <Link key={qa.label} to={qa.link}>
                <div
                  style={{
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    gap: 10, padding: "24px 16px",
                    background: `${qa.color}08`,
                    border: `1px solid ${qa.color}25`,
                    borderRadius: 14, cursor: "pointer",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.background     = `${qa.color}15`;
                    (e.currentTarget as HTMLDivElement).style.borderColor    = `${qa.color}55`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.background     = `${qa.color}08`;
                    (e.currentTarget as HTMLDivElement).style.borderColor    = `${qa.color}25`;
                  }}
                >
                  <span style={{ fontSize: 30 }}>{qa.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: qa.color, textAlign: "center" }}>
                    {qa.label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </AppShell>
  );
}
