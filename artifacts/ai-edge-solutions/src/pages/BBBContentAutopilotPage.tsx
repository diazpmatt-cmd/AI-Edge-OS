// ── BB&B Content Autopilot V2 ────────────────────────────────────────────────
// V2: queue posts as real backend drafts via POST /api/social-posts.
// WorkflowNav connects this page into the full BB&B Growth OS workflow.

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useApiFetch } from "@/lib/api";
import { WorkflowNav } from "@/components/WorkflowNav";
import { PlatformStateChip, resolvePlatformUIState } from "@/components/PlatformStateChip";
import { SOCIAL_PROVIDERS, type SocialProviderId, type SocialProvider } from "@/lib/social-providers";

// ── Brand ─────────────────────────────────────────────────────────────────────
const B = {
  navy:      "#030612",
  panel:     "#080E1F",
  panel2:    "#0A1228",
  border:    "rgba(255,255,255,0.07)",
  blue:      "#00AEEF",
  sky:       "#38BDF8",
  emerald:   "#10B981",
  green:     "#22C55E",
  gold:      "#FBBF24",
  orange:    "#F97316",
  purple:    "#A78BFA",
  red:       "#EF4444",
  silver:    "#94A3B8",
  dim:       "#64748B",
  white:     "#F1F5F9",
  bbbDark:   "#0D2B45",
  bbbMid:    "#0077B6",
  bbbOrange: "#F26C21",
};

// ── Types ─────────────────────────────────────────────────────────────────────
type PlatformStatus = "not-queued" | "ready" | "success" | "failed";

interface ContentTemplate {
  topic:     string;
  facebook:  string;
  instagram: string;
  gbp:       string;
  imageIdea: string;
  cta:       string;
}

interface QueuedPost {
  id:        string;
  platform:  SocialProviderId;
  caption:   string;
  imageIdea: string;
  cta:       string;
  topic:     string;
  queuedAt:  string;
}

interface ActivityEntry {
  id:       string;
  ts:       string;
  platform: SocialProviderId;
  action:   string;
  status:   PlatformStatus;
}

// ── 6 rotating BB&B content templates (no termite content) ───────────────────
const TEMPLATES: ContentTemplate[] = [
  {
    topic: "Early Warning Signs",
    facebook:
      "🐛 Waking up with mysterious bites? Seeing tiny rust-colored spots on your sheets? These could be early warning signs of bed bugs.\n\nBed Bugs & Beyond serves all of Baldwin County — Foley, Gulf Shores, Orange Beach, Fairhope, and more. Call us before it gets worse. Free phone consultation.\n\n📞 #BedBugs #BaldwinCounty #PestControl #FoleyAL",
    instagram:
      "🚨 Early bed bug signs:\n• Small bites in a line or cluster\n• Rust-colored spots on sheets\n• Musty odor near the bed\n\nDon't wait — they spread fast. Serving Baldwin County, AL 🐛\n\n#BedBugs #BaldwinCountyAL #PestControlAL #HomePestControl #GulfShores #Foley #OrangeBeach",
    gbp:
      "Noticing mysterious bites or spots on your sheets? Bed Bugs & Beyond offers same-week inspections across all of Baldwin County. Call or message us today for a free phone consultation — fast, discreet, and professional.",
    imageIdea: "Close-up of bed bug warning signs: rust-colored stains on white sheets with BB&B logo and orange brand accent overlay",
    cta:       "Call now for a free phone consultation",
  },
  {
    topic: "Before & After Treatment",
    facebook:
      "✅ Another Baldwin County home — bed bug free!\n\nOur treatment process is thorough, discreet, and effective. We serve Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, and all of Baldwin County.\n\nIf you're dealing with bed bugs, you don't have to fight it alone. 📞\n\n#BedBugTreatment #BaldwinCountyAL #PestControl #GulfShores",
    instagram:
      "Before: sleepless nights 😓\nAfter: peace of mind ✅\n\nBed Bugs & Beyond — trusted pest control across Baldwin County, AL.\nFast. Discreet. Guaranteed.\n\n#BedBugFree #BaldwinCounty #PestControl #BeforeAndAfter #GulfShoresAL #FoleyAL",
    gbp:
      "Recent treatment success in Gulf Shores, AL. Our professional bed bug treatment eliminates infestations at the source — no shortcuts. Serving all of Baldwin County. Fast response and thorough results.",
    imageIdea: "Side-by-side before/after: messy infested bedroom vs. clean treated room, BB&B logo centered below",
    cta:       "Book your inspection today",
  },
  {
    topic: "Summer Travel Prevention Tips",
    facebook:
      "🧳 Traveling this summer? Bed bugs hitchhike in luggage. Here's how to protect your Baldwin County home:\n\n✅ Inspect hotel mattresses and headboards\n✅ Keep luggage off the floor (use the rack)\n✅ Wash all clothes on HIGH HEAT when you return\n\nAlready found something suspicious? Call Bed Bugs & Beyond.\n\n#TravelTips #BedBugs #BaldwinCounty #SummerTravel",
    instagram:
      "Summer travel = bed bug risk 🧳\n\n3 quick protection tips:\n1. Inspect before sleeping\n2. Luggage on racks, not floors\n3. Wash everything on high heat 🔥\n\nBed Bugs & Beyond — Baldwin County, AL 🐛\n\n#TravelTips #BedBugs #BaldwinCountyAL #PestPrevention #SummerTravel",
    gbp:
      "Traveling this summer? Protect your Baldwin County home from bed bugs with simple prevention habits. Bed Bugs & Beyond offers fast inspections for returning travelers. Call for same-week availability.",
    imageIdea: "Clean infographic: 3-step travel checklist styled with BB&B navy/orange branding, luggage icon with bug warning badge",
    cta:       "Returning from a trip? Schedule an inspection",
  },
  {
    topic: "Gulf Shores Service Spotlight",
    facebook:
      "🌊 Serving Gulf Shores & Orange Beach homeowners — and vacation rentals!\n\nBed Bugs & Beyond provides discreet, professional bed bug treatment for short-term rental properties, hotels, and family homes. Protect your property and your reviews.\n\n📞 Fast response. Proven results.\n\n#GulfShores #OrangeBeach #VacationRental #BedBugs #BaldwinCounty",
    instagram:
      "Gulf Shores & Orange Beach — we've got you covered 🌊🐛\n\nSpecializing in:\n✅ Vacation rental treatment\n✅ Single-family homes\n✅ Discreet, fast service\n\nBed Bugs & Beyond — Baldwin County, AL\n\n#GulfShores #OrangeBeachAL #VacationRental #BedBugTreatment #BaldwinCountyAL",
    gbp:
      "Serving Gulf Shores and Orange Beach property owners and vacation rental hosts. Fast response, discreet treatment, and guaranteed results. One call covers your whole property. Contact Bed Bugs & Beyond today.",
    imageIdea: "Gulf Shores beach scene background with BB&B branded service badge overlay — clean, professional, coastal feel",
    cta:       "Call for vacation rental inspection pricing",
  },
  {
    topic: "5-Star Review Spotlight",
    facebook:
      "⭐⭐⭐⭐⭐ \"Professional, thorough, and fast. I'd highly recommend Bed Bugs & Beyond for anyone in Baldwin County dealing with bed bugs.\" — Recent customer\n\nThank you for trusting us! Ready to experience 5-star service?\n\n📞 We serve all of Baldwin County.\n\n#5Stars #BaldwinCounty #BedBugs #CustomerReview #PestControl",
    instagram:
      "⭐⭐⭐⭐⭐ Another 5-star review!\n\n\"Professional, thorough, and fast.\"\n\nThank you Baldwin County! 🙏\nBed Bugs & Beyond — your trusted local pest control.\n\n#5Stars #BaldwinCountyAL #BedBugsAL #CustomerLove #PestControl #LocalBusiness",
    gbp:
      "Thank you to our latest 5-star reviewer! Bed Bugs & Beyond is proud to serve Baldwin County with professional, thorough pest control. Browse our Google reviews and book your inspection today.",
    imageIdea: "Review card graphic: 5 orange stars, quote text, BB&B logo on dark navy — screenshot-style social proof format",
    cta:       "Read our reviews — then book your inspection",
  },
  {
    topic: "Summer Bed Bug Season Alert",
    facebook:
      "☀️ Summer is peak season for bed bugs in Baldwin County.\n\nMore travel, more hotel stays, more risk at home. Bed Bugs & Beyond offers fast inspections and effective treatment throughout Foley, Gulf Shores, Fairhope, Daphne, Spanish Fort, and the whole county.\n\nDon't let pests ruin your summer. 📞\n\n#SummerPests #BaldwinCounty #BedBugs #PestControl #FoleyAL",
    instagram:
      "☀️ Summer = bed bug season in Baldwin County\n\nMore travel → more risk 🐛\n\nBed Bugs & Beyond is ready:\n✅ Same-week inspections\n✅ All Baldwin County areas\n✅ Fast and discreet\n\n#SummerPests #BaldwinCountyAL #BedBugs #GulfShores #Foley #PestControl",
    gbp:
      "Summer is here — and so is bed bug season in Baldwin County. Bed Bugs & Beyond offers fast inspections and professional treatment from Foley to Gulf Shores. Call today for a same-week appointment.",
    imageIdea: "Summer-themed branded graphic: sun icon + bed bug alert badge, BB&B orange/navy colors, text: 'Peak Season — Act Fast'",
    cta:       "Schedule a same-week inspection today",
  },
];

// ── Runtime-derived platform sets (canonical registry — no hardcoded arrays) ──
// Adding a new entry to SOCIAL_PROVIDERS automatically appears here.
const QUEUEABLE_PROVIDERS: SocialProvider[] = SOCIAL_PROVIDERS.filter(
  p => p.status === "operational" && p.capabilities.queue,
);

const INITIAL_STATUS: Partial<Record<SocialProviderId, PlatformStatus>> = Object.fromEntries(
  QUEUEABLE_PROVIDERS.map(p => [p.id, "not-queued" as PlatformStatus]),
);

// Context-specific display notes for non-queueable platforms (caption info panel).
// These are UX strings — not registry metadata.
const PLATFORM_NOTE: Partial<Record<SocialProviderId, string>> = {
  youtube:  "YouTube Short content is generated via Auto Content Engine. Queueing available after channel connection and platform approval.",
  tiktok:   "TikTok publishing is pending platform approval. Content preview available via Auto Content Engine.",
  linkedin: "LinkedIn publishing is not yet available. Content generation is available via Auto Content Engine.",
};

const STATUS_META: Record<PlatformStatus, { dot: string; label: string; color: string }> = {
  "not-queued": { dot: "#475569", label: "Not queued",        color: "#64748B" },
  "ready":      { dot: "#FBBF24", label: "Ready for review",  color: "#FBBF24" },
  "success":    { dot: "#22C55E", label: "Published",         color: "#22C55E" },
  "failed":     { dot: "#EF4444", label: "Failed",            color: "#EF4444" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function weekLabel(): string {
  const d = new Date();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `Week of ${monday.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function captionFor(t: ContentTemplate, p: SocialProviderId): string {
  if (p === "facebook")        return t.facebook;
  if (p === "instagram")       return t.instagram;
  if (p === "google_business") return t.gbp;
  return ""; // youtube, tiktok, linkedin: content not available in static templates
}

function nowTs(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BBBContentAutopilotPage() {
  const [templateIdx,     setTemplateIdx]     = useState<number | null>(null);
  const [activeTab,       setActiveTab]       = useState<SocialProviderId>("facebook");
  const [queue,           setQueue]           = useState<QueuedPost[]>([]);
  const [copiedKey,       setCopiedKey]       = useState<string | null>(null);
  const [justQueued,      setJustQueued]      = useState<string[]>([]);
  const [platformStatus,  setPlatformStatus]  = useState<Partial<Record<SocialProviderId, PlatformStatus>>>({ ...INITIAL_STATUS });
  const [activityLog,     setActivityLog]     = useState<ActivityEntry[]>([]);
  const [draftsSaved,     setDraftsSaved]     = useState<Set<string>>(new Set());

  // V2: real backend draft creation
  const authFetch   = useApiFetch();
  const createDraft = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      authFetch<{ id: number }>("/social-posts", { method: "POST", body: JSON.stringify(data) }),
  });

  // Live social connections — used to derive connected/disconnected state per provider
  const { data: connections = [] } = useQuery<Array<{ id: string; provider: string; accountName: string | null }>>({
    queryKey: ["social_connections"],
    queryFn:  () => authFetch<Array<{ id: string; provider: string; accountName: string | null }>>("/social-connections"),
    staleTime: 60 * 1000,
  });
  const connectedProviders = new Set(connections.map(c => c.provider));

  const generated = templateIdx !== null ? TEMPLATES[templateIdx] : null;

  // ── Derived status values (queueable platforms only) ──
  const anyReady   = QUEUEABLE_PROVIDERS.some(p => platformStatus[p.id] === "ready");
  const anyFailed  = QUEUEABLE_PROVIDERS.some(p => platformStatus[p.id] === "failed");
  const allReady   = QUEUEABLE_PROVIDERS.every(p => platformStatus[p.id] === "ready");
  const noneQueued = QUEUEABLE_PROVIDERS.every(p => platformStatus[p.id] === "not-queued");

  const banner = anyFailed
    ? { color: B.red,    bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.3)",   icon: "🔴", text: "Some platforms need attention"   }
    : allReady
    ? { color: B.green,  bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.3)",   icon: "🟢", text: "All platforms ready for review"  }
    : anyReady
    ? { color: B.gold,   bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.3)",  icon: "🟡", text: "Posts ready for review"          }
    : { color: B.dim,    bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.2)", icon: "⚪", text: "No posts queued yet"              };

  function handleGenerate() {
    setTemplateIdx(prev => prev === null ? 0 : (prev + 1) % TEMPLATES.length);
    setActiveTab("facebook");
    setJustQueued([]);
    setPlatformStatus({ ...INITIAL_STATUS });
  }

  function queuePost(platform: SocialProviderId) {
    if (!generated) return;
    const post: QueuedPost = {
      id:        uid(),
      platform,
      caption:   captionFor(generated, platform),
      imageIdea: generated.imageIdea,
      cta:       generated.cta,
      topic:     generated.topic,
      queuedAt:  nowTs(),
    };
    setQueue(q => [post, ...q]);
    setJustQueued(prev => [...new Set([...prev, platform])]);
    setPlatformStatus(s => ({ ...s, [platform]: "ready" }));
    setActivityLog(prev => [{
      id:       uid(),
      ts:       nowTs(),
      platform,
      action:   `"${generated.topic}" added to review queue`,
      status:   "ready",
    }, ...prev]);

    // V2: save to backend as a real draft in the Publishing Center
    // Backend expects "google" (page-local alias), not "google_business" (registry ID)
    const platformKey = platform === "google_business" ? "google" : platform;
    createDraft.mutate({
      caption:         captionFor(generated, "instagram"),
      captionFacebook: captionFor(generated, "facebook"),
      captionGoogle:   captionFor(generated, "google_business"),
      platforms:       [platformKey],
      status:          "draft",
    }, {
      onSuccess: () => setDraftsSaved(prev => new Set([...prev, post.id])),
    });
  }

  function queueAll() {
    if (!generated) return;
    QUEUEABLE_PROVIDERS.forEach(p => { if (!justQueued.includes(p.id)) queuePost(p.id); });
  }

  function removeFromQueue(id: string) {
    const post = queue.find(p => p.id === id);
    if (post) {
      const stillQueued = queue.filter(p => p.id !== id && p.platform === post.platform).length > 0;
      if (!stillQueued) setPlatformStatus(s => ({ ...s, [post.platform]: "not-queued" }));
      setActivityLog(prev => [{
        id:       uid(),
        ts:       nowTs(),
        platform: post.platform,
        action:   "Removed from queue",
        status:   "not-queued",
      }, ...prev]);
    }
    setQueue(q => q.filter(p => p.id !== id));
    setJustQueued(prev => {
      if (!post) return prev;
      const remaining = queue.filter(p => p.id !== id && p.platform === post.platform);
      return remaining.length === 0 ? prev.filter(pl => pl !== post.platform) : prev;
    });
  }

  function copyText(text: string, key: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
      }).catch(() => {});
    }
  }

  const currentCaption = generated ? captionFor(generated, activeTab) : "";
  const isInfoTab      = !QUEUEABLE_PROVIDERS.some(p => p.id === activeTab);
  const activeProvider = SOCIAL_PROVIDERS.find(p => p.id === activeTab) ?? SOCIAL_PROVIDERS[0];
  const allQueued      = QUEUEABLE_PROVIDERS.every(p => justQueued.includes(p.id));

  return (
    <div style={{ minHeight: "100vh", background: B.navy, color: B.white, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Workflow Navigator ── */}
      <div style={{ padding: "14px 36px 0" }}>
        <WorkflowNav />
      </div>

      {/* ── Header ── */}
      <div style={{
        background: `linear-gradient(135deg, ${B.bbbDark} 0%, #0A1A2E 60%, ${B.navy} 100%)`,
        borderBottom: `1px solid ${B.border}`, padding: "26px 36px 22px",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const,
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: 12, flexShrink: 0,
          background: `linear-gradient(135deg, rgba(242,108,33,0.3) 0%, rgba(0,119,182,0.2) 100%)`,
          border: `1px solid rgba(242,108,33,0.4)`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
        }}>⚡</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: B.white, letterSpacing: "-0.3px" }}>
            Content Autopilot V1
          </div>
          <div style={{ fontSize: 12, color: B.dim, marginTop: 3 }}>
            Bed Bugs &amp; Beyond · Baldwin County, AL — Generate &amp; queue posts across all connected platforms in one click
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700,
            background: "rgba(242,108,33,0.12)", border: `1px solid rgba(242,108,33,0.3)`,
            color: B.bbbOrange, borderRadius: 8, padding: "4px 12px",
          }}>
            {weekLabel()}
          </span>
          {!noneQueued && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: banner.bg, border: `1px solid ${banner.border}`,
              color: banner.color, borderRadius: 8, padding: "4px 12px",
            }}>
              {banner.icon} {banner.text}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "28px 36px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Generate card ── */}
        <div style={{
          background: `linear-gradient(135deg, ${B.bbbDark} 0%, #0A1E35 60%, ${B.panel} 100%)`,
          border: `1px solid rgba(242,108,33,0.3)`, borderRadius: 18,
          padding: "28px 32px", marginBottom: 16,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap" as const, gap: 20,
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, color: B.bbbOrange, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>
              ⚡ Weekly Content Plan
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: B.white, letterSpacing: "-0.5px", marginBottom: 8 }}>
              {generated ? generated.topic : "Ready to generate this week's content"}
            </div>
            <div style={{ fontSize: 13, color: B.silver, maxWidth: 520 }}>
              {generated
                ? "Captions for all connected platforms — ready to copy or queue."
                : "One click generates a complete weekly content plan for BB&B: captions for all supported platforms, an image idea, and a call-to-action."}
            </div>
          </div>
          <button
            onClick={handleGenerate}
            style={{
              flexShrink: 0,
              background: `linear-gradient(135deg, rgba(242,108,33,0.2) 0%, rgba(0,119,182,0.15) 100%)`,
              border: `1.5px solid rgba(242,108,33,0.5)`,
              borderRadius: 12, padding: "14px 28px",
              fontSize: 14, fontWeight: 800, color: B.white,
              cursor: "pointer", transition: "all 0.2s",
              display: "flex", alignItems: "center", gap: 10,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(242,108,33,0.35) 0%, rgba(0,119,182,0.25) 100%)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(242,108,33,0.2) 0%, rgba(0,119,182,0.15) 100%)"; }}
          >
            <span style={{ fontSize: 20 }}>⚡</span>
            {generated ? "Generate Next Week →" : "Generate Weekly Content"}
          </button>
        </div>

        {/* ── Publishing Status Bar ── */}
        <div style={{
          background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16,
          padding: "16px 20px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const,
        }}>
          {/* Overall banner */}
          <div style={{
            flex: 1, minWidth: 180,
            background: banner.bg, border: `1px solid ${banner.border}`,
            borderRadius: 10, padding: "10px 16px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>{banner.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: banner.color }}>{banner.text}</div>
              <div style={{ fontSize: 10, color: B.dim, marginTop: 2 }}>
                {noneQueued ? "Generate content and queue posts to begin" : "Posts are held for review — nothing publishes automatically"}
              </div>
            </div>
          </div>

          {/* Platform status — all providers from registry */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {SOCIAL_PROVIDERS.map(p => {
              const isQueueable = QUEUEABLE_PROVIDERS.some(q => q.id === p.id);
              if (isQueueable) {
                const sState = platformStatus[p.id] ?? "not-queued";
                const sMeta  = STATUS_META[sState];
                return (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: `${p.color}08`,
                    border: `1px solid ${sState !== "not-queued" ? `${sMeta.dot}40` : `${p.color}20`}`,
                    borderRadius: 10, padding: "8px 12px", minWidth: 110,
                    transition: "all 0.3s",
                  }}>
                    <div style={{
                      width: 11, height: 11, borderRadius: "50%", flexShrink: 0,
                      background: sMeta.dot,
                      boxShadow: sState !== "not-queued" ? `0 0 7px ${sMeta.dot}` : "none",
                      transition: "all 0.3s",
                    }} />
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: B.white }}>
                        {p.icon} {p.abbreviation}
                      </div>
                      <div style={{ fontSize: 9, color: sMeta.color, fontWeight: 600, marginTop: 1 }}>
                        {sMeta.label}
                      </div>
                    </div>
                  </div>
                );
              } else {
                const uiState = resolvePlatformUIState(p, connectedProviders.has(p.id));
                return (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 7,
                    background: `${p.color}04`,
                    border: `1px solid ${p.color}15`,
                    borderRadius: 10, padding: "8px 12px", minWidth: 110,
                    opacity: 0.6,
                  }}>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: B.dim }}>
                        {p.icon} {p.abbreviation}
                      </div>
                      <div style={{ marginTop: 3 }}>
                        <PlatformStateChip state={uiState} size="xs" />
                      </div>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        </div>

        {/* ── Generated content ── */}
        {generated && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

            {/* ── Platform captions ── */}
            <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: B.bbbOrange, letterSpacing: "1.5px", textTransform: "uppercase" }}>
                📝 Platform Captions
              </div>

              {/* Platform tabs — all providers from registry */}
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>
                {SOCIAL_PROVIDERS.map(provider => {
                  const isQueueable = QUEUEABLE_PROVIDERS.some(q => q.id === provider.id);
                  const isActive    = activeTab === provider.id;
                  const sState      = isQueueable ? (platformStatus[provider.id] ?? "not-queued") : null;
                  const sMeta       = sState ? STATUS_META[sState] : null;
                  return (
                    <button
                      key={provider.id}
                      onClick={() => setActiveTab(provider.id)}
                      title={!isQueueable && PLATFORM_NOTE[provider.id] ? PLATFORM_NOTE[provider.id] : undefined}
                      style={{
                        flex: "1 1 auto",
                        background: isActive ? `${provider.color}20` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${isActive ? `${provider.color}55` : "rgba(255,255,255,0.07)"}`,
                        borderRadius: 8, padding: "7px 4px",
                        fontSize: 10, fontWeight: 700,
                        color: isActive ? provider.color : isQueueable ? B.dim : "#374151",
                        cursor: "pointer", transition: "all 0.15s",
                        position: "relative" as const,
                        opacity: isQueueable ? 1 : 0.65,
                      }}
                    >
                      {provider.icon} {provider.abbreviation}
                      {sState && sState !== "not-queued" && sMeta && (
                        <span style={{
                          position: "absolute" as const, top: -5, right: -5,
                          width: 10, height: 10, borderRadius: "50%",
                          background: sMeta.dot, border: `2px solid ${B.panel}`,
                        }} />
                      )}
                      {!isQueueable && (
                        <span style={{
                          position: "absolute" as const, top: -5, right: -5,
                          width: 10, height: 10, borderRadius: "50%",
                          background: provider.status === "coming_soon" ? "#475569" : "#F59E0B",
                          border: `2px solid ${B.panel}`,
                        }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Caption */}
              <div style={{ position: "relative" as const, flex: 1 }}>
                {isInfoTab ? (
                  /* Informational platform — no static template content */
                  <div style={{
                    width: "100%", boxSizing: "border-box" as const,
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${activeProvider.color}30`,
                    borderRadius: 10, padding: "20px 16px",
                    fontSize: 12, color: B.dim, lineHeight: 1.7,
                    textAlign: "center" as const, minHeight: 148,
                    display: "flex", flexDirection: "column" as const,
                    alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                    <span style={{ fontSize: 22, opacity: 0.4 }}>{activeProvider.icon}</span>
                    <div style={{ fontWeight: 700, color: B.silver, fontSize: 12 }}>
                      {activeProvider.status === "coming_soon"      ? "Coming Soon"
                        : activeProvider.status === "pending_approval" ? "Pending Approval"
                        : connectedProviders.has(activeProvider.id)    ? "Connected — Not available in Autopilot"
                        : "Not Connected"}
                    </div>
                    <div style={{ fontSize: 11, color: B.dim, maxWidth: 280 }}>
                      {PLATFORM_NOTE[activeProvider.id] ?? `${activeProvider.label} is not yet available in Content Autopilot.`}
                    </div>
                    <PlatformStateChip
                      state={resolvePlatformUIState(activeProvider, connectedProviders.has(activeProvider.id))}
                      size="sm"
                    />
                  </div>
                ) : (
                  <textarea
                    readOnly
                    value={currentCaption}
                    rows={9}
                    style={{
                      width: "100%", boxSizing: "border-box" as const,
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${activeProvider.color}30`,
                      borderRadius: 10, padding: "12px 14px",
                      fontSize: 12, color: B.white, lineHeight: 1.7,
                      fontFamily: "inherit", resize: "none", outline: "none",
                    }}
                  />
                )}
                {!isInfoTab && (
                  <button
                    onClick={() => copyText(currentCaption, `caption-${activeTab}`)}
                    style={{
                      position: "absolute" as const, top: 8, right: 8,
                      background: copiedKey === `caption-${activeTab}` ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${copiedKey === `caption-${activeTab}` ? "rgba(16,185,129,0.4)" : B.border}`,
                      borderRadius: 6, padding: "3px 10px",
                      fontSize: 10, fontWeight: 700,
                      color: copiedKey === `caption-${activeTab}` ? B.emerald : B.silver,
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    {copiedKey === `caption-${activeTab}` ? "✓ Copied" : "📋 Copy"}
                  </button>
                )}
              </div>

              <div style={{ fontSize: 10, color: B.dim, marginTop: -8 }}>
                {activeTab === "facebook"        && "Facebook: ~400–500 chars recommended"}
                {activeTab === "instagram"       && "Instagram: use all hashtags · tag location if possible"}
                {activeTab === "google_business" && "GBP: 1,500 char max · include your city/service area"}
                {activeTab === "youtube"         && "YouTube Short scripts are generated by Auto Content Engine"}
                {activeTab === "tiktok"          && "TikTok scripts are generated by Auto Content Engine"}
                {activeTab === "linkedin"        && "LinkedIn posts are generated by Auto Content Engine"}
              </div>
            </div>

            {/* ── Right column ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Image idea */}
              <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "18px 20px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: B.purple, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>
                  🎨 Suggested Image / Video
                </div>
                <div style={{ fontSize: 12.5, color: B.white, lineHeight: 1.6 }}>{generated.imageIdea}</div>
              </div>

              {/* CTA */}
              <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "18px 20px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: B.gold, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>
                  📣 Call to Action
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: B.white,
                    background: "rgba(251,191,36,0.08)", border: `1px solid rgba(251,191,36,0.25)`,
                    borderRadius: 8, padding: "8px 14px", flex: 1,
                  }}>
                    {generated.cta}
                  </div>
                  <button
                    onClick={() => copyText(generated.cta, "cta")}
                    style={{
                      background: copiedKey === "cta" ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${copiedKey === "cta" ? "rgba(16,185,129,0.35)" : B.border}`,
                      borderRadius: 7, padding: "6px 12px",
                      fontSize: 10, fontWeight: 700,
                      color: copiedKey === "cta" ? B.emerald : B.silver,
                      cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
                    }}
                  >
                    {copiedKey === "cta" ? "✓" : "📋"}
                  </button>
                </div>
              </div>

              {/* Queue buttons */}
              <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "18px 20px", flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: B.sky, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 14 }}>
                  📤 Queue Posts
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Queueable platforms — from registry: operational + queue capable */}
                  {QUEUEABLE_PROVIDERS.map(p => {
                    const sState = platformStatus[p.id] ?? "not-queued";
                    const sMeta  = STATUS_META[sState];
                    const isQ    = justQueued.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => queuePost(p.id)}
                        disabled={isQ}
                        style={{
                          background: isQ ? `${p.color}15` : `${p.color}0C`,
                          border: `1px solid ${isQ ? `${p.color}50` : `${p.color}25`}`,
                          borderRadius: 10, padding: "10px 14px",
                          fontSize: 12, fontWeight: 700,
                          color: isQ ? p.color : B.silver,
                          cursor: isQ ? "default" : "pointer",
                          transition: "all 0.15s",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          opacity: isQ ? 0.85 : 1,
                        }}
                      >
                        <span>{p.icon} Queue {p.abbreviation} Post</span>
                        {isQ && (
                          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: sMeta.color, fontWeight: 800 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: sMeta.dot, display: "inline-block" }} />
                            {sMeta.label}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {/* Non-queueable platforms — from registry: shown with live state chip */}
                  {SOCIAL_PROVIDERS.filter(p => !QUEUEABLE_PROVIDERS.some(q => q.id === p.id)).map(p => {
                    const uiState = resolvePlatformUIState(p, connectedProviders.has(p.id));
                    return (
                      <div
                        key={p.id}
                        title={PLATFORM_NOTE[p.id]}
                        style={{
                          background: `${p.color}06`,
                          border: `1px dashed ${p.color}20`,
                          borderRadius: 10, padding: "8px 14px",
                          fontSize: 11, fontWeight: 700,
                          color: "#374151",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          cursor: "default",
                        }}
                      >
                        <span style={{ color: p.color, opacity: 0.4 }}>{p.icon}</span>
                        <span style={{ flex: 1, marginLeft: 8 }}>{p.abbreviation} — Not available in Autopilot</span>
                        <PlatformStateChip state={uiState} />
                      </div>
                    );
                  })}

                  <button
                    onClick={queueAll}
                    disabled={allQueued}
                    style={{
                      marginTop: 4,
                      background: allQueued
                        ? "rgba(34,197,94,0.12)"
                        : `linear-gradient(135deg, rgba(242,108,33,0.18) 0%, rgba(0,174,239,0.12) 100%)`,
                      border: `1.5px solid ${allQueued ? "rgba(34,197,94,0.4)" : "rgba(242,108,33,0.45)"}`,
                      borderRadius: 10, padding: "12px 14px",
                      fontSize: 13, fontWeight: 800,
                      color: allQueued ? B.green : B.white,
                      cursor: allQueued ? "default" : "pointer", transition: "all 0.2s",
                    }}
                    onMouseEnter={e => { if (!allQueued) (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(242,108,33,0.30) 0%, rgba(0,174,239,0.20) 100%)"; }}
                    onMouseLeave={e => { if (!allQueued) (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(242,108,33,0.18) 0%, rgba(0,174,239,0.12) 100%)"; }}
                  >
                    {allQueued
                      ? `🟢 All ${QUEUEABLE_PROVIDERS.length} Platforms Ready for Review`
                      : `⚡ Queue All ${QUEUEABLE_PROVIDERS.length} Platforms`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!generated && (
          <div style={{
            background: B.panel, border: `1px solid ${B.border}`,
            borderRadius: 16, padding: "48px 32px",
            textAlign: "center" as const, marginBottom: 20,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: B.white, marginBottom: 8 }}>
              No content generated yet
            </div>
            <div style={{ fontSize: 13, color: B.dim, maxWidth: 400, margin: "0 auto" }}>
              Click "Generate Weekly Content" above to create this week's Facebook, Instagram, and Google Business Profile posts for Bed Bugs &amp; Beyond.
            </div>
          </div>
        )}

        {/* ── Ready-to-Queue list ── */}
        {queue.length > 0 && (
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "22px 24px", marginBottom: 20 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: B.green, letterSpacing: "1.5px", textTransform: "uppercase" }}>
                📋 Ready to Queue — {queue.length} post{queue.length !== 1 ? "s" : ""}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, color: B.dim,
                background: "rgba(255,255,255,0.04)", border: `1px solid ${B.border}`,
                borderRadius: 6, padding: "3px 10px",
              }}>
                Not published — review before sending
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {queue.map(post => {
                const prov   = SOCIAL_PROVIDERS.find(p => p.id === post.platform);
                const pColor = prov?.color ?? "#64748B";
                const pIcon  = prov?.icon ?? "?";
                const pAbbr  = prov?.abbreviation ?? post.platform;
                const sState = platformStatus[post.platform] ?? "not-queued";
                const sMeta  = STATUS_META[sState];
                return (
                  <div key={post.id} style={{
                    background: `${pColor}08`, border: `1px solid ${pColor}25`,
                    borderRadius: 12, padding: "14px 16px",
                    display: "flex", gap: 14, alignItems: "flex-start",
                  }}>
                    <div style={{
                      flexShrink: 0, width: 40, height: 40, borderRadius: 10,
                      background: `${pColor}18`, border: `1px solid ${pColor}35`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                    }}>
                      {pIcon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: pColor }}>{pAbbr}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 800, color: sMeta.color,
                          background: `${sMeta.dot}18`, border: `1px solid ${sMeta.dot}40`,
                          borderRadius: 4, padding: "1px 6px", textTransform: "uppercase" as const, letterSpacing: "0.5px",
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: sMeta.dot, display: "inline-block" }} />
                          {sMeta.label}
                        </span>
                        <span style={{ fontSize: 10, color: B.dim }}>· {post.topic} · {post.queuedAt}</span>
                        {draftsSaved.has(post.id) && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: B.emerald, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 5, padding: "2px 6px" }}>
                            📨 Draft in Publishing Center
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 11.5, color: B.silver, lineHeight: 1.55,
                        overflow: "hidden", display: "-webkit-box",
                        WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                      }}>
                        {post.caption}
                      </div>
                      <div style={{ fontSize: 10, color: B.dim, marginTop: 5 }}>📣 CTA: {post.cta}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => copyText(post.caption, `queue-${post.id}`)}
                        style={{
                          background: copiedKey === `queue-${post.id}` ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)",
                          border: `1px solid ${copiedKey === `queue-${post.id}` ? "rgba(16,185,129,0.35)" : B.border}`,
                          borderRadius: 7, padding: "5px 12px", fontSize: 10, fontWeight: 700,
                          color: copiedKey === `queue-${post.id}` ? B.emerald : B.silver,
                          cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" as const,
                        }}
                      >
                        {copiedKey === `queue-${post.id}` ? "✓ Copied" : "📋 Copy"}
                      </button>
                      <button
                        onClick={() => removeFromQueue(post.id)}
                        style={{
                          background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)",
                          borderRadius: 7, padding: "5px 12px", fontSize: 10, fontWeight: 700,
                          color: "#F87171", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" as const,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{
              marginTop: 16,
              background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.15)",
              borderRadius: 10, padding: "10px 14px",
              fontSize: 11, color: B.silver, lineHeight: 1.6,
            }}>
              💡 Posts are held here for your review. Use the Publishing Center to send them live, or copy each caption to post manually.
              Nothing is published automatically.
            </div>
          </div>
        )}

        {/* ── Activity Log ── */}
        {activityLog.length > 0 && (
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: B.blue, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 14 }}>
              🕐 Activity Log
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {activityLog.slice(0, 12).map(entry => {
                const prov   = SOCIAL_PROVIDERS.find(p => p.id === entry.platform);
                const pColor = prov?.color ?? "#64748B";
                const pIcon  = prov?.icon ?? "?";
                const pAbbr  = prov?.abbreviation ?? entry.platform;
                const sMeta  = STATUS_META[entry.status];
                return (
                  <div key={entry.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "8px 10px", borderRadius: 8,
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid rgba(255,255,255,0.04)`,
                  }}>
                    <span style={{ fontSize: 10, color: B.dim, flexShrink: 0, width: 76, fontFamily: "monospace" }}>
                      {entry.ts}
                    </span>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{pIcon}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: pColor, flexShrink: 0, minWidth: 64 }}>
                      {pAbbr}
                    </span>
                    <span style={{ fontSize: 11, color: B.silver, flex: 1 }}>{entry.action}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: sMeta.color,
                      background: `${sMeta.dot}15`, border: `1px solid ${sMeta.dot}35`,
                      borderRadius: 4, padding: "2px 8px", flexShrink: 0,
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: sMeta.dot, display: "inline-block" }} />
                      {sMeta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Platform posting tips ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {([
            {
              platform: "facebook" as SocialProviderId,
              tips: ["Post 3–5x per week", "Photos outperform text", "Include a direct CTA", "Respond to all comments"],
            },
            {
              platform: "instagram" as SocialProviderId,
              tips: ["Use 5–15 relevant hashtags", "Before/after photos perform best", "Post Stories for engagement", "Tag your city: #GulfShoresAL"],
            },
            {
              platform: "google_business" as SocialProviderId,
              tips: ["Post at least weekly", "Include your service area cities", "Add a photo to every post", "Use keywords: 'bed bug treatment Baldwin County'"],
            },
          ]).map(({ platform, tips }) => {
            const prov  = SOCIAL_PROVIDERS.find(p => p.id === platform);
            const pColor = prov?.color ?? "#64748B";
            const pIcon  = prov?.icon ?? "?";
            const pAbbr  = prov?.abbreviation ?? platform;
            return (
              <div key={platform} style={{
                background: B.panel, border: `1px solid ${pColor}20`, borderRadius: 14, padding: "16px 18px",
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: pColor, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>
                  {pIcon} {pAbbr} Tips
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {tips.map(tip => (
                    <div key={tip} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                      <span style={{ color: pColor, fontSize: 11, flexShrink: 0, marginTop: 1 }}>→</span>
                      <span style={{ fontSize: 11, color: B.silver, lineHeight: 1.5 }}>{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
