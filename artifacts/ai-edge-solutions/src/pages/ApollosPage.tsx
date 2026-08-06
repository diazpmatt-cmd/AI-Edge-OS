// ── Apollos Conversation Mode ─────────────────────────────────────────────────
// Apollos AI — live chat backed by OpenAI, context pulled from live BB&B data.

import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useApiFetch } from "@/lib/api";
import { useLeadsQuery } from "@/hooks/useLeadsQuery";
import { useSocialPostsQuery } from "@/hooks/useSocialPostsQuery";
import { useCallIntelligenceQuery } from "@/hooks/useCallIntelligenceQuery";

// ── Brand ─────────────────────────────────────────────────────────────────────
const B = {
  navy:   "#030612",
  panel:  "#080E1F",
  panel2: "#0A1228",
  border: "rgba(0,174,239,0.15)",
  blue:   "#00AEEF",
  cyan:   "#06B6D4",
  green:  "#22C55E",
  gold:   "#FBBF24",
  silver: "#94A3B8",
  dim:    "#475569",
  white:  "#E2E8F0",
};

// ── Types ─────────────────────────────────────────────────────────────────────
type WeeklyApprovalStatus = "generating" | "pending" | "approved" | "executed" | "failed" | "rejected";

function normalizeWeeklyApprovalStatus(status?: string): WeeklyApprovalStatus | null {
  if (status === "generation_queued" || status === "generating_drafts" || status === "executing") return "generating";
  if (status === "pending_review" || status === "awaiting_batch_approval") return "pending";
  if (status === "approved" || status === "executed" || status === "failed" || status === "rejected") return status;
  return null;
}

interface RepairPlanSummary {
  planId: string;
  diagnosisId: string;
  status: "not_required" | "ready" | "approval_required" | "manual_required" | "insufficient_evidence";
  smallestSafeRepair: string;
  canApollosExecute: boolean;
  approvalRequired: boolean;
  approvalReason: string | null;
  repairAuthority: "apollos" | "operator" | "provider" | "deployment";
  steps: {
    key: string;
    position: number;
    title: string;
    action: string;
    effect: "read_only" | "checkpoint_resume" | "internal_change" | "deployment_change" | "credential_change" | "provider_change" | "external_publish";
    executableByApollos: boolean;
    requiresApproval: boolean;
    verification: string;
  }[];
}

interface WeeklyApproval {
  taskId: string;
  startDate: string;
  endDate: string;
  deliveryCount: number;
  platforms: string[];
  status: WeeklyApprovalStatus;
  failureCode?: string | null;
  failureDetail?: string | null;
  completedSteps?: number;
  totalSteps?: number;
  currentStep?: string | null;
  diagnosis?: {
    diagnosisId: string;
    confidence: "confirmed" | "probable" | "unknown";
    component: string;
    rootCauseCode: string;
    rootCause: string;
    repairAuthority: "apollos" | "operator" | "provider" | "deployment";
    canApollosRepair: boolean;
    requiresApproval: boolean;
    recommendedRepair: string;
    verification: string[];
  } | null;
  repairPlan?: RepairPlanSummary | null;
}

interface Message {
  id: string;
  role: "apollos" | "user";
  text: string;
  time: string;
  weeklyApproval?: WeeklyApproval;
}

// ── Static data ───────────────────────────────────────────────────────────────
const OPENING_MESSAGE: Message = {
  id: "opening",
  role: "apollos",
  text: "Hello, I'm Apollos.\n\nI'm your AI Business Advisor.\n\nI can help you grow your business, analyze opportunities, build marketing campaigns, improve SEO, generate media, review performance, and coordinate your AI team.\n\nHow shall we improve your business today?",
  time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
};

// Chat is live — see POST /api/apollos/chat

// ── Navigation intents ─────────────────────────────────────────────────────────
// Matched case-insensitively via includes(). First match wins.
const NAV_INTENTS: { patterns: string[]; response: string; route: string }[] = [
  { patterns: ["morning brief"],                           response: "Opening Morning Brief...",              route: "/admin/morning-brief"      },
  { patterns: ["mission control", "start my day"],         response: "Opening Mission Control...",            route: "/admin/mission-control"    },
  { patterns: ["content autopilot", "autopilot", "queue posts", "generate content", "bbb autopilot"], response: "Opening Content Autopilot...", route: "/admin/bbb-autopilot"     },
  { patterns: ["media engine", "launch media", "create an ad", "ad campaign", "build a commercial"], response: "Launching Media Engine...",             route: "/admin/media-engine"       },
  { patterns: ["lead recovery", "review leads", "missed calls", "review missed"], response: "Taking you to Lead Recovery...",       route: "/admin/lead-recovery"      },
  { patterns: ["publishing", "draft social", "social post", "publishing center"], response: "Opening Publishing Center...",          route: "/admin/social-publishing"  },
  { patterns: ["growth execution", "daily execution", "today's mission"], response: "Loading Growth Execution...",          route: "/admin/bbb-execution"      },
  { patterns: ["client onboarding"],                       response: "Preparing Client Onboarding...",        route: "/admin/client-onboarding"  },
  { patterns: ["revenue forecast", "show revenue", "profit center"], response: "Loading Revenue Forecast...", route: "/admin/profit-center"      },
  { patterns: ["google business", "generate a google"],    response: "Taking you to Local Edge Presence Engine...",route: "/admin/local-presence"     },
  { patterns: ["seo", "analyze seo"],                      response: "Opening SEO Engine...",                 route: "/admin/local-presence"     },
];

const TODAY_RECS = [
  {
    icon: "🔥", title: "Follow up with recovered leads",
    reason: "Check the Lead Recovery dashboard for any new missed-call leads.",
    priority: "High", priorityColor: "#F97316",
    route: "/admin/lead-recovery", btnLabel: "Review Leads →",
    color: "#F97316",
  },
  {
    icon: "📣", title: "Create today's Facebook post",
    reason: "Consistent daily posts keep BB&B top of mind in Baldwin County.",
    priority: "Medium", priorityColor: "#3B82F6",
    route: "/admin/social-publishing", btnLabel: "Open Publisher →",
    color: "#3B82F6",
  },
  {
    icon: "💰", title: "Review revenue forecast",
    reason: "Weekly check-in — compare actuals vs. projected growth targets.",
    priority: "Medium", priorityColor: "#10B981",
    route: "/admin/profit-center", btnLabel: "View Forecast →",
    color: "#10B981",
  },
  {
    icon: "📢", title: "Build a BB&B ad campaign",
    reason: "Summer pest season peaks now — launch a targeted local ad.",
    priority: "High", priorityColor: "#A78BFA",
    route: "/admin/media-engine", btnLabel: "Open Media Engine →",
    color: "#A78BFA",
  },
] as const;

type TimelineStatus = "done" | "ready" | "pending";
const TIMELINE_STATUS_STYLE: Record<TimelineStatus, { label: string; color: string; bg: string; dot: string }> = {
  done:    { label: "Done",    color: "#22C55E", bg: "rgba(34,197,94,0.12)",   dot: "#22C55E" },
  ready:   { label: "Ready",   color: "#00AEEF", bg: "rgba(0,174,239,0.12)",   dot: "#00AEEF" },
  pending: { label: "Pending", color: "#64748B", bg: "rgba(100,116,139,0.12)", dot: "#475569" },
};

const BRIEFING_TIMELINE = [
  {
    icon: "☀️", title: "Morning Brief",
    desc: "Review overnight signals and identify today's top opportunities.",
    status: "pending" as TimelineStatus, engine: "Morning Brief",
    route: "/admin/morning-brief", btnLabel: "Open Brief",
  },
  {
    icon: "🔥", title: "Lead Review",
    desc: "Check recovered leads and send follow-up messages.",
    status: "pending" as TimelineStatus, engine: "Lead Recovery",
    route: "/admin/lead-recovery", btnLabel: "View Leads",
  },
  {
    icon: "⚡", title: "Content Autopilot",
    desc: "Generate and queue today's social posts for review.",
    status: "pending" as TimelineStatus, engine: "Content Autopilot",
    route: "/admin/bbb-autopilot", btnLabel: "Open Autopilot",
  },
  {
    icon: "✈",  title: "Publishing Center",
    desc: "Review drafts and publish approved posts.",
    status: "pending" as TimelineStatus, engine: "Publishing Center",
    route: "/admin/social-publishing", btnLabel: "Open Publisher",
  },
  {
    icon: "🌙", title: "End-of-Day Recap",
    desc: "Review today's activity and plan tomorrow's priorities.",
    status: "pending" as TimelineStatus, engine: "Apollos AI",
    route: null, btnLabel: null,
  },
] as const;

const LEFT_NAV_ACTIONS = [
  { icon: "📊", label: "Business Review"    },
  { icon: "🎯", label: "Campaign Builder"   },
  { icon: "🔍", label: "SEO Analysis"       },
];

const SUGGESTED_PROMPTS = [
  { icon: "🎯", text: "What should I do next?",              color: "#FBBF24" },
  { icon: "📊", text: "How are we doing?",                   color: "#22C55E" },
  { icon: "❓", text: "Why isn't my score 100%?",            color: "#F97316" },
  { icon: "⏱️", text: "I only have 30 minutes.",             color: "#06B6D4" },
  { icon: "🔌", text: "What's still disconnected?",          color: "#F87171" },
  { icon: "⏳", text: "What's waiting on third parties?",    color: "#A78BFA" },
  { icon: "📚", text: "Teach me AI Edge.",                   color: "#00AEEF" },
  { icon: "💰", text: "What does Profit Center do?",         color: "#10B981" },
  { icon: "📞", text: "Review my missed calls.",             color: "#3B82F6" },
];

const QUICK_ACTIONS = [
  { label: "☀️ Morning Brief",    route: "/admin/morning-brief", msg: null,                        color: "#FBBF24" },
  { label: "🎥 Media Engine",     route: "/admin/media-engine",  msg: null,                        color: "#00AEEF" },
  { label: "🔥 Review Leads",     route: "/admin/lead-recovery", msg: null,                        color: "#F97316" },
  { label: "📣 Create Ad",        route: "/admin/media-engine",  msg: "Create an ad campaign.",    color: "#A78BFA" },
  { label: "✍️ Draft Social Post", route: "/admin/social-publishing", msg: "Draft a social media post.", color: "#06B6D4" },
  { label: "💰 Revenue Forecast", route: "/admin/profit-center", msg: null,                        color: "#10B981" },
] as const;

type LaunchStatus = "connected" | "preview" | "soon";

const LAUNCH_ENGINES: { icon: string; label: string; desc: string; status: LaunchStatus; route: string | null; color: string }[] = [
  { icon: "☀️", label: "Morning Brief",     desc: "Overnight AI summary + live signals",  status: "connected", route: "/admin/morning-brief",  color: "#FBBF24" },
  { icon: "🎥", label: "Media Engine",      desc: "AI content creation & publishing",     status: "connected", route: "/admin/media-engine",   color: "#00AEEF" },
  { icon: "🔥", label: "Lead Recovery",     desc: "Capture & follow up missed leads",     status: "connected", route: "/admin/lead-recovery",  color: "#F97316" },
  { icon: "📞", label: "AI Receptionist",   desc: "Emma — 24/7 call handling & textback", status: "connected", route: "/admin/ai-receptionist", color: "#22C55E" },
  { icon: "🔍", label: "SEO Engine",        desc: "Local search rankings & visibility",   status: "preview",   route: "/admin/ai-visibility",  color: "#06B6D4" },
  { icon: "💰", label: "Revenue Forecast",  desc: "AI Profit Center & ROI dashboard",     status: "preview",   route: "/admin/profit-center",  color: "#10B981" },
  { icon: "⭐", label: "Review Engine",     desc: "Reputation management & requests",     status: "preview",   route: "/admin/reviews",        color: "#FBBF24" },
  { icon: "📤", label: "Publishing Center", desc: "Schedule & distribute all content",    status: "connected", route: "/admin/social-publishing", color: "#A78BFA" },
];

const STATUS_STYLE: Record<LaunchStatus, { label: string; bg: string; border: string; color: string }> = {
  connected: { label: "Connected",    bg: "rgba(34,197,94,0.10)",  border: "rgba(34,197,94,0.3)",   color: "#22C55E" },
  preview:   { label: "Preview",      bg: "rgba(0,174,239,0.10)",  border: "rgba(0,174,239,0.3)",   color: "#00AEEF" },
  soon:      { label: "Coming Soon",  bg: "rgba(100,116,139,0.10)",border: "rgba(100,116,139,0.25)",color: "#64748B" },
};

const HISTORY_PLACEHOLDER = [
  { icon: "💬", label: "BB&B Morning Brief",  sub: "Yesterday" },
  { icon: "📊", label: "Revenue Analysis",    sub: "Mon"       },
  { icon: "📣", label: "Facebook Campaign",   sub: "Last week" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function nowTime() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ApollosAvatar({ size = 34, glowing = false }: { size?: number; glowing?: boolean }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, rgba(0,174,239,0.22) 0%, rgba(6,182,212,0.10) 100%)",
      border: `1.5px solid ${glowing ? "rgba(0,174,239,0.75)" : "rgba(0,174,239,0.45)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.52),
      boxShadow: glowing
        ? "0 0 14px rgba(0,174,239,0.55), 0 0 32px rgba(0,174,239,0.20)"
        : "0 0 8px rgba(0,174,239,0.15)",
      transition: "box-shadow 0.4s ease, border-color 0.4s ease",
    }}>🎙️</div>
  );
}

function ComingSoon() {
  return (
    <span style={{
      fontSize: 8, fontWeight: 800, letterSpacing: "0.8px",
      background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)",
      color: "#FBBF24", borderRadius: 8, padding: "1px 6px",
    }}>SOON</span>
  );
}

function Bubble({
  msg,
  actionBusy,
  onWeeklyDecision,
}: {
  msg: Message;
  actionBusy: boolean;
  onWeeklyDecision: (messageId: string, taskId: string, decision: "approve" | "reject") => void;
}) {
  const isApollos = msg.role === "apollos";
  return (
    <div style={{
      display: "flex", gap: 10, alignItems: "flex-start",
      flexDirection: isApollos ? "row" : "row-reverse",
      marginBottom: 20,
    }}>
      {isApollos ? (
        <ApollosAvatar size={34} />
      ) : (
        <div style={{
          width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
        }}>👤</div>
      )}
      <div style={{
        maxWidth: "72%", display: "flex", flexDirection: "column",
        alignItems: isApollos ? "flex-start" : "flex-end", gap: 4,
      }}>
        <div style={{
          padding: "12px 16px",
          borderRadius: isApollos ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
          background: isApollos
            ? "linear-gradient(135deg, #0A1632 0%, #0D1A3A 100%)"
            : "linear-gradient(135deg, rgba(0,174,239,0.18) 0%, rgba(6,182,212,0.12) 100%)",
          border: `1px solid ${isApollos ? "rgba(0,174,239,0.15)" : "rgba(0,174,239,0.3)"}`,
          fontSize: 13.5, color: B.white, lineHeight: 1.75, whiteSpace: "pre-wrap",
        }}>
          {isApollos && (
            <div style={{
              fontSize: 9.5, fontWeight: 700, color: B.blue,
              letterSpacing: "1px", marginBottom: 7, textTransform: "uppercase",
            }}>Apollos</div>
          )}
          {msg.text}
          {msg.weeklyApproval && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${B.border}` }}>
              <div style={{ fontSize: 11, color: B.silver, marginBottom: 9 }}>
                {msg.weeklyApproval.startDate} through {msg.weeklyApproval.endDate}
                {" · "}{msg.weeklyApproval.deliveryCount} deliveries
              </div>
              {msg.weeklyApproval.status === "pending" ? (
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  <a
                    href="/admin/bbb-autopilot"
                    target="_blank"
                    rel="noreferrer"
                    style={{ background: "rgba(0,174,239,.14)", border: "1px solid rgba(0,174,239,.5)", color: B.blue, borderRadius: 9, padding: "9px 14px", fontWeight: 800, textDecoration: "none" }}
                  >↗ Review Complete Package</a>
                  <button
                    disabled={actionBusy}
                    onClick={() => onWeeklyDecision(msg.id, msg.weeklyApproval!.taskId, "approve")}
                    style={{ background: "rgba(34,197,94,.18)", border: "1px solid rgba(34,197,94,.55)", color: B.green, borderRadius: 9, padding: "9px 14px", fontWeight: 800, cursor: actionBusy ? "wait" : "pointer" }}
                  >✓ Approve Week</button>
                  <button
                    disabled={actionBusy}
                    onClick={() => onWeeklyDecision(msg.id, msg.weeklyApproval!.taskId, "reject")}
                    style={{ background: "rgba(248,113,113,.14)", border: "1px solid rgba(248,113,113,.45)", color: "#F87171", borderRadius: 9, padding: "9px 14px", fontWeight: 800, cursor: actionBusy ? "wait" : "pointer" }}
                  >✕ Reject</button>
                </div>
              ) : (
                <div style={{
                  color:
                    msg.weeklyApproval.status === "failed" || msg.weeklyApproval.status === "rejected"
                      ? "#F87171"
                      : msg.weeklyApproval.status === "executed"
                        ? B.green
                        : B.blue,
                  fontWeight: 800,
                }}>
                  {msg.weeklyApproval.status === "generating" && (
                    <>
                      ⚙ Apollos is creating every caption, image, and YouTube video.
                      {typeof msg.weeklyApproval.totalSteps === "number" &&
                        msg.weeklyApproval.totalSteps > 0 &&
                        ` ${msg.weeklyApproval.completedSteps ?? 0}/${msg.weeklyApproval.totalSteps} steps complete.`}
                      {msg.weeklyApproval.currentStep &&
                        ` Current: ${msg.weeklyApproval.currentStep.replace("generate:", "")}.`}
                      {" Approval appears when the complete package is ready."}
                    </>
                  )}
                  {msg.weeklyApproval.status === "approved" &&
                    "✓ Complete weekly package approved — ready for guarded scheduling and delivery."}
                  {msg.weeklyApproval.status === "executed" &&
                    "✓ Approved weekly campaign completed."}
                  {msg.weeklyApproval.status === "failed" &&
                    "⚠ Weekly generation stopped after bounded retries. Open Under the Hood for the exact failure."}
                  {msg.weeklyApproval.status === "rejected" &&
                    "✕ Weekly package rejected. Its drafts remain unpublished."}
                </div>
              )}
              {msg.weeklyApproval.status === "failed" && (
                <div style={{ marginTop: 8, padding: 10, borderRadius: 7, background: "rgba(248,113,113,.08)", color: B.silver, fontSize: 10.5 }}>
                  <strong style={{ color: "#F87171" }}>
                    {msg.weeklyApproval.failureCode ?? "APOLLOS_WEEKLY_GENERATION_FAILED"}
                  </strong>
                  {msg.weeklyApproval.failureDetail
                    ? ` · ${msg.weeklyApproval.failureDetail}`
                    : ""}
                  {msg.weeklyApproval.diagnosis && (
                    <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(248,113,113,.2)", lineHeight: 1.55 }}>
                      <div style={{ color: B.blue, fontWeight: 900, marginBottom: 4 }}>
                        🔎 Under the Hood · {msg.weeklyApproval.diagnosis.confidence.toUpperCase()}
                      </div>
                      <div><strong>Component:</strong> {msg.weeklyApproval.diagnosis.component}</div>
                      <div><strong>Root cause:</strong> {msg.weeklyApproval.diagnosis.rootCause}</div>
                      <div><strong>Repair:</strong> {msg.weeklyApproval.diagnosis.recommendedRepair}</div>
                      <div>
                        <strong>Who controls it:</strong>{" "}
                        {msg.weeklyApproval.diagnosis.repairAuthority}
                        {msg.weeklyApproval.diagnosis.canApollosRepair ? " · Apollos can prepare the repair" : ""}
                        {msg.weeklyApproval.diagnosis.requiresApproval ? " · approval required" : ""}
                      </div>
                      <div style={{ marginTop: 5 }}>
                        <strong>Verify:</strong>{" "}
                        {msg.weeklyApproval.diagnosis.verification.join(" → ")}
                      </div>
                      {msg.weeklyApproval.repairPlan && (
                        <div style={{ marginTop: 8, padding: 8, borderRadius: 7, background: "rgba(0,174,239,.07)", border: "1px solid rgba(0,174,239,.16)" }}>
                          <div style={{ color: B.blue, fontWeight: 900 }}>
                            🛠 Smallest safe repair · {msg.weeklyApproval.repairPlan.status.replaceAll("_", " ").toUpperCase()}
                          </div>
                          <div style={{ marginTop: 3 }}>{msg.weeklyApproval.repairPlan.smallestSafeRepair}</div>
                          {msg.weeklyApproval.repairPlan.approvalRequired && (
                            <div style={{ color: B.gold, marginTop: 3 }}>
                              Approval required{msg.weeklyApproval.repairPlan.approvalReason ? `: ${msg.weeklyApproval.repairPlan.approvalReason}` : "."}
                            </div>
                          )}
                          {msg.weeklyApproval.repairPlan.steps.length > 0 && (
                            <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                              {msg.weeklyApproval.repairPlan.steps.map((repairStep) => (
                                <li key={repairStep.key} style={{ marginTop: 3 }}>
                                  <strong>{repairStep.title}</strong>
                                  {" — "}{repairStep.action}
                                  {repairStep.requiresApproval ? " · approval gate" : ""}
                                </li>
                              ))}
                            </ol>
                          )}
                          <div style={{ color: B.dim, marginTop: 5 }}>
                            Plan {msg.weeklyApproval.repairPlan.planId} · bound to diagnosis {msg.weeklyApproval.repairPlan.diagnosisId}
                          </div>
                        </div>
                      )}
                      <div style={{ color: B.dim, marginTop: 4 }}>
                        {msg.weeklyApproval.diagnosis.rootCauseCode}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ fontSize: 10, color: B.dim }}>{msg.time}</div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ApollosPage() {
  const [, navigate]                = useLocation();
  const [messages, setMessages]     = useState<Message[]>([OPENING_MESSAGE]);
  const [input, setInput]           = useState("");
  const [responding, setResponding] = useState(false);
  const [weeklyActionBusy, setWeeklyActionBusy] = useState<string | null>(null);
  const briefFiredRef               = useRef(false);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [recsOpen, setRecsOpen]         = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const bottomRef                   = useRef<HTMLDivElement>(null);
  const voiceUtterRef               = useRef<SpeechSynthesisUtterance[]>([]);
  // ── Voice INPUT state (SpeechRecognition) ────────────────────────────────
  const [listenEnabled, setListenEnabled] = useState(false);
  const [micStatus, setMicStatus]         = useState<"idle"|"requesting"|"listening"|"heard"|"blocked"|"unsupported">("idle");
  const recognitionRef      = useRef<any>(null);
  const silenceTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenEnabledRef    = useRef(false);
  const hasAutoStartedMicRef = useRef(false);
  const micSupported     = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const apiFetch = useApiFetch();

  useEffect(() => {
    const active = messages.filter(
      (message) =>
        message.weeklyApproval?.status === "generating",
    );
    if (active.length === 0) return;

    let cancelled = false;
    const refresh = async () => {
      const results = await Promise.all(
        active.map(async (message) => {
          try {
            const task = await apiFetch(`/agent-tasks/${message.weeklyApproval!.taskId}`) as {
              status?: string;
              failureCode?: string | null;
              decisionNote?: string | null;
              progress?: {
                completedSteps?: number;
                totalSteps?: number;
                currentStep?: string | null;
              };
              diagnosis?: {
                diagnosisId: string;
                confidence: "confirmed" | "probable" | "unknown";
                component: string;
                rootCauseCode: string;
                rootCause: string;
                repairAuthority: "apollos" | "operator" | "provider" | "deployment";
                canApollosRepair: boolean;
                requiresApproval: boolean;
                recommendedRepair: string;
                verification: string[];
              } | null;
              repairPlan?: RepairPlanSummary | null;
            };
            return {
              messageId: message.id,
              status: task.status,
              failureCode: task.failureCode ?? null,
              failureDetail: task.decisionNote ?? null,
              completedSteps: task.progress?.completedSteps ?? 0,
              totalSteps: task.progress?.totalSteps ?? 0,
              currentStep: task.progress?.currentStep ?? null,
              diagnosis: task.diagnosis ?? null,
              repairPlan: task.repairPlan ?? null,
            };
          } catch {
            return {
              messageId: message.id,
              status: undefined,
              failureCode: null,
              failureDetail: null,
              completedSteps: undefined,
              totalSteps: undefined,
              currentStep: undefined,
              diagnosis: null,
              repairPlan: null,
            };
          }
        }),
      );
      if (cancelled) return;
      setMessages((current) =>
        current.map((message) => {
          const result = results.find((item) => item.messageId === message.id);
          const status = normalizeWeeklyApprovalStatus(result?.status);
          if (
            !message.weeklyApproval ||
            !status ||
            status === message.weeklyApproval.status &&
            result?.completedSteps === message.weeklyApproval.completedSteps &&
            result?.totalSteps === message.weeklyApproval.totalSteps &&
            result?.currentStep === message.weeklyApproval.currentStep &&
            result?.diagnosis?.diagnosisId === message.weeklyApproval.diagnosis?.diagnosisId &&
            result?.repairPlan?.planId === message.weeklyApproval.repairPlan?.planId
          ) {
            return message;
          }
          return {
            ...message,
            weeklyApproval: {
              ...message.weeklyApproval,
              status,
              failureCode: result?.failureCode ?? null,
              failureDetail: result?.failureDetail ?? null,
              completedSteps: result?.completedSteps,
              totalSteps: result?.totalSteps,
              currentStep: result?.currentStep,
              diagnosis: result?.diagnosis ?? null,
              repairPlan: result?.repairPlan ?? null,
            },
          };
        }),
      );
    };

    void refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiFetch, messages]);

  // ── Live data queries ────────────────────────────────────────────────────────
  const ciQuery    = useCallIntelligenceQuery("30days", { retry: 1 });
  const leadsQuery = useLeadsQuery({ retry: 1 });
  const postsQuery = useSocialPostsQuery({ retry: 1 });

  const ci       = ciQuery.data;
  const leads    = leadsQuery.data;
  const posts    = postsQuery.data ?? [];

  const hasLiveCalls   = (ci?.metrics.total_calls ?? 0) > 0;
  const hasLiveLeads   = (leads?.stats.total ?? 0) > 0;
  const hasLivePosts   = posts.length > 0;
  const postsPublished = hasLivePosts ? posts.filter(p => p.status === "published").length : 0;
  const postsDraft     = hasLivePosts ? posts.filter(p => p.status === "draft").length : 0;
  const leadsActive    = hasLiveLeads ? (leads?.stats.active ?? 0) : 0;
  const missedCalls    = hasLiveCalls ? (ci?.metrics.missed_calls ?? 0) : 0;

  // ── Live-derived recommendations ─────────────────────────────────────────────
  const todayRecs = [
    {
      icon: "🔥",
      title: hasLiveLeads && leadsActive > 0 ? `Follow up with ${leadsActive} lead${leadsActive !== 1 ? "s" : ""}` : "Follow up with recovered leads",
      reason: hasLiveLeads && leadsActive > 0
        ? `${leadsActive} lead${leadsActive !== 1 ? "s" : ""} in 'new' status — respond before competitors do.`
        : "Check Lead Recovery for new contacts captured overnight.",
      priority: "High", priorityColor: "#F97316",
      route: "/admin/lead-recovery", btnLabel: "Review Leads →", color: "#F97316",
    },
    {
      icon: "📣",
      title: postsDraft > 0 ? `Publish ${postsDraft} queued draft${postsDraft !== 1 ? "s" : ""}` : "Create today's social post",
      reason: postsDraft > 0
        ? `${postsDraft} draft${postsDraft !== 1 ? "s" : ""} waiting in Publishing Center — approve and publish.`
        : "Consistent daily posts keep BB&B top of mind in Baldwin County.",
      priority: "Medium", priorityColor: "#3B82F6",
      route: "/admin/social-publishing", btnLabel: "Open Publisher →", color: "#3B82F6",
    },
    {
      icon: "💰",
      title: "Review revenue forecast",
      reason: "Weekly check-in — compare actuals vs. projected growth targets.",
      priority: "Medium", priorityColor: "#10B981",
      route: "/admin/profit-center", btnLabel: "View Forecast →", color: "#10B981",
    },
    {
      icon: missedCalls > 0 ? "📞" : "📢",
      title: missedCalls > 0 ? `Recover ${missedCalls} missed call${missedCalls !== 1 ? "s" : ""}` : "Build a BB&B ad campaign",
      reason: missedCalls > 0
        ? `${missedCalls} missed call${missedCalls !== 1 ? "s" : ""} with no follow-up — high-intent revenue at risk.`
        : "Summer pest season peaks now — launch a targeted local ad.",
      priority: missedCalls > 0 ? "High" : "Medium",
      priorityColor: missedCalls > 0 ? "#EF4444" : "#A78BFA",
      route: missedCalls > 0 ? "/admin/lead-recovery" : "/admin/media-engine",
      btnLabel: missedCalls > 0 ? "See Calls →" : "Open Media Engine →",
      color: missedCalls > 0 ? "#EF4444" : "#A78BFA",
    },
  ];

  // ── Live-derived briefing timeline ────────────────────────────────────────────
  const briefingTimeline: { icon: string; title: string; desc: string; status: TimelineStatus; engine: string; route: string | null; btnLabel: string | null }[] = [
    {
      icon: "☀️", title: "Morning Brief",
      desc: "Review overnight signals and identify today's top opportunities.",
      status: "ready", engine: "Morning Brief",
      route: "/admin/morning-brief", btnLabel: "Open Brief",
    },
    {
      icon: "🔥", title: "Lead Review",
      desc: hasLiveLeads
        ? `${leadsActive} lead${leadsActive !== 1 ? "s" : ""} in 'new' status need${leadsActive === 1 ? "s" : ""} follow-up.`
        : "Check recovered leads and send follow-up messages.",
      status: hasLiveLeads && leadsActive > 0 ? "ready" : hasLiveLeads ? "done" : "pending",
      engine: "Lead Recovery", route: "/admin/lead-recovery", btnLabel: "View Leads",
    },
    {
      icon: "⚡", title: "Content Autopilot",
      desc: hasLivePosts
        ? `${postsPublished} posts published · ${postsDraft} draft${postsDraft !== 1 ? "s" : ""} queued.`
        : "Generate and queue today's social posts for review.",
      status: postsPublished > 0 ? "done" : hasLivePosts ? "ready" : "pending",
      engine: "Content Autopilot", route: "/admin/bbb-autopilot", btnLabel: "Open Autopilot",
    },
    {
      icon: "✈", title: "Publishing Center",
      desc: postsDraft > 0
        ? `${postsDraft} draft${postsDraft !== 1 ? "s" : ""} awaiting approval and publish.`
        : "Review drafts and publish approved posts.",
      status: postsDraft > 0 ? "ready" : postsPublished > 0 ? "done" : "pending",
      engine: "Publishing Center", route: "/admin/social-publishing", btnLabel: "Open Publisher",
    },
    {
      icon: "🌙", title: "End-of-Day Recap",
      desc: "Review today's activity and plan tomorrow's priorities.",
      status: "pending", engine: "Apollos AI", route: null, btnLabel: null,
    },
  ];

  const INTRO_SCRIPT = [
    "Hi, I'm Apollos.",
    "I'm your AI Business Advisor.",
    "How shall we improve your business today?",
  ];

  function stopVoice() {
    window.speechSynthesis?.cancel();
    setVoicePlaying(false);
    voiceUtterRef.current = [];
  }

  // ── Shared voice picker ────────────────────────────────────────────────────
  function pickVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    const PREF_NAMES = ["Daniel", "Google UK English Male", "Microsoft Ryan Online (Natural)", "Microsoft George"];
    const isMale = (v: SpeechSynthesisVoice) =>
      v.name.toLowerCase().includes("male") ||
      PREF_NAMES.some(n => v.name.toLowerCase().includes(n.toLowerCase()));
    let voice: SpeechSynthesisVoice | null =
      PREF_NAMES.reduce<SpeechSynthesisVoice | null>((found, name) =>
        found ?? (voices.find(v => v.lang.startsWith("en-GB") && v.name.toLowerCase().includes(name.toLowerCase())) ?? null)
      , null);
    if (!voice) voice = voices.find(v => v.lang.startsWith("en-GB") && isMale(v)) ?? null;
    if (!voice) voice = voices.find(v => v.lang.startsWith("en") && isMale(v)) ?? null;
    if (!voice) voice = voices.find(v => v.lang.startsWith("en-GB")) ?? null;
    return voice;
  }

  // ── Speak an Apollos reply aloud ───────────────────────────────────────────
  function speakResponse(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    stopVoice();
    // Strip emoji, markdown-style symbols, and truncate to avoid very long TTS
    const clean = text
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")   // emojis
      .replace(/[🎯✨🍍→]/g, "")
      .replace(/\*+/g, "")
      .replace(/#{1,3}\s?/g, "")
      .trim();
    const speakText = clean.length > 650 ? clean.slice(0, 647) + "…" : clean;
    if (!speakText) return;
    const voice = pickVoice();
    const u = new SpeechSynthesisUtterance(speakText);
    u.lang = "en-GB"; u.pitch = 0.92; u.rate = 0.98;
    if (voice) u.voice = voice;
    u.onstart = () => setVoicePlaying(true);
    u.onend   = () => { setVoicePlaying(false); voiceUtterRef.current = []; };
    u.onerror = () => { setVoicePlaying(false); voiceUtterRef.current = []; };
    voiceUtterRef.current = [u];
    window.speechSynthesis.speak(u);
    setVoicePlaying(true);
  }

  function playVoiceIntro() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    stopVoice();
    const voice = pickVoice();

    voiceUtterRef.current = INTRO_SCRIPT.map((line, i) => {
      const u = new SpeechSynthesisUtterance(line);
      u.lang = "en-GB"; u.pitch = 0.92; u.rate = 0.98;
      if (voice) u.voice = voice;
      u.onstart = () => setVoicePlaying(true);
      u.onend = () => {
        if (i === INTRO_SCRIPT.length - 1) { setVoicePlaying(false); voiceUtterRef.current = []; }
        else setTimeout(() => { const next = voiceUtterRef.current[i + 1]; if (next) window.speechSynthesis.speak(next); }, 350);
      };
      return u;
    });
    window.speechSynthesis.speak(voiceUtterRef.current[0]);
    setVoicePlaying(true);
  }

  // ── Voice INPUT functions (SpeechRecognition) ────────────────────────────

  function stopListening() {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (recognitionRef.current) {
      recognitionRef.current._intentionalStop = true;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setMicStatus("idle");
  }

  function startListening() {
    if (!micSupported) { setMicStatus("unsupported"); return; }
    if (recognitionRef.current) return;
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const rec: any = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;
    rec._intentionalStop = false;

    rec.onstart = () => setMicStatus("listening");

    rec.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      const txt = (final || interim).trim();
      if (txt) { setInput(txt); setMicStatus("heard"); }
      if (final.trim()) {
        const snapshot = final.trim();
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          send(snapshot);
          setInput("");
          setMicStatus("listening");
        }, 1500);
      }
    };

    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicStatus("blocked");
        listenEnabledRef.current = false;
        setListenEnabled(false);
        recognitionRef.current = null;
      }
      // "no-speech" and other transient errors: recognition restarts via onend
    };

    rec.onend = () => {
      recognitionRef.current = null;
      if (rec._intentionalStop) return;
      // Auto-restart if still enabled (handles browser timeout / no-speech)
      if (listenEnabledRef.current) {
        setTimeout(() => { if (listenEnabledRef.current) startListening(); }, 400);
      } else {
        setMicStatus("idle");
      }
    };

    setMicStatus("requesting");
    try {
      rec.start();
      recognitionRef.current = rec;
    } catch {
      recognitionRef.current = null;
      setMicStatus("idle");
    }
  }

  function toggleListen() {
    if (!micSupported) { setMicStatus("unsupported"); return; }
    const next = !listenEnabled;
    listenEnabledRef.current = next;
    setListenEnabled(next);
    if (next) startListening();
    else stopListening();
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Pause mic while Apollos speaks or awaits response; resume after
  useEffect(() => {
    if (!listenEnabled) return;
    if (voicePlaying || responding) {
      if (recognitionRef.current) {
        recognitionRef.current._intentionalStop = true;
        recognitionRef.current.abort();
        recognitionRef.current = null;
        setMicStatus("idle");
      }
    } else {
      if (!recognitionRef.current) startListening();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voicePlaying, responding, listenEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      listenEnabledRef.current = false;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        recognitionRef.current._intentionalStop = true;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      window.speechSynthesis?.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-start mic once the initial brief finishes loading ─────────────────
  useEffect(() => {
    if (hasAutoStartedMicRef.current) return;
    if (responding) return;              // still loading the brief
    if (!briefFiredRef.current) return;  // brief hasn't fired yet
    hasAutoStartedMicRef.current = true;
    if (!micSupported) return;
    const t = setTimeout(() => {
      listenEnabledRef.current = true;
      setListenEnabled(true);
      startListening();
    }, 900);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responding]);

  // ── Proactive operational brief — fires once on page open ──────────────────
  useEffect(() => {
    if (briefFiredRef.current) return;
    briefFiredRef.current = true;

    const loadingId = uid();
    setMessages(prev => [...prev, {
      id: loadingId, role: "apollos",
      text: "⏳ Loading your operational brief…",
      time: nowTime(),
    }]);
    setResponding(true);

    apiFetch("/apollos/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "__auto_brief__", history: [] }),
    })
      .then((data: any) => {
        setMessages(prev => prev.map(m =>
          m.id === loadingId
            ? { ...m, text: data.reply ?? data.error ?? "(no brief)", time: nowTime() }
            : m,
        ));
      })
      .catch((err: any) => {
        setMessages(prev => prev.map(m =>
          m.id === loadingId
            ? { ...m, text: `Unable to generate brief right now. Ask me anything to get started.\n\n(${err?.message ?? "Network error"})`, time: nowTime() }
            : m,
        ));
      })
      .finally(() => setResponding(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || responding) return;

    const userMsg: Message = { id: uid(), role: "user", text: trimmed, time: nowTime() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setResponding(true);

    const lower = trimmed.toLowerCase();
    const weeklyCommand =
      /\b(create|generate|build|prepare|schedule)\b/.test(lower) &&
      (/\bweek(?:'s|s|ly)?\b/.test(lower) || /seven[- ]day|7[- ]day/.test(lower)) &&
      (/all (four|4)|facebook|instagram|google business|\bgbp\b|youtube/.test(lower));

    if (weeklyCommand) {
      try {
        const data = await apiFetch("/apollos/weekly-campaign/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: trimmed }),
        }) as {
          taskId: string;
          duplicate?: boolean;
          executionStatus: string;
          plan: {
            startDate: string;
            endDate: string;
            deliveryCount: number;
            platforms: string[];
          };
        };
        const status = normalizeWeeklyApprovalStatus(data.executionStatus) ?? "generating";
        setMessages(prev => [...prev, {
          id: uid(),
          role: "apollos",
          text: data.duplicate
            ? "I found the existing weekly campaign instead of creating a duplicate."
            : "I am building your complete weekly package now: 5 Facebook posts, 5 Instagram posts, 2 Google Business Profile posts, and 1 YouTube video. You will receive one approval decision after every caption and media asset is ready.",
          time: nowTime(),
          weeklyApproval: {
            taskId: data.taskId,
            startDate: data.plan.startDate,
            endDate: data.plan.endDate,
            deliveryCount: data.plan.deliveryCount,
            platforms: data.plan.platforms,
            status,
          },
        }]);
      } catch (err: any) {
        setMessages(prev => [...prev, {
          id: uid(),
          role: "apollos",
          text: `I could not create the weekly campaign. ${err?.message ?? "Unknown error"}`,
          time: nowTime(),
        }]);
      } finally {
        setResponding(false);
      }
      return;
    }

    const intent = NAV_INTENTS.find(i => i.patterns.some(p => lower.includes(p)));

    if (intent) {
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: uid(), role: "apollos",
          text: intent.response,
          time: nowTime(),
        }]);
        setResponding(false);
        setTimeout(() => navigate(intent.route), 800);
      }, 450);
    } else {
      try {
        // Pass conversation history for session focus detection
        const history = messages.map(m => ({ role: m.role, content: m.text }));
        const data = await apiFetch("/apollos/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, history }),
        }) as { reply?: string; error?: string; intent?: string };
        const replyText = data.reply ?? data.error ?? "(no response)";
        setMessages(prev => [...prev, {
          id: uid(), role: "apollos",
          text: replyText,
          time: nowTime(),
        }]);
        if (listenEnabled) speakResponse(replyText);
      } catch (err: any) {
        setMessages(prev => [...prev, {
          id: uid(), role: "apollos",
          text: `I'm having trouble connecting right now. Please try again in a moment.\n\n(${err?.message ?? "Network error"})`,
          time: nowTime(),
        }]);
      } finally {
        setResponding(false);
      }
    }
  }

  async function decideWeeklyCampaign(
    messageId: string,
    taskId: string,
    decision: "approve" | "reject",
  ) {
    if (weeklyActionBusy) return;
    setWeeklyActionBusy(taskId);
    try {
      await apiFetch(`/agent-tasks/${taskId}/${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: decision === "reject"
          ? JSON.stringify({ note: "Rejected from Apollos weekly campaign review." })
          : JSON.stringify({}),
      });
      setMessages(current => current.map(message =>
        message.id === messageId && message.weeklyApproval
          ? {
              ...message,
              weeklyApproval: {
                ...message.weeklyApproval,
                status: decision === "approve" ? "approved" : "rejected",
              },
            }
          : message
      ));
    } catch (err: any) {
      setMessages(current => [...current, {
        id: uid(),
        role: "apollos",
        text: `The weekly decision was not recorded. ${err?.message ?? "Please try again."}`,
        time: nowTime(),
      }]);
    } finally {
      setWeeklyActionBusy(null);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  const canSend = input.trim().length > 0 && !responding;

  return (
    <div style={{
      display: "flex", height: "calc(100vh - 0px)", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
      color: B.white, background: B.navy,
    }}>

      {/* ══ LEFT PANEL ════════════════════════════════════════════════════════ */}
      <div style={{
        width: 220, flexShrink: 0, background: B.panel,
        borderRight: `1px solid ${B.border}`,
        display: "flex", flexDirection: "column",
        padding: "16px 12px", gap: 4, overflowY: "auto",
      }}>
        {/* New conversation */}
        <button
          onClick={() => { setMessages([OPENING_MESSAGE]); setInput(""); setResponding(false); }}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, #00AEEF 0%, #06B6D4 100%)",
            border: "none", borderRadius: 10, padding: "10px 14px",
            fontSize: 12.5, fontWeight: 700, color: "#030612",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            marginBottom: 12, boxShadow: "0 4px 12px rgba(0,174,239,0.25)",
          }}>
          ✨ New Conversation
        </button>

        {/* Quick actions */}
        <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1.5px", textTransform: "uppercase", padding: "0 4px", marginBottom: 4 }}>
          Quick Actions
        </div>
        {LEFT_NAV_ACTIONS.map(a => (
          <button key={a.label} onClick={() => send(a.label)} style={{
            width: "100%", background: "transparent", border: "1px solid transparent",
            borderRadius: 8, padding: "8px 10px", fontSize: 12, color: B.silver,
            cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8,
          }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.04)"; b.style.borderColor = "rgba(0,174,239,0.2)"; }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "transparent"; }}>
            <span>{a.icon}</span>{a.label}
          </button>
        ))}

        {/* History */}
        <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1.5px", textTransform: "uppercase", padding: "14px 4px 6px" }}>
          Recent
        </div>
        <div style={{ padding: "10px", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.06)", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: B.dim, lineHeight: 1.5 }}>
            Conversation history<br />not yet persisted
          </div>
        </div>
      </div>

      {/* ══ CENTER PANEL ══════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* Chat header */}
        <div style={{
          padding: "12px 24px", borderBottom: `1px solid ${B.border}`,
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: B.panel,
          flexWrap: "wrap",
        }}>
          <ApollosAvatar size={38} glowing={voicePlaying} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: B.white, letterSpacing: "-0.2px" }}>Apollos</span>
              <span style={{
                fontSize: 8, fontWeight: 800, letterSpacing: "1px",
                background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.3)",
                color: "#22C55E", borderRadius: 8, padding: "2px 7px",
              }}>🟢 AI LIVE</span>
            </div>
            <div style={{ fontSize: 11, color: B.blue, fontWeight: 600, marginTop: 2 }}>AI Business Advisor · British Executive</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {/* Voice intro button */}
            {!voicePlaying ? (
              <button onClick={playVoiceIntro} style={{
                background: "rgba(0,174,239,0.10)", border: "1px solid rgba(0,174,239,0.3)",
                borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700,
                color: B.blue, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              }}>▶ Hear Intro</button>
            ) : (
              <button onClick={stopVoice} style={{
                background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.3)",
                borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700,
                color: "#F87171", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              }}>■ Stop</button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: B.green, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: B.green, fontWeight: 600 }}>Ready</span>
            </div>
            {/* Mic listening status pill */}
            {listenEnabled && (
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                background: micStatus === "blocked" ? "rgba(248,113,113,0.08)" : "rgba(0,174,239,0.08)",
                border: `1px solid ${micStatus === "blocked" ? "rgba(248,113,113,0.25)" : "rgba(0,174,239,0.22)"}`,
                borderRadius: 8, padding: "4px 10px",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", display: "inline-block", flexShrink: 0,
                  background:
                    micStatus === "listening"  ? B.blue :
                    micStatus === "heard"      ? B.cyan :
                    micStatus === "requesting" ? B.gold :
                    micStatus === "blocked"    ? "#F87171" : B.dim,
                }} />
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: micStatus === "blocked" ? "#F87171" : micStatus === "heard" ? B.cyan : B.blue,
                }}>
                  {micStatus === "requesting" ? "Requesting mic…" :
                   micStatus === "listening"  ? "Listening" :
                   micStatus === "heard"      ? "Heard speech" :
                   micStatus === "blocked"    ? "Mic blocked" :
                   responding                 ? "Thinking…" :
                   voicePlaying               ? "Speaking" : "Mic on"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column" }}>

          {/* ── Today's Apollos Recommendations ── */}
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => setRecsOpen(o => !o)} style={{
              width: "100%", background: "none", border: "none", padding: "0 0 10px 0",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 13 }}>🧠</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: B.blue, letterSpacing: "1.2px", textTransform: "uppercase" }}>
                Today's Apollos Recommendations
              </span>
              <span style={{ fontSize: 9, color: B.dim }}>— {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: B.dim, transition: "transform 0.25s", display: "inline-block", transform: recsOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>▾</span>
            </button>
            <div style={{ overflow: "hidden", maxHeight: recsOpen ? "800px" : "0px", transition: "max-height 0.3s ease", }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingBottom: 4 }}>
              {todayRecs.map(r => (
                <div key={r.title} style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)",
                  border: `1px solid rgba(255,255,255,0.07)`,
                  borderLeft: `3px solid ${r.color}`,
                  borderRadius: 12, padding: "13px 14px",
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  {/* Card header */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 16 }}>{r.icon}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: B.white, lineHeight: 1.35 }}>{r.title}</span>
                    </div>
                    <span style={{
                      flexShrink: 0, fontSize: 8, fontWeight: 800, letterSpacing: "0.6px",
                      background: `${r.priorityColor}18`, border: `1px solid ${r.priorityColor}40`,
                      color: r.priorityColor, borderRadius: 6, padding: "2px 6px",
                    }}>{r.priority}</span>
                  </div>
                  {/* Reason */}
                  <div style={{ fontSize: 11, color: B.dim, lineHeight: 1.5 }}>{r.reason}</div>
                  {/* Action */}
                  <button
                    onClick={() => navigate(r.route)}
                    style={{
                      alignSelf: "flex-start", background: `${r.color}14`,
                      border: `1px solid ${r.color}30`, borderRadius: 8,
                      padding: "5px 11px", fontSize: 10.5, fontWeight: 700,
                      color: r.color, cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${r.color}26`; }}
                    onMouseLeave={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${r.color}14`; }}
                  >
                    {r.btnLabel}
                  </button>
                </div>
              ))}
            </div>
            </div>
          </div>

          {/* ── Today's Briefing Timeline ── */}
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => setTimelineOpen(o => !o)} style={{
              width: "100%", background: "none", border: "none", padding: "0 0 10px 0",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 13 }}>📋</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: B.blue, letterSpacing: "1.2px", textTransform: "uppercase" }}>
                Today's Briefing Timeline
              </span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: B.dim, transition: "transform 0.25s", display: "inline-block", transform: timelineOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>▾</span>
            </button>
            <div style={{ overflow: "hidden", maxHeight: timelineOpen ? "1200px" : "0px", transition: "max-height 0.3s ease" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {briefingTimeline.map((item, idx) => {
                const s = TIMELINE_STATUS_STYLE[item.status];
                const isLast = idx === briefingTimeline.length - 1;
                return (
                  <div key={item.title} style={{ display: "flex", gap: 12, position: "relative" }}>
                    {/* Connector line */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 20 }}>
                      <div style={{
                        width: 12, height: 12, borderRadius: "50%", marginTop: 14,
                        background: s.dot, flexShrink: 0,
                        boxShadow: item.status !== "pending" ? `0 0 6px ${s.dot}88` : "none",
                      }} />
                      {!isLast && <div style={{ width: 2, flex: 1, minHeight: 20, background: "rgba(255,255,255,0.06)", marginTop: 4, marginBottom: 0 }} />}
                    </div>
                    {/* Card */}
                    <div style={{
                      flex: 1, background: "rgba(255,255,255,0.02)",
                      border: `1px solid rgba(255,255,255,0.06)`,
                      borderRadius: 10, padding: "10px 12px",
                      marginBottom: isLast ? 0 : 8,
                      opacity: item.status === "pending" ? 0.65 : 1,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ fontSize: 14 }}>{item.icon}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: B.white }}>{item.title}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: 8.5, color: B.dim }}>{item.engine}</span>
                          <span style={{
                            fontSize: 8, fontWeight: 800, letterSpacing: "0.5px",
                            background: s.bg, color: s.color, borderRadius: 6,
                            padding: "2px 6px", border: `1px solid ${s.color}40`,
                          }}>{s.label}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: B.dim, lineHeight: 1.5, marginBottom: item.route ? 8 : 0 }}>{item.desc}</div>
                      {item.route && item.btnLabel && (
                        <button
                          onClick={() => navigate(item.route as string)}
                          style={{
                            background: `${s.color}12`, border: `1px solid ${s.color}30`,
                            borderRadius: 7, padding: "4px 10px", fontSize: 10, fontWeight: 700,
                            color: s.color, cursor: "pointer", transition: "all 0.15s",
                          }}
                          onMouseEnter={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${s.color}24`; }}
                          onMouseLeave={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${s.color}12`; }}
                        >
                          {item.btnLabel} →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>

          {/* ── End-of-Day Recap ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13 }}>🌙</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: B.blue, letterSpacing: "1.2px", textTransform: "uppercase" }}>
                End-of-Day Recap
              </span>
              <span style={{ fontSize: 9, color: B.dim }}>— Preview</span>
            </div>
            <div style={{
              background: "linear-gradient(135deg, rgba(167,139,250,0.06) 0%, rgba(6,182,212,0.04) 100%)",
              border: "1px solid rgba(167,139,250,0.18)", borderRadius: 14, padding: "16px 18px",
            }}>
              {/* Recap rows */}
              {[
                { icon: "🏆", label: "Today's Wins",          value: "Waiting to generate…", color: "#22C55E" },
                { icon: "⚠️", label: "Missed Opportunities",  value: "Waiting to generate…", color: "#FBBF24" },
                { icon: "💰", label: "Revenue Notes",         value: "Waiting to generate…", color: "#10B981" },
                { icon: "📄", label: "Content Completed",     value: "Waiting to generate…", color: "#00AEEF" },
                { icon: "🎯", label: "Tomorrow's Priority",   value: "Waiting to generate…", color: "#A78BFA" },
              ].map(row => (
                <div key={row.label} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{row.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: row.color, marginBottom: 2 }}>{row.label}</div>
                    <div style={{ fontSize: 11, color: B.dim, fontStyle: "italic" }}>{row.value}</div>
                  </div>
                </div>
              ))}
              {/* Generate button — calls real AI */}
              <button
                onClick={() => send("Generate my end-of-day recap for BB&B. Using only live data, summarise: Today's Wins, Missed Opportunities, Revenue Notes, Content Completed today, and the single most important priority for tomorrow. If data is missing say 'No live data yet'.")}
                disabled={responding}
                style={{
                  marginTop: 14, width: "100%",
                  background: "linear-gradient(135deg, rgba(167,139,250,0.18) 0%, rgba(6,182,212,0.12) 100%)",
                  border: "1px solid rgba(167,139,250,0.35)", borderRadius: 10,
                  padding: "9px 0", fontSize: 12, fontWeight: 700,
                  color: responding ? "#64748B" : "#A78BFA",
                  cursor: responding ? "not-allowed" : "pointer", transition: "all 0.15s",
                  opacity: responding ? 0.6 : 1,
                }}
                onMouseEnter={ev => { if (!responding) (ev.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(167,139,250,0.28) 0%, rgba(6,182,212,0.2) 100%)"; }}
                onMouseLeave={ev => { (ev.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(167,139,250,0.18) 0%, rgba(6,182,212,0.12) 100%)"; }}
              >
                {responding ? "⏳ Generating…" : "🔮 Generate End-of-Day Recap"}
              </button>
            </div>
          </div>

          {messages.map(m => (
            <Bubble
              key={m.id}
              msg={m}
              actionBusy={weeklyActionBusy === m.weeklyApproval?.taskId}
              onWeeklyDecision={decideWeeklyCampaign}
            />
          ))}

          {/* Typing indicator */}
          {responding && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 18 }}>
              <ApollosAvatar size={34} />
              <div style={{
                padding: "13px 18px", borderRadius: "4px 14px 14px 14px",
                background: "linear-gradient(135deg, #0A1632 0%, #0D1A3A 100%)",
                border: `1px solid ${B.border}`,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: "50%", background: B.blue,
                    display: "inline-block",
                    animation: `apollosBounce 1.2s infinite ${i * 0.2}s`,
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Quick Actions ── */}
        <div style={{
          padding: "8px 24px 0",
          background: B.panel,
          borderTop: `1px solid ${B.border}`,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 7 }}>
            Quick Actions
          </div>
          <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 10, scrollbarWidth: "none" }}>
            {QUICK_ACTIONS.map(qa => (
              <button
                key={qa.label}
                onClick={() => send(qa.label)}
                style={{
                  flexShrink: 0, whiteSpace: "nowrap",
                  background: `${qa.color}12`,
                  border: `1px solid ${qa.color}30`,
                  borderRadius: 20, padding: "5px 13px",
                  fontSize: 11.5, fontWeight: 600, color: qa.color,
                  cursor: "pointer", transition: "all 0.15s",
                }}
                onMouseEnter={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${qa.color}24`; (ev.currentTarget as HTMLButtonElement).style.borderColor = `${qa.color}55`; }}
                onMouseLeave={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${qa.color}12`; (ev.currentTarget as HTMLButtonElement).style.borderColor = `${qa.color}30`; }}
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input bar */}
        <div style={{ padding: "14px 24px 16px", borderTop: `1px solid ${B.border}`, background: B.panel, flexShrink: 0 }}>
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-end",
            background: B.panel2, border: `1px solid ${B.border}`,
            borderRadius: 14, padding: "10px 14px",
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask Apollos anything about your business..."
              rows={1}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                resize: "none", fontSize: 13.5, color: B.white, lineHeight: 1.55,
                fontFamily: "inherit", paddingTop: 2,
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, paddingBottom: 2 }}>
              {/* Voice input toggle */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                {micSupported ? (
                  <button
                    onClick={toggleListen}
                    title={listenEnabled ? "Turn off microphone (Auto Listen ON)" : "Turn on microphone (Auto Listen OFF)"}
                    style={{
                      width: 34, height: 34, borderRadius: "50%",
                      background: listenEnabled
                        ? (micStatus === "heard" ? "rgba(6,182,212,0.22)" : "rgba(0,174,239,0.16)")
                        : "rgba(255,255,255,0.03)",
                      border: `1px solid ${
                        listenEnabled
                          ? (micStatus === "blocked" ? "rgba(248,113,113,0.55)" : "rgba(0,174,239,0.55)")
                          : "rgba(255,255,255,0.10)"
                      }`,
                      color: listenEnabled
                        ? (micStatus === "blocked" ? "#F87171" : B.blue)
                        : B.dim,
                      cursor: "pointer", fontSize: 15,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.2s",
                      boxShadow: listenEnabled && micStatus === "listening"
                        ? "0 0 10px rgba(0,174,239,0.35)"
                        : "none",
                    }}
                  >🎤</button>
                ) : (
                  <button disabled style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                    color: B.dim, cursor: "not-allowed", fontSize: 15,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>🎤</button>
                )}
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: "0.5px",
                  color: !micSupported ? B.dim : listenEnabled ? (micStatus === "blocked" ? "#F87171" : B.blue) : B.dim,
                }}>
                  {!micSupported ? "N/A" : listenEnabled ? (micStatus === "blocked" ? "BLOCKED" : "ON") : "OFF"}
                </span>
              </div>
              {/* Attach */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <button disabled style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                  color: B.dim, cursor: "not-allowed", fontSize: 15,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>📎</button>
                <ComingSoon />
              </div>
              {/* Send */}
              <button
                onClick={() => send(input)}
                disabled={!canSend}
                style={{
                  width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                  background: canSend
                    ? "linear-gradient(135deg, #00AEEF 0%, #06B6D4 100%)"
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${canSend ? "#00AEEF" : "rgba(255,255,255,0.08)"}`,
                  color: canSend ? "#030612" : B.dim,
                  cursor: canSend ? "pointer" : "not-allowed",
                  fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s",
                  boxShadow: canSend ? "0 4px 12px rgba(0,174,239,0.3)" : "none",
                }}>➤</button>
            </div>
          </div>
          <div style={{ fontSize: 10, color: micStatus === "blocked" ? "#F87171" : B.dim, marginTop: 7, textAlign: "center" }}>
            {micStatus === "blocked"
              ? "⚠ Microphone blocked — allow access in browser settings, then click 🎤 again."
              : micStatus === "requesting"
              ? "💬 Allow microphone access when prompted to enable Apollos listening."
              : listenEnabled
              ? "🎤 Auto Listen ON — speak naturally, Apollos will transcribe and send after a pause."
              : "Enter to send · Shift+Enter for new line · click 🎤 to enable voice input"}
          </div>
        </div>
      </div>

      {/* ══ RIGHT PANEL ═══════════════════════════════════════════════════════ */}
      <div style={{
        width: 240, flexShrink: 0, background: B.panel,
        borderLeft: `1px solid ${B.border}`,
        padding: "20px 14px", overflowY: "auto",
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>
          Suggested Prompts
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {SUGGESTED_PROMPTS.map(p => (
            <button key={p.text} onClick={() => send(p.text)} style={{
              width: "100%", background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
              padding: "10px 12px", fontSize: 12, color: B.silver,
              cursor: "pointer", textAlign: "left", lineHeight: 1.4,
              display: "flex", alignItems: "flex-start", gap: 8, transition: "all 0.15s",
            }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = `${p.color}12`; b.style.borderColor = `${p.color}35`; b.style.color = B.white; }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.02)"; b.style.borderColor = "rgba(255,255,255,0.06)"; b.style.color = B.silver; }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{p.icon}</span>
              <span>{p.text}</span>
            </button>
          ))}
        </div>

        <div style={{ margin: "20px 0 12px", height: 1, background: B.border }} />

        <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>
          Active Context
        </div>
        {[
          { icon: "🐛", label: "BB&B",              sub: "Live client"   },
          { icon: "📍", label: "Baldwin County, AL", sub: "Service area" },
          { icon: "🏷️", label: "Pest Control",       sub: "Industry"     },
        ].map(c => (
          <div key={c.label} style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}>
            <span style={{ fontSize: 13 }}>{c.icon}</span>
            <div>
              <div style={{ fontSize: 11.5, color: B.white, fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: 10, color: B.dim }}>{c.sub}</div>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 16, padding: "8px 10px", borderRadius: 8, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.2)", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: B.dim, marginBottom: 3 }}>Live business context</div>
          <div style={{ fontSize: 9, color: "#22C55E", fontWeight: 800, letterSpacing: "0.5px" }}>🟢 CONNECTED</div>
          {hasLivePosts && <div style={{ fontSize: 9, color: B.dim, marginTop: 3 }}>{postsPublished} posts published</div>}
          {hasLiveLeads && <div style={{ fontSize: 9, color: B.dim }}>{leadsActive} lead{leadsActive !== 1 ? "s" : ""} need follow-up</div>}
          {hasLiveCalls && missedCalls > 0 && <div style={{ fontSize: 9, color: "#F87171" }}>{missedCalls} missed call{missedCalls !== 1 ? "s" : ""}</div>}
        </div>

        {/* ── Launch Panel ── */}
        <div style={{ margin: "22px 0 10px", height: 1, background: B.border }} />
        <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>
          Launch an AI Edge Engine
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {LAUNCH_ENGINES.map(e => {
            const s = STATUS_STYLE[e.status as LaunchStatus];
            const canLaunch = e.status !== "soon" && e.route !== null;
            return (
              <div key={e.label} style={{
                background: "rgba(255,255,255,0.02)",
                border: `1px solid rgba(255,255,255,0.06)`,
                borderLeft: `2px solid ${e.color}44`,
                borderRadius: 10, padding: "10px 11px",
              }}>
                {/* Card header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>{e.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: B.white }}>{e.label}</span>
                  </div>
                  <span style={{
                    fontSize: 7.5, fontWeight: 800, letterSpacing: "0.6px",
                    background: s.bg, border: `1px solid ${s.border}`,
                    color: s.color, borderRadius: 7, padding: "1px 5px", flexShrink: 0,
                  }}>{s.label}</span>
                </div>
                {/* Description */}
                <div style={{ fontSize: 10, color: B.dim, lineHeight: 1.4, marginBottom: 8 }}>{e.desc}</div>
                {/* Action button */}
                {canLaunch ? (
                  <button
                    onClick={() => navigate(e.route as string)}
                    style={{
                      width: "100%", background: `${e.color}14`,
                      border: `1px solid ${e.color}33`, borderRadius: 7,
                      padding: "5px 0", fontSize: 10.5, fontWeight: 700,
                      color: e.color, cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${e.color}24`; }}
                    onMouseLeave={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${e.color}14`; }}
                  >
                    {e.status === "preview" ? "Open Preview →" : "Launch →"}
                  </button>
                ) : (
                  <button disabled style={{
                    width: "100%", background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7,
                    padding: "5px 0", fontSize: 10.5, fontWeight: 700,
                    color: B.dim, cursor: "not-allowed",
                  }}>Coming Soon</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`@keyframes apollosBounce{0%,100%{transform:translateY(0);opacity:0.6}50%{transform:translateY(-4px);opacity:1}}`}</style>
    </div>
  );
}
