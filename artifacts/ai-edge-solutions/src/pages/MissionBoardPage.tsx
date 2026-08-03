import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, BrainCircuit, Clock3, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Link } from "wouter";
import { useApiFetch } from "@/lib/api";

type PlannerStatus = "healthy" | "stale" | "blocked" | "disabled" | "uninitialized";
type AgentStatus = "ready" | "blocked" | "disabled" | "uninitialized" | "budget_exhausted";

interface PlannerResponse {
  status: PlannerStatus;
  checkedAt: string;
  heartbeatAgeMs?: number | null;
  latestHeartbeat: null | {
    runtimeId: string;
    observedAt: string;
    readinessStatus: "ready" | "blocked";
    blockers: string[];
    reasonCode: string;
    nextEligibleAt: string | null;
    consecutiveFailures: number;
  };
  latestCycle: null | {
    completedAt: string;
    operation: string;
    stopCode: string | null;
    outcome: string;
  };
}

interface Recommendation {
  summary?: string;
  observations?: string[];
  recommendedNextStep?: string;
  requiresHumanApproval?: boolean;
  requestedCapability?: string | null;
  confidence?: number;
  stopReason?: string | null;
}

interface AgentResponse {
  status: AgentStatus;
  checkedAt: string;
  workerEnabled: boolean;
  providerEnabled: boolean;
  killSwitch: boolean;
  providerReady: boolean;
  queue: null | { queued: number; running: number; failed: number; succeeded: number };
  budget: {
    dailyRequestLimit: number;
    dailyTokenLimit: number;
    requestsUsed: number;
    tokensUsed: number;
    exhausted?: boolean;
  };
  latestRun: null | {
    runId: string;
    model: string;
    startedAt: string;
    completedAt: string | null;
    status: string;
    inputTokens: number | null;
    outputTokens: number | null;
    failureCode: string | null;
  };
  latestResult: null | {
    createdAt: string;
    recommendation: Recommendation;
  };
}

const palette = {
  navy: "#030612",
  panel: "#080E1F",
  border: "rgba(0,174,239,0.18)",
  blue: "#00AEEF",
  green: "#22C55E",
  gold: "#FBBF24",
  red: "#F87171",
  silver: "#94A3B8",
  white: "#FFFFFF",
};

function colorFor(status: string): string {
  if (["healthy", "ready", "completed", "succeeded"].includes(status)) return palette.green;
  if (["stale", "blocked", "budget_exhausted", "failed"].includes(status)) return status === "failed" ? palette.red : palette.gold;
  return palette.silver;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Invalid timestamp" : parsed.toLocaleString();
}

function StatusPill({ value }: { value: string }) {
  const color = colorFor(value);
  return <span style={{ color, border: `1px solid ${color}55`, background: `${color}18`, borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".7px" }}>{value.replaceAll("_", " ")}</span>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <section style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 20 }}>{children}</section>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><div style={{ color: palette.silver, fontSize: 11, textTransform: "uppercase", letterSpacing: "1px" }}>{label}</div><div style={{ color: palette.white, fontSize: 20, fontWeight: 800, marginTop: 5 }}>{value}</div></div>;
}

export default function MissionBoardPage() {
  const apiFetch = useApiFetch();
  const planner = useQuery({ queryKey: ["dab", "planner-status"], queryFn: () => apiFetch<PlannerResponse>("/dab/status"), refetchInterval: 30_000, retry: 1 });
  const agent = useQuery({ queryKey: ["dab", "agent-status"], queryFn: () => apiFetch<AgentResponse>("/dab/agent-status"), refetchInterval: 30_000, retry: 1 });
  const refreshing = planner.isFetching || agent.isFetching;
  const refresh = () => Promise.all([planner.refetch(), agent.refetch()]);
  const recommendation = agent.data?.latestResult?.recommendation;
  const error = planner.error || agent.error;

  return <main style={{ minHeight: "100vh", background: palette.navy, color: palette.white, padding: "28px 32px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
      <div>
        <Link href="/admin/mission-control" style={{ color: palette.blue, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", marginBottom: 12 }}><ArrowLeft size={14}/> Mission Control</Link>
        <div style={{ color: palette.blue, fontSize: 10, letterSpacing: "3px", fontWeight: 800, textTransform: "uppercase" }}>AI Edge OS · Development Autonomy</div>
        <h1 style={{ margin: "6px 0", fontSize: 30 }}>🧭 Mission Board</h1>
        <p style={{ margin: 0, color: palette.silver, fontSize: 13 }}>Read-only proof of when the system woke, what it observed, and what it recommends.</p>
      </div>
      <button onClick={refresh} disabled={refreshing} style={{ background: `${palette.blue}18`, color: palette.blue, border: `1px solid ${palette.blue}55`, borderRadius: 10, padding: "10px 14px", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}><RefreshCw size={15} style={{ animation: refreshing ? "spin 1s linear infinite" : undefined }}/>{refreshing ? "Refreshing" : "Refresh"}</button>
    </header>

    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

    {error && <div style={{ marginBottom: 18, border: `1px solid ${palette.red}55`, background: `${palette.red}15`, color: palette.red, borderRadius: 12, padding: 14, display: "flex", gap: 9, alignItems: "center" }}><TriangleAlert size={18}/> Status could not be loaded. The board will retry automatically.</div>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, marginBottom: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}><div style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 800 }}><Bot size={20} color={palette.blue}/> Planner Worker</div>{planner.data && <StatusPill value={planner.data.status}/>}</div>
        {planner.isLoading ? <p style={{ color: palette.silver }}>Reading planner heartbeat…</p> : planner.data ? <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Metric label="Last heartbeat" value={formatTime(planner.data.latestHeartbeat?.observedAt)}/>
            <Metric label="Wake reason" value={planner.data.latestHeartbeat?.reasonCode ?? "None"}/>
            <Metric label="Last operation" value={planner.data.latestCycle?.operation ?? "None"}/>
            <Metric label="Cycle outcome" value={planner.data.latestCycle?.outcome ?? "None"}/>
          </div>
          {planner.data.latestHeartbeat?.blockers?.length ? <div style={{ marginTop: 16, color: palette.gold, fontSize: 13 }}>Blocked by: {planner.data.latestHeartbeat.blockers.join(", ")}</div> : null}
          {planner.data.latestCycle?.stopCode ? <div style={{ marginTop: 8, color: palette.silver, fontSize: 13 }}>Safe stop: {planner.data.latestCycle.stopCode}</div> : null}
        </> : <p style={{ color: palette.silver }}>No planner status is available.</p>}
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}><div style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 800 }}><BrainCircuit size={20} color={palette.blue}/> Reasoning Agent</div>{agent.data && <StatusPill value={agent.data.status}/>}</div>
        {agent.isLoading ? <p style={{ color: palette.silver }}>Reading agent state…</p> : agent.data ? <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Metric label="Provider ready" value={agent.data.providerReady ? "Yes" : "No"}/>
            <Metric label="Latest run" value={agent.data.latestRun?.status ?? "No run"}/>
            <Metric label="Queued" value={agent.data.queue?.queued ?? 0}/>
            <Metric label="Completed" value={agent.data.queue?.succeeded ?? 0}/>
          </div>
          {!agent.data.providerReady && <div style={{ marginTop: 16, color: palette.gold, fontSize: 13 }}>Provider is blocked. Check the provider switch, kill switch, or model credential.</div>}
          {agent.data.latestRun?.failureCode && <div style={{ marginTop: 8, color: palette.red, fontSize: 13 }}>Last failure: {agent.data.latestRun.failureCode}</div>}
        </> : <p style={{ color: palette.silver }}>No agent status is available.</p>}
      </Card>
    </div>

    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div><div style={{ fontWeight: 900, fontSize: 18 }}>Latest Autonomous Recommendation</div><div style={{ color: palette.silver, fontSize: 12, marginTop: 4 }}>Recommendation only — the agent has no authority to execute it.</div></div>
        <ShieldCheck size={24} color={palette.green}/>
      </div>
      {recommendation ? <div style={{ display: "grid", gap: 16 }}>
        <div><div style={{ color: palette.blue, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px" }}>Summary</div><p style={{ lineHeight: 1.6, marginBottom: 0 }}>{recommendation.summary || "No summary supplied."}</p></div>
        {recommendation.observations?.length ? <div><div style={{ color: palette.blue, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px" }}>Observations</div><ul style={{ lineHeight: 1.7, paddingLeft: 20 }}>{recommendation.observations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div> : null}
        <div style={{ borderLeft: `3px solid ${palette.blue}`, paddingLeft: 14 }}><div style={{ color: palette.blue, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px" }}>Recommended next step</div><p style={{ fontSize: 17, fontWeight: 750, lineHeight: 1.55, marginBottom: 0 }}>{recommendation.recommendedNextStep || "No next step supplied."}</p></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
          <Metric label="Human approval" value={recommendation.requiresHumanApproval ? "Required" : "Not requested"}/>
          <Metric label="Requested capability" value={recommendation.requestedCapability || "None"}/>
          <Metric label="Confidence" value={typeof recommendation.confidence === "number" ? `${Math.round(recommendation.confidence * 100)}%` : "Not supplied"}/>
          <Metric label="Generated" value={formatTime(agent.data?.latestResult?.createdAt)}/>
        </div>
        {recommendation.stopReason && <div style={{ color: palette.gold, fontSize: 13 }}>Stop reason: {recommendation.stopReason}</div>}
      </div> : <div style={{ color: palette.silver, padding: "18px 0" }}><Clock3 size={24} style={{ marginBottom: 8 }}/>No successful autonomous recommendation has been observed yet. The board will show it as soon as a bounded run completes.</div>}
    </Card>

    {agent.data && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 16 }}>
      <Card><Metric label="Requests today" value={`${agent.data.budget.requestsUsed} / ${agent.data.budget.dailyRequestLimit}`}/></Card>
      <Card><Metric label="Tokens today" value={`${agent.data.budget.tokensUsed} / ${agent.data.budget.dailyTokenLimit}`}/></Card>
      <Card><Metric label="Last model" value={agent.data.latestRun?.model ?? "None"}/></Card>
      <Card><Metric label="Last checked" value={formatTime(agent.data.checkedAt)}/></Card>
    </div>}
  </main>;
}
