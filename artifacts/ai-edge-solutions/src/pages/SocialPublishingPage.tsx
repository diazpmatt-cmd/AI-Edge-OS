import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { useTheme } from "@/contexts/theme-context";
import { toast } from "sonner";
import { SOCIAL_PROVIDERS, getSocialProvider, type SocialProviderId } from "@/lib/social-providers";
import { PlatformStateChip, resolvePlatformUIState } from "@/components/PlatformStateChip";
import { MediaUploader, type MediaAttachment } from "@/components/MediaUploader";
import { resolvePreviewUrl } from "@/lib/media-config";
import { PLATFORM_MEDIA_COMPAT } from "@/lib/media-compat";

type Platform = "facebook" | "instagram" | "google" | "youtube" | "tiktok";

type SocialPost = {
  id: string;
  clientName: string;
  platforms: Platform[];
  imageUrl: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  youtubeTitle:   string | null;
  youtubePrivacy: string | null;
  youtubeVideoId: string | null;
  caption: string;
  captionFacebook: string | null;
  captionGoogle: string | null;
  ctaType: string;
  ctaValue: string | null;
  scheduledAt: string | null;
  status: string;
  publishedAt: string | null;
  errorMessage: string | null;
  aiCity: string | null;
  aiTopic: string | null;
  aiAngle: string | null;
  contentScore: number | null;
  matchedImageId: string | null;
  matchedImageUrl: string | null;
  matchedImageScore: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagementScore: number | null;
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
  draft:     { bg: "rgba(196,181,253,0.12)",  color: "#C4B5FD" },
  scheduled: { bg: "rgba(245,158,11,0.12)",  color: "#F59E0B" },
  published: { bg: "rgba(34,197,94,0.12)",   color: "#22C55E" },
  partial:   { bg: "rgba(245,158,11,0.12)",  color: "#F59E0B" },
  failed:    { bg: "rgba(239,68,68,0.12)",   color: "#EF4444" },
};

// "google" is a page-local alias for the canonical "google_business" provider ID.
// bg and color are display-optimized dark-background variants; icon and label from registry.
const PLATFORM_STYLE: Record<string, { bg: string; color: string; icon: string; label: string }> = {
  facebook:  { bg: "rgba(59,130,246,0.18)",  color: "#3B82F6", icon: getSocialProvider("facebook").icon,        label: getSocialProvider("facebook").shortLabel },
  instagram: { bg: "rgba(168,85,247,0.18)",  color: "#A855F7", icon: getSocialProvider("instagram").icon,       label: getSocialProvider("instagram").shortLabel },
  google:    { bg: "rgba(234,67,53,0.18)",   color: "#EA4335", icon: getSocialProvider("google_business").icon, label: "Google Business" },
  youtube:   { bg: "rgba(255,0,0,0.15)",     color: "#FF0000", icon: getSocialProvider("youtube").icon,         label: getSocialProvider("youtube").shortLabel },
  tiktok:    { bg: "rgba(37,244,238,0.12)",  color: "#25F4EE", icon: getSocialProvider("tiktok").icon,          label: getSocialProvider("tiktok").shortLabel },
};

function parsePlatformResults(post: SocialPost): Record<string, { ok: boolean | null; error?: string }> {
  const { status, errorMessage, platforms } = post;
  if (status === "published") return Object.fromEntries(platforms.map(p => [p, { ok: true }]));
  if (status === "draft" || status === "scheduled") return Object.fromEntries(platforms.map(p => [p, { ok: null }]));
  const errs: Record<string, string> = {};
  if (errorMessage) {
    for (const seg of errorMessage.split(/[;|]/)) {
      const ci = seg.indexOf(":");
      if (ci > 0) {
        const k = seg.slice(0, ci).trim().toLowerCase();
        const v = seg.slice(ci + 1).trim();
        if (k) errs[k] = v;
      }
    }
  }
  return Object.fromEntries(platforms.map(p => [
    p,
    errs[p] ? { ok: false, error: errs[p] } : { ok: status === "partial" },
  ]));
}

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

const EMPTY_FORM = {
  clientName:   "Bed Bugs & Beyond",
  platforms:    ["facebook"] as Platform[],
  imageUrl:     null as string | null,
  videoUrl:     "" as string,
  audioUrl:     null as string | null,
  youtubeTitle:   "" as string,
  youtubePrivacy: "private" as string,
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
  const qc         = useQueryClient();
  const search     = useSearch();
  const [, navigate] = useLocation();
  const { colors: t } = useTheme();

  const [showForm,      setShowForm]      = useState(false);
  const [editId,        setEditId]        = useState<string | null>(null);
  const [form,          setForm]          = useState({ ...EMPTY_FORM });
  const [publishingId,      setPublishingId]      = useState<string | null>(null);
  const [publishResult,     setPublishResult]     = useState<{ ok: boolean; msg: string } | null>(null);
  const [publishStatusOpen, setPublishStatusOpen] = useState(false);
  const [perfModalId,  setPerfModalId]  = useState<string | null>(null);
  const [perfForm,     setPerfForm]     = useState({ impressions: "", reach: "", clicks: "", likes: "", comments: "", shares: "" });

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

  const imageMatchMut = useMutation({
    mutationFn: (id: string) => authFetch(`/social-posts/${id}/image-match`, { method: "POST", body: "{}" }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      if (data.matched) toast.success(`Image matched! Score: ${data.score}/100`);
      else toast.info("No matching image found — upload tagged images first.");
    },
  });

  const perfMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, number> }) =>
      authFetch(`/social-posts/${id}/performance`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      setPerfModalId(null);
      toast.success("Performance data saved!");
    },
  });

  // Meta publish-status (live permission + page token check)
  const { data: fbStatus } = useQuery<MetaPublishStatus>({
    queryKey: ["meta_publish_status"],
    queryFn: () => authFetch<MetaPublishStatus>("/social-connections/meta-publish-status"),
    staleTime: 60 * 1000,
    retry: 1,
  });

  // Social connections — shared cache key with ConnectionsPage
  const { data: connections = [] } = useQuery<Array<{ id: string; provider: string; accountName: string | null }>>({
    queryKey: ["social_connections"],
    queryFn: () => authFetch<Array<{ id: string; provider: string; accountName: string | null }>>("/social-connections"),
    staleTime: 60 * 1000,
    retry: 1,
  });
  const connectedProviders = new Set(connections.map(c => c.provider));

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
  };

  const startEdit = (post: SocialPost) => {
    setEditId(post.id);
    setForm({
      clientName:   post.clientName,
      platforms:    post.platforms,
      imageUrl:     post.imageUrl,
      videoUrl:     post.videoUrl ?? "",
      audioUrl:     post.audioUrl ?? null,
      youtubeTitle:   post.youtubeTitle   ?? "",
      youtubePrivacy: post.youtubePrivacy ?? "private",
      caption:      post.caption,
      ctaType:      post.ctaType,
      ctaValue:     post.ctaValue ?? "",
      scheduleMode: post.scheduledAt ? "later" : "now",
      scheduledAt:  post.scheduledAt ? post.scheduledAt.slice(0, 16) : "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Derive current media attachment from form fields (for MediaUploader)
  const currentMedia = useMemo((): MediaAttachment | null => {
    if (form.imageUrl) return { objectPath: form.imageUrl, kind: "image", mimeType: "image/jpeg", filename: "", byteSize: 0 };
    if (form.videoUrl) return { objectPath: form.videoUrl, kind: "video", mimeType: "video/mp4", filename: "", byteSize: 0 };
    if (form.audioUrl) return { objectPath: form.audioUrl, kind: "audio", mimeType: "audio/mpeg", filename: "", byteSize: 0 };
    return null;
  }, [form.imageUrl, form.videoUrl, form.audioUrl]);

  const handleMediaChange = useCallback((att: MediaAttachment | null) => {
    if (!att) {
      setForm(f => ({ ...f, imageUrl: null, videoUrl: "", audioUrl: null }));
      return;
    }
    setForm(f => ({
      ...f,
      imageUrl: att.kind === "image" ? att.objectPath : null,
      videoUrl: att.kind === "video" ? att.objectPath : "",
      audioUrl: att.kind === "audio" ? att.objectPath : null,
    }));
  }, []);

  const togglePlatform = (p: Platform) =>
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p],
    }));

  const buildPayload = (status: "draft" | "scheduled" | "published") => ({
    clientName:  form.clientName,
    platforms:   form.platforms,
    imageUrl:    form.imageUrl,
    videoUrl:       form.videoUrl.trim() || null,
    audioUrl:       form.audioUrl || null,
    youtubeTitle:   form.platforms.includes("youtube") ? form.youtubeTitle.trim() || null : null,
    youtubePrivacy: form.platforms.includes("youtube") ? form.youtubePrivacy || "private" : null,
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

  const canSave    = !saveMut.isPending;
  const canPublish = canSave && !publishMut.isPending && form.platforms.length > 0 && !!form.caption.trim();

  return (
    <AppShell>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)", borderRadius: 20, padding: "4px 14px", marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>📸 Social Publishing</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: t.text, letterSpacing: "-0.5px", margin: "0 0 6px" }}>Publishing Center</h1>
            <p style={{ fontSize: 14, color: t.text2, margin: 0 }}>Create, schedule, and publish posts to Facebook and Instagram.</p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)} style={{ padding: "10px 20px", borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: "pointer", background: "linear-gradient(135deg,#00AEEF,#0080CC)", border: "none", color: "#fff" }}>
              + New Post
            </button>
          )}
        </div>

        {/* ── Publishing Status Banner ── */}
        {!isLoading && posts.length > 0 && (() => {
          const hasFailed = counts.failed > 0;
          const hasScheduled = counts.scheduled > 0;
          const allGood = !hasFailed && counts.published > 0;
          const bannerBg     = hasFailed ? "rgba(239,68,68,0.07)"   : hasScheduled ? "rgba(245,158,11,0.07)"   : "rgba(34,197,94,0.07)";
          const bannerBorder = hasFailed ? "rgba(239,68,68,0.2)"    : hasScheduled ? "rgba(245,158,11,0.2)"    : "rgba(34,197,94,0.2)";
          return (
            <div style={{ marginBottom: 20, padding: "12px 18px", borderRadius: 10, background: bannerBg, border: `1px solid ${bannerBorder}`, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>Publishing Status</span>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", flex: 1 }}>
                {counts.published > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: "#22C55E" }}>🟢 {counts.published} Published</span>}
                {counts.scheduled > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: "#F59E0B" }}>🟡 {counts.scheduled} Scheduled</span>}
                {counts.draft > 0     && <span style={{ fontSize: 13, fontWeight: 700, color: "#64748B" }}>⚪ {counts.draft} Draft{counts.draft !== 1 ? "s" : ""}</span>}
                {counts.failed > 0    && <span style={{ fontSize: 13, fontWeight: 700, color: "#EF4444" }}>🔴 {counts.failed} Failed — see Activity Log below</span>}
              </div>
              {allGood && <span style={{ fontSize: 11, color: "#22C55E", fontWeight: 600 }}>✓ API-confirmed</span>}
            </div>
          );
        })()}

        {/* ── Publish toast ── */}
        {publishResult && (
          <div style={{ marginBottom: 20, padding: "12px 18px", borderRadius: 10, background: publishResult.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${publishResult.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, color: publishResult.ok ? "#22C55E" : "#EF4444", fontSize: 13, fontWeight: 600 }}>
            {publishResult.ok ? "✓" : "✗"} {publishResult.msg}
          </div>
        )}

        {/* ── Facebook Publishing Status Panel ── */}
        {(() => {
          const sl = fbStatus?.statusLabel;
          const panelColor = sl === "ready_to_publish" ? "#22C55E" : sl === "missing_permissions" ? "#F59E0B" : "#64748B";
          const panelBg = sl === "ready_to_publish" ? "rgba(34,197,94,0.06)" : sl === "missing_permissions" ? "rgba(245,158,11,0.06)" : "rgba(100,116,139,0.06)";
          const panelBorder = sl === "ready_to_publish" ? "rgba(34,197,94,0.2)" : sl === "missing_permissions" ? "rgba(245,158,11,0.2)" : "rgba(100,116,139,0.15)";
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
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#030612", background: "#F59E0B", borderRadius: 10, padding: "1px 8px" }}>
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
                      <div key={c.label} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, background: c.ok ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)", border: `1px solid ${c.ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}` }}>
                        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{c.ok ? "✓" : "✗"}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: c.ok ? "#22C55E" : "#EF4444" }}>{c.label}</div>
                          {c.detail && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>{c.detail}</div>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {sl === "missing_permissions" && (
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <p style={{ fontSize: 12.5, color: "#9CA3AF", margin: 0, lineHeight: 1.5 }}>
                        Your existing Facebook connection is missing publishing permissions. Click <strong style={{ color: "#F59E0B" }}>Upgrade Permissions</strong> to grant them without reconnecting from scratch.
                      </p>
                      <a href="/admin/connections" style={{ flexShrink: 0, padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.5)", color: "#F59E0B", textDecoration: "none" }}>
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

                  {/* Platform selector — all 6 providers from canonical registry */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>

                    {/* ── Selectable: operational + demo-mode providers ── */}
                    {(["facebook", "instagram", "google", "youtube", "tiktok"] as Platform[]).map(p => {
                      const s = PLATFORM_STYLE[p];
                      const checked = form.platforms.includes(p);
                      const registryId: SocialProviderId = p === "google" ? "google_business" : p as SocialProviderId;
                      const provider = getSocialProvider(registryId);
                      const isConnected = connectedProviders.has(registryId);
                      const uiState = resolvePlatformUIState(provider, isConnected);
                      const isDemoMode = provider.status === "pending_approval";
                      return (
                        <div key={p} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                          <button
                            onClick={() => togglePlatform(p)}
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8, cursor: "pointer", background: checked ? s.bg : "rgba(255,255,255,0.04)", border: `1px solid ${checked ? s.color + "55" : isDemoMode ? "rgba(245,158,11,0.25)" : "rgba(255,255,255,0.1)"}`, color: checked ? s.color : isDemoMode ? "#F59E0B" : "#6B7280", fontWeight: 700, fontSize: 12.5 }}
                          >
                            <span style={{ fontFamily: "monospace", fontWeight: 900 }}>{s.icon}</span>
                            {s.label}
                            {isDemoMode && <span style={{ fontSize: 9, fontWeight: 800, color: "#F59E0B", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: "1px 5px", marginLeft: 2 }}>DEMO</span>}
                          </button>
                          <PlatformStateChip state={uiState} showConnectLink={uiState === "disconnected"} />
                        </div>
                      );
                    })}

                    {/* ── Non-selectable: coming soon (no publish backend) ── */}
                    {SOCIAL_PROVIDERS
                      .filter(p => !["facebook", "instagram", "google_business", "youtube", "tiktok"].includes(p.id))
                      .map(provider => {
                        const uiState = resolvePlatformUIState(provider, connectedProviders.has(provider.id));
                        return (
                          <div key={provider.id} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                            <div
                              title={provider.status === "pending_approval"
                                ? "Pending platform approval — publishing not yet available"
                                : "Publishing support coming soon"}
                              style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 8, cursor: "not-allowed", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)", fontWeight: 700, fontSize: 12.5, userSelect: "none" }}
                            >
                              <span style={{ fontFamily: "monospace", fontWeight: 900, color: provider.color, opacity: 0.35 }}>{provider.icon}</span>
                              <span style={{ color: "#374151" }}>{provider.shortLabel}</span>
                            </div>
                            <PlatformStateChip state={uiState} />
                          </div>
                        );
                    })}
                  </div>

                  {/* TikTok Review Demo Mode notice */}
                  {form.platforms.includes("tiktok") && (
                    <div style={{ margin: "8px 0 4px", padding: "10px 14px", borderRadius: 8, background: "rgba(37,244,238,0.06)", border: "1px solid rgba(37,244,238,0.25)", display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#25F4EE", letterSpacing: "0.5px", textTransform: "uppercase" }}>🔬 TikTok Review Demo Mode</div>
                      <div style={{ fontSize: 11.5, color: "#94A3B8", lineHeight: 1.6 }}>
                        TikTok is connected via OAuth with <code style={{ color: "#25F4EE" }}>video.publish</code> scope requested. Posts are queued in the system.
                        Live publishing activates once TikTok grants production approval for the <strong style={{ color: "#E2E8F0" }}>video.publish</strong> scope in the TikTok Developer Portal.
                      </div>
                      <div style={{ fontSize: 10.5, color: "#64748B" }}>Simulated Provider Response — this is not a live publish to TikTok.</div>
                    </div>
                  )}

                  {/* Helper text */}
                  <p style={{ margin: 0, fontSize: 11.5, color: "#4B5563", lineHeight: 1.6 }}>
                    Facebook, Instagram, Google Business Profile, and YouTube are active. TikTok is available in demo mode — posts are queued pending TikTok app approval.
                    {form.platforms.includes("google") && (
                      <span style={{ display: "block", marginTop: 4, color: "#EA4335", opacity: 0.8 }}>
                        Google Business: posts go to your first verified location. Connect your account in <strong>Connected Accounts</strong> if not done yet.
                      </span>
                    )}
                    {form.platforms.includes("youtube") && (
                      <span style={{ display: "block", marginTop: 4, color: "#FF5555", opacity: 0.85 }}>
                        YouTube: requires video content — image-only posts will be skipped for YouTube. Connect your channel in <strong>Connected Accounts</strong> and run Test Upload to verify permissions.
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

              {/* RIGHT — media upload */}
              <div style={{ padding: "24px" }}>
                <label style={labelStyle}>Media</label>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}>
                  Image (JPG/PNG/WEBP/GIF · 10 MB) · Video MP4 (100 MB) · Audio MP3 (50 MB)
                </div>

                <MediaUploader
                  value={currentMedia}
                  onChange={handleMediaChange}
                />

                {/* Platform / media compatibility warnings */}
                {currentMedia && form.platforms.length > 0 && (() => {
                  const blockers: string[] = [];
                  const warnings: string[] = [];
                  for (const platform of form.platforms) {
                    const pId = platform === "google" ? "google_business" : platform;
                    const compat = PLATFORM_MEDIA_COMPAT[pId as keyof typeof PLATFORM_MEDIA_COMPAT];
                    if (!compat) continue;
                    const pLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
                    if (currentMedia.kind === "video" && (platform === "youtube" || platform === "tiktok")) {
                      // good — both YouTube and TikTok accept video
                    } else if (currentMedia.kind === "audio") {
                      warnings.push(`${pLabel}: MP3 stored as source asset — not published directly.`);
                    } else if (currentMedia.kind === "video" && platform !== "youtube" && platform !== "tiktok") {
                      warnings.push(`${pLabel}: video publishing not yet implemented.`);
                    }
                  }
                  if (form.platforms.includes("youtube") && currentMedia.kind !== "video") {
                    blockers.push("YouTube requires an MP4 video to publish.");
                  }
                  if (form.platforms.includes("tiktok") && currentMedia.kind !== "video") {
                    warnings.push("TikTok: requires an MP4 video for live publishing (demo mode — post queued without video).");
                  }
                  if (form.platforms.includes("instagram") && currentMedia.kind !== "image") {
                    blockers.push("Instagram requires an image (JPG/PNG/WEBP/GIF).");
                  }
                  if (!blockers.length && !warnings.length) return null;
                  return (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                      {blockers.map((b, i) => (
                        <div key={i} style={{ padding: "6px 10px", borderRadius: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 11, color: "#EF4444" }}>⚠ {b}</div>
                      ))}
                      {warnings.map((w, i) => (
                        <div key={i} style={{ padding: "6px 10px", borderRadius: 6, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)", fontSize: 11, color: "#F59E0B" }}>ℹ {w}</div>
                      ))}
                    </div>
                  );
                })()}

                {/* YouTube-specific fields */}
                {form.platforms.includes("youtube") && (
                  <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Video URL status */}
                    <div>
                      <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 15 }}>▶</span> YouTube Video
                      </label>
                      {form.videoUrl ? (
                        <div style={{ padding: "7px 10px", borderRadius: 8, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", fontSize: 11, color: "#22C55E" }}>
                          ✓ MP4 attached · ready for upload
                          <div style={{ marginTop: 2, fontFamily: "monospace", fontSize: 10, color: "#64748B", wordBreak: "break-all" }}>{form.videoUrl.startsWith("/objects/") ? `Object storage: ${form.videoUrl}` : form.videoUrl.slice(0, 60) + (form.videoUrl.length > 60 ? "…" : "")}</div>
                        </div>
                      ) : (
                        <div style={{ padding: "7px 10px", borderRadius: 8, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", fontSize: 11, color: "#EF4444" }}>
                          No video attached — upload an MP4 above to publish to YouTube.
                        </div>
                      )}
                    </div>

                    {/* YouTube Title */}
                    <div>
                      <label style={labelStyle}>YouTube Title</label>
                      <input
                        type="text"
                        value={form.youtubeTitle}
                        onChange={e => setForm(f => ({ ...f, youtubeTitle: e.target.value }))}
                        placeholder="Video title (max 100 chars) — defaults to first line of caption"
                        maxLength={100}
                        style={inputStyle}
                      />
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                        <span>Set an explicit title, or leave blank to use the first 100 chars of your caption.</span>
                        <span style={{ color: form.youtubeTitle.length > 90 ? "#F59E0B" : "#475569" }}>
                          {form.youtubeTitle.length}/100
                        </span>
                      </div>
                    </div>

                    {/* Privacy */}
                    <div>
                      <label style={labelStyle}>Privacy</label>
                      <select
                        value={form.youtubePrivacy}
                        onChange={e => setForm(f => ({ ...f, youtubePrivacy: e.target.value }))}
                        style={{ ...inputStyle, cursor: "pointer" }}
                      >
                        <option value="private">🔒 Private — only you can see it</option>
                        <option value="unlisted">🔗 Unlisted — anyone with the link</option>
                        <option value="public">🌐 Public — visible to everyone</option>
                      </select>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
                        Use <strong>Private</strong> or <strong>Unlisted</strong> for test uploads before going public.
                      </div>
                    </div>
                  </div>
                )}

                {/* Post preview card */}
                {(form.caption || form.imageUrl) && (
                  <div style={{ marginTop: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>Post Preview</div>
                    {form.imageUrl && <img src={resolvePreviewUrl(form.imageUrl, BASE)} alt="" style={{ width: "100%", maxHeight: 160, objectFit: "cover", display: "block" }} />}
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
            { label: "Drafts",    value: counts.draft,     color: "#C4B5FD" },
            { label: "Scheduled", value: counts.scheduled, color: "#F59E0B" },
            { label: "Published", value: counts.published, color: "#22C55E" },
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

                    <div style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,0.05)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                      {post.imageUrl || post.matchedImageUrl ? (
                        <>
                          <img src={post.imageUrl ? resolvePreviewUrl(post.imageUrl, BASE) : `${BASE}/api/storage${post.matchedImageUrl}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          {!post.imageUrl && post.matchedImageUrl && (
                            <div style={{ position: "absolute", bottom: 2, right: 2, background: "rgba(0,174,239,0.9)", borderRadius: 3, fontSize: 7, fontWeight: 800, color: "#fff", padding: "1px 3px", lineHeight: 1 }}>AI</div>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 22 }}>🖼</span>
                      )}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                        {post.platforms.map(p => {
                          const ps = PLATFORM_STYLE[p];
                          const pr = parsePlatformResults(post)[p];
                          const dot = pr?.ok === true ? "🟢" : pr?.ok === false ? "🔴" : post.status === "scheduled" ? "🟡" : "⚪";
                          return (
                            <span key={p} title={pr?.error ?? undefined} style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: ps.bg, color: ps.color, textTransform: "uppercase", letterSpacing: "0.4px", cursor: pr?.error ? "help" : "default" }}>
                              {dot} {ps.label.split(" ")[0]}
                            </span>
                          );
                        })}
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: ss.bg, color: ss.color, textTransform: "capitalize" }}>{post.status}</span>
                        {post.ctaType !== "none" && (
                          <span style={{ fontSize: 10, color: "#F59E0B", background: "rgba(245,158,11,0.1)", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                            {CTA_OPTIONS.find(o => o.value === post.ctaType)?.label ?? post.ctaType}
                          </span>
                        )}
                      </div>

                      {/* Dual-caption preview when both Facebook + Google are selected */}
                      {post.captionFacebook && post.captionGoogle && post.platforms.includes("facebook") && post.platforms.includes("google") ? (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                              <span style={{ fontSize: 9, fontWeight: 800, color: "#6B9EFF", background: "rgba(107,158,255,0.12)", border: "1px solid rgba(107,158,255,0.25)", borderRadius: 10, padding: "1px 7px", letterSpacing: "0.4px", textTransform: "uppercase" }}>f Facebook</span>
                            </div>
                            <div style={{ fontSize: 12.5, color: "#D1D5DB", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                              {post.captionFacebook}
                            </div>
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                              <span style={{ fontSize: 9, fontWeight: 800, color: "#EA4335", background: "rgba(234,67,53,0.1)", border: "1px solid rgba(234,67,53,0.25)", borderRadius: 10, padding: "1px 7px", letterSpacing: "0.4px", textTransform: "uppercase" }}>G Google</span>
                            </div>
                            <div style={{ fontSize: 12.5, color: "#94A3B8", lineHeight: 1.5, fontStyle: "italic" }}>
                              {post.captionGoogle}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#D1D5DB", lineHeight: 1.5, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {post.caption || <span style={{ color: "#475569", fontStyle: "italic" }}>No caption</span>}
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "#475569" }}>{post.clientName}</span>
                        {post.scheduledAt && <span style={{ fontSize: 11, color: "#6B7280" }}>🗓 {fmtDate(post.scheduledAt)}</span>}
                        {post.publishedAt && <span style={{ fontSize: 11, color: "#22C55E" }}>✓ Published {fmtDate(post.publishedAt)}</span>}
                        {!post.scheduledAt && !post.publishedAt && <span style={{ fontSize: 11, color: "#475569" }}>Created {timeAgo(post.createdAt)}</span>}
                      </div>

                      {post.errorMessage && (
                        <div style={{ marginTop: 6, fontSize: 11, color: "#EF4444", background: "rgba(239,68,68,0.08)", borderRadius: 6, padding: "4px 8px" }}>
                          ⚠ {post.errorMessage}
                        </div>
                      )}

                      {/* V4: Performance metrics */}
                      {(post.status === "published" || post.status === "partial") && (
                        <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          {post.engagementScore != null ? (
                            <>
                              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, border: `1px solid ${post.engagementScore >= 5 ? "rgba(34,197,94,0.3)" : post.engagementScore >= 2 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)"}`, background: post.engagementScore >= 5 ? "rgba(34,197,94,0.1)" : post.engagementScore >= 2 ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)", color: post.engagementScore >= 5 ? "#22C55E" : post.engagementScore >= 2 ? "#F59E0B" : "#EF4444" }}>
                                📊 {post.engagementScore.toFixed(1)}% eng
                              </span>
                              {post.impressions != null && <span style={{ fontSize: 10, color: "#64748B" }}>👁 {post.impressions.toLocaleString()}</span>}
                              {post.likes      != null && <span style={{ fontSize: 10, color: "#64748B" }}>❤ {post.likes}</span>}
                              {post.shares     != null && <span style={{ fontSize: 10, color: "#64748B" }}>↗ {post.shares}</span>}
                              <button onClick={() => { setPerfModalId(post.id); setPerfForm({ impressions: String(post.impressions ?? ""), reach: String(post.reach ?? ""), clicks: String(post.clicks ?? ""), likes: String(post.likes ?? ""), comments: String(post.comments ?? ""), shares: String(post.shares ?? "") }); }} style={{ fontSize: 10, color: "#475569", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "1px 8px", cursor: "pointer" }}>edit</button>
                            </>
                          ) : (
                            <button onClick={() => { setPerfModalId(post.id); setPerfForm({ impressions: "", reach: "", clicks: "", likes: "", comments: "", shares: "" }); }} style={{ fontSize: 10, fontWeight: 600, color: "#6B7280", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "2px 10px", cursor: "pointer" }}>
                              📊 Log Performance
                            </button>
                          )}
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
                      {(post.status === "draft" || post.status === "scheduled") && !post.matchedImageId && (
                        <button
                          onClick={() => imageMatchMut.mutate(post.id)}
                          disabled={imageMatchMut.isPending}
                          title="Auto-match image from library"
                          style={{ padding: "6px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(107,158,255,0.08)", border: "1px solid rgba(107,158,255,0.2)", color: "#6B9EFF" }}
                        >🖼</button>
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

        {/* ── Activity Log ── */}
        {(() => {
          const actPosts = [...posts]
            .filter(p => p.status === "published" || p.status === "partial" || p.status === "failed")
            .sort((a, b) => new Date(b.publishedAt ?? b.updatedAt).getTime() - new Date(a.publishedAt ?? a.updatedAt).getTime())
            .slice(0, 20);
          return (
            <div style={{ marginTop: 28, background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>📋 Activity Log</span>
                <span style={{ fontSize: 12, color: "#475569" }}>Publish history — all results are API-confirmed</span>
              </div>
              {actPosts.length === 0 ? (
                <div style={{ padding: "40px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#475569", marginBottom: 4 }}>No publish activity yet</div>
                  <div style={{ fontSize: 12, color: "#334155" }}>Published and failed posts appear here with per-platform results.</div>
                </div>
              ) : (
                <div>
                  {actPosts.map((p, i) => {
                    const pr = parsePlatformResults(p);
                    return (
                      <div key={p.id} style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 16, padding: "12px 20px", borderBottom: i < actPosts.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 11, color: "#475569", marginBottom: 2 }}>{fmtDate(p.publishedAt ?? p.updatedAt)}</div>
                          <div style={{ fontSize: 10, color: "#334155" }}>{timeAgo(p.publishedAt ?? p.updatedAt)}</div>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                            {p.platforms.map(plt => {
                              const ps = PLATFORM_STYLE[plt];
                              const r  = pr[plt];
                              const ok = r?.ok;
                              return (
                                <span key={plt} title={r?.error ?? undefined} style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, cursor: r?.error ? "help" : "default", background: ok === true ? "rgba(34,197,94,0.12)" : ok === false ? "rgba(239,68,68,0.12)" : "rgba(100,116,139,0.12)", color: ok === true ? "#22C55E" : ok === false ? "#EF4444" : "#64748B" }}>
                                  <span style={{ color: ps.color, marginRight: 3 }}>{ps.icon}</span>
                                  {ok === true ? "✓" : ok === false ? "✗" : "○"} {ps.label.split(" ")[0]}
                                </span>
                              );
                            })}
                          </div>
                          <div style={{ fontSize: 12, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.aiTopic ?? p.caption.slice(0, 90)}
                          </div>
                          {p.errorMessage && (
                            <div style={{ marginTop: 3, fontSize: 11, color: "#EF4444" }}>⚠ {p.errorMessage}</div>
                          )}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap", background: p.status === "published" ? "rgba(34,197,94,0.12)" : p.status === "partial" ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)", color: p.status === "published" ? "#22C55E" : p.status === "partial" ? "#F59E0B" : "#EF4444" }}>
                          {p.status === "published" ? "🟢 Published" : p.status === "partial" ? "🟡 Partial" : "🔴 Failed"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", fontSize: 12, color: "#D97706", lineHeight: 1.6 }}>
          <strong>Instagram tip:</strong> Select both Facebook + Instagram together. The image uploads to Facebook first, and that hosted URL is automatically reused for Instagram.
        </div>
      </div>

      {/* ── Performance logging modal ── */}
      {perfModalId && (() => {
        const post = posts.find(p => p.id === perfModalId);
        if (!post) return null;
        const handleSave = () => {
          const data: Record<string, number> = {};
          if (perfForm.impressions) data.impressions = parseInt(perfForm.impressions, 10);
          if (perfForm.reach)       data.reach       = parseInt(perfForm.reach,       10);
          if (perfForm.clicks)      data.clicks      = parseInt(perfForm.clicks,      10);
          if (perfForm.likes)       data.likes       = parseInt(perfForm.likes,       10);
          if (perfForm.comments)    data.comments    = parseInt(perfForm.comments,    10);
          if (perfForm.shares)      data.shares      = parseInt(perfForm.shares,      10);
          perfMut.mutate({ id: perfModalId, data });
        };
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: "#0D1829", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 440 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#FFFFFF", marginBottom: 4 }}>📊 Log Performance</div>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {post.aiTopic ? `${post.aiTopic}${post.aiCity ? ` · ${post.aiCity.split(",")[0]}` : ""}` : post.caption.slice(0, 50)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                {([
                  { key: "impressions" as const, label: "Impressions", icon: "👁" },
                  { key: "reach"       as const, label: "Reach",       icon: "📡" },
                  { key: "clicks"      as const, label: "Clicks",      icon: "🔗" },
                  { key: "likes"       as const, label: "Likes",       icon: "❤" },
                  { key: "comments"    as const, label: "Comments",    icon: "💬" },
                  { key: "shares"      as const, label: "Shares",      icon: "↗" },
                ]).map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 5 }}>{f.icon} {f.label}</label>
                    <input type="number" min="0" value={perfForm[f.key]}
                      onChange={e => setPerfForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder="0"
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#E5E7EB", fontFamily: "inherit", outline: "none" }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#334155", marginBottom: 18 }}>
                Engagement score is computed automatically: (likes + comments×3 + shares×5 + clicks×2) / reach × 100
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setPerfModalId(null)} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8" }}>Cancel</button>
                <button onClick={handleSave} disabled={perfMut.isPending} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", background: "linear-gradient(135deg,#00AEEF,#0080CC)", border: "none", color: "#fff", opacity: perfMut.isPending ? 0.7 : 1 }}>
                  {perfMut.isPending ? "Saving…" : "Save Performance"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </AppShell>
  );
}
