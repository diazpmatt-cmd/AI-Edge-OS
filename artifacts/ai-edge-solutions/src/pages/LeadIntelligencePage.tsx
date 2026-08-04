import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { useTheme } from "@/contexts/theme-context";
import { toast } from "sonner";

interface Lead {
  id: string; clientName: string; source: string; phone: string; customerName: string | null;
  message: string | null; status: string; service: string | null; location: string | null;
  urgency: string; draftResponse: string | null; responseStatus: string; receivedAt: string;
  updatedAt: string; lastFollowUpAt: string | null; outcome: string | null;
  deliveryStatus: string | null; needsFollowUp: boolean;
}
interface LeadsResponse {
  leads: Lead[];
  stats: { total: number; active: number; thisMonth: number; withMessages: number; followUpDue: number };
}
type ReviewAction = "edit" | "reject";

const RESPONSE_LABELS: Record<string, string> = {
  pending: "Pending", ready_for_review: "Ready for review", approved: "Approved",
  sending: "Sending", rejected: "Rejected", sent: "Sent", replied: "Replied", opted_out: "Opted out",
};
const RESPONSE_COLORS: Record<string, string> = {
  pending: "#94A3B8", ready_for_review: "#F59E0B", approved: "#22C55E",
  sending: "#A78BFA", rejected: "#EF4444", sent: "#00AEEF", replied: "#22C55E", opted_out: "#94A3B8",
};
const URGENCY_COLORS: Record<string, string> = { low: "#64748B", normal: "#3B82F6", high: "#F59E0B", emergency: "#EF4444" };

export default function LeadIntelligencePage() {
  const authFetch = useApiFetch();
  const queryClient = useQueryClient();
  const { colors: t } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("all");

  const { data, isLoading } = useQuery<LeadsResponse>({
    queryKey: ["lead-intelligence"], queryFn: () => authFetch<LeadsResponse>("/leads"), refetchInterval: 30_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["lead-intelligence"] });

  const analyzeMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/leads/${id}/analyze`, { method: "POST" }),
    onSuccess: () => { refresh(); toast.success("Lead analyzed and draft prepared"); },
    onError: () => toast.error("Lead analysis failed"),
  });
  const reviewMutation = useMutation({
    mutationFn: ({ id, action, draftResponse }: { id: string; action: ReviewAction; draftResponse?: string }) =>
      authFetch(`/leads/${id}/review`, { method: "PATCH", body: JSON.stringify({ action, ...(draftResponse !== undefined ? { draftResponse } : {}) }) }),
    onSuccess: (_, vars) => { refresh(); toast.success(vars.action === "reject" ? "Draft rejected" : "Draft saved for review"); },
    onError: () => toast.error("Could not update the draft"),
  });
  const sendMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/leads/${id}/send`, { method: "POST" }),
    onSuccess: () => { refresh(); toast.success("Response approved and sent by SMS"); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Message could not be sent"),
  });

  const leads = data?.leads ?? [];
  const visible = useMemo(() => {
    if (filter === "all") return leads;
    if (filter === "follow_up") return leads.filter(lead => lead.needsFollowUp);
    return leads.filter(lead => lead.responseStatus === filter);
  }, [filter, leads]);
  const selected = leads.find(lead => lead.id === selectedId) ?? null;
  const selectLead = (lead: Lead) => { setSelectedId(lead.id); setDraft(lead.draftResponse ?? ""); };
  const review = (action: ReviewAction) => {
    if (!selected) return;
    reviewMutation.mutate({ id: selected.id, action, ...(action === "edit" ? { draftResponse: draft.trim() } : {}) });
  };
  const canApproveAndSend = selected?.responseStatus === "ready_for_review" || selected?.responseStatus === "approved";

  return <AppShell><div style={{ maxWidth: 1180, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif" }}>
    <div style={{ marginBottom: 24 }}>
      <div style={{ color: "#00AEEF", fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Lead Intelligence</div>
      <h1 style={{ color: t.text, fontSize: 30, margin: 0 }}>Human Review Queue</h1>
      <p style={{ color: t.text2, marginTop: 8, maxWidth: 760 }}>Review and send customer replies, then track delivery, responses, opt-outs, and leads that need follow-up.</p>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 20 }}>
      {[["Total leads", data?.stats.total ?? 0], ["Ready to send", leads.filter(l => l.responseStatus === "ready_for_review" || l.responseStatus === "approved").length], ["Customer replies", leads.filter(l => l.responseStatus === "replied").length], ["Follow-up due", data?.stats.followUpDue ?? 0]].map(([label, value]) =>
        <div key={String(label)} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16 }}><div style={{ color: t.text3, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .8 }}>{label}</div><div style={{ color: t.text, fontSize: 28, fontWeight: 900, marginTop: 8 }}>{value}</div></div>)}
    </div>

    <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
      {["all", "pending", "ready_for_review", "sent", "replied", "follow_up", "opted_out", "rejected"].map(status => <button key={status} onClick={() => setFilter(status)} style={{ border: `1px solid ${filter === status ? "#00AEEF" : t.border}`, background: filter === status ? "rgba(0,174,239,.12)" : "transparent", color: filter === status ? "#00AEEF" : t.text2, padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{status === "all" ? "All" : status === "follow_up" ? "Follow-up due" : RESPONSE_LABELS[status]}</button>)}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: selected ? "minmax(0,1fr) 430px" : "1fr", gap: 16, alignItems: "start" }}>
      <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, overflow: "hidden" }}>
        {isLoading ? <div style={{ padding: 28, color: t.text3 }}>Loading leads...</div> : visible.length === 0 ? <div style={{ padding: 36, color: t.text3, textAlign: "center" }}>No leads match this filter.</div> : visible.map(lead => {
          const active = lead.id === selectedId;
          return <button key={lead.id} onClick={() => selectLead(lead)} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 125px", gap: 16, width: "100%", textAlign: "left", padding: "16px 18px", border: 0, borderBottom: `1px solid ${t.border}`, borderLeft: active ? "3px solid #00AEEF" : lead.needsFollowUp ? "3px solid #F59E0B" : "3px solid transparent", background: active ? "rgba(0,174,239,.08)" : "transparent", cursor: "pointer" }}>
            <div><div style={{ color: t.text, fontWeight: 800 }}>{lead.customerName || lead.phone}</div><div style={{ color: t.text3, fontSize: 12, marginTop: 5 }}>{lead.message || "No message supplied"}</div></div>
            <div><div style={{ color: t.text2, fontSize: 13 }}>{lead.service || "Service not identified"}</div><div style={{ color: t.text3, fontSize: 12, marginTop: 5 }}>{lead.deliveryStatus ? `SMS: ${lead.deliveryStatus.replaceAll("_", " ")}` : lead.location || "Location unknown"}</div></div>
            <div><div style={{ color: RESPONSE_COLORS[lead.responseStatus] ?? "#94A3B8", fontSize: 11, fontWeight: 800 }}>{RESPONSE_LABELS[lead.responseStatus] || lead.responseStatus}</div><div style={{ color: lead.needsFollowUp ? "#F59E0B" : URGENCY_COLORS[lead.urgency] ?? "#3B82F6", fontSize: 11, fontWeight: 800, marginTop: 7, textTransform: "uppercase" }}>{lead.needsFollowUp ? "Follow-up due" : lead.urgency}</div></div>
          </button>;
        })}
      </div>

      {selected && <aside style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 18, position: "sticky", top: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}><div><div style={{ color: t.text, fontWeight: 900, fontSize: 18 }}>{selected.customerName || "Unknown customer"}</div><div style={{ color: t.text3, fontSize: 12, marginTop: 4 }}>{selected.phone} · {selected.source}</div></div><button onClick={() => setSelectedId(null)} style={{ border: 0, background: "transparent", color: t.text3, cursor: "pointer", fontSize: 18 }}>×</button></div>
        {(selected.deliveryStatus || selected.needsFollowUp) && <div style={{ marginTop: 14, padding: 10, borderRadius: 9, background: selected.needsFollowUp ? "rgba(245,158,11,.12)" : "rgba(0,174,239,.1)", color: selected.needsFollowUp ? "#F59E0B" : "#00AEEF", fontSize: 12, fontWeight: 800 }}>{selected.needsFollowUp ? "Follow-up is due — no customer reply has been recorded." : `SMS status: ${selected.deliveryStatus?.replaceAll("_", " ")}`}</div>}
        <div style={{ marginTop: 18 }}><div style={{ color: t.text3, fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Customer message</div><div style={{ color: t.text2, fontSize: 13, lineHeight: 1.55, marginTop: 7, padding: 12, borderRadius: 10, background: "rgba(255,255,255,.03)" }}>{selected.message || "No message supplied"}</div></div>
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><div style={{ color: t.text2, fontSize: 12 }}><strong>Service:</strong><br />{selected.service || "Unknown"}</div><div style={{ color: t.text2, fontSize: 12 }}><strong>Location:</strong><br />{selected.location || "Unknown"}</div></div>
        <div style={{ marginTop: 18 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}><div style={{ color: t.text3, fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Proposed response</div><button onClick={() => analyzeMutation.mutate(selected.id)} disabled={analyzeMutation.isPending || ["sending", "sent", "replied", "opted_out"].includes(selected.responseStatus)} style={{ border: "1px solid rgba(0,174,239,.35)", background: "rgba(0,174,239,.1)", color: "#00AEEF", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 11, fontWeight: 800 }}>{selected.draftResponse ? "Re-analyze" : "Analyze"}</button></div>
          <textarea value={draft} onChange={event => setDraft(event.target.value)} rows={8} disabled={["sending", "sent", "replied", "opted_out"].includes(selected.responseStatus)} placeholder="Analyze this lead to generate a review draft." style={{ width: "100%", boxSizing: "border-box", resize: "vertical", borderRadius: 10, border: `1px solid ${t.border}`, background: "rgba(0,0,0,.18)", color: t.text, padding: 12, lineHeight: 1.5 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
          <button onClick={() => review("edit")} disabled={!draft.trim() || reviewMutation.isPending || ["sent", "replied", "opted_out"].includes(selected.responseStatus)} style={{ padding: 10, borderRadius: 9, border: `1px solid ${t.border}`, background: "transparent", color: t.text2, cursor: "pointer", fontWeight: 800 }}>Save edit</button>
          <button onClick={() => review("reject")} disabled={!selected.draftResponse || reviewMutation.isPending || ["sent", "replied", "opted_out"].includes(selected.responseStatus)} style={{ padding: 10, borderRadius: 9, border: "1px solid rgba(239,68,68,.35)", background: "rgba(239,68,68,.08)", color: "#EF4444", cursor: "pointer", fontWeight: 800 }}>Reject draft</button>
          <button onClick={() => sendMutation.mutate(selected.id)} disabled={!canApproveAndSend || sendMutation.isPending} style={{ gridColumn: "1 / -1", padding: 12, borderRadius: 9, border: "1px solid rgba(0,174,239,.5)", background: "rgba(0,174,239,.16)", color: "#00AEEF", cursor: "pointer", fontWeight: 900 }}>{sendMutation.isPending ? "Sending..." : "Approve & Send SMS"}</button>
        </div>
        <div style={{ color: t.text3, fontSize: 11, lineHeight: 1.5, marginTop: 12 }}>{selected.responseStatus === "replied" ? "Customer replied. Automated follow-up is suppressed." : selected.responseStatus === "opted_out" ? "Customer opted out. Further SMS follow-up is blocked." : selected.responseStatus === "sent" ? `Sent ${selected.lastFollowUpAt ? new Date(selected.lastFollowUpAt).toLocaleString() : "successfully"}.` : "Approve & Send is the only customer-contact action. The server blocks duplicate clicks."}</div>
      </aside>}
    </div>
  </div></AppShell>;
}
