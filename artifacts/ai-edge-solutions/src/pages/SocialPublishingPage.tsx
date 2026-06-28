import { useRef, useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { useSearch, useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { toast } from "sonner";

type Platform = "facebook" | "instagram" | "google";

type SocialPost = {
  id: string;
  clientName: string;
  platforms: Platform[];
  imageUrl: string | null;
  caption: string;
  ctaType: string;
  ctaValue: string | null;
  scheduledAt: string | null;
  status: string;
  publishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

const CTA_OPTIONS = [
  { value: "none",       label: "None" },
  { value: "call_now",   label: "📞 Call Now" },
  { value: "learn_more", label: "🔗 Learn More" },
  { value: "book_now",   label: "📅 Book" },
  { value: "sign_up",    label: "✍️ Sign Up" },
  { value: "contact_us", label: "✉️ Contact Us" },
];

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  draft:     { bg: "rgba(148,163,184,0.12)", color: "#94A3B8" },
  scheduled: { bg: "rgba(0,174,239,0.12)",   color: "#00AEEF" },
  published: { bg: "rgba(16,185,129,0.12)",  color: "#10B981" },
  partial:   { bg: "rgba(245,158,11,0.12)",  color: "#F59E0B" },
  failed:    { bg: "rgba(239,68,68,0.12)",   color: "#EF4444" },
};

const PLATFORM_STYLE: Record<string, { bg: string; color: string; icon: string; label: string }> = {
  facebook:  { bg: "rgba(59,89,152,0.18)",  color: "#6B9EFF", icon: "f", label: "Facebook" },
  instagram: { bg: "rgba(225,48,108,0.15)", color: "#FF6B9D", icon: "✦", label: "Instagram" },
  google:    { bg: "rgba(234,67,53,0.1)",   color: "#EA4335", icon: "G", label: "Google Business" },
};

const COMING_SOON_PLATFORMS = [
  { key: "youtube", label: "YouTube Shorts", icon: "▶", color: "#FF0000", note: "Video/Shorts uploads only" },
  { key: "tiktok",  label: "TikTok",         icon: "♪", color: "#69C9D0", note: "Video + creator integration" },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const MAX_CAPTION = 2200;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

const EMPTY_FORM = {
  clientName:   "Bed Bugs & Beyond",
  platforms:    ["facebook"] as Platform[],
  imageUrl:     null as string | null,
  caption:      "",
  ctaType:      "call_now",
  ctaValue:     "(251) 324-9090",
  scheduleMode: "now" as "now" | "later",
  scheduledAt:  "",
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type MetaPublishStatus = {
  statusLabel: "not_connected" | "missing_permissions" | "ready_to_publish";
  userTokenExists: boolean;
  accountName: string | null;
  grantedScopes: string[];
  missingScopes: string[];
  hasPublishPermissions: boolean;
  pagesFound: number;
  pageTokenStored: boolean;
  pageName: string | null;
  instagramBusinessAccountId: string | null;
  permissionsError: string | null;
};

export default function SocialPublishingPage() {
  const authFetch  = useApiFetch();
  const { getToken } = useAuth();
  const qc         = useQueryClient();
  const fileRef    = useRef<HTMLInputElement>(null);
  const search     = useSearch();
  const [, navigate] = useLocation();

  const [showForm,      setShowForm]      = useState(false);
  const [editId,        setEditId]        = useState<string | null>(null);
  const [form,          setForm]          = useState({ ...EMPTY_FORM });
  const [uploadState,   setUploadState]   = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadError,   setUploadError]   = useState<string | null>(null);
  const [publishingId,      setPublishingId]      = useState<string | null>(null);
  const [publishResult,     setPublishResult]     = useState<{ ok: boolean; msg: string } | null>(null);
  const [publishStatusOpen, setPublishStatusOpen] = useState(false);

  const { data: posts = [], isLoading } = useQuery<SocialPost[]>({
    queryKey: ["social-posts"],
    queryFn: () => authFetch("/social-posts"),
    refetchInterval: 30000,
  });

  const saveMut = useMutation({
    mutationFn: (payload: any) =>
      editId
        ? authFetch(`/social-posts/${editId}`, { method: "PATCH", body: JSON.stringify(payload) })
        : authFetch("/social-posts", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["social-posts"] }); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => authFetch(`/social-posts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => authFetch(`/social-posts/${id}/publish`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      setPublishingId(null);
      const msg = data.ok
        ? "Published successfully!"
        : data.results
          ? Object.entries(data.results).map(([k, v]: any) => `${k}: ${v.ok ? "✓" : v.error}`).join(" | ")
          : "Some platforms failed.";
      setPublishResult({ ok: data.ok, msg });
      setTimeout(() => setPublishResult(null), 7000);
    },
    onError: () => setPublishingId(null),
  });

  // Meta publish-status (live permission + page token check)
  const { data: fbStatus } = useQuery<MetaPublishStatus>({
    queryKey: ["meta_publish_status"],
    queryFn: () => authFetch<MetaPublishStatus>("/social-connections/meta-publish-status"),
    staleTime: 60 * 1000,
    retry: 1,
  });

  // Handle ?connected=facebook&status=success redirect from OAuth upgrade flow
  useEffect(() => {
    const params = new URLSearchParams(search);
    const connected = params.get("connected");
    const status = params.get("status");
    if (connected && status === "success") {
      qc.invalidateQueries({ queryKey: ["meta_publish_status"] });
      toast.success(`${connected.charAt(0).toUpperCase() + connected.slice(1)} permissions upgraded — ready to publish!`);
      navigate("/admin/social-publishing", { replace: true });
    }
  }, [search]);

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setUploadState("idle");
    setUploadError(null);
  };

  const startEdit = (post: SocialPost) => {
    setEditId(post.id);
    setForm({
      clientName:   post.clientName,
      platforms:    post.platforms,
      imageUrl:     post.imageUrl,
      caption:      post.caption,
      ctaType:      post.ctaType,
      ctaValue:     post.ctaValue ?? "",
      scheduleMode: post.scheduledAt ? "later" : "now",
      scheduledAt:  post.scheduledAt ? post.scheduledAt.slice(0, 16) : "",
    });
    setUploadState(post.imageUrl ? "done" : "idle");
    setUploadError(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const uploadFile = useCallback(async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError("Only JPG, PNG, WEBP, or GIF files are allowed.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError("Image is too large. Maximum size is 10 MB.");
      return;
    }
    setUploadError(null);
    setUploadState("uploading");
    setForm(f => ({ ...f, imageUrl: null }));

    try {
      const token = await getToken().catch(() => null);
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`${BASE}/api/social-posts/upload-image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        credentials: "include",
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setForm(f => ({ ...f, imageUrl: data.imageUrl }));
      setUploadState("done");
    } catch (e: any) {
      setUploadError(e.message ?? "Upload failed. Try again.");
      setUploadState("error");
    }
  }, [getToken]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const togglePlatform = (p: Platform) =>
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p],
    }));

  const buildPayload = (status: "draft" | "scheduled" | "published") => ({
    clientName:  form.clientName,
    platforms:   form.platforms,
    imageUrl:    form.imageUrl,
    caption:     form.caption,
    ctaType:     form.ctaType,
    ctaValue:    form.ctaValue || null,
    scheduledAt: form.scheduleMode === "later" && form.scheduledAt ? form.scheduledAt : null,
    status,
  });

  const handlePublishNow = async () => {
    const saved = await saveMut.mutateAsync(buildPayload("draft")) as SocialPost;
    setPublishingId(saved.id);
    publishMut.mutate(saved.id);
    resetForm();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, padding: "9px 12px", fontSize: 13.5, color: "#E5E7EB",
    fontFamily: "inherit", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: "#475569", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 6,
  };
  const sectionStyle: React.CSSProperties = { marginBottom: 18 };

  const counts = { draft: 0, scheduled: 0, published: 0, failed: 0 };
  for (const p of posts) {
    if (p.status === "draft")                                  counts.draft++;
    else if (p.status === "scheduled")                         counts.scheduled++;
    else if (p.status === "published" || p.status === "partial") counts.published++;
    else if (p.status === "failed")                            counts.failed++;
  }

  const isUploading   = uploadState === "uploading";
  const canSave       = !saveMut.isPending && !isUploading;
  const canPublish    = canSave && !publishMut.isPending && form.platforms.length > 0 && !!form.caption.trim();

  return (
    <AppShell>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)", borderRadius: 20, padding: "4px 14px", marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>📸 Social Publishing</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.5px", margin: "0 0 6px" }}>Publishing Center</h1>
            <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>Create, schedule, and publish posts to Facebook and Instagram.</p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)} style={{ padding: "10px 20px", borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: "pointer", background: "linear-gradient(135deg,#00AEEF,#0080CC)", border: "none", color: "#fff" }}>
              + New Post
            </button>
          )}
        </div>

        {/* ── Publish toast ── */}
        {publishResult && (
          <div style={{ marginBottom: 20, padding: "12px 18px", borderRadius: 10, background: publishResult.ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${publishResult.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, color: publishResult.ok ? "#10B981" : "#EF4444", fontSize: 13, fontWeight: 600 }}>
            {publishResult.ok ? "✓" : "✗"} {publishResult.msg}
          </div>
        )}

        {/* ── Facebook Publishing Status Panel ── */}
        {(() => {
          const sl = fbStatus?.statusLabel;
          const panelColor = sl === "ready_to_publish" ? "#10B981" : sl === "missing_permissions" ? "#FB923C" : "#64748B";
          const panelBg = sl === "ready_to_publish" ? "rgba(16,185,129,0.06)" : sl === "missing_permissions" ? "rgba(251,146,60,0.06)" : "rgba(100,116,139,0.06)";
          const panelBorder = sl === "ready_to_publish" ? "rgba(16,185,129,0.2)" : sl === "missing_permissions" ? "rgba(251,146,60,0.2)" : "rgba(100,116,139,0.15)";
          const checks = [
            {
              label: "Facebook user token",
              ok: fbStatus?.userTokenExists ?? false,
              detail: fbStatus?.accountName ? `Connected as ${fbStatus.accountName}` : undefined,
            },
            {
              label: "Page access token stored",
              ok: fbStatus?.pageTokenStored ?? false,
              detail: fbStatus?.pageName ? `Page: ${fbStatus.pageName}` : fbStatus?.pagesFound ? `${fbStatus.pagesFound} page(s) found — upgrade to store token` : "Re-authenticate to grant page access",
            },
            {
              label: "Publish permissions granted",
              ok: fbStatus?.hasPublishPermissions ?? false,
              detail: fbStatus?.missingScopes && fbStatus.missingScopes.length > 0 ? `Missing: ${fbStatus.missingScopes.join(", ")}` : fbStatus?.grantedScopes && fbStatus.grantedScopes.length > 0 ? `Granted: ${fbStatus.grantedScopes.filter(s => ["pages_show_list","pages_manage_posts","pages_read_engagement"].includes(s)).join(", ")}` : undefined,
            },
            {
              label: "Instagram business account",
              ok: !!(fbStatus?.instagramBusinessAccountId),
              detail: fbStatus?.instagramBusinessAccountId ? `ID: ${fbStatus.instagramBusinessAccountId}` : "No IG business account linked to page",
            },
          ];

          return (
            <div style={{ marginBottom: 24, background: panelBg, border: `1px solid ${panelBorder}`, borderRadius: 12, overflow: "hidden" }}>
              <button
                onClick={() => setPublishStatusOpen(o => !o)}
                style={{ width: "100%", padding: "12px 18px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: panelColor }}>
                    {sl === "ready_to_publish" ? "✓ Facebook Ready to Publish" : sl === "missing_permissions" ? "⚠️ Facebook Needs Permission Upgrade" : "○ Facebook Not Connected"}
                  </span>
                  {sl === "missing_permissions" && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#030612", background: "#FB923C", borderRadius: 10, padding: "1px 8px" }}>
                      Action Required
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: "#475569" }}>{publishStatusOpen ? "▲ Hide" : "▼ Details"}</span>
              </button>

              {publishStatusOpen && (
                <div style={{ padding: "0 18px 16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8, marginBottom: sl === "missing_permissions" ? 14 : 0 }}>
                    {checks.map(c => (
                      <div key={c.label} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, background: c.ok ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.07)", border: `1px solid ${c.ok ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)"}` }}>
                        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{c.ok ? "✓" : "✗"}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: c.ok ? "#10B981" : "#EF4444" }}>{c.label}</div>
                          {c.detail && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>{c.detail}</div>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {sl === "missing_permissions" && (
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <p style={{ fontSize: 12.5, color: "#9CA3AF", margin: 0, lineHeight: 1.5 }}>
                        Your existing Facebook connection is missing publishing permissions. Click <strong style={{ color: "#FB923C" }}>Upgrade Permissions</strong> to grant them without reconnecting from scratch.
                      </p>
                      <a href="/admin/connections" style={{ flexShrink: 0, padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.5)", color: "#FB923C", textDecoration: "none" }}>
                        ⬆ Upgrade Permissions →
                      </a>
                    </div>
                  )}
                  {fbStatus?.permissionsError && (
                    <div style={{ marginTop: 8, fontSize: 11.5, color: "#EF4444" }}>
                      ⚠️ Could not fetch permissions from Facebook: {fbStatus.permissionsError}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Compose form ── */}
        {showForm && (
          <div style={{ background: "rgba(11,22,41,0.8)", border: "1px solid rgba(0,174,239,0.15)", borderRadius: 16, marginBottom: 32, overflow: "hidden" }}>

            <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>{editId ? "Edit Post" : "Create New Post"}</span>
              <button onClick={resetForm} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 20 }}>×</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 0 }}>

              {/* LEFT — caption + schedule */}
              <div style={{ padding: "24px", borderRight: "1px solid rgba(255,255,255,0.05)" }}>

                <div style={sectionStyle}>
                  <label style={labelStyle}>Client / Business</label>
                  <input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} style={inputStyle} placeholder="Business name" />
                </div>

                <div style={sectionStyle}>
                  <label style={labelStyle}>Platforms</label>

                  {/* Active platforms */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {(["facebook", "instagram", "google"] as Platform[]).map(p => {
                      const s = PLATFORM_STYLE[p];
                      const checked = form.platforms.includes(p);
                      return (
                        <button key={p} onClick={() => togglePlatform(p)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8, cursor: "pointer", background: checked ? s.bg : "rgba(255,255,255,0.04)", border: `1px solid ${checked ? s.color + "55" : "rgba(255,255,255,0.1)"}`, color: checked ? s.color : "#6B7280", fontWeight: 700, fontSize: 12.5 }}>
                          <span style={{ fontFamily: "monospace", fontWeight: 900 }}>{s.icon}</span>
                          {s.label}
                        </button>
                      );
                    })}

                    {/* Coming soon platforms */}
                    {COMING_SOON_PLATFORMS.map(p => (
                      <div key={p.key} title={p.note} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 8, cursor: "not-allowed", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)", fontWeight: 700, fontSize: 12.5, userSelect: "none" }}>
                        <span style={{ fontFamily: "monospace", fontWeight: 900, color: p.color, opacity: 0.35 }}>{p.icon}</span>
                        <span style={{ color: "#374151" }}>{p.label}</span>
                        <span style={{ fontSize: 9, fontWeight: 800, color: "#4B5563", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "1px 6px", letterSpacing: "0.4px", textTransform: "uppercase", marginLeft: 2 }}>Soon</span>
                      </div>
                    ))}
                  </div>

                  {/* Helper text */}
                  <p style={{ margin: 0, fontSize: 11.5, color: "#4B5563", lineHeight: 1.6 }}>
                    Facebook, Instagram, and Google Business Profile are active. YouTube Shorts and TikTok are coming next.
                    {form.platforms.includes("google") && (
                      <span style={{ display: "block", marginTop: 4, color: "#EA4335", opacity: 0.8 }}>
                        Google Business: posts go to your first verified location. Connect your account in <strong>Connected Accounts</strong> if not done yet.
                      </span>
                    )}
                  </p>
                </div>

                <div style={sectionStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Caption / Description</label>
                    <span style={{ fontSize: 11, color: form.caption.length > MAX_CAPTION ? "#EF4444" : "#475569" }}>{form.caption.length} / {MAX_CAPTION}</span>
                  </div>
                  <textarea value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value.slice(0, MAX_CAPTION) }))} rows={7} placeholder="Write your post caption here…" style={{ ...inputStyle, resize: "vertical" }} />
                </div>

                <div style={{ ...sectionStyle, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>CTA Button</label>
                    <select value={form.ctaType} onChange={e => setForm(f => ({ ...f, ctaType: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                      {CTA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>{form.ctaType === "call_now" ? "Phone Number" : "URL / Value"}</label>
                    <input value={form.ctaValue ?? ""} onChange={e => setForm(f => ({ ...f, ctaValue: e.target.value }))} style={inputStyle} placeholder={form.ctaType === "call_now" ? "(251) 324-9090" : "https://…"} />
                  </div>
                </div>

                <div style={sectionStyle}>
                  <label style={labelStyle}>Timing</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    {(["now", "later"] as const).map(m => (
                      <button key={m} onClick={() => setForm(f => ({ ...f, scheduleMode: m }))} style={{ padding: "7px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, background: form.scheduleMode === m ? "rgba(0,174,239,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${form.scheduleMode === m ? "rgba(0,174,239,0.4)" : "rgba(255,255,255,0.1)"}`, color: form.scheduleMode === m ? "#00AEEF" : "#6B7280" }}>
                        {m === "now" ? "📤 Post Now" : "🗓 Schedule for Later"}
                      </button>
                    ))}
                  </div>
                  {form.scheduleMode === "later" && (
                    <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} style={{ ...inputStyle, colorScheme: "dark" }} />
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <button onClick={() => saveMut.mutate(buildPayload("draft"))} disabled={!canSave} style={{ padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#94A3B8", opacity: !canSave ? 0.6 : 1 }}>
                    {saveMut.isPending ? "Saving…" : "💾 Save Draft"}
                  </button>
                  {form.scheduleMode === "later" && (
                    <button onClick={() => saveMut.mutate(buildPayload("scheduled"))} disabled={!canSave || !form.scheduledAt || form.platforms.length === 0} style={{ padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.35)", color: "#00AEEF", opacity: (!canSave || !form.scheduledAt || form.platforms.length === 0) ? 0.5 : 1 }}>
                      🗓 Schedule Post
                    </button>
                  )}
                  {form.scheduleMode === "now" && (
                    <button onClick={handlePublishNow} disabled={!canPublish} style={{ padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", background: "linear-gradient(135deg,#00AEEF,#0080CC)", border: "none", color: "#fff", opacity: !canPublish ? 0.5 : 1 }}>
                      {publishMut.isPending ? "Publishing…" : "🚀 Publish Now"}
                    </button>
                  )}
                </div>
              </div>

              {/* RIGHT — image upload */}
              <div style={{ padding: "24px" }}>
                <label style={labelStyle}>Photo / Image</label>

                {/* Upload error */}
                {uploadError && (
                  <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#F87171", fontSize: 12 }}>
                    ⚠ {uploadError}
                  </div>
                )}

                {/* Uploading spinner */}
                {isUploading && (
                  <div style={{ border: "2px dashed rgba(0,174,239,0.3)", borderRadius: 12, padding: "40px 20px", textAlign: "center", background: "rgba(0,174,239,0.04)" }}>
                    <div style={{ fontSize: 12, color: "#00AEEF", fontWeight: 600 }}>⏳ Uploading image…</div>
                  </div>
                )}

                {/* Preview */}
                {!isUploading && form.imageUrl && (
                  <div style={{ position: "relative" }}>
                    <img src={form.imageUrl} alt="Preview" style={{ width: "100%", borderRadius: 10, objectFit: "cover", maxHeight: 280, display: "block" }} />
                    <button onClick={() => { setForm(f => ({ ...f, imageUrl: null })); setUploadState("idle"); setUploadError(null); }} style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    <button onClick={() => fileRef.current?.click()} style={{ marginTop: 10, width: "100%", padding: "8px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8", fontSize: 12, cursor: "pointer" }}>Replace image</button>
                  </div>
                )}

                {/* Drop zone */}
                {!isUploading && !form.imageUrl && (
                  <div
                    onDrop={handleDrop}
                    onDragOver={e => e.preventDefault()}
                    onClick={() => fileRef.current?.click()}
                    style={{ border: "2px dashed rgba(0,174,239,0.25)", borderRadius: 12, padding: "40px 20px", textAlign: "center", cursor: "pointer", background: "rgba(0,174,239,0.03)" }}
                  >
                    <div style={{ fontSize: 36, marginBottom: 10 }}>🖼</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#94A3B8", marginBottom: 6 }}>Drop image here or click to browse</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>JPG, PNG, WEBP, GIF · Max 10 MB</div>
                  </div>
                )}

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                  style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
                />

                {/* Post preview card */}
                {(form.caption || form.imageUrl) && !isUploading && (
                  <div style={{ marginTop: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>Post Preview</div>
                    {form.imageUrl && <img src={form.imageUrl} alt="" style={{ width: "100%", maxHeight: 160, objectFit: "cover", display: "block" }} />}
                    {form.caption && <div style={{ padding: "10px 12px", fontSize: 12.5, color: "#D1D5DB", lineHeight: 1.6, maxHeight: 80, overflow: "hidden" }}>{form.caption}</div>}
                    {form.ctaType !== "none" && (
                      <div style={{ padding: "6px 12px 10px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#00AEEF", background: "rgba(0,174,239,0.1)", padding: "3px 10px", borderRadius: 20 }}>
                          {CTA_OPTIONS.find(o => o.value === form.ctaType)?.label}
                          {form.ctaValue ? `: ${form.ctaValue}` : ""}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Stats bar ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
          {[
            { label: "Drafts",    value: counts.draft,     color: "#94A3B8" },
            { label: "Scheduled", value: counts.scheduled, color: "#00AEEF" },
            { label: "Published", value: counts.published, color: "#10B981" },
            { label: "Failed",    value: counts.failed,    color: "#EF4444" },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color, marginBottom: 2 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Post list ── */}
        <div style={{ background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>All Posts</span>
            <span style={{ fontSize: 12, color: "#475569" }}>{posts.length} total</span>
          </div>

          {isLoading && <div style={{ padding: 48, textAlign: "center", color: "#6B7280" }}>Loading posts…</div>}

          {!isLoading && posts.length === 0 && (
            <div style={{ padding: 64, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>📭</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF", marginBottom: 8 }}>No posts yet</div>
              <div style={{ fontSize: 13, color: "#6B7280", maxWidth: 360, margin: "0 auto" }}>
                Create your first post using the button above. Connect Facebook or Instagram in Connected Accounts first.
              </div>
            </div>
          )}

          {posts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {posts.map((post, i) => {
                const ss = STATUS_STYLE[post.status] ?? STATUS_STYLE.draft;
                const isPublishing = publishingId === post.id;
                return (
                  <div key={post.id} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 16, padding: "14px 20px", borderBottom: i < posts.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "start" }}>

                    <div style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,0.05)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {post.imageUrl
                        ? <img src={post.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ fontSize: 22 }}>🖼</span>
                      }
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                        {post.platforms.map(p => {
                          const ps = PLATFORM_STYLE[p];
                          return <span key={p} style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: ps.bg, color: ps.color, textTransform: "uppercase", letterSpacing: "0.4px" }}>{p}</span>;
                        })}
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: ss.bg, color: ss.color, textTransform: "capitalize" }}>{post.status}</span>
                        {post.ctaType !== "none" && (
                          <span style={{ fontSize: 10, color: "#F59E0B", background: "rgba(245,158,11,0.1)", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                            {CTA_OPTIONS.find(o => o.value === post.ctaType)?.label ?? post.ctaType}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 13, color: "#D1D5DB", lineHeight: 1.5, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {post.caption || <span style={{ color: "#475569", fontStyle: "italic" }}>No caption</span>}
                      </div>

                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "#475569" }}>{post.clientName}</span>
                        {post.scheduledAt && <span style={{ fontSize: 11, color: "#6B7280" }}>🗓 {fmtDate(post.scheduledAt)}</span>}
                        {post.publishedAt && <span style={{ fontSize: 11, color: "#10B981" }}>✓ Published {fmtDate(post.publishedAt)}</span>}
                        {!post.scheduledAt && !post.publishedAt && <span style={{ fontSize: 11, color: "#475569" }}>Created {timeAgo(post.createdAt)}</span>}
                      </div>

                      {post.errorMessage && (
                        <div style={{ marginTop: 6, fontSize: 11, color: "#F87171", background: "rgba(239,68,68,0.08)", borderRadius: 6, padding: "4px 8px" }}>
                          ⚠ {post.errorMessage}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "flex-start" }}>
                      {(post.status === "draft" || post.status === "failed" || post.status === "scheduled") && (
                        <button
                          onClick={() => { setPublishingId(post.id); publishMut.mutate(post.id); }}
                          disabled={isPublishing || publishMut.isPending}
                          style={{ padding: "6px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "linear-gradient(135deg,#00AEEF,#0080CC)", border: "none", color: "#fff", opacity: (isPublishing || publishMut.isPending) ? 0.6 : 1, whiteSpace: "nowrap" }}
                        >
                          {isPublishing ? "…" : "🚀 Publish"}
                        </button>
                      )}
                      <button onClick={() => startEdit(post)} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8" }}>✏</button>
                      <button onClick={() => { if (confirm("Delete this post?")) deleteMut.mutate(post.id); }} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444" }}>🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", fontSize: 12, color: "#D97706", lineHeight: 1.6 }}>
          <strong>Instagram tip:</strong> Select both Facebook + Instagram together. The image uploads to Facebook first, and that hosted URL is automatically reused for Instagram.
        </div>
      </div>
    </AppShell>
  );
}
