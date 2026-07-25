import { useSocialPostsQuery } from "@/hooks/useSocialPostsQuery";
import { useCallIntelligenceQuery } from "@/hooks/useCallIntelligenceQuery";
import { Link } from "wouter";

type EntryStatus = "success" | "pending" | "failed";

interface FeedEntry {
  id: string;
  ts: string;
  description: string;
  status: EntryStatus;
  module: string;
  link?: string;
}

const STATUS_CONFIG: Record<EntryStatus, { color: string; icon: string; label: string }> = {
  success: { color: "#22C55E", icon: "✓", label: "Done"    },
  pending: { color: "#F59E0B", icon: "⟳", label: "Pending" },
  failed:  { color: "#EF4444", icon: "✕", label: "Failed"  },
};

function relativeTime(ts: string): string {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return "Just now";
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return "—";
  }
}

function FeedItem({ entry }: { entry: FeedEntry }) {
  const s = STATUS_CONFIG[entry.status];
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "11px 14px",
      background: "rgba(11,22,41,0.5)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 10,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        background: `${s.color}12`, border: `1px solid ${s.color}25`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, color: s.color, fontWeight: 900, marginTop: 1,
      }}>{s.icon}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
          <span style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.4 }}>{entry.description}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 9, color: "#334155", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{entry.module}</span>
          <span style={{ fontSize: 9, color: "#334155" }}>·</span>
          <span style={{ fontSize: 10, color: "#334155" }}>{relativeTime(entry.ts)}</span>
          <span style={{
            fontSize: 8, fontWeight: 800, color: s.color,
            background: `${s.color}10`, border: `1px solid ${s.color}22`,
            borderRadius: 10, padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.4px",
          }}>{s.label}</span>
        </div>
      </div>

      {entry.link && (
        <Link to={entry.link} style={{ flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "#00AEEF", fontWeight: 700, cursor: "pointer" }}>View →</span>
        </Link>
      )}
    </div>
  );
}

export function AiActivityFeed() {
  const { data: posts, isLoading: postsLoading } = useSocialPostsQuery();
  const { data: ciData, isLoading: ciLoading } = useCallIntelligenceQuery("30days");

  const loading = postsLoading || ciLoading;

  const entries: FeedEntry[] = [];

  (posts ?? [])
    .filter(p => p.status === "published" && p.publishedAt)
    .sort((a, b) => new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime())
    .slice(0, 3)
    .forEach(p => {
      const platform = p.platforms?.[0] ?? "Social";
      entries.push({
        id: `post-${p.id}`,
        ts: p.publishedAt!,
        description: `Post published to ${platform}: "${p.caption.slice(0, 60)}${p.caption.length > 60 ? "…" : ""}"`,
        status: "success",
        module: "Publishing Center",
        link: "/admin/social-publishing",
      });
    });

  (posts ?? [])
    .filter(p => p.status === "scheduled" && p.scheduledAt)
    .slice(0, 2)
    .forEach(p => {
      entries.push({
        id: `scheduled-${p.id}`,
        ts: p.createdAt,
        description: `Post scheduled for ${p.scheduledAt ? new Date(p.scheduledAt).toLocaleDateString() : "—"}: "${p.caption.slice(0, 50)}${p.caption.length > 50 ? "…" : ""}"`,
        status: "pending",
        module: "Publishing Center",
        link: "/admin/social-publishing",
      });
    });

  (ciData?.recent_activity ?? []).slice(0, 3).forEach(a => {
    const outcome = a.outcome ?? "unknown";
    const isRecovered = outcome === "recovered" || outcome === "callback";
    entries.push({
      id: `ci-${a.id}`,
      ts: a.timestamp,
      description: isRecovered
        ? `Lead recovered from ${a.caller_number} — ${outcome}`
        : `Call ${a.call_type} from ${a.caller_number} — ${outcome}`,
      status: isRecovered ? "success" : "pending",
      module: "Lead Recovery AI",
      link: "/admin/lead-recovery",
    });
  });

  entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            height: 64,
            background: "linear-gradient(90deg, rgba(255,255,255,0.025) 25%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0.025) 75%)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 10,
          }} />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{
        background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 13, padding: "36px 20px", textAlign: "center",
      }}>
        <div style={{ fontSize: 22, marginBottom: 10 }}>🤖</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 6 }}>No AI activity yet</div>
        <div style={{ fontSize: 11, color: "#334155", maxWidth: 320, margin: "0 auto", lineHeight: 1.5 }}>
          Activity appears here as the AI Edge system generates content, recovers leads, and executes automations.
        </div>
      </div>
    );
  }

  return (
    <div role="feed" aria-label="AI Activity Feed" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.slice(0, 8).map(e => (
        <FeedItem key={e.id} entry={e} />
      ))}
    </div>
  );
}
