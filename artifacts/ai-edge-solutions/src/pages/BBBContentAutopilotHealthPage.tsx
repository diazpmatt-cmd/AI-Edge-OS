import { useEffect, useMemo, useState } from "react";
import { useApiFetch } from "@/lib/api";
import BBBContentAutopilotPage from "./BBBContentAutopilotPage";

type WeeklyLifecycle =
  | "incomplete"
  | "generated"
  | "approved"
  | "scheduled"
  | "attempted"
  | "partial"
  | "published"
  | "failed";

interface AgentTaskSummary {
  id: string;
  taskType: string;
  createdAt?: string;
}

interface AgentTaskListResponse {
  tasks: AgentTaskSummary[];
}

interface WeeklyDeliveryChannel {
  platform: string;
  expected: number;
  published: number;
  failed: number;
  receiptMissing: number;
  unresolved: number;
  lifecycle: WeeklyLifecycle;
  receipts: Array<{
    externalPostId: string | null;
    externalPostUrl: string | null;
    publishedAt: string | null;
  }>;
}

interface WeeklyDeliveryStatus {
  taskId: string;
  taskStatus: string;
  planStartDate: string;
  planEndDate: string;
  verificationRule: "external_post_id_or_url_required";
  expectedDeliveries: number;
  publishedDeliveries: number;
  failedDeliveries: number;
  receiptMissingDeliveries: number;
  unresolvedDeliveries: number;
  lifecycle: WeeklyLifecycle;
  channels: WeeklyDeliveryChannel[];
}

const PRIMARY_LANES = [
  { id: "facebook", label: "Facebook", icon: "f" },
  { id: "instagram", label: "Instagram", icon: "◎" },
  { id: "google_business", label: "Google Business", icon: "G" },
  { id: "youtube", label: "YouTube", icon: "▶" },
] as const;

function laneStatus(channel: WeeklyDeliveryChannel | undefined) {
  if (!channel) {
    return {
      text: "No lane evidence",
      tone: "#94A3B8",
      border: "rgba(148,163,184,0.22)",
    };
  }
  if (channel.expected > 0 && channel.published === channel.expected) {
    return {
      text: `Verified ${channel.published}/${channel.expected}`,
      tone: "#34D399",
      border: "rgba(52,211,153,0.32)",
    };
  }
  if (channel.failed > 0 || channel.receiptMissing > 0) {
    return {
      text: `Needs attention ${channel.published}/${channel.expected}`,
      tone: "#FCA5A5",
      border: "rgba(248,113,113,0.32)",
    };
  }
  return {
    text: `Receipts ${channel.published}/${channel.expected}`,
    tone: "#FBBF24",
    border: "rgba(251,191,36,0.32)",
  };
}

export default function BBBContentAutopilotHealthPage() {
  const apiFetch = useApiFetch();
  const [health, setHealth] = useState<WeeklyDeliveryStatus | null>(null);
  const [hasWeeklyTask, setHasWeeklyTask] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      setLoading(true);
      setError(null);
      try {
        const taskList = await apiFetch<AgentTaskListResponse>("/agent-tasks");
        const weeklyTask = taskList.tasks.find((task) => task.taskType === "weekly_campaign");
        if (!weeklyTask) {
          if (!cancelled) {
            setHasWeeklyTask(false);
            setHealth(null);
          }
          return;
        }

        if (!cancelled) setHasWeeklyTask(true);
        const status = await apiFetch<WeeklyDeliveryStatus>(
          `/agent-tasks/${weeklyTask.id}/weekly-delivery-status`,
        );
        if (!cancelled) setHealth(status);
      } catch {
        if (!cancelled) {
          setHealth(null);
          setError("Receipt evidence could not be verified. No delivery success is assumed.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadHealth();
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  const overall = useMemo(() => {
    if (loading) {
      return { label: "Checking weekly delivery receipts…", tone: "#94A3B8", border: "rgba(148,163,184,0.28)" };
    }
    if (error) {
      return { label: "Publishing health unverified", tone: "#FCA5A5", border: "rgba(248,113,113,0.35)" };
    }
    if (hasWeeklyTask === false) {
      return { label: "No weekly campaign receipt evidence", tone: "#FBBF24", border: "rgba(251,191,36,0.35)" };
    }
    if (!health) {
      return { label: "No receipt status available", tone: "#FBBF24", border: "rgba(251,191,36,0.35)" };
    }
    if (health.expectedDeliveries > 0 && health.publishedDeliveries === health.expectedDeliveries) {
      return { label: `All ${health.publishedDeliveries}/${health.expectedDeliveries} deliveries receipt-verified`, tone: "#34D399", border: "rgba(52,211,153,0.35)" };
    }
    if (health.failedDeliveries > 0 || health.receiptMissingDeliveries > 0) {
      return { label: "Weekly delivery needs attention", tone: "#FCA5A5", border: "rgba(248,113,113,0.35)" };
    }
    return { label: `${health.publishedDeliveries}/${health.expectedDeliveries} deliveries receipt-verified`, tone: "#FBBF24", border: "rgba(251,191,36,0.35)" };
  }, [error, hasWeeklyTask, health, loading]);

  return (
    <div style={{ position: "relative" }}>
      <div
        data-testid="weekly-publishing-health"
        style={{
          position: "fixed",
          top: 14,
          right: 18,
          zIndex: 90,
          width: "min(500px, calc(100vw - 36px))",
          padding: "12px 14px",
          borderRadius: 12,
          background: "rgba(3,6,18,0.96)",
          border: `1px solid ${overall.border}`,
          boxShadow: "0 12px 36px rgba(0,0,0,0.42)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span aria-hidden="true">📡</span>
          <strong style={{ color: overall.tone, fontSize: 12 }}>{overall.label}</strong>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PRIMARY_LANES.map((lane) => {
            const channel = health?.channels.find((item) => item.platform === lane.id);
            const status = laneStatus(channel);
            return (
              <span
                key={lane.id}
                data-testid={`weekly-health-${lane.id}`}
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: status.tone,
                  border: `1px solid ${status.border}`,
                  background: "rgba(255,255,255,0.035)",
                }}
              >
                {lane.icon} {lane.label}: {status.text}
              </span>
            );
          })}
        </div>

        <div style={{ marginTop: 8, color: "#64748B", fontSize: 10.5, lineHeight: 1.45 }}>
          {error ??
            (health
              ? `${health.planStartDate} → ${health.planEndDate}. Success requires a provider external post ID or URL; scheduled/queued status alone does not count.`
              : "Success requires provider receipt evidence. Scheduled, queued, or parent post status alone does not count.")}
        </div>
      </div>

      <BBBContentAutopilotPage />
    </div>
  );
}
