import { useQuery } from "@tanstack/react-query";
import { FileCheck2, RefreshCw } from "lucide-react";
import { useApiFetch } from "@/lib/api";

type Artifact = { artifactId: number; kind: string; bytes: number; sha256: string; createdAt: string; preview: string | null };
type Job = { jobId: string; proposalId: string; capability: string; approvedBy: string; status: string; attempts: number; createdAt: string; completedAt: string | null; failureCode: string | null; artifacts: Artifact[] };
type Response = { executionEnabled: false; authorityNotice?: string; jobs: Job[] };

const C = { panel: "#080E1F", blue: "#00AEEF", green: "#22C55E", gold: "#FBBF24", red: "#F87171", silver: "#94A3B8", white: "#FFFFFF", border: "rgba(0,174,239,.2)" };

export default function PreparationReviewPanel() {
  const apiFetch = useApiFetch();
  const query = useQuery({ queryKey: ["dab", "preparations"], queryFn: () => apiFetch<Response>("/dab/preparations"), refetchInterval: 30_000, retry: 1 });
  return <section style={{ marginTop: 24 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <div><h2 style={{ margin: 0, fontSize: 22 }}>🧪 Prepared Review Packages</h2><p style={{ color: C.silver, margin: "5px 0 0", fontSize: 13 }}>Disposable-sandbox output only. Nothing below has been applied, committed, merged, deployed, or published.</p></div>
      <button onClick={() => query.refetch()} style={{ background: `${C.blue}18`, border: `1px solid ${C.blue}55`, color: C.blue, borderRadius: 9, padding: "8px 11px", display: "flex", gap: 7, fontWeight: 800 }}><RefreshCw size={14}/> Refresh</button>
    </div>
    {query.isLoading && <p style={{ color: C.silver }}>Reading preparation jobs…</p>}
    {query.error && <p style={{ color: C.red }}>Preparation status could not be loaded.</p>}
    <div style={{ display: "grid", gap: 12 }}>
      {query.data?.jobs.map((job) => {
        const color = job.status === "succeeded" ? C.green : job.status === "failed" || job.status === "blocked" ? C.red : C.gold;
        return <article key={job.jobId} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><div style={{ color: C.blue, fontSize: 11, textTransform: "uppercase", fontWeight: 800 }}>{job.capability.replaceAll("_", " ")}</div><div style={{ fontWeight: 850, marginTop: 5 }}>{job.jobId}</div></div><span style={{ color, fontWeight: 900, textTransform: "uppercase", fontSize: 11 }}>{job.status}</span></div>
          <div style={{ color: C.silver, fontSize: 12, marginTop: 10 }}>Approved by {job.approvedBy} · Attempts {job.attempts} · Created {new Date(job.createdAt).toLocaleString()}</div>
          {job.failureCode && <p style={{ color: C.red }}>Failure: {job.failureCode}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, marginTop: 12 }}>
            {job.artifacts.map((artifact) => <div key={artifact.artifactId} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 11 }}><div style={{ display: "flex", gap: 7, alignItems: "center", fontWeight: 800 }}><FileCheck2 size={15} color={C.blue}/>{artifact.kind.replaceAll("_", " ")}</div><div style={{ color: C.silver, fontSize: 11, marginTop: 6 }}>{artifact.bytes} bytes · <code>{artifact.sha256.slice(0, 14)}…</code></div>{artifact.preview && <pre style={{ whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto", color: C.silver, fontSize: 11, marginBottom: 0 }}>{artifact.preview}</pre>}</div>)}
          </div>
        </article>;
      })}
      {query.data && query.data.jobs.length === 0 && <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, color: C.silver }}>No approved proposal has produced a preparation job yet.</div>}
    </div>
  </section>;
}
