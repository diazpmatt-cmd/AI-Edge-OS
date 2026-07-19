import { useState, useEffect, useCallback } from "react";
import { useApiFetch } from "@/lib/api";
import { AdminLayout } from "@/components/AdminLayout";

interface AuditData {
  id: number;
  clientId: string;
  aiSearchScore: number;
  authorityScore: number;
  reviewScore: number;
  competitorGapScore: number;
  createdAt: string;
  actionPlan?: ActionItem[];
}

interface ActionItem {
  priority: string;
  task: string;
  reason: string;
  impact: string;
  status: string;
}

interface CitationDir {
  name: string;
  icon: string;
  tier: 1 | 2 | 3;
  category: "general" | "home-services" | "pest-control" | "ai-search" | "local";
  status: "listed" | "missing" | "unverified" | "na";
  da: number;
  url?: string;
}

const CITATION_DIRS: CitationDir[] = [
  { name: "Google Business Profile", icon: "🌐", tier: 1, category: "general",       status: "listed",     da: 100 },
  { name: "Yelp",                    icon: "⭐", tier: 1, category: "general",       status: "missing",    da: 93  },
  { name: "Better Business Bureau",  icon: "🏛️", tier: 1, category: "general",       status: "missing",    da: 91  },
  { name: "Angi",                    icon: "🔧", tier: 1, category: "home-services",  status: "missing",    da: 90  },
  { name: "HomeAdvisor",             icon: "🏠", tier: 1, category: "home-services",  status: "missing",    da: 88  },
  { name: "Facebook Business",       icon: "📘", tier: 1, category: "general",       status: "listed",     da: 96  },
  { name: "Bing Places",             icon: "🔍", tier: 2, category: "general",       status: "listed",     da: 94  },
  { name: "Apple Business Connect",  icon: "🍎", tier: 2, category: "general",       status: "unverified", da: 100 },
  { name: "Thumbtack",               icon: "📌", tier: 2, category: "home-services",  status: "missing",    da: 75  },
  { name: "Nextdoor Business",       icon: "🏘️", tier: 2, category: "local",         status: "missing",    da: 74  },
  { name: "Houzz",                   icon: "🛋️", tier: 2, category: "home-services",  status: "missing",    da: 79  },
  { name: "Porch",                   icon: "🪴", tier: 2, category: "home-services",  status: "missing",    da: 68  },
  { name: "Foursquare",              icon: "📍", tier: 2, category: "local",         status: "missing",    da: 87  },
  { name: "MapQuest",                icon: "🗺️", tier: 2, category: "local",         status: "missing",    da: 71  },
  { name: "Alignable",               icon: "🤝", tier: 2, category: "local",         status: "missing",    da: 62  },
  { name: "ChatGPT / Bing",          icon: "🤖", tier: 1, category: "ai-search",     status: "missing",    da: 98  },
  { name: "Perplexity",              icon: "🧠", tier: 1, category: "ai-search",     status: "missing",    da: 85  },
  { name: "Google AI Mode",          icon: "✨", tier: 1, category: "ai-search",     status: "missing",    da: 100 },
  { name: "Siri / Apple Maps",       icon: "🍎", tier: 2, category: "ai-search",     status: "unverified", da: 100 },
  { name: "Alexa Business",          icon: "🔊", tier: 3, category: "ai-search",     status: "missing",    da: 84  },
  { name: "NPMA Directory",          icon: "🐛", tier: 2, category: "pest-control",  status: "missing",    da: 55  },
  { name: "PestWorld.org",           icon: "🌿", tier: 2, category: "pest-control",  status: "missing",    da: 52  },
  { name: "PCT Proquota",            icon: "📊", tier: 3, category: "pest-control",  status: "missing",    da: 48  },
  { name: "Pest Control World",      icon: "🦟", tier: 3, category: "pest-control",  status: "missing",    da: 44  },
];

const CITATION_STATUS_CFG = {
  listed:     { color: "#22C55E", label: "Listed",     dot: "●" },
  missing:    { color: "#EF4444", label: "Missing",    dot: "✕" },
  unverified: { color: "#F59E0B", label: "Unverified", dot: "⚠" },
  na:         { color: "#64748B", label: "N/A",        dot: "○" },
};

const TIER_LABELS = { 1: "Tier 1 — Critical", 2: "Tier 2 — High Value", 3: "Tier 3 — Supplemental" };
const TIER_COLORS = { 1: "#EF4444", 2: "#F59E0B", 3: "#64748B" };

const BACKLINKS = [
  { source: "Las Vegas Review-Journal",      url: "lvrj.com",              da: 78, type: "Media",    status: "active"  },
  { source: "NPMA Member Listing",           url: "npmapestworld.org",     da: 55, type: "Industry", status: "missing" },
  { source: "Henderson Chamber of Commerce", url: "hendersonchamber.com",  da: 48, type: "Local",    status: "missing" },
  { source: "Nevada Pest Control Assoc.",    url: "nevadapest.org",        da: 41, type: "Industry", status: "missing" },
  { source: "Vegas Valley Homeowners Blog",  url: "vegasvalleyhomes.com",  da: 31, type: "Local",    status: "missing" },
  { source: "BBB News Mention",              url: "bbb.org",               da: 91, type: "Authority",status: "missing" },
];

const SCHEMA_ITEMS = [
  { type: "LocalBusiness",          status: "missing",    impact: "Critical" },
  { type: "Service (Bed Bug Treatment)", status: "missing", impact: "High"  },
  { type: "FAQPage",                status: "missing",    impact: "High"    },
  { type: "Review / AggregateRating", status: "missing",  impact: "High"   },
  { type: "BreadcrumbList",         status: "missing",    impact: "Medium"  },
  { type: "Organization",           status: "missing",    impact: "Medium"  },
];

const NAP_CHECKS = [
  { platform: "Google Business Profile", name: "✓",   address: "✓",   phone: "✓",   status: "consistent" as const },
  { platform: "Facebook Business",       name: "✓",   address: "✓",   phone: "✓",   status: "consistent" as const },
  { platform: "Bing Places",             name: "✓",   address: "?",   phone: "✓",   status: "partial"    as const },
  { platform: "Yelp (not claimed)",      name: "—",   address: "—",   phone: "—",   status: "missing"    as const },
  { platform: "Apple Maps",              name: "✓",   address: "?",   phone: "?",   status: "partial"    as const },
  { platform: "BBB.org",                 name: "—",   address: "—",   phone: "—",   status: "missing"    as const },
  { platform: "Angi",                    name: "—",   address: "—",   phone: "—",   status: "missing"    as const },
];

const NAP_STATUS_CFG = {
  consistent: { color: "#22C55E", label: "Consistent" },
  partial:    { color: "#F59E0B", label: "Partial"    },
  missing:    { color: "#EF4444", label: "Missing"    },
};

type Tab = "citations" | "nap" | "backlinks" | "schema" | "actions";

const listed   = CITATION_DIRS.filter(d => d.status === "listed").length;
const missing  = CITATION_DIRS.filter(d => d.status === "missing").length;
const citScore = Math.round((listed / CITATION_DIRS.length) * 100);

function ScoreGauge({ score, color, label, sub }: { score: number; color: string; label: string; sub: string }) {
  const r = 38; const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width={100} height={100} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={50} cy={50} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={8} />
        <circle
          cx={50} cy={50} r={r} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </svg>
      <div style={{ marginTop: -76, zIndex: 1, textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 900, color }}>{score}</div>
        <div style={{ fontSize: 10, color: "rgba(148,163,184,0.7)", marginTop: -2 }}>/100</div>
      </div>
      <div style={{ height: 30, textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>{label}</div>
        <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

export default function AuthorityEnginePage() {
  const apiFetch = useApiFetch();
  const [audit, setAudit]   = useState<AuditData | null>(null);
  const [tab, setTab]       = useState<Tab>("citations");
  const [catFilter, setCat] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const clientId = new URLSearchParams(window.location.search).get("clientId") ?? "bbb";

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<AuditData>(`/ai-visibility/${clientId}`);
      setAudit(data);
    } catch {
      setAudit(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, clientId]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const authorityScore = audit?.authorityScore ?? 29;
  const napScore       = 71;
  const backlinkScore  = audit ? Math.min(100, Math.round((BACKLINKS.filter(b => b.status === "active").length / 10) * 100)) : 19;
  const schemaScore    = 0;
  const overallAuth    = Math.round((authorityScore + napScore + backlinkScore + schemaScore) / 4);

  const statusColor = (s: number) => s >= 70 ? "#22C55E" : s >= 40 ? "#F59E0B" : "#EF4444";

  const filteredDirs = catFilter === "all"
    ? CITATION_DIRS
    : CITATION_DIRS.filter(d => d.category === catFilter);

  const CATS = [
    { id: "all",          label: "All"          },
    { id: "general",      label: "General"      },
    { id: "home-services",label: "Home Services" },
    { id: "ai-search",    label: "AI Search"    },
    { id: "pest-control", label: "Pest Control" },
    { id: "local",        label: "Local"        },
  ];

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "citations", label: "Citation Network", icon: "📋" },
    { id: "nap",       label: "NAP Consistency",  icon: "📍" },
    { id: "backlinks", label: "Backlink Profile",  icon: "🔗" },
    { id: "schema",    label: "Structured Data",   icon: "🧩" },
    { id: "actions",   label: "Action Plan",       icon: "⚡" },
  ];

  return (
    <AdminLayout>
      <div style={{ minHeight: "100vh", background: "#030612", padding: "28px 24px 48px" }}>
        {/* ── Header ── */}
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.8px",
                  color: "#38BDF8", background: "rgba(56,189,248,0.1)",
                  border: "1px solid rgba(56,189,248,0.25)", borderRadius: 5, padding: "2px 8px",
                }}>AUTHORITY ENGINE</span>
              </div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: "#F1F5F9", margin: 0, lineHeight: 1.15 }}>
                Edge Authority
              </h1>
              <p style={{ fontSize: 13, color: "#94A3B8", margin: "3px 0 0", fontWeight: 500 }}>
                Domain Authority &amp; Citation Builder
              </p>
              <p style={{ fontSize: 13, color: "#64748B", margin: "5px 0 0" }}>
                Bed Bugs &amp; Beyond · Las Vegas, NV · Pest Control
              </p>
            </div>
            <button
              onClick={fetchAudit}
              disabled={loading}
              style={{
                padding: "9px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                cursor: loading ? "default" : "pointer",
                background: loading ? "rgba(56,189,248,0.05)" : "rgba(56,189,248,0.1)",
                border: "1px solid rgba(56,189,248,0.3)", color: "#38BDF8",
                letterSpacing: "0.3px",
              }}
            >
              {loading ? "Refreshing…" : "↻ Refresh Scores"}
            </button>
          </div>

          {/* ── Score Overview ── */}
          <div style={{
            background: "linear-gradient(135deg, rgba(6,20,32,0.95), rgba(3,6,18,0.9))",
            border: "1px solid rgba(56,189,248,0.18)",
            borderRadius: 16, padding: "24px 28px", marginBottom: 24,
            boxShadow: "0 0 40px rgba(56,189,248,0.07), 0 4px 24px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
              {/* Overall score */}
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{
                  width: 88, height: 88, borderRadius: "50%",
                  background: `conic-gradient(${statusColor(overallAuth)} ${overallAuth * 3.6}deg, rgba(255,255,255,0.04) 0deg)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 0 24px ${statusColor(overallAuth)}30`,
                }}>
                  <div style={{
                    width: 68, height: 68, borderRadius: "50%",
                    background: "#030612",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 24, fontWeight: 900, color: statusColor(overallAuth), lineHeight: 1 }}>{overallAuth}</span>
                    <span style={{ fontSize: 9, color: "rgba(148,163,184,0.6)" }}>/100</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9" }}>Overall Authority Score</div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
                    Needs significant improvement · {missing} citation gaps identified
                  </div>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    marginTop: 7, padding: "3px 10px", borderRadius: 20,
                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444", display: "inline-block" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444" }}>Below Competitor Average</span>
                  </div>
                </div>
              </div>

              {/* Sub-score gauges */}
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <ScoreGauge score={citScore}       color={statusColor(citScore)}       label="Citations"    sub={`${listed}/${CITATION_DIRS.length} listed`} />
                <ScoreGauge score={napScore}       color={statusColor(napScore)}       label="NAP Consistency" sub="4 of 7 verified" />
                <ScoreGauge score={backlinkScore}  color={statusColor(backlinkScore)}  label="Backlinks"    sub="1 active link" />
                <ScoreGauge score={schemaScore}    color="#EF4444"                    label="Schema.org"   sub="Not configured" />
              </div>
            </div>
          </div>

          {/* ── Alert banner ── */}
          <div style={{
            background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 10, padding: "11px 16px", marginBottom: 22,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div style={{ fontSize: 12, color: "#FCA5A5" }}>
              <strong>Citation gap detected:</strong> Competitors average 30+ citations. Bed Bugs &amp; Beyond has{" "}
              <strong>{listed}</strong> active citations. Closing this gap is the single highest-impact action for
              ranking in Google Maps and AI search results.
            </div>
          </div>

          {/* ── Tabs ── */}
          <div style={{
            display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap",
            background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 4,
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: "1 1 auto", padding: "9px 14px", borderRadius: 7,
                  fontSize: 11, fontWeight: tab === t.id ? 700 : 500,
                  cursor: "pointer",
                  background: tab === t.id ? "rgba(56,189,248,0.12)" : "transparent",
                  border: tab === t.id ? "1px solid rgba(56,189,248,0.3)" : "1px solid transparent",
                  color: tab === t.id ? "#38BDF8" : "rgba(148,163,184,0.7)",
                  transition: "all 0.15s", whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>

          {/* ── Tab: Citations ── */}
          {tab === "citations" && (
            <div>
              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
                {[
                  { label: "Listed",     value: listed,                                color: "#22C55E", icon: "✓" },
                  { label: "Missing",    value: missing,                               color: "#EF4444", icon: "✕" },
                  { label: "Unverified", value: CITATION_DIRS.filter(d => d.status === "unverified").length, color: "#F59E0B", icon: "⚠" },
                  { label: "Citation Score", value: `${citScore}%`,                   color: statusColor(citScore), icon: "📊" },
                ].map(s => (
                  <div key={s.label} style={{
                    background: "rgba(11,22,41,0.8)", border: `1px solid ${s.color}20`,
                    borderLeft: `3px solid ${s.color}`, borderRadius: 10, padding: "12px 16px",
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Category filter */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                {CATS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCat(c.id)}
                    style={{
                      padding: "5px 12px", borderRadius: 20, fontSize: 10, fontWeight: 600,
                      cursor: "pointer",
                      background: catFilter === c.id ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
                      border: catFilter === c.id ? "1px solid rgba(56,189,248,0.35)" : "1px solid rgba(255,255,255,0.08)",
                      color: catFilter === c.id ? "#38BDF8" : "rgba(148,163,184,0.65)",
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Tier groups */}
              {([1, 2, 3] as const).map(tier => {
                const dirs = filteredDirs.filter(d => d.tier === tier);
                if (!dirs.length) return null;
                return (
                  <div key={tier} style={{ marginBottom: 20 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
                    }}>
                      <div style={{
                        height: 1, flex: 1,
                        background: `linear-gradient(90deg, ${TIER_COLORS[tier]}40, transparent)`,
                      }} />
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: TIER_COLORS[tier],
                        letterSpacing: "0.6px", textTransform: "uppercase",
                      }}>
                        {TIER_LABELS[tier]}
                      </span>
                      <div style={{
                        height: 1, flex: 1,
                        background: `linear-gradient(90deg, transparent, ${TIER_COLORS[tier]}40)`,
                      }} />
                    </div>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                      gap: 8,
                    }}>
                      {dirs.map(d => {
                        const sc = CITATION_STATUS_CFG[d.status];
                        return (
                          <div key={d.name} style={{
                            background: "rgba(11,22,41,0.75)",
                            border: `1px solid ${sc.color}20`,
                            borderLeft: `3px solid ${sc.color}`,
                            borderRadius: 9, padding: "11px 14px",
                            display: "flex", alignItems: "center", gap: 10,
                          }}>
                            <span style={{ fontSize: 18, flexShrink: 0 }}>{d.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: 11, fontWeight: 700,
                                color: d.status === "listed" ? "#E2E8F0" : "rgba(148,163,184,0.75)",
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                              }}>{d.name}</div>
                              <div style={{ fontSize: 9.5, color: "rgba(100,116,139,0.8)", marginTop: 1 }}>
                                DA {d.da} · {d.category}
                              </div>
                            </div>
                            <span style={{
                              fontSize: 9, fontWeight: 700,
                              color: sc.color, background: `${sc.color}14`,
                              border: `1px solid ${sc.color}28`,
                              borderRadius: 20, padding: "2px 7px", flexShrink: 0,
                              display: "flex", alignItems: "center", gap: 3,
                            }}>
                              {sc.dot} {sc.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Tab: NAP Consistency ── */}
          {tab === "nap" && (
            <div>
              <div style={{
                background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, overflow: "hidden", marginBottom: 18,
              }}>
                <div style={{
                  padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.02)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>NAP Audit — Bed Bugs &amp; Beyond</div>
                  <div style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600 }}>Score: 71/100</div>
                </div>
                <div style={{ padding: "8px 0" }}>
                  {/* Header row */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 80px 80px 110px",
                    gap: 0, padding: "6px 18px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}>
                    {["Platform", "Name", "Address", "Phone", "Status"].map(h => (
                      <div key={h} style={{ fontSize: 9, fontWeight: 700, color: "rgba(100,116,139,0.8)", letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</div>
                    ))}
                  </div>
                  {NAP_CHECKS.map((row, i) => {
                    const sc = NAP_STATUS_CFG[row.status];
                    return (
                      <div key={row.platform} style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 80px 80px 80px 110px",
                        gap: 0, padding: "11px 18px",
                        background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                        alignItems: "center",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>{row.platform}</div>
                        {[row.name, row.address, row.phone].map((v, j) => (
                          <div key={j} style={{
                            fontSize: 14,
                            color: v === "✓" ? "#22C55E" : v === "?" ? "#F59E0B" : v === "—" ? "#475569" : "#E2E8F0",
                          }}>{v}</div>
                        ))}
                        <div>
                          <span style={{
                            fontSize: 9, fontWeight: 700,
                            color: sc.color, background: `${sc.color}14`,
                            border: `1px solid ${sc.color}28`,
                            borderRadius: 20, padding: "2px 8px",
                          }}>{sc.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{
                background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 10, padding: "13px 16px",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#F59E0B", marginBottom: 6 }}>Why NAP Consistency Matters</div>
                <div style={{ fontSize: 12, color: "rgba(203,213,225,0.7)", lineHeight: 1.6 }}>
                  Google cross-references your business name, address, and phone number across the web to verify your legitimacy.
                  Inconsistencies or missing listings reduce your Google Maps ranking and make it harder for AI search tools
                  like ChatGPT and Perplexity to confidently surface your business. Claim and verify each missing platform above.
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Backlinks ── */}
          {tab === "backlinks" && (
            <div>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 10, marginBottom: 18,
              }}>
                {[
                  { label: "Active Backlinks",    value: BACKLINKS.filter(b => b.status === "active").length,  color: "#22C55E" },
                  { label: "Opportunities",        value: BACKLINKS.filter(b => b.status === "missing").length, color: "#F59E0B" },
                  { label: "Target (competitive)", value: "20+",                                                color: "#38BDF8" },
                  { label: "Backlink Score",       value: `${backlinkScore}/100`,                              color: statusColor(backlinkScore) },
                ].map(s => (
                  <div key={s.label} style={{
                    background: "rgba(11,22,41,0.8)", border: `1px solid ${s.color}20`,
                    borderLeft: `3px solid ${s.color}`, borderRadius: 10, padding: "12px 16px",
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div style={{
                background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, overflow: "hidden",
              }}>
                <div style={{
                  padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.02)",
                  fontSize: 13, fontWeight: 700, color: "#E2E8F0",
                }}>
                  Backlink Opportunities
                </div>
                <div style={{ padding: "8px 0" }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 120px 90px",
                    padding: "6px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}>
                    {["Source", "DA", "Type", "Status"].map(h => (
                      <div key={h} style={{ fontSize: 9, fontWeight: 700, color: "rgba(100,116,139,0.8)", letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</div>
                    ))}
                  </div>
                  {BACKLINKS.map((b, i) => (
                    <div key={b.source} style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 120px 90px",
                      padding: "12px 18px",
                      background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      alignItems: "center",
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>{b.source}</div>
                        <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{b.url}</div>
                      </div>
                      <div style={{
                        fontSize: 11, fontWeight: 700,
                        color: b.da >= 70 ? "#22C55E" : b.da >= 40 ? "#F59E0B" : "#94A3B8",
                      }}>{b.da}</div>
                      <div style={{
                        fontSize: 10, color: "#64748B",
                        background: "rgba(255,255,255,0.04)", borderRadius: 5,
                        padding: "2px 8px", display: "inline-block",
                      }}>{b.type}</div>
                      <div>
                        <span style={{
                          fontSize: 9, fontWeight: 700,
                          color: b.status === "active" ? "#22C55E" : "#F59E0B",
                          background: b.status === "active" ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)",
                          border: `1px solid ${b.status === "active" ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.25)"}`,
                          borderRadius: 20, padding: "2px 8px",
                        }}>
                          {b.status === "active" ? "● Active" : "○ Opportunity"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Structured Data ── */}
          {tab === "schema" && (
            <div>
              <div style={{
                background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 10, padding: "13px 16px", marginBottom: 18,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>🧩</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#FCA5A5", marginBottom: 3 }}>
                    No Structured Data Detected — Score: 0/100
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(203,213,225,0.6)", lineHeight: 1.5 }}>
                    Schema.org markup helps Google, ChatGPT, and Perplexity understand your business and surface it in rich
                    results. Adding these schemas to your website directly boosts Google Maps rankings and AI search visibility.
                  </div>
                </div>
              </div>

              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10,
              }}>
                {SCHEMA_ITEMS.map(s => (
                  <div key={s.type} style={{
                    background: "rgba(11,22,41,0.8)",
                    border: "1px solid rgba(239,68,68,0.15)",
                    borderLeft: "3px solid rgba(239,68,68,0.5)",
                    borderRadius: 10, padding: "14px 16px",
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <span style={{ fontSize: 20 }}>✕</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>{s.type}</div>
                      <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>Not implemented</div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      color: s.impact === "Critical" ? "#EF4444" : s.impact === "High" ? "#F59E0B" : "#64748B",
                      background: s.impact === "Critical" ? "rgba(239,68,68,0.1)" : s.impact === "High" ? "rgba(245,158,11,0.1)" : "rgba(100,116,139,0.1)",
                      border: `1px solid ${s.impact === "Critical" ? "rgba(239,68,68,0.2)" : s.impact === "High" ? "rgba(245,158,11,0.2)" : "rgba(100,116,139,0.2)"}`,
                      borderRadius: 20, padding: "2px 8px", flexShrink: 0,
                    }}>{s.impact}</span>
                  </div>
                ))}
              </div>

              <div style={{
                marginTop: 18, background: "rgba(56,189,248,0.05)",
                border: "1px solid rgba(56,189,248,0.15)",
                borderRadius: 10, padding: "14px 16px",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#38BDF8", marginBottom: 6 }}>Quick Win: LocalBusiness Schema</div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(148,163,184,0.8)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
{`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Bed Bugs & Beyond",
  "description": "Expert bed bug extermination in Las Vegas, NV.",
  "telephone": "+1-702-XXX-XXXX",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Las Vegas",
    "addressRegion": "NV",
    "addressCountry": "US"
  },
  "geo": { "@type": "GeoCoordinates", "latitude": 36.1699, "longitude": -115.1398 },
  "openingHours": "Mo-Su 07:00-21:00",
  "priceRange": "$$",
  "areaServed": "Las Vegas, Henderson, Summerlin, North Las Vegas"
}
</script>`}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Action Plan ── */}
          {tab === "actions" && (
            <div>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12,
              }}>
                {[
                  {
                    priority: "critical", icon: "🔴", order: 1,
                    task: "Claim & verify Yelp listing",
                    reason: "Yelp DA 93 · Highest-impact missing citation. Powers AI search results.",
                    impact: "High", time: "30 min",
                    steps: ["Visit biz.yelp.com", "Search for existing listing", "Claim & verify with phone call", "Complete all business fields"],
                  },
                  {
                    priority: "critical", icon: "🔴", order: 2,
                    task: "Submit to Better Business Bureau",
                    reason: "BBB accreditation DA 91. Significantly improves trust signals for AI search.",
                    impact: "High", time: "1 hr",
                    steps: ["Visit bbb.org/apply", "Choose pest control category", "Complete business profile", "Pay accreditation fee"],
                  },
                  {
                    priority: "critical", icon: "🔴", order: 3,
                    task: "Add LocalBusiness Schema to website",
                    reason: "Schema.org structured data is required for ChatGPT and Google AI Mode to surface BBB.",
                    impact: "High", time: "2 hrs",
                    steps: ["Copy schema template (see Structured Data tab)", "Add to website <head>", "Test with Google Rich Results Test", "Submit updated sitemap"],
                  },
                  {
                    priority: "high", icon: "🟡", order: 4,
                    task: "Create Angi & HomeAdvisor profiles",
                    reason: "Home services platforms. DA 88-90 citations widely used by AI search tools.",
                    impact: "Medium", time: "1 hr",
                    steps: ["angi.com/professional → create pro account", "homeadvisor.com → list your business", "Add all services including Heat Treatment"],
                  },
                  {
                    priority: "high", icon: "🟡", order: 5,
                    task: "Verify Apple Business Connect",
                    reason: "Powers Siri and Apple Maps results. Currently unverified — quick win.",
                    impact: "Medium", time: "20 min",
                    steps: ["Visit businessconnect.apple.com", "Claim Bed Bugs & Beyond", "Verify via phone", "Add photos and services"],
                  },
                  {
                    priority: "high", icon: "🟡", order: 6,
                    task: "Join NPMA Directory",
                    reason: "Industry association listing signals expertise to AI platforms. Direct backlink from npmapestworld.org.",
                    impact: "Medium", time: "2 hrs",
                    steps: ["Join NPMA at npmapestworld.org/join", "Create member directory listing", "Add NPMA badge to website"],
                  },
                  {
                    priority: "medium", icon: "⚪", order: 7,
                    task: "List on Thumbtack & Porch",
                    reason: "Home services lead directories. DA 68-75. Increases citation breadth.",
                    impact: "Low", time: "1 hr",
                    steps: ["Create Thumbtack Pro account at thumbtack.com/pro", "Set service area to Las Vegas metro", "List on porch.com/pro"],
                  },
                  {
                    priority: "medium", icon: "⚪", order: 8,
                    task: "Set up Nextdoor Business",
                    reason: "Hyper-local platform. High trust signal for neighborhood-level Google Maps ranking.",
                    impact: "Medium", time: "30 min",
                    steps: ["Visit business.nextdoor.com", "Create Las Vegas service area profile", "Ask customers to recommend on Nextdoor"],
                  },
                ].map(a => (
                  <div key={a.task} style={{
                    background: "rgba(11,22,41,0.8)",
                    border: `1px solid ${a.priority === "critical" ? "rgba(239,68,68,0.2)" : a.priority === "high" ? "rgba(245,158,11,0.2)" : "rgba(100,116,139,0.15)"}`,
                    borderTop: `3px solid ${a.priority === "critical" ? "#EF4444" : a.priority === "high" ? "#F59E0B" : "#475569"}`,
                    borderRadius: 11, padding: "16px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, color: "#030612",
                        background: a.priority === "critical" ? "#EF4444" : a.priority === "high" ? "#F59E0B" : "#475569",
                        borderRadius: 20, padding: "2px 8px", flexShrink: 0,
                      }}>#{a.order}</span>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0", lineHeight: 1.3 }}>{a.task}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5, marginBottom: 10 }}>{a.reason}</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 9, fontWeight: 600, color: "#38BDF8",
                        background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)",
                        borderRadius: 5, padding: "2px 8px",
                      }}>⏱ {a.time}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 600,
                        color: a.impact === "High" ? "#22C55E" : a.impact === "Medium" ? "#F59E0B" : "#64748B",
                        background: a.impact === "High" ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
                        border: `1px solid ${a.impact === "High" ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`,
                        borderRadius: 5, padding: "2px 8px",
                      }}>{a.impact} Impact</span>
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(100,116,139,0.9)", lineHeight: 1.7 }}>
                      {a.steps.map((s, i) => (
                        <div key={i} style={{ display: "flex", gap: 6 }}>
                          <span style={{ color: "#38BDF8", flexShrink: 0 }}>{i + 1}.</span>
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
