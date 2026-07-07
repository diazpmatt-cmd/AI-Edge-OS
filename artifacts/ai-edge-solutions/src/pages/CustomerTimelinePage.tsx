import { useState, useMemo } from "react";
import { useQuery }          from "@tanstack/react-query";
import { useApiFetch }       from "@/lib/api";
import { AppShell }          from "@/components/app-shell";

// ── Brand ─────────────────────────────────────────────────────────────────────
const B = {
  navy:      "#030612",
  panel:     "#080E1F",
  blue:      "#00AEEF",
  cyan:      "#06B6D4",
  silver:    "#94A3B8",
  white:     "#FFFFFF",
  green:     "#22C55E",
  emerald:   "#10B981",
  gold:      "#FBBF24",
  red:       "#F87171",
  orange:    "#F97316",
  purple:    "#A78BFA",
  dim:       "#64748B",
  border:    "rgba(0,174,239,0.15)",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Lead {
  id:           string;
  customerName: string | null;
  phone:        string | null;
  source:       string | null;
  message:      string | null;
  eventType:    string | null;
  status:       string | null;
  createdAt:    string;
}

interface LeadsResponse {
  leads: Lead[];
  stats: { total: number; active: number; thisMonth: number; withMessages: number };
}

interface CallMetrics {
  metrics: {
    total_calls:       number;
    missed_calls:      number;
    recovery_rate:     number | null;
    sms_conversations: number;
    leads_captured:    number;
  };
}

interface AttrLead {
  id:           string;
  customerName: string;
  phone:        string | null;
  leadSource:   string | null;
  status:       string;
  revenue:      number | null;
  serviceType:  string | null;
  matchedAt:    string | null;
  createdAt:    string;
}

interface ReviewRequest {
  id:           string;
  customerName: string;
  contact:      string | null;
  platform:     string | null;
  status:       string | null;
  sentAt:       string | null;
}

interface ReviewsResponse {
  requests: ReviewRequest[];
}

// ── Unified event type ────────────────────────────────────────────────────────
interface TimelineEvent {
  id:           string;
  timestamp:    string;
  icon:         string;
  title:        string;
  desc:         string;
  color:        string;
  customer:     string;
  phone:        string;
  source:       "lead" | "attribution" | "review";
  recordingUrl?: string;
}

// ── Event builders ────────────────────────────────────────────────────────────
function eventTypeLabel(et: string | null): { icon: string; title: string; color: string } {
  switch (et) {
    case "missed_call":
    case "call_hangup_missed":
      return { icon: "📞", title: "Missed Call Captured",     color: B.red    };
    case "telnyx_textback_sent":
      return { icon: "📱", title: "AI Text Sent",             color: B.blue   };
    case "telnyx_sms_reply":
    case "message_received":
      return { icon: "💬", title: "Customer Replied via SMS", color: B.cyan   };
    case "sms":
      return { icon: "💬", title: "Inbound SMS",              color: B.cyan   };
    case "transferred":
      return { icon: "☎️",  title: "Call Transferred",        color: B.emerald};
    case "callback":
      return { icon: "📲", title: "Callback Requested",       color: B.green  };
    case "voicemail":
      return { icon: "📬", title: "Voicemail Left",           color: B.orange };
    default:
      return { icon: "🤖", title: "Lead Captured",            color: B.purple };
  }
}

function leadsToEvents(leads: Lead[]): TimelineEvent[] {
  return leads.map(l => {
    const { icon, title, color } = eventTypeLabel(l.eventType);
    const name = l.customerName ?? "Unknown Caller";
    const phone = l.phone ?? "";
    const msg = l.message?.trim();
    const desc = msg
      ? `${name}${phone ? ` · ${phone}` : ""} — "${msg.slice(0, 120)}${msg.length > 120 ? "…" : ""}"`
      : `${name}${phone ? ` · ${phone}` : ""}`;
    const recordingUrl = (l.eventType === "telnyx_voicemail" && l.message)
      ? (l.message.match(/https?:\/\/\S+/)?.[0] ?? undefined)
      : undefined;
    return {
      id:        l.id,
      timestamp: l.createdAt,
      icon, title, color,
      customer:  name,
      phone,
      desc,
      source:    "lead" as const,
      recordingUrl,
    };
  });
}

function attrToEvents(leads: AttrLead[]): TimelineEvent[] {
  return leads
    .filter(l => (l.status === "won" || l.status === "matched") && (l.matchedAt || l.createdAt))
    .map(l => {
      const isWon = l.status === "won";
      return {
        id:        `attr-${l.id}`,
        timestamp: l.matchedAt ?? l.createdAt,
        icon:      isWon ? "💰" : "🔗",
        title:     isWon ? "Revenue Matched" : "Matched to GorillaDesk",
        desc:      isWon
          ? `${l.customerName} · ${l.serviceType ?? "Service"} · ${l.revenue ? `$${l.revenue.toLocaleString()}` : "amount pending"}`
          : `${l.customerName} matched to a GorillaDesk customer record`,
        color:     isWon ? B.emerald : B.cyan,
        customer:  l.customerName,
        phone:     l.phone ?? "",
        source:    "attribution" as const,
      };
    });
}

function reviewsToEvents(requests: ReviewRequest[]): TimelineEvent[] {
  return requests
    .filter(r => r.sentAt)
    .map(r => {
      const done = r.status === "completed" || r.status === "responded";
      return {
        id:        `rev-${r.id}`,
        timestamp: r.sentAt!,
        icon:      done ? "⭐" : "📩",
        title:     done ? "Review Received" : "Review Request Sent",
        desc:      `${r.customerName} · ${r.platform ?? "Review platform"}${r.contact ? ` · ${r.contact}` : ""}`,
        color:     done ? B.gold : B.purple,
        customer:  r.customerName,
        phone:     r.contact ?? "",
        source:    "review" as const,
      };
    });
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function LiveBadge() {
  return (
    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1px", background: `${B.green}22`, color: B.green, border: `1px solid ${B.green}44`, borderRadius: 10, padding: "2px 7px" }}>
      🟢 LIVE
    </span>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "2.5px", color: B.blue, textTransform: "uppercase", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ flex: 1, height: 1, background: `${B.blue}33` }} />
      {text}
      <span style={{ flex: 1, height: 1, background: `${B.blue}33` }} />
    </div>
  );
}

function Panel({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 14, padding: "20px 24px", boxSizing: "border-box", ...style }}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
      <div style={{ width: 28, height: 28, border: `3px solid ${B.border}`, borderTopColor: B.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) + " · Today";
  }
  if (diffDays === 1) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) + " · Yesterday";
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " +
         d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function sourceTag(src: TimelineEvent["source"]) {
  if (src === "attribution") return { label: "Revenue Attribution", color: B.emerald };
  if (src === "review")      return { label: "Reviews",             color: B.gold    };
  return                            { label: "AI Receptionist",     color: B.blue    };
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CustomerTimelinePage() {
  const apiFetch = useApiFetch();
  const [search, setSearch] = useState("");

  const leadsQ = useQuery<LeadsResponse>({
    queryKey: ["timeline-leads"],
    queryFn:  () => apiFetch("/leads"),
    staleTime: 2 * 60_000,
  });

  const callsQ = useQuery<CallMetrics>({
    queryKey: ["timeline-calls"],
    queryFn:  () => apiFetch("/call-intelligence?period=30days"),
    staleTime: 2 * 60_000,
  });

  const attrQ = useQuery<AttrLead[]>({
    queryKey: ["timeline-attribution"],
    queryFn:  () => apiFetch("/revenue-attribution?clientId=default"),
    staleTime: 2 * 60_000,
  });

  const reviewsQ = useQuery<ReviewsResponse>({
    queryKey: ["timeline-reviews"],
    queryFn:  () => apiFetch("/reviews/requests"),
    staleTime: 2 * 60_000,
  });

  const isLoading = leadsQ.isLoading || callsQ.isLoading;

  // Merge + sort all events newest-first
  const allEvents = useMemo<TimelineEvent[]>(() => {
    const leadEvents  = leadsToEvents(leadsQ.data?.leads ?? []);
    const attrEvents  = attrToEvents(attrQ.data ?? []);
    const revEvents   = reviewsToEvents(reviewsQ.data?.requests ?? []);

    // Deduplicate attribution events that are also in leads (same customer+hour)
    const leadKeys = new Set(leadEvents.map(e => e.phone + e.timestamp.slice(0, 13)));
    const filteredAttr = attrEvents.filter(e => !leadKeys.has(e.phone + e.timestamp.slice(0, 13)));

    return [...leadEvents, ...filteredAttr, ...revEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 100);
  }, [leadsQ.data, attrQ.data, reviewsQ.data]);

  // Client-side filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allEvents;
    return allEvents.filter(e =>
      e.customer.toLowerCase().includes(q) ||
      e.phone.includes(q) ||
      e.title.toLowerCase().includes(q) ||
      e.desc.toLowerCase().includes(q)
    );
  }, [allEvents, search]);

  const stats   = leadsQ.data?.stats;
  const metrics = callsQ.data?.metrics;

  return (
    <AppShell>
      <div style={{
        minHeight: "100vh", background: B.navy,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
        color: B.white, padding: "28px 32px", boxSizing: "border-box",
      }}>

        {/* ══ Header ═══════════════════════════════════════════════════════════ */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "3px", color: B.blue, textTransform: "uppercase", marginBottom: 6 }}>
                BB&amp;B · AI Edge OS
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.5px" }}>
                👤 Customer Activity Feed
              </h1>
              <div style={{ fontSize: 13, color: B.silver }}>
                Real-time customer interactions — calls, texts, leads, revenue, reviews
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: B.silver, pointerEvents: "none" }}>🔍</span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter by name or phone…"
                  style={{
                    background: B.panel, border: `1px solid ${B.border}`,
                    borderRadius: 30, padding: "10px 16px 10px 36px",
                    color: B.white, fontSize: 13, outline: "none", width: 230,
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: `${B.green}15`, border: `1px solid ${B.green}33`, borderRadius: 30, padding: "8px 16px" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: B.green, display: "inline-block" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: B.green }}>
                  {allEvents.length} Event{allEvents.length !== 1 ? "s" : ""} · Live
                </span>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? <Spinner /> : (
          <>
            {/* ══ KPI Strip ════════════════════════════════════════════════════ */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
              {[
                { icon: "🤖", label: "Total Leads",       value: stats ? String(stats.total)     : "—", sub: "All AI-captured leads",        color: B.blue    },
                { icon: "🔥", label: "Active Leads",      value: stats ? String(stats.active)    : "—", sub: "New or contacted",             color: B.orange  },
                { icon: "📅", label: "This Month",        value: stats ? String(stats.thisMonth) : "—", sub: "New leads captured",           color: B.green   },
                { icon: "📞", label: "Calls (30 days)",   value: metrics ? String(metrics.total_calls) : "—", sub: metrics?.recovery_rate != null ? `${metrics.recovery_rate}% recovery rate` : "Call intelligence", color: B.cyan },
              ].map(k => (
                <Panel key={k.label} style={{ borderColor: `${k.color}33` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <span style={{ fontSize: 20 }}>{k.icon}</span>
                    <LiveBadge />
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: k.color, letterSpacing: "-1px", marginBottom: 4 }}>{k.value}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: B.white, marginBottom: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 11, color: B.dim }}>{k.sub}</div>
                </Panel>
              ))}
            </div>

            {/* ══ Timeline ═════════════════════════════════════════════════════ */}
            <SectionLabel text={search ? `Filtered Results — ${filtered.length} event${filtered.length !== 1 ? "s" : ""}` : `Customer Activity — ${allEvents.length} Event${allEvents.length !== 1 ? "s" : ""}`} />

            {filtered.length === 0 ? (
              <Panel>
                <div style={{ textAlign: "center", padding: "48px 24px", color: B.dim }}>
                  <div style={{ fontSize: 40, marginBottom: 14 }}>
                    {search ? "🔍" : "👤"}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: B.silver, marginBottom: 8 }}>
                    {search ? `No results for "${search}"` : "No customer activity yet."}
                  </div>
                  <div style={{ fontSize: 12, color: B.dim }}>
                    {search
                      ? "Try a different name, phone number, or keyword."
                      : "Customer interactions will appear here as leads come in via calls, texts, and the AI Receptionist."}
                  </div>
                </div>
              </Panel>
            ) : (
              <Panel style={{ padding: "24px 28px" }}>
                {filtered.map((ev, i) => {
                  const tag = sourceTag(ev.source);
                  return (
                    <div key={ev.id} style={{ display: "flex", gap: 16, paddingBottom: i < filtered.length - 1 ? 22 : 0, position: "relative" }}>
                      {/* Connector line */}
                      {i < filtered.length - 1 && (
                        <div style={{
                          position: "absolute", left: 19, top: 40, bottom: 0, width: 2,
                          background: `linear-gradient(to bottom, ${ev.color}55, ${filtered[i + 1].color}22)`,
                        }} />
                      )}
                      {/* Icon circle */}
                      <div style={{
                        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                        background: `${ev.color}18`, border: `2px solid ${ev.color}55`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, position: "relative", zIndex: 1,
                      }}>
                        {ev.icon}
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, paddingTop: 4, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: B.white }}>{ev.title}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: tag.color, background: `${tag.color}18`, border: `1px solid ${tag.color}44`, borderRadius: 8, padding: "2px 6px" }}>
                            {tag.label}
                          </span>
                          <LiveBadge />
                        </div>
                        <div style={{ fontSize: 10, color: B.blue, fontWeight: 600, marginBottom: 5 }}>
                          {fmtTime(ev.timestamp)}
                        </div>
                        <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.6 }}>{ev.desc}</div>
                        {ev.title === "Voicemail Left" && (
                          ev.recordingUrl ? (
                            <audio controls src={ev.recordingUrl} style={{ marginTop: 8, width: "100%", maxWidth: 380, borderRadius: 6, outline: "none" }} />
                          ) : (
                            <div style={{ marginTop: 5, fontSize: 11, color: B.dim }}>No recording available</div>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
                {allEvents.length >= 100 && !search && (
                  <div style={{ marginTop: 20, textAlign: "center", fontSize: 11, color: B.dim }}>
                    Showing most recent 100 events · Use search to find specific customers
                  </div>
                )}
              </Panel>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
