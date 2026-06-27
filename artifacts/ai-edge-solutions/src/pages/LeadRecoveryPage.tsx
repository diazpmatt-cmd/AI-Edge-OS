import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";

type Lead = {
  id: string;
  clientName: string;
  source: string;
  phone: string;
  customerName: string | null;
  message: string | null;
  eventType: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type LeadsResponse = {
  leads: Lead[];
  stats: { total: number; active: number; thisMonth: number; withMessages: number };
};

const STATUS_OPTIONS = ["new", "contacted", "booked", "closed", "lost"];

const STATUS_STYLE: Record<string, { bg: string; color: string; dot: string }> = {
  new:       { bg: "rgba(0,174,239,0.12)",    color: "#00AEEF", dot: "#00AEEF" },
  contacted: { bg: "rgba(245,158,11,0.12)",   color: "#F59E0B", dot: "#F59E0B" },
  booked:    { bg: "rgba(16,185,129,0.12)",   color: "#10B981", dot: "#10B981" },
  closed:    { bg: "rgba(16,185,129,0.08)",   color: "#6EE7B7", dot: "#6EE7B7" },
  lost:      { bg: "rgba(148,163,184,0.1)",   color: "#64748B", dot: "#475569" },
};

const EVENT_ICON: Record<string, string> = {
  sms:         "💬",
  missed_call: "📵",
  call:        "📞",
};

function formatPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return p;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function LeadRecoveryPage() {
  const authFetch = useApiFetch();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [testing, setTesting] = useState<"sms" | "call" | null>(null);

  const { data, isLoading, error } = useQuery<LeadsResponse>({
    queryKey: ["leads"],
    queryFn: () => authFetch("/leads"),
    refetchInterval: 30000,
  });

  const patchMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Lead> }) =>
      authFetch(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const testMut = useMutation({
    mutationFn: (type: "sms" | "call") =>
      authFetch(
        type === "sms" ? "/telnyx/test-sms" : "/telnyx/test-missed-call",
        { method: "POST", body: JSON.stringify({}) }
      ),
    onSuccess: () => {
      setTesting(null);
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onSettled: () => setTesting(null),
  });

  const leads = data?.leads ?? [];
  const stats = data?.stats ?? { total: 0, active: 0, thisMonth: 0, withMessages: 0 };
  const selected = leads.find(l => l.id === selectedId);

  return (
    <AppShell>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)",
            borderRadius: 20, padding: "4px 14px", marginBottom: 14,
          }}>
            <span style={{ fontSize: 12, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              📞 Lead Recovery
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.5px", margin: "0 0 6px" }}>
                Lead Recovery AI
              </h1>
              <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>
                Missed calls and inbound SMS from Telnyx — auto-captured leads.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setTesting("sms"); testMut.mutate("sms"); }}
                disabled={testing !== null}
                style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.3)", color: "#00AEEF",
                  opacity: testing ? 0.6 : 1,
                }}
              >
                {testing === "sms" ? "Sending…" : "💬 Test SMS"}
              </button>
              <button
                onClick={() => { setTesting("call"); testMut.mutate("call"); }}
                disabled={testing !== null}
                style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#F87171",
                  opacity: testing ? 0.6 : 1,
                }}
              >
                {testing === "call" ? "Sending…" : "📵 Test Missed Call"}
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total Leads",    value: stats.total,        color: "#FFFFFF" },
            { label: "Active",         value: stats.active,       color: "#00AEEF" },
            { label: "This Month",     value: stats.thisMonth,    color: "#10B981" },
            { label: "With Messages",  value: stats.withMessages, color: "#F59E0B" },
          ].map(s => (
            <div key={s.label} style={{
              background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: "16px 18px",
            }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Lead list + detail panel */}
        <div style={{ display: "grid", gridTemplateColumns: selectedId ? "1fr 360px" : "1fr", gap: 16 }}>
          {/* Table */}
          <div style={{ background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
            {isLoading && (
              <div style={{ padding: 40, textAlign: "center", color: "#6B7280" }}>Loading leads…</div>
            )}
            {error && (
              <div style={{ padding: 40, textAlign: "center", color: "#F87171" }}>Failed to load leads.</div>
            )}
            {!isLoading && !error && leads.length === 0 && (
              <div style={{ padding: 60, textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF", marginBottom: 8 }}>No leads yet</div>
                <div style={{ fontSize: 13, color: "#6B7280", maxWidth: 340, margin: "0 auto" }}>
                  Leads appear here when Telnyx delivers an inbound SMS or missed call. Use the test buttons above to simulate.
                </div>
              </div>
            )}
            {leads.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["", "Phone", "Type", "Message", "Client", "Status", "Time"].map(h => (
                      <th key={h} style={{ padding: "11px 14px", fontSize: 11, fontWeight: 700, color: "#475569", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => {
                    const sm = STATUS_STYLE[lead.status] ?? STATUS_STYLE.new;
                    const isSelected = lead.id === selectedId;
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => {
                          if (isSelected) { setSelectedId(null); }
                          else { setSelectedId(lead.id); setEditNotes(lead.notes ?? ""); }
                        }}
                        style={{
                          borderBottom: i < leads.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                          background: isSelected ? "rgba(0,174,239,0.07)" : "transparent",
                          cursor: "pointer", transition: "background 0.15s",
                        }}
                      >
                        <td style={{ padding: "11px 14px", fontSize: 16 }}>{EVENT_ICON[lead.eventType] ?? "📋"}</td>
                        <td style={{ padding: "11px 14px", fontSize: 13, color: "#E5E7EB", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {formatPhone(lead.phone)}
                          {lead.customerName && <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 400 }}>{lead.customerName}</div>}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                            {lead.eventType.replace("_", " ")}
                          </span>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#9CA3AF", maxWidth: 220 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {lead.message ?? "—"}
                          </div>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>{lead.clientName || "—"}</td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: sm.bg, color: sm.color,
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: sm.dot, flexShrink: 0 }} />
                            {lead.status}
                          </span>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>{timeAgo(lead.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{
              background: "rgba(11,22,41,0.9)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>Lead Detail</span>
                <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 18 }}>×</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Detail label="Phone"    value={formatPhone(selected.phone)} />
                <Detail label="Type"     value={`${EVENT_ICON[selected.eventType] ?? ""} ${selected.eventType.replace("_", " ")}`} />
                <Detail label="Source"   value={selected.source} />
                <Detail label="Client"   value={selected.clientName || "—"} />
                <Detail label="Received" value={new Date(selected.createdAt).toLocaleString()} />
                {selected.message && (
                  <div>
                    <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", marginBottom: 5 }}>Message</div>
                    <div style={{ fontSize: 13, color: "#D1D5DB", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", lineHeight: 1.6 }}>
                      {selected.message}
                    </div>
                  </div>
                )}
              </div>

              {/* Status */}
              <div>
                <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>Status</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {STATUS_OPTIONS.map(s => {
                    const sm = STATUS_STYLE[s] ?? STATUS_STYLE.new;
                    const active = selected.status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => patchMut.mutate({ id: selected.id, patch: { status: s } })}
                        style={{
                          padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                          background: active ? sm.bg : "rgba(255,255,255,0.04)",
                          border: active ? `1px solid ${sm.color}44` : "1px solid rgba(255,255,255,0.08)",
                          color: active ? sm.color : "#6B7280",
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>Notes</div>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={4}
                  placeholder="Add notes about this lead…"
                  style={{
                    width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                    padding: "10px 12px", fontSize: 13, color: "#D1D5DB", resize: "vertical",
                    fontFamily: "inherit", outline: "none",
                  }}
                />
                <button
                  onClick={() => patchMut.mutate({ id: selected.id, patch: { notes: editNotes } })}
                  disabled={patchMut.isPending}
                  style={{
                    marginTop: 8, padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    background: "rgba(0,174,239,0.15)", border: "1px solid rgba(0,174,239,0.35)", color: "#00AEEF",
                    opacity: patchMut.isPending ? 0.6 : 1,
                  }}
                >
                  {patchMut.isPending ? "Saving…" : "Save Notes"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 12, color: "#475569", fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: "#D1D5DB", textAlign: "right" }}>{value}</span>
    </div>
  );
}
