import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { useApiFetch } from "@/lib/api";

type Platform = "facebook" | "google";
type Preflight = {
  canArm: boolean;
  payloadHash: string;
  payload: Record<string, unknown>;
  platformReadiness: { platform: string; connected: boolean; mediaValid: boolean; reason: string | null; canPublish: boolean };
  blockers: string[];
  confirmationText: string;
};
type Execution = { executionId: string; postId: string; platform: string; payloadHash: string; scheduledAt: string; status: string; externalPostId: string | null; externalPostUrl: string | null; publishedAt: string | null; failureCode: string | null };

const C = { bg: "#030612", panel: "#080E1F", blue: "#00AEEF", green: "#22C55E", gold: "#FBBF24", red: "#F87171", silver: "#94A3B8", white: "#FFFFFF", border: "rgba(0,174,239,.22)" };

export default function FirstPublishPage() {
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  const [caption, setCaption] = useState("");
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [scheduledAt, setScheduledAt] = useState("");
  const [postId, setPostId] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [confirmation, setConfirmation] = useState("");

  const executions = useQuery({ queryKey: ["dab", "first-publish"], queryFn: () => apiFetch<{ executions: Execution[] }>("/dab/first-publish"), refetchInterval: 15_000, retry: 1 });

  const save = useMutation({
    mutationFn: () => apiFetch<{ id: string }>("/social-posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientName: "Bed Bugs & Beyond", caption, platforms: [], scheduledAt: null, status: "draft", ctaType: "none" }),
    }),
    onSuccess: (post) => { setPostId(post.id); setPreflight(null); setConfirmation(""); },
  });

  const check = useMutation({
    mutationFn: () => apiFetch<Preflight>("/dab/first-publish/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, platform, scheduledAt: new Date(scheduledAt).toISOString() }),
    }),
    onSuccess: (result) => { setPreflight(result); setConfirmation(""); },
  });

  const arm = useMutation({
    mutationFn: () => apiFetch("/dab/first-publish/arm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, platform, scheduledAt: new Date(scheduledAt).toISOString(), payloadHash: preflight?.payloadHash, confirmation }),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dab", "first-publish"] }); setPreflight(null); setConfirmation(""); },
  });

  const changedAfterSave = Boolean(postId && save.data?.id === postId && save.variables === undefined);
  const canPreflight = Boolean(postId && scheduledAt && !check.isPending);

  return <main style={{ minHeight: "100vh", background: C.bg, color: C.white, padding: "28px 32px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
    <header style={{ marginBottom: 24 }}>
      <Link href="/admin/approval-inbox" style={{ color: C.blue, textDecoration: "none", display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}><ArrowLeft size={14}/> Approval Inbox</Link>
      <div style={{ marginTop: 12, color: C.blue, fontSize: 10, letterSpacing: "3px", fontWeight: 800, textTransform: "uppercase" }}>DAB-8A · First Bounded Action</div>
      <h1 style={{ margin: "6px 0", fontSize: 30 }}>🚀 First Verified Publish</h1>
      <p style={{ margin: 0, color: C.silver, maxWidth: 850 }}>Save one Bed Bugs & Beyond post, run a read-only readiness check, then arm one exact payload for one platform and one time.</p>
    </header>

    <div style={{ border: `1px solid ${C.gold}55`, background: `${C.gold}12`, color: C.gold, padding: 14, borderRadius: 12, marginBottom: 18, display: "flex", gap: 9 }}><ShieldAlert size={19}/><div><strong>This can publish externally.</strong> Saving and preflight do not publish. Typing the exact ARM phrase and pressing Arm Test authorizes one real post.</div></div>

    <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "grid", gap: 14 }}>
      <label><div style={{ color: C.silver, fontSize: 12, marginBottom: 6 }}>Exact post content</div><textarea value={caption} onChange={(e) => { setCaption(e.target.value); if (postId) { setPostId(null); setPreflight(null); } }} maxLength={5000} placeholder="Write the exact approved Bed Bugs & Beyond post..." style={{ width: "100%", minHeight: 150, boxSizing: "border-box", borderRadius: 10, padding: 12, background: C.bg, color: C.white, border: `1px solid ${C.border}` }}/></label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
        <label><div style={{ color: C.silver, fontSize: 12, marginBottom: 6 }}>Platform</div><select value={platform} onChange={(e) => { setPlatform(e.target.value as Platform); setPreflight(null); }} style={{ width: "100%", padding: 11, borderRadius: 9, background: C.bg, color: C.white, border: `1px solid ${C.border}` }}><option value="facebook">Facebook</option><option value="google">Google Business Profile</option></select></label>
        <label><div style={{ color: C.silver, fontSize: 12, marginBottom: 6 }}>Publish time</div><input type="datetime-local" value={scheduledAt} onChange={(e) => { setScheduledAt(e.target.value); setPreflight(null); }} style={{ width: "100%", boxSizing: "border-box", padding: 11, borderRadius: 9, background: C.bg, color: C.white, border: `1px solid ${C.border}` }}/></label>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button disabled={caption.trim().length < 10 || save.isPending} onClick={() => save.mutate()} style={{ padding: "10px 14px", borderRadius: 9, background: `${C.blue}20`, color: C.blue, border: `1px solid ${C.blue}55`, fontWeight: 800 }}>1. Save Exact Post</button>
        <button disabled={!canPreflight} onClick={() => check.mutate()} style={{ padding: "10px 14px", borderRadius: 9, background: `${C.green}20`, color: C.green, border: `1px solid ${C.green}55`, fontWeight: 800 }}>2. Run Preflight</button>
      </div>
      {postId && <div style={{ color: C.silver, fontSize: 12 }}>Saved post ID: <code>{postId}</code></div>}
      {(save.error || check.error || arm.error) && <div style={{ color: C.red }}>The operation was blocked or failed. Refresh and verify the exact post, platform connection, schedule, and confirmation.</div>}
    </section>

    {preflight && <section style={{ marginTop: 18, background: C.panel, border: `1px solid ${preflight.canArm ? C.green : C.red}55`, borderRadius: 14, padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>{preflight.canArm ? "✅ Ready to arm" : "⛔ Preflight blocked"}</h2>
      <p style={{ color: C.silver }}>Connection: {preflight.platformReadiness.connected ? "connected" : "not connected"} · Media: {preflight.platformReadiness.mediaValid ? "valid" : "invalid"}</p>
      {preflight.blockers.length > 0 && <p style={{ color: C.red }}>{preflight.blockers.join(" · ")}</p>}
      <div style={{ color: C.silver, fontSize: 12 }}>Payload hash<br/><code style={{ color: C.white }}>{preflight.payloadHash}</code></div>
      {preflight.canArm && <div style={{ marginTop: 16 }}>
        <div style={{ color: C.gold, marginBottom: 8 }}>Type exactly: <strong>{preflight.confirmationText}</strong></div>
        <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: 11, borderRadius: 9, background: C.bg, color: C.white, border: `1px solid ${C.gold}66` }}/>
        <button disabled={confirmation !== preflight.confirmationText || arm.isPending} onClick={() => arm.mutate()} style={{ marginTop: 10, padding: "11px 15px", borderRadius: 9, background: `${C.red}20`, color: C.red, border: `1px solid ${C.red}66`, fontWeight: 900, display: "inline-flex", gap: 8, alignItems: "center" }}><Send size={16}/> 3. Arm One Real Test Post</button>
      </div>}
    </section>}

    <section style={{ marginTop: 18, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 style={{ margin: 0 }}>Execution Ledger</h2><button onClick={() => executions.refetch()} style={{ background: "transparent", color: C.blue, border: 0 }}><RefreshCw size={16}/></button></div>
      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {executions.data?.executions.map((item) => <div key={item.executionId} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><strong>{item.platform}</strong><span style={{ color: item.status === "verified" ? C.green : item.status === "failed" ? C.red : C.gold }}>{item.status}</span></div>
          <div style={{ color: C.silver, fontSize: 12, marginTop: 6 }}>Scheduled: {new Date(item.scheduledAt).toLocaleString()}</div>
          {item.externalPostId && <div style={{ color: C.green, fontSize: 12 }}>External ID: {item.externalPostId}</div>}
          {item.externalPostUrl && <a href={item.externalPostUrl} target="_blank" rel="noreferrer" style={{ color: C.blue, fontSize: 12 }}>Open published post</a>}
          {item.failureCode && <div style={{ color: C.red, fontSize: 12 }}>{item.failureCode}</div>}
        </div>)}
        {executions.data && executions.data.executions.length === 0 && <div style={{ color: C.silver }}>No DAB-8A execution has been armed.</div>}
      </div>
    </section>
  </main>;
}
