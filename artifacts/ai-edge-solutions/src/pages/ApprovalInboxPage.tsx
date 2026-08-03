import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock3, RefreshCw, ShieldAlert, SlidersHorizontal, XCircle } from "lucide-react";
import { Link } from "wouter";
import { useApiFetch } from "@/lib/api";
import PreparationReviewPanel from "@/components/PreparationReviewPanel";

type Proposal = {
  proposalId: string;
  proposalFingerprint: string;
  requestId: string;
  runId: string;
  contextHash: string;
  capability: string;
  riskLevel: "low" | "medium" | "high";
  summary: string;
  recommendedNextStep: string;
  affectedResources: string[];
  rationale: string;
  confidence: number;
  status: "pending" | "approved" | "rejected" | "modify" | "expired";
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  operatorInstructions: string | null;
};

type ApprovalResponse = {
  executionEnabled: false;
  authorityNotice: string;
  proposals: Proposal[];
};

const C = { bg: "#030612", panel: "#080E1F", blue: "#00AEEF", green: "#22C55E", gold: "#FBBF24", red: "#F87171", silver: "#94A3B8", white: "#FFFFFF", border: "rgba(0,174,239,.2)" };

function statusColor(status: string) {
  if (status === "approved") return C.green;
  if (status === "rejected" || status === "expired") return C.red;
  if (status === "modify") return C.gold;
  return C.blue;
}

export default function ApprovalInboxPage() {
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const approvals = useQuery({ queryKey: ["dab", "approvals"], queryFn: () => apiFetch<ApprovalResponse>("/dab/approvals"), refetchInterval: 30_000, retry: 1 });
  const decision = useMutation({
    mutationFn: ({ proposal, value }: { proposal: Proposal; value: "approved" | "rejected" | "modify" }) => apiFetch(`/dab/approvals/${proposal.proposalId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: value, proposalFingerprint: proposal.proposalFingerprint, operatorInstructions: instructions[proposal.proposalId] || null }),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dab", "approvals"] }),
  });

  return <main style={{ minHeight: "100vh", background: C.bg, color: C.white, padding: "28px 32px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
      <div>
        <Link href="/admin/mission-board" style={{ color: C.blue, textDecoration: "none", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14}/> Mission Board</Link>
        <div style={{ marginTop: 12, color: C.blue, fontSize: 10, letterSpacing: "3px", fontWeight: 800, textTransform: "uppercase" }}>AI Edge OS · Human Authority</div>
        <h1 style={{ margin: "6px 0", fontSize: 30 }}>🛡️ Approval Inbox</h1>
        <p style={{ margin: 0, color: C.silver, maxWidth: 760 }}>Review exact-scope preparation requests and the disposable-sandbox packages created after approval.</p>
      </div>
      <button onClick={() => approvals.refetch()} style={{ alignSelf: "flex-start", background: `${C.blue}18`, border: `1px solid ${C.blue}55`, color: C.blue, borderRadius: 10, padding: "10px 14px", fontWeight: 800, display: "flex", gap: 8 }}><RefreshCw size={15}/> Refresh</button>
    </header>

    <div style={{ border: `1px solid ${C.gold}55`, background: `${C.gold}12`, color: C.gold, padding: 14, borderRadius: 12, marginBottom: 18, display: "flex", gap: 9 }}><ShieldAlert size={19}/><div><strong>Preparation only.</strong> Approval may create review artifacts in a disposable sandbox. It never applies changes, writes GitHub, merges, deploys, publishes, contacts customers, or triggers external action.</div></div>

    {approvals.isLoading && <p style={{ color: C.silver }}>Reading the durable approval ledger…</p>}
    {approvals.error && <p style={{ color: C.red }}>The approval inbox could not be loaded. It will retry automatically.</p>}
    {decision.error && <p style={{ color: C.red }}>The decision was not recorded. Refresh the proposal before trying again.</p>}

    <div style={{ display: "grid", gap: 16 }}>
      {approvals.data?.proposals.map((proposal) => {
        const color = statusColor(proposal.status);
        const pending = proposal.status === "pending";
        return <section key={proposal.proposalId} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div><div style={{ color: C.blue, fontSize: 11, textTransform: "uppercase", fontWeight: 800, letterSpacing: "1px" }}>{proposal.capability.replaceAll("_", " ")}</div><h2 style={{ margin: "6px 0 4px", fontSize: 20 }}>{proposal.summary}</h2><div style={{ color: C.silver, fontSize: 12 }}>Risk: {proposal.riskLevel} · Confidence: {Math.round(proposal.confidence * 100)}%</div></div>
            <span style={{ color, border: `1px solid ${color}55`, background: `${color}18`, borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>{proposal.status}</span>
          </div>
          <div style={{ marginTop: 16, borderLeft: `3px solid ${C.blue}`, paddingLeft: 14 }}><div style={{ color: C.blue, fontSize: 10, textTransform: "uppercase", fontWeight: 800 }}>Proposed preparation</div><p style={{ marginBottom: 0, lineHeight: 1.6 }}>{proposal.recommendedNextStep}</p></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 16, color: C.silver, fontSize: 12 }}>
            <div><strong style={{ color: C.white }}>Affected resources</strong><br/>{proposal.affectedResources.join(", ") || "None specified"}</div>
            <div><strong style={{ color: C.white }}>Expires</strong><br/><Clock3 size={12} style={{ verticalAlign: "middle" }}/> {new Date(proposal.expiresAt).toLocaleString()}</div>
            <div><strong style={{ color: C.white }}>Proposal fingerprint</strong><br/><code>{proposal.proposalFingerprint.slice(0, 20)}…</code></div>
            <div><strong style={{ color: C.white }}>Context digest</strong><br/><code>{proposal.contextHash.slice(0, 20)}…</code></div>
          </div>
          <p style={{ color: C.silver, fontSize: 12, lineHeight: 1.5 }}>{proposal.rationale}</p>
          {pending ? <>
            <textarea value={instructions[proposal.proposalId] || ""} onChange={(event) => setInstructions((current) => ({ ...current, [proposal.proposalId]: event.target.value }))} placeholder="Optional for approve/reject; required when requesting changes." maxLength={2000} style={{ width: "100%", minHeight: 80, boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`, color: C.white, borderRadius: 10, padding: 12, resize: "vertical" }}/>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
              <button disabled={decision.isPending} onClick={() => decision.mutate({ proposal, value: "approved" })} style={{ background: `${C.green}20`, color: C.green, border: `1px solid ${C.green}55`, borderRadius: 9, padding: "9px 12px", fontWeight: 800, display: "flex", gap: 7 }}><CheckCircle2 size={16}/> Approve preparation</button>
              <button disabled={decision.isPending} onClick={() => decision.mutate({ proposal, value: "modify" })} style={{ background: `${C.gold}20`, color: C.gold, border: `1px solid ${C.gold}55`, borderRadius: 9, padding: "9px 12px", fontWeight: 800, display: "flex", gap: 7 }}><SlidersHorizontal size={16}/> Request changes</button>
              <button disabled={decision.isPending} onClick={() => decision.mutate({ proposal, value: "rejected" })} style={{ background: `${C.red}20`, color: C.red, border: `1px solid ${C.red}55`, borderRadius: 9, padding: "9px 12px", fontWeight: 800, display: "flex", gap: 7 }}><XCircle size={16}/> Reject</button>
            </div>
          </> : <div style={{ color, marginTop: 14, fontSize: 13 }}>Decision recorded {proposal.decidedAt ? new Date(proposal.decidedAt).toLocaleString() : ""}{proposal.operatorInstructions ? ` · ${proposal.operatorInstructions}` : ""}</div>}
        </section>;
      })}
      {approvals.data && approvals.data.proposals.length === 0 && <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, color: C.silver }}>No supported approval request is pending. A proposal appears only when the agent explicitly requests human approval for an allowlisted preparation capability.</section>}
    </div>

    <PreparationReviewPanel />
  </main>;
}
