import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { toast } from "sonner";
import { useTheme } from "@/contexts/theme-context";

// ── Types ─────────────────────────────────────────────────────────────────────
interface WebLead {
  id: string;
  customerName: string | null;
  phone: string;
  email: string | null;
  business: string | null;
  industry: string | null;
  services: string | null;
  packageLabel: string | null;
  packageKey: string | null;
  note: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WebLeadsResponse {
  leads: WebLead[];
  stats: { total: number; active: number; thisMonth: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatPhone(p: string) {
  if (!p) return "—";
  const d = p.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return p;
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: "New",       color: "#3B82F6", bg: "rgba(59,130,246,0.12)"  },
  contacted: { label: "Contacted", color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
  closed:    { label: "Closed",    color: "#22C55E", bg: "rgba(34,197,94,0.12)"   },
  lost:      { label: "Lost",      color: "#6B7280", bg: "rgba(107,114,128,0.1)"  },
};

const STATUS_OPTIONS = ["new", "contacted", "closed", "lost"] as const;

const PACKAGE_COLOR: Record<string, string> = {
  starter:   "#6B7280",
  growth:    "#3B82F6",
  pro:       "#8B5CF6",
  enterprise:"#F59E0B",
};

function pkgColor(key: string | null) {
  if (!key) return "#475569";
  const lower = key.toLowerCase();
  for (const [k, c] of Object.entries(PACKAGE_COLOR)) {
    if (lower.includes(k)) return c;
  }
  return "#00AEEF";
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KPICard({ icon, label, value, color }: { icon: string; label: string; value: number | string; color: string }) {
  const { colors: t } = useTheme();
  return (
    <div style={{
      background: t.card, border: `1px solid ${color}20`,
      borderTop: `2px solid ${color}55`, borderRadius: 14, padding: "18px 20px",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -14, right: -14, width: 60, height: 60,
        borderRadius: "50%", background: `${color}0C`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
      }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.text3, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.new;
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, color: cfg.color,
      background: cfg.bg, border: `1px solid ${cfg.color}30`,
      padding: "3px 9px", borderRadius: 12, whiteSpace: "nowrap",
    }}>{cfg.label}</span>
  );
}

function DetailRow({ label, value, href }: { label: string; value: string | null; href?: string }) {
  const { colors: t } = useTheme();
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: `1px solid ${t.border}` }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: t.text3, textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>{label}</span>
      {href ? (
        <a href={href} style={{ fontSize: 12, color: "#00AEEF", textAlign: "right", wordBreak: "break-all", textDecoration: "none" }}>{value}</a>
      ) : (
        <span style={{ fontSize: 12, color: t.text2, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WebLeadsPage() {
  const authFetch = useApiFetch();
  const qc = useQueryClient();
  const { colors: t } = useTheme();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data, isLoading, isError, refetch } = useQuery<WebLeadsResponse>({
    queryKey: ["web-leads"],
    queryFn: () => authFetch<WebLeadsResponse>("/leads/web"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const patchMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { status?: string; notes?: string } }) =>
      authFetch(`/leads/web/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["web-leads"] });
      setEditingNotes(false);
      toast.success("Lead updated");
    },
    onError: () => toast.error("Failed to update lead"),
  });

  const leads = data?.leads ?? [];
  const stats = data?.stats ?? { total: 0, active: 0, thisMonth: 0 };

  const visible = filterStatus === "all" ? leads : leads.filter(l => l.status === filterStatus);
  const selected = leads.find(l => l.id === selectedId) ?? null;

  useEffect(() => {
    if (selected) setNotesDraft(selected.notes ?? "");
  }, [selectedId]);

  const openDetail = useCallback((lead: WebLead) => {
    setSelectedId(lead.id);
    setNotesDraft(lead.notes ?? "");
    setEditingNotes(false);
  }, []);

  function handleStatusChange(id: string, status: string) {
    patchMut.mutate({ id, patch: { status } });
  }

  function saveNotes(id: string) {
    patchMut.mutate({ id, patch: { notes: notesDraft } });
  }

  return (
    <AppShell>
      <div style={{ maxWidth: 1100, margin: "0 auto", fontFamily: "'Inter', -apple-system, sans-serif" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)",
            borderRadius: 20, padding: "4px 14px", marginBottom: 14,
          }}>
            <span style={{ fontSize: 12, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              📋 Quote Requests
            </span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: t.text, letterSpacing: "-0.5px", margin: "0 0 6px" }}>
            Web Leads
          </h1>
          <p style={{ fontSize: 14, color: t.text2, margin: 0, maxWidth: 540 }}>
            Contact form submissions from the AI Edge Solutions website. Each entry captures the prospect's info, requested services, and selected package.
          </p>
        </div>

        {isError && (
          <div role="alert" style={{
            marginBottom: 18, padding: "14px 16px", borderRadius: 12,
            border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)",
            color: "#FCA5A5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>Web Leads could not be loaded.</div>
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>The displayed pipeline is unavailable; this is not a confirmed zero-lead state.</div>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.4)", background: "transparent", color: "#FCA5A5", fontWeight: 700, cursor: "pointer" }}
            >
              Retry
            </button>
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
          <KPICard icon="📬" label="Total Submissions"  value={isError ? "—" : stats.total}     color="#00AEEF" />
          <KPICard icon="🔥" label="Active (Open)"      value={isError ? "—" : stats.active}    color="#F59E0B" />
          <KPICard icon="📅" label="This Month"         value={isError ? "—" : stats.thisMonth} color="#22C55E" />
        </div>

        {/* ── Filters ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          {(["all", ...STATUS_OPTIONS] as string[]).map(s => {
            const cfg = STATUS_CFG[s];
            const isActive = filterStatus === s;
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: isActive ? `1px solid ${cfg?.color ?? "#00AEEF"}55` : "1px solid rgba(255,255,255,0.08)",
                  background: isActive ? (cfg ? cfg.bg : "rgba(0,174,239,0.12)") : "transparent",
                  color: isActive ? (cfg?.color ?? "#00AEEF") : t.text3,
                  transition: "all 0.15s",
                }}
              >
                {s === "all" ? "All Statuses" : (STATUS_CFG[s]?.label ?? s)}
                {s !== "all" && (
                  <span style={{ marginLeft: 5, opacity: 0.7 }}>
                    ({leads.filter(l => l.status === s).length})
                  </span>
                )}
              </button>
            );
          })}
          <div style={{ marginLeft: "auto", fontSize: 12, color: t.text3 }}>
            {visible.length} lead{visible.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* ── Main content: table + detail panel ── */}
        <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 360px" : "1fr", gap: 16, alignItems: "start" }}>

          {/* ── Table ── */}
          <div style={{
            background: "rgba(11,22,41,0.8)", border: "1px solid rgba(0,174,239,0.1)",
            borderRadius: 14, overflow: "hidden",
          }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: selected
                ? "1.4fr 1fr 1fr 100px 100px"
                : "1.4fr 1.1fr 1fr 1fr 100px 100px",
              padding: "10px 16px",
              background: "rgba(0,174,239,0.04)",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}>
              {(selected
                ? ["Name / Business", "Contact", "Package", "Status", "Time"]
                : ["Name / Business", "Contact", "Industry", "Services / Package", "Status", "Time"]
              ).map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px" }}>{h}</div>
              ))}
            </div>

            {isError ? (
              <div style={{ padding: 32, textAlign: "center", color: "#FCA5A5", fontSize: 13 }}>Lead data is unavailable. Retry the request above.</div>
            ) : isLoading ? (
              <div style={{ padding: 32, textAlign: "center", color: "#475569", fontSize: 13 }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                <div style={{ fontSize: 14, color: "#475569" }}>
                  {filterStatus === "all" ? "No web leads yet — submissions from the contact form will appear here." : "No leads with this status."}
                </div>
              </div>
            ) : visible.map((lead, i) => {
              const isActive = lead.id === selectedId;
              const color = pkgColor(lead.packageKey);
              return (
                <div
                  key={lead.id}
                  onClick={() => isActive ? setSelectedId(null) : openDetail(lead)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: selected
                      ? "1.4fr 1fr 1fr 100px 100px"
                      : "1.4fr 1.1fr 1fr 1fr 100px 100px",
                    padding: "12px 16px",
                    borderBottom: i < visible.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    cursor: "pointer",
                    background: isActive ? "rgba(0,174,239,0.08)" : "transparent",
                    borderLeft: isActive ? "3px solid #00AEEF" : "3px solid transparent",
                    transition: "background 0.12s",
                    alignItems: "center",
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {/* Name / Business */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lead.customerName ?? "Unknown"}
                    </div>
                    {lead.business && (
                      <div style={{ fontSize: 11, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.business}</div>
                    )}
                  </div>

                  {/* Contact */}
                  <div>
                    {lead.email && (
                      <div style={{ fontSize: 11, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.email}</div>
                    )}
                    <div style={{ fontSize: 11, color: "#64748B" }}>{formatPhone(lead.phone)}</div>
                  </div>

                  {/* Industry (hidden in narrow layout) */}
                  {!selected && (
                    <div style={{ fontSize: 12, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lead.industry ?? "—"}
                    </div>
                  )}

                  {/* Services / Package */}
                  <div>
                    {lead.packageLabel && (
                      <span style={{
                        display: "inline-block", fontSize: 10, fontWeight: 800,
                        color, background: `${color}15`, border: `1px solid ${color}30`,
                        padding: "2px 8px", borderRadius: 10, marginBottom: 3,
                        maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{lead.packageLabel}</span>
                    )}
                    {!selected && lead.services && (
                      <div style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.services}</div>
                    )}
                  </div>

                  {/* Status */}
                  <div><StatusBadge status={lead.status} /></div>

                  {/* Time */}
                  <div style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap" }}>{timeAgo(lead.createdAt)}</div>
                </div>
              );
            })}
          </div>

          {/* ── Detail panel ── */}
          {selected && (
            <div style={{
              background: "linear-gradient(180deg, rgba(11,22,41,0.98), rgba(3,6,18,0.95))",
              border: "1px solid rgba(0,174,239,0.15)", borderRadius: 16,
              position: "sticky", top: 20, maxHeight: "calc(100vh - 90px)", overflowY: "auto",
            }}>
              {/* Panel header */}
              <div style={{
                padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#FFFFFF" }}>
                    {selected.customerName ?? "Unknown Prospect"}
                  </div>
                  {selected.business && (
                    <div style={{ fontSize: 11, color: "#475569" }}>{selected.business}</div>
                  )}
                </div>
                <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 18 }}>✕</button>
              </div>

              <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 18 }}>

                {/* Contact Info */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Contact Info</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    <DetailRow label="Name"     value={selected.customerName} />
                    <DetailRow label="Email"    value={selected.email}    href={selected.email ? `mailto:${selected.email}` : undefined} />
                    <DetailRow label="Phone"    value={formatPhone(selected.phone)} href={selected.phone ? `tel:${selected.phone}` : undefined} />
                    <DetailRow label="Business" value={selected.business} />
                    <DetailRow label="Industry" value={selected.industry} />
                    <DetailRow label="Submitted" value={new Date(selected.createdAt).toLocaleString()} />
                  </div>
                </div>

                {/* Request Details */}
                {(selected.packageLabel || selected.services || selected.note) && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Request Details</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      <DetailRow label="Package"  value={selected.packageLabel} />
                      <DetailRow label="Services" value={selected.services} />
                    </div>
                    {selected.note && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Message</div>
                        <div style={{ fontSize: 13, color: "#D1D5DB", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", lineHeight: 1.6 }}>
                          {selected.note}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Status */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Update Status</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {STATUS_OPTIONS.map(s => {
                      const cfg = STATUS_CFG[s];
                      const isCurrent = selected.status === s;
                      return (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(selected.id, s)}
                          disabled={isCurrent || patchMut.isPending}
                          style={{
                            padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: isCurrent ? "default" : "pointer",
                            background: isCurrent ? cfg.bg : "rgba(255,255,255,0.04)",
                            border: `1px solid ${isCurrent ? cfg.color + "55" : "rgba(255,255,255,0.1)"}`,
                            color: isCurrent ? cfg.color : "#64748B",
                            opacity: patchMut.isPending ? 0.6 : 1,
                            transition: "all 0.15s",
                          }}
                        >{cfg.label}</button>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "1px" }}>Internal Notes</div>
                    {!editingNotes && (
                      <button
                        onClick={() => setEditingNotes(true)}
                        style={{ fontSize: 11, color: "#00AEEF", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        {selected.notes ? "Edit" : "+ Add"}
                      </button>
                    )}
                  </div>
                  {editingNotes ? (
                    <>
                      <textarea
                        value={notesDraft}
                        onChange={e => setNotesDraft(e.target.value)}
                        rows={4}
                        placeholder="Add internal notes about this lead…"
                        style={{
                          width: "100%", boxSizing: "border-box",
                          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,174,239,0.3)",
                          borderRadius: 8, padding: "10px 12px", color: "#E5E7EB",
                          fontSize: 12, lineHeight: 1.6, resize: "vertical", outline: "none",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          onClick={() => saveNotes(selected.id)}
                          disabled={patchMut.isPending}
                          style={{
                            padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                            background: "rgba(0,174,239,0.2)", border: "1px solid rgba(0,174,239,0.4)",
                            color: "#00AEEF", opacity: patchMut.isPending ? 0.6 : 1,
                          }}
                        >Save</button>
                        <button
                          onClick={() => { setEditingNotes(false); setNotesDraft(selected.notes ?? ""); }}
                          style={{
                            padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                            background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#64748B",
                          }}
                        >Cancel</button>
                      </div>
                    </>
                  ) : (
                    <div style={{
                      fontSize: 12, color: selected.notes ? "#94A3B8" : "#334155",
                      background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px",
                      lineHeight: 1.6, fontStyle: selected.notes ? "normal" : "italic",
                      minHeight: 40,
                    }}>
                      {selected.notes ?? "No notes yet."}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
