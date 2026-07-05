import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { useTheme } from "@/contexts/theme-context";

// ── Types ─────────────────────────────────────────────────────────────────────
type AssetType = "image" | "video" | "audio" | "campaign" | "logo" | "brand-kit" | "template";
type SortKey   = "newest" | "oldest" | "name" | "type";
type FilterKey = "all" | AssetType | "favorites";
type Section   = "browser" | "collections" | "brand" | "prompts" | "usage" | "activity";

interface Asset {
  id: string;
  name: string;
  type: AssetType;
  brand: string;
  date: string;
  size: string;
  tags: string[];
  icon: string;
  color: string;
}

interface Prompt {
  id: string;
  label: string;
  category: "image" | "video" | "audio" | "ad";
  text: string;
  brand: string;
  icon: string;
}

// ── Mock data ─────────────────────────────────────────────────────────────────
const MOCK_ASSETS: Asset[] = [
  { id: "a1",  name: "BB&B Summer Pest Ad",       type: "image",    brand: "BB&B",  date: "2026-07-04", size: "1.2 MB",  tags: ["summer", "ad", "pest"],      icon: "🖼️",  color: "#00AEEF" },
  { id: "a2",  name: "AI Edge Hero Video",         type: "video",    brand: "AIE",   date: "2026-07-03", size: "24 MB",   tags: ["hero", "brand"],             icon: "🎬",  color: "#A78BFA" },
  { id: "a3",  name: "BB&B Receptionist Script",   type: "audio",    brand: "BB&B",  date: "2026-07-02", size: "0.9 MB",  tags: ["receptionist", "phone"],     icon: "🎙️", color: "#34D399" },
  { id: "a4",  name: "Q3 Pest Campaign",           type: "campaign", brand: "BB&B",  date: "2026-07-01", size: "—",       tags: ["campaign", "q3"],            icon: "🚀",  color: "#FB923C" },
  { id: "a5",  name: "AI Edge Logo Full",          type: "logo",     brand: "AIE",   date: "2026-06-30", size: "0.3 MB",  tags: ["logo", "brand"],             icon: "🏷️", color: "#C0C0C0" },
  { id: "a6",  name: "BB&B Instagram Reel",        type: "video",    brand: "BB&B",  date: "2026-06-29", size: "18 MB",   tags: ["instagram", "reel", "social"],icon: "🎬", color: "#A78BFA" },
  { id: "a7",  name: "Bed Bug Alert Facebook Ad",  type: "image",    brand: "BB&B",  date: "2026-06-28", size: "0.8 MB",  tags: ["facebook", "ad", "bed-bug"], icon: "🖼️",  color: "#00AEEF" },
  { id: "a8",  name: "AI Edge Brand Kit v2",       type: "brand-kit",brand: "AIE",   date: "2026-06-27", size: "—",       tags: ["brand", "kit", "design"],    icon: "🎨",  color: "#00AEEF" },
  { id: "a9",  name: "Spring Pest Control Promo",  type: "campaign", brand: "BB&B",  date: "2026-06-26", size: "—",       tags: ["spring", "promo"],           icon: "🚀",  color: "#FB923C" },
  { id: "a10", name: "AI Receptionist Greeting",   type: "audio",    brand: "BB&B",  date: "2026-06-25", size: "1.1 MB",  tags: ["greeting", "ai", "voice"],   icon: "🎙️", color: "#34D399" },
  { id: "a11", name: "Social Post Template Set",   type: "template", brand: "AIE",   date: "2026-06-24", size: "—",       tags: ["template", "social"],        icon: "📋",  color: "#F472B6" },
  { id: "a12", name: "BB&B Logo Primary",          type: "logo",     brand: "BB&B",  date: "2026-06-23", size: "0.2 MB",  tags: ["logo", "primary"],           icon: "🏷️", color: "#00AEEF" },
  { id: "a13", name: "AI Edge Demo Reel",          type: "video",    brand: "AIE",   date: "2026-06-22", size: "31 MB",   tags: ["demo", "showcase"],          icon: "🎬",  color: "#A78BFA" },
  { id: "a14", name: "Google Display Ad Set",      type: "image",    brand: "BB&B",  date: "2026-06-21", size: "2.1 MB",  tags: ["google", "display", "ad"],   icon: "🖼️",  color: "#00AEEF" },
  { id: "a15", name: "Q4 Holiday Campaign",        type: "campaign", brand: "BB&B",  date: "2026-06-20", size: "—",       tags: ["holiday", "q4", "promo"],    icon: "🚀",  color: "#FB923C" },
];

const TYPE_COLORS: Record<AssetType, string> = {
  image:    "#00AEEF",
  video:    "#A78BFA",
  audio:    "#34D399",
  campaign: "#FB923C",
  logo:     "#C0C0C0",
  "brand-kit": "#F472B6",
  template: "#FBBF24",
};

const MOCK_PROMPTS: Prompt[] = [
  { id: "p1",  label: "BB&B Bed Bug Alert",         category: "image", brand: "BB&B", icon: "🖼️", text: "Bed Bugs & Beyond pest control ad, professional technician treating home, blue and white color scheme, Baldwin County AL, clean modern photography style, 1200×628" },
  { id: "p2",  label: "Spring Pest Special Ad",     category: "image", brand: "BB&B", icon: "🖼️", text: "Spring pest control promotion, bright outdoor scene, family home, green garden background, BB&B logo placement, bold headline overlay, 1080×1080 social format" },
  { id: "p3",  label: "AI Edge Hero Banner",        category: "image", brand: "AIE",  icon: "🖼️", text: "AI Edge Solutions futuristic dark banner, electric blue #00AEEF glow effects, circuit board texture, AE monogram logo, premium tech aesthetic, 1920×600" },
  { id: "p4",  label: "AI Edge Product Showcase",   category: "image", brand: "AIE",  icon: "🖼️", text: "AI dashboard interface mockup, dark navy background, cyan accent data visualizations, modern SaaS product screenshot, professional lighting" },
  { id: "p5",  label: "BB&B 30-sec Commercial",     category: "video", brand: "BB&B", icon: "🎬", text: "30-second pest control commercial for BB&B, Gulf Shores AL. Scene 1: pest problem in home (5s). Scene 2: BB&B technician arrives (8s). Scene 3: treatment in action (8s). Scene 4: happy pest-free family (5s). CTA: Call Today (4s). Upbeat professional music." },
  { id: "p6",  label: "AI Edge Explainer Reel",     category: "video", brand: "AIE",  icon: "🎬", text: "60-second AI Edge Solutions product explainer. Dark premium aesthetic. Show: local business problem → AI automation → measurable results. Motion graphics, data counters, 9:16 vertical format for Instagram Reels." },
  { id: "p7",  label: "Instagram Story Ad",         category: "video", brand: "BB&B", icon: "🎬", text: "15-second Instagram Story ad for BB&B. Fast cuts: bug close-up → scared homeowner → BB&B hero → relief. Bold text overlays. Trending audio hook. 1080×1920." },
  { id: "p8",  label: "BB&B Phone Receptionist",   category: "audio", brand: "BB&B", icon: "🎙️", text: "Professional AI receptionist greeting for Bed Bugs & Beyond. Voice: warm, trustworthy female. Script: 'Thank you for calling Bed Bugs and Beyond, Baldwin County's most trusted pest control experts. We eliminate pests fast, guaranteed. Please hold and one of our specialists will be right with you.' Tone: professional, local, reassuring." },
  { id: "p9",  label: "BB&B Voiceover Ad",         category: "audio", brand: "BB&B", icon: "🎙️", text: "30-second radio-style voiceover ad. Male voice, authoritative but friendly. 'Bed bugs keeping you up at night? Cockroaches taking over your kitchen? Bed Bugs and Beyond is Baldwin County's number one pest control service. Fast response, guaranteed results, local experts. Call today for your free inspection.' Upbeat background music." },
  { id: "p10", label: "AI Edge Testimonial Voice",  category: "audio", brand: "AIE",  icon: "🎙️", text: "AI Edge Solutions client success testimonial narration. Professional female voice, confident and forward-looking. 60 seconds. Emphasize ROI, automation, time saved. Premium calm tone with subtle tech ambiance." },
  { id: "p11", label: "Summer Pest Lead Gen",       category: "ad",   brand: "BB&B", icon: "🚀", text: "BB&B summer pest control campaign | objective: lead generation | audience: homeowners 28–65, Baldwin County AL, 25mi radius | offer: free inspection + 20% off first treatment | CTA: Call Today | platforms: Facebook, Instagram | headline: 'Pest-Free Living Starts Here' | copy: 'Baldwin County's #1 pest control. Fast, effective, guaranteed.' | brand: #00355F / #00AEEF" },
  { id: "p12", label: "AI Edge Brand Awareness",    category: "ad",   brand: "AIE",  icon: "🚀", text: "AI Edge Solutions brand awareness campaign | objective: brand awareness | audience: small business owners 30–55, Gulf Coast AL | offer: free AI business assessment | CTA: Get Your Free Assessment | platforms: Facebook, Google Display, YouTube Shorts | headline: 'Stop Losing Customers to Bigger Competitors' | brand: #00AEEF / #030612" },
];

const COLLECTIONS = [
  { id: "bbb",          label: "Bed Bugs & Beyond", icon: "🐛", color: "#00AEEF", count: 8  },
  { id: "aie",          label: "AI Edge Solutions",  icon: "⚡", color: "#A78BFA", count: 7  },
  { id: "social",       label: "Social Media",       icon: "📱", color: "#F472B6", count: 5  },
  { id: "commercials",  label: "Commercials",        icon: "📺", color: "#FB923C", count: 3  },
  { id: "receptionist", label: "AI Receptionist",    icon: "🤖", color: "#34D399", count: 2  },
  { id: "ads",          label: "Ads",                icon: "🚀", color: "#FBBF24", count: 6  },
  { id: "websites",     label: "Websites",           icon: "🌐", color: "#60A5FA", count: 1  },
];

const ACTIVITY = [
  { id: "r1", icon: "🖼️",  label: "Image created",      detail: "BB&B Summer Pest Ad",        time: "2 hours ago",   color: "#00AEEF" },
  { id: "r2", icon: "🎬",  label: "Video generated",     detail: "AI Edge Hero Video",          time: "5 hours ago",   color: "#A78BFA" },
  { id: "r3", icon: "📋",  label: "Prompt copied",       detail: "BB&B Phone Receptionist",     time: "1 day ago",     color: "#34D399" },
  { id: "r4", icon: "🚀",  label: "Campaign exported",   detail: "Q3 Pest Campaign",            time: "2 days ago",    color: "#FB923C" },
  { id: "r5", icon: "🎨",  label: "Brand updated",       detail: "AI Edge Brand Kit v2",        time: "3 days ago",    color: "#F472B6" },
  { id: "r6", icon: "🎙️", label: "Audio generated",     detail: "AI Receptionist Greeting",    time: "4 days ago",    color: "#34D399" },
  { id: "r7", icon: "🖼️",  label: "Image created",       detail: "Google Display Ad Set",       time: "5 days ago",    color: "#00AEEF" },
  { id: "r8", icon: "📋",  label: "Prompt copied",       detail: "Summer Pest Lead Gen",        time: "6 days ago",    color: "#FBBF24" },
];

const BRAND_ASSETS = {
  logos: [
    { name: "AI Edge Primary",      format: "SVG + PNG", brand: "AIE",  icon: "⚡", size: "0.3 MB" },
    { name: "AI Edge Monogram",     format: "SVG",       brand: "AIE",  icon: "⚡", size: "0.1 MB" },
    { name: "BB&B Primary Logo",    format: "SVG + PNG", brand: "BB&B", icon: "🐛", size: "0.2 MB" },
    { name: "BB&B Icon Only",       format: "PNG",       brand: "BB&B", icon: "🐛", size: "0.1 MB" },
  ],
  palettes: [
    { name: "AI Edge Brand Colors", colors: ["#030612", "#00AEEF", "#C0C0C0", "#FFFFFF"], brand: "AIE" },
    { name: "BB&B Brand Colors",    colors: ["#00355F", "#00AEEF", "#FF6B4A", "#FFFFFF"], brand: "BB&B" },
  ],
  fonts: [
    { name: "Inter",         usage: "Body, UI",      brand: "Both", style: "Sans-serif" },
    { name: "Satoshi",       usage: "Headings",      brand: "AIE",  style: "Sans-serif" },
    { name: "Neue Haas",     usage: "Display",       brand: "AIE",  style: "Sans-serif" },
    { name: "Source Serif",  usage: "Testimonials",  brand: "BB&B", style: "Serif" },
  ],
};

const USAGE_STATS = [
  { label: "Images Generated",  value: "47",        icon: "🖼️",  color: "#00AEEF" },
  { label: "Videos Generated",  value: "12",        icon: "🎬",  color: "#A78BFA" },
  { label: "Audio Generated",   value: "23",        icon: "🎙️", color: "#34D399" },
  { label: "Campaigns Created", value: "9",         icon: "🚀",  color: "#FB923C" },
  { label: "Storage Used",      value: "2.4 GB",    icon: "💾",  color: "#60A5FA" },
  { label: "Most Used Brand",   value: "BB&B",      icon: "🐛",  color: "#FBBF24" },
  { label: "Prompts Copied",    value: "134",       icon: "📋",  color: "#F472B6" },
  { label: "Favorites Saved",   value: "21",        icon: "⭐",  color: "#FCD34D" },
];

// ── Style helpers ─────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  padding: "16px 18px", borderRadius: 12,
  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
};

const labelStyle = (color: string): React.CSSProperties => ({
  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
  background: `${color}18`, border: `1px solid ${color}33`, color,
  textTransform: "uppercase", letterSpacing: "0.5px",
});

const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px",
  color: "#00AEEF", marginBottom: 14,
};

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...card, ...style }}>{children}</div>;
}

function DisabledBtn({ label }: { label: string }) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button disabled style={{
        padding: "8px 16px", borderRadius: 8, cursor: "not-allowed", fontSize: 12, fontWeight: 700,
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", color: "#334155",
        display: "flex", alignItems: "center", gap: 6,
      }}>{label}</button>
      <span style={{
        position: "absolute", top: -7, right: -4, padding: "1px 5px", borderRadius: 3,
        fontSize: 8, fontWeight: 800, letterSpacing: "0.5px",
        background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",
      }}>SOON</span>
    </div>
  );
}

// ── Section: Asset Browser ────────────────────────────────────────────────────
function AssetBrowser({
  assets, search, setSearch, sort, setSort,
  filter, setFilter, viewMode, setViewMode, favorites, toggleFav,
}: {
  assets: Asset[]; search: string; setSearch: (v: string) => void;
  sort: SortKey; setSort: (v: SortKey) => void;
  filter: FilterKey; setFilter: (v: FilterKey) => void;
  viewMode: "grid" | "list"; setViewMode: (v: "grid" | "list") => void;
  favorites: Set<string>; toggleFav: (id: string) => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [copied, setCopied]       = useState<string | null>(null);

  const FILTER_OPTS: { key: FilterKey; label: string; icon: string }[] = [
    { key: "all",       label: "All",       icon: "📁"  },
    { key: "image",     label: "Images",    icon: "🖼️"  },
    { key: "video",     label: "Videos",    icon: "🎬"  },
    { key: "audio",     label: "Audio",     icon: "🎙️" },
    { key: "campaign",  label: "Campaigns", icon: "🚀"  },
    { key: "logo",      label: "Logos",     icon: "🏷️" },
    { key: "brand-kit", label: "Brand Kits",icon: "🎨"  },
    { key: "template",  label: "Templates", icon: "📋"  },
    { key: "favorites", label: "Favorites", icon: "⭐"  },
  ];

  const SORT_OPTS: { key: SortKey; label: string }[] = [
    { key: "newest", label: "Newest" },
    { key: "oldest", label: "Oldest" },
    { key: "name",   label: "Name"   },
    { key: "type",   label: "Type"   },
  ];

  const filtered = useMemo(() => {
    let list = [...assets];
    if (filter === "favorites") list = list.filter(a => favorites.has(a.id));
    else if (filter !== "all")  list = list.filter(a => a.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.tags.some(t => t.includes(q)) ||
        a.brand.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sort === "newest") return b.date.localeCompare(a.date);
      if (sort === "oldest") return a.date.localeCompare(b.date);
      if (sort === "name")   return a.name.localeCompare(b.name);
      if (sort === "type")   return a.type.localeCompare(b.type);
      return 0;
    });
    return list;
  }, [assets, filter, search, sort, favorites]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none" }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search assets, tags, brand…"
            style={{
              width: "100%", padding: "9px 12px 9px 34px", borderRadius: 9, boxSizing: "border-box",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)",
              color: "#E2E8F0", fontSize: 13, outline: "none",
            }}
          />
        </div>

        {/* Sort */}
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)} style={{
          padding: "9px 12px", borderRadius: 9, cursor: "pointer",
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)",
          color: "#E2E8F0", fontSize: 12, outline: "none",
        }}>
          {SORT_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>

        {/* Grid / List toggle */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["grid", "list"] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              width: 34, height: 34, borderRadius: 8, cursor: "pointer", fontSize: 14,
              background: viewMode === m ? "rgba(0,174,239,0.14)" : "rgba(255,255,255,0.03)",
              border: viewMode === m ? "1.5px solid rgba(0,174,239,0.4)" : "1px solid rgba(255,255,255,0.08)",
              color: viewMode === m ? "#00AEEF" : "#475569",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{m === "grid" ? "▦" : "☰"}</button>
          ))}
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTER_OPTS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 700,
            background: filter === f.key ? "rgba(0,174,239,0.14)" : "rgba(255,255,255,0.02)",
            border: filter === f.key ? "1.5px solid rgba(0,174,239,0.45)" : "1px solid rgba(255,255,255,0.07)",
            color: filter === f.key ? "#00AEEF" : "#64748B",
          }}>
            <span>{f.icon}</span>{f.label}
            {f.key !== "all" && f.key !== "favorites" && (
              <span style={{
                background: filter === f.key ? "rgba(0,174,239,0.2)" : "rgba(255,255,255,0.06)",
                borderRadius: 10, padding: "0 5px", fontSize: 9, fontWeight: 800, color: filter === f.key ? "#00AEEF" : "#475569",
              }}>
                {f.key === "image" ? MOCK_ASSETS.filter(a => a.type === "image").length
                  : f.key === "video" ? MOCK_ASSETS.filter(a => a.type === "video").length
                  : f.key === "audio" ? MOCK_ASSETS.filter(a => a.type === "audio").length
                  : f.key === "campaign" ? MOCK_ASSETS.filter(a => a.type === "campaign").length
                  : f.key === "logo" ? MOCK_ASSETS.filter(a => a.type === "logo").length
                  : f.key === "brand-kit" ? MOCK_ASSETS.filter(a => a.type === "brand-kit").length
                  : MOCK_ASSETS.filter(a => a.type === "template").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div style={{ fontSize: 11, color: "#334155" }}>
        {filtered.length} asset{filtered.length !== 1 ? "s" : ""} {filter !== "all" ? `· filtered by ${filter}` : ""}{search ? ` matching "${search}"` : ""}
      </div>

      {/* Asset grid / list */}
      {filtered.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "#334155", fontSize: 13 }}>
          No assets found. Try a different search or filter.
        </div>
      ) : viewMode === "grid" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {filtered.map(a => (
            <AssetCard key={a.id} asset={a} isFav={favorites.has(a.id)} onToggleFav={() => toggleFav(a.id)}
              onPreview={() => setPreviewId(a.id)} mode="grid" />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(a => (
            <AssetCard key={a.id} asset={a} isFav={favorites.has(a.id)} onToggleFav={() => toggleFav(a.id)}
              onPreview={() => setPreviewId(a.id)} mode="list" />
          ))}
        </div>
      )}

      {/* Preview modal */}
      {previewId && (() => {
        const a = assets.find(x => x.id === previewId)!;
        return (
          <div style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(3,6,18,0.88)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }} onClick={() => setPreviewId(null)}>
            <div onClick={e => e.stopPropagation()} style={{
              width: 480, borderRadius: 18,
              background: "linear-gradient(135deg, #0B1629 0%, #060E1E 100%)",
              border: `1.5px solid ${a.color}44`,
              boxShadow: `0 0 40px ${a.color}22`,
              padding: "28px 28px 24px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                  background: `${a.color}14`, border: `1.5px solid ${a.color}33`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
                }}>{a.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#E2E8F0", marginBottom: 4 }}>{a.name}</div>
                  <span style={labelStyle(a.color)}>{a.type}</span>
                </div>
                <button onClick={() => setPreviewId(null)} style={{
                  width: 30, height: 30, borderRadius: "50%", cursor: "pointer",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#64748B", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
                }}>×</button>
              </div>

              {/* Mock preview area */}
              <div style={{
                height: 180, borderRadius: 12, marginBottom: 18,
                background: `linear-gradient(135deg, ${a.color}08 0%, rgba(255,255,255,0.01) 100%)`,
                border: `1px solid ${a.color}18`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                <div style={{ fontSize: 48, filter: `drop-shadow(0 0 16px ${a.color}44)` }}>{a.icon}</div>
                <div style={{ fontSize: 11, color: "#334155" }}>Preview not available — generation coming soon</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16, fontSize: 12 }}>
                {[
                  { label: "Brand", value: a.brand === "BB&B" ? "Bed Bugs & Beyond" : "AI Edge Solutions" },
                  { label: "Type",  value: a.type },
                  { label: "Date",  value: a.date },
                  { label: "Size",  value: a.size },
                ].map(row => (
                  <div key={row.label} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontSize: 10, color: "#475569", marginBottom: 3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{row.label}</div>
                    <div style={{ color: "#CBD5E1", fontWeight: 600 }}>{row.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {a.tags.map(tag => (
                  <span key={tag} style={{ padding: "3px 9px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748B" }}>#{tag}</span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function AssetCard({ asset: a, isFav, onToggleFav, onPreview, mode }: {
  asset: Asset; isFav: boolean; onToggleFav: () => void; onPreview: () => void; mode: "grid" | "list";
}) {
  if (mode === "list") {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 14, padding: "11px 16px", borderRadius: 10,
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        transition: "border-color 0.1s",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: `${a.color}12`, border: `1px solid ${a.color}25`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
        }}>{a.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={labelStyle(a.color)}>{a.type}</span>
            <span style={{ fontSize: 11, color: "#475569" }}>{a.brand === "BB&B" ? "Bed Bugs & Beyond" : "AI Edge Solutions"}</span>
            <span style={{ fontSize: 11, color: "#334155" }}>· {a.date}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          <button onClick={onPreview} style={{
            padding: "5px 11px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700,
            background: `${a.color}10`, border: `1px solid ${a.color}30`, color: a.color,
          }}>Preview</button>
          <button disabled style={{
            padding: "5px 11px", borderRadius: 7, cursor: "not-allowed", fontSize: 11, fontWeight: 700,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "#334155",
          }}>Edit</button>
          <button onClick={onToggleFav} style={{
            width: 30, height: 30, borderRadius: 7, cursor: "pointer",
            background: isFav ? "rgba(252,211,77,0.12)" : "rgba(255,255,255,0.02)",
            border: isFav ? "1px solid rgba(252,211,77,0.35)" : "1px solid rgba(255,255,255,0.07)",
            color: isFav ? "#FCD34D" : "#475569", fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>⭐</button>
        </div>
      </div>
    );
  }

  // grid card
  return (
    <div style={{
      borderRadius: 12, overflow: "hidden",
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
      display: "flex", flexDirection: "column",
    }}>
      {/* Thumbnail */}
      <div style={{
        height: 110, position: "relative",
        background: `linear-gradient(135deg, ${a.color}10 0%, rgba(255,255,255,0.01) 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 38, filter: `drop-shadow(0 0 10px ${a.color}44)` }}>{a.icon}</span>
        {/* Fav button */}
        <button onClick={onToggleFav} style={{
          position: "absolute", top: 7, right: 7,
          width: 26, height: 26, borderRadius: 7, cursor: "pointer",
          background: isFav ? "rgba(252,211,77,0.18)" : "rgba(0,0,0,0.4)",
          border: isFav ? "1px solid rgba(252,211,77,0.4)" : "1px solid rgba(255,255,255,0.1)",
          color: isFav ? "#FCD34D" : "#94A3B8", fontSize: 13,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>⭐</button>
        <span style={{ position: "absolute", top: 7, left: 7, ...labelStyle(a.color) }}>{a.type}</span>
      </div>

      {/* Body */}
      <div style={{ padding: "10px 12px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#E2E8F0", lineHeight: 1.3, minHeight: 32 }}>{a.name}</div>
        <div style={{ fontSize: 10.5, color: "#475569" }}>
          {a.brand === "BB&B" ? "🐛 Bed Bugs & Beyond" : "⚡ AI Edge Solutions"}
        </div>
        <div style={{ fontSize: 10.5, color: "#334155" }}>{a.date} · {a.size}</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {a.tags.slice(0, 2).map(tag => (
            <span key={tag} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "#475569" }}>#{tag}</span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: "auto", paddingTop: 6 }}>
          <button onClick={onPreview} style={{
            flex: 1, padding: "6px 0", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700,
            background: `${a.color}10`, border: `1px solid ${a.color}30`, color: a.color,
          }}>Preview</button>
          <button disabled style={{
            flex: 1, padding: "6px 0", borderRadius: 7, cursor: "not-allowed", fontSize: 11, fontWeight: 600,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "#334155",
          }}>Edit</button>
          <button disabled style={{
            width: 28, borderRadius: 7, cursor: "not-allowed", fontSize: 13,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "#334155",
          }}>🗑</button>
        </div>
      </div>
    </div>
  );
}

// ── Section: Collections ──────────────────────────────────────────────────────
function CollectionsSection() {
  const [active, setActive] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={sectionLabel}>Collections</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {COLLECTIONS.map(c => (
          <button key={c.id} onClick={() => setActive(active === c.id ? null : c.id)} style={{
            padding: "22px 18px", borderRadius: 14, cursor: "pointer", textAlign: "left",
            background: active === c.id
              ? `linear-gradient(135deg, ${c.color}16 0%, ${c.color}08 100%)`
              : "rgba(255,255,255,0.02)",
            border: active === c.id ? `1.5px solid ${c.color}` : "1px solid rgba(255,255,255,0.07)",
            boxShadow: active === c.id ? `0 0 18px ${c.color}18` : "none",
            transition: "all 0.15s",
          }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>{c.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: active === c.id ? "#E2E8F0" : "#CBD5E1", marginBottom: 4 }}>{c.label}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "#475569" }}>{c.count} assets</span>
              {active === c.id && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: `${c.color}20`, border: `1px solid ${c.color}44`, color: c.color }}>ACTIVE</span>}
            </div>
          </button>
        ))}
      </div>
      {active && (
        <Panel>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 22 }}>{COLLECTIONS.find(c => c.id === active)!.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#E2E8F0" }}>{COLLECTIONS.find(c => c.id === active)!.label}</span>
            <span style={{ fontSize: 11, color: "#475569" }}>· {COLLECTIONS.find(c => c.id === active)!.count} assets</span>
          </div>
          <div style={{ fontSize: 12, color: "#334155", padding: "24px 0", textAlign: "center" }}>
            Asset listing per collection available when backend integration is active.
          </div>
        </Panel>
      )}
    </div>
  );
}

// ── Section: Brand Assets ─────────────────────────────────────────────────────
function BrandAssetsSection() {
  const [tab, setTab] = useState<"logos" | "palettes" | "fonts" | "guidelines">("logos");
  const tabs = [
    { key: "logos",      label: "Logos & Icons",    icon: "🏷️" },
    { key: "palettes",   label: "Color Palettes",   icon: "🎨" },
    { key: "fonts",      label: "Typography",       icon: "Aa" },
    { key: "guidelines", label: "Brand Guidelines", icon: "📘" },
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={sectionLabel}>Brand Assets</div>
      <div style={{ display: "flex", gap: 6 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 700,
            background: tab === t.key ? "rgba(0,174,239,0.12)" : "rgba(255,255,255,0.02)",
            border: tab === t.key ? "1.5px solid rgba(0,174,239,0.4)" : "1px solid rgba(255,255,255,0.07)",
            color: tab === t.key ? "#00AEEF" : "#64748B",
          }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === "logos" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {BRAND_ASSETS.logos.map(logo => (
            <Panel key={logo.name}>
              <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, marginBottom: 12 }}>
                {logo.icon}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 4 }}>{logo.name}</div>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}>{logo.format} · {logo.size}</div>
              <DisabledBtn label="⬇ Download" />
            </Panel>
          ))}
        </div>
      )}

      {tab === "palettes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {BRAND_ASSETS.palettes.map(pal => (
            <Panel key={pal.name}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 12 }}>{pal.name}</div>
              <div style={{ display: "flex", gap: 10 }}>
                {pal.colors.map(c => (
                  <div key={c} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 10, background: c, border: "1px solid rgba(255,255,255,0.1)" }} />
                    <span style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>{c}</span>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {tab === "fonts" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {BRAND_ASSETS.fonts.map(font => (
            <Panel key={font.name}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#E2E8F0", marginBottom: 6, letterSpacing: "-0.5px" }}>{font.name}</div>
              <div style={{ fontSize: 11, color: "#00AEEF", fontWeight: 700, marginBottom: 4 }}>{font.style}</div>
              <div style={{ fontSize: 11, color: "#475569" }}>Usage: {font.usage}</div>
              <div style={{ fontSize: 11, color: "#334155", marginTop: 4 }}>Brand: {font.brand}</div>
            </Panel>
          ))}
        </div>
      )}

      {tab === "guidelines" && (
        <Panel>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 8 }}>Brand Guidelines</div>
          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, marginBottom: 16 }}>
            Full brand guidelines documents for AI Edge Solutions and Bed Bugs & Beyond — including logo usage rules, color system, typography scale, voice & tone, and campaign templates.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <DisabledBtn label="📘 AI Edge Guidelines" />
            <DisabledBtn label="📘 BB&B Guidelines" />
          </div>
        </Panel>
      )}
    </div>
  );
}

// ── Section: Prompt Library ───────────────────────────────────────────────────
function PromptLibrarySection() {
  const [search, setSearch]     = useState("");
  const [catFilter, setCatFilter] = useState<"all" | "image" | "video" | "audio" | "ad">("all");
  const [favs, setFavs]         = useState<Set<string>>(new Set());
  const [copied, setCopied]     = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = [...MOCK_PROMPTS];
    if (catFilter !== "all") list = list.filter(p => p.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.label.toLowerCase().includes(q) || p.text.toLowerCase().includes(q));
    }
    return list;
  }, [search, catFilter]);

  function toggleFav(id: string) {
    setFavs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function copyPrompt(p: Prompt) {
    navigator.clipboard.writeText(p.text).catch(() => {});
    setCopied(p.id);
    setTimeout(() => setCopied(null), 2000);
  }

  const CAT_COLORS: Record<string, string> = { image: "#00AEEF", video: "#A78BFA", audio: "#34D399", ad: "#FB923C" };
  const CAT_OPTS = [
    { key: "all",   label: "All",    icon: "📋" },
    { key: "image", label: "Image",  icon: "🖼️" },
    { key: "video", label: "Video",  icon: "🎬" },
    { key: "audio", label: "Audio",  icon: "🎙️" },
    { key: "ad",    label: "Ad",     icon: "🚀" },
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={sectionLabel}>Prompt Library</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none" }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search prompts…"
            style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 9, boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)", color: "#E2E8F0", fontSize: 13, outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {CAT_OPTS.map(o => (
            <button key={o.key} onClick={() => setCatFilter(o.key)} style={{
              display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700,
              background: catFilter === o.key ? `${CAT_COLORS[o.key] ?? "#00AEEF"}14` : "rgba(255,255,255,0.02)",
              border: catFilter === o.key ? `1.5px solid ${CAT_COLORS[o.key] ?? "#00AEEF"}55` : "1px solid rgba(255,255,255,0.07)",
              color: catFilter === o.key ? (CAT_COLORS[o.key] ?? "#00AEEF") : "#64748B",
            }}><span>{o.icon}</span>{o.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(p => (
          <Panel key={p.id}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: `${CAT_COLORS[p.category]}12`, border: `1px solid ${CAT_COLORS[p.category]}28`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
              }}>{p.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{p.label}</span>
                  <span style={labelStyle(CAT_COLORS[p.category])}>{p.category}</span>
                  <span style={{ fontSize: 10, color: "#334155" }}>{p.brand === "BB&B" ? "🐛 BB&B" : "⚡ AIE"}</span>
                </div>
                <div style={{
                  fontSize: 11.5, color: "#64748B", lineHeight: 1.6,
                  maxHeight: 52, overflow: "hidden",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                }}>
                  {p.text}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => copyPrompt(p)} style={{
                  padding: "6px 12px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700,
                  background: copied === p.id ? "rgba(34,197,94,0.1)" : `${CAT_COLORS[p.category]}10`,
                  border: copied === p.id ? "1px solid rgba(34,197,94,0.35)" : `1px solid ${CAT_COLORS[p.category]}30`,
                  color: copied === p.id ? "#22C55E" : CAT_COLORS[p.category],
                  transition: "all 0.15s",
                }}>{copied === p.id ? "✓ Copied" : "📋 Copy"}</button>
                <button onClick={() => toggleFav(p.id)} style={{
                  width: 30, height: 30, borderRadius: 7, cursor: "pointer",
                  background: favs.has(p.id) ? "rgba(252,211,77,0.12)" : "rgba(255,255,255,0.02)",
                  border: favs.has(p.id) ? "1px solid rgba(252,211,77,0.35)" : "1px solid rgba(255,255,255,0.07)",
                  color: favs.has(p.id) ? "#FCD34D" : "#475569", fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>⭐</button>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

// ── Section: AI Usage Panel ───────────────────────────────────────────────────
function UsagePanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={sectionLabel}>AI Usage Statistics</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {USAGE_STATS.map(s => (
          <Panel key={s.label}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: `${s.color}14`, border: `1px solid ${s.color}28`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
              }}>{s.icon}</div>
              <div style={{ fontSize: 10.5, color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.3 }}>{s.label}</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.color, letterSpacing: "-0.5px" }}>{s.value}</div>
            <div style={{ height: 3, borderRadius: 2, marginTop: 10, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.random() * 60 + 30}%`, background: `linear-gradient(90deg, ${s.color}88, ${s.color})`, borderRadius: 2 }} />
            </div>
          </Panel>
        ))}
      </div>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 14 }}>Monthly Generation Breakdown</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Images",    value: 47, max: 60, color: "#00AEEF" },
            { label: "Videos",    value: 12, max: 60, color: "#A78BFA" },
            { label: "Audio",     value: 23, max: 60, color: "#34D399" },
            { label: "Campaigns", value:  9, max: 60, color: "#FB923C" },
          ].map(row => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 72, fontSize: 11.5, color: "#64748B", fontWeight: 600, flexShrink: 0 }}>{row.label}</div>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(row.value / row.max) * 100}%`, background: `linear-gradient(90deg, ${row.color}66, ${row.color})`, borderRadius: 4, transition: "width 0.4s" }} />
              </div>
              <div style={{ width: 28, fontSize: 12, fontWeight: 700, color: row.color, textAlign: "right", flexShrink: 0 }}>{row.value}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ── Section: Recent Activity ──────────────────────────────────────────────────
function RecentActivitySection() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={sectionLabel}>Recent Activity</div>
      <Panel>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {ACTIVITY.map((item, i) => (
            <div key={item.id} style={{
              display: "flex", alignItems: "flex-start", gap: 14,
              paddingBottom: i < ACTIVITY.length - 1 ? 16 : 0,
              marginBottom: i < ACTIVITY.length - 1 ? 16 : 0,
              borderBottom: i < ACTIVITY.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, flexShrink: 0 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: `${item.color}14`, border: `1px solid ${item.color}28`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                }}>{item.icon}</div>
                {i < ACTIVITY.length - 1 && <div style={{ width: 1, flex: 1, minHeight: 12, background: "rgba(255,255,255,0.05)", margin: "4px 0" }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#CBD5E1", marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 11.5, color: "#475569", marginBottom: 3 }}>{item.detail}</div>
                <div style={{ fontSize: 10.5, color: "#334155" }}>🕐 {item.time}</div>
              </div>
              <span style={labelStyle(item.color)}>{item.label.split(" ")[0]}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AssetLibraryPage() {
  const { colors: t } = useTheme();

  // Browser state
  const [search,   setSearch]   = useState("");
  const [sort,     setSort]     = useState<SortKey>("newest");
  const [filter,   setFilter]   = useState<FilterKey>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [favorites, setFavorites] = useState<Set<string>>(new Set(["a1", "a3"]));
  const [activeSection, setActiveSection] = useState<Section>("browser");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showNewCollection, setShowNewCollection] = useState(false);

  function toggleFav(id: string) {
    setFavorites(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const totalImages    = MOCK_ASSETS.filter(a => a.type === "image").length;
  const totalVideos    = MOCK_ASSETS.filter(a => a.type === "video").length;
  const totalAudio     = MOCK_ASSETS.filter(a => a.type === "audio").length;
  const totalCampaigns = MOCK_ASSETS.filter(a => a.type === "campaign").length;
  const totalBrand     = MOCK_ASSETS.filter(a => a.type === "logo" || a.type === "brand-kit").length;

  const SECTIONS: { key: Section; label: string; icon: string }[] = [
    { key: "browser",     label: "Asset Browser",     icon: "📁" },
    { key: "collections", label: "Collections",       icon: "🗂️" },
    { key: "brand",       label: "Brand Assets",      icon: "🎨" },
    { key: "prompts",     label: "Prompt Library",    icon: "📋" },
    { key: "usage",       label: "AI Usage",          icon: "📊" },
    { key: "activity",    label: "Recent Activity",   icon: "🕐" },
  ];

  const DASH_STATS = [
    { label: "Total Assets",  value: MOCK_ASSETS.length,     icon: "📁", color: "#00AEEF" },
    { label: "Images",        value: totalImages,             icon: "🖼️", color: "#00AEEF" },
    { label: "Videos",        value: totalVideos,             icon: "🎬", color: "#A78BFA" },
    { label: "Audio",         value: totalAudio,              icon: "🎙️",color: "#34D399" },
    { label: "Campaigns",     value: totalCampaigns,          icon: "🚀", color: "#FB923C" },
    { label: "Brand Assets",  value: totalBrand,              icon: "🎨", color: "#F472B6" },
    { label: "Favorites",     value: favorites.size,          icon: "⭐", color: "#FCD34D" },
  ];

  return (
    <AppShell>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg, rgba(0,174,239,0.2) 0%, rgba(192,192,192,0.15) 100%)",
            border: "1.5px solid rgba(0,174,239,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
          }}>📁</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#E2E8F0", lineHeight: 1.1 }}>Asset Library</h1>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 3 }}>
              Centralized media repository — images, video, audio, campaigns & brand assets
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{
              padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.25)", color: "#00AEEF",
            }}>FRONTEND PREVIEW</span>
          </div>
        </div>
      </div>

      {/* Dashboard Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginBottom: 24 }}>
        {DASH_STATS.map(s => (
          <div key={s.label} onClick={() => { if (s.label === "Favorites") { setFilter("favorites"); setActiveSection("browser"); } }} style={{
            padding: "14px 12px", borderRadius: 12, cursor: s.label === "Favorites" ? "pointer" : "default",
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
            transition: "border-color 0.15s",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              <span style={{ fontSize: 9.5, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.2 }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        <DisabledBtn label="⬆ Upload Asset" />
        <DisabledBtn label="📥 Import Media" />
        <button onClick={() => setShowNewCollection(v => !v)} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
          background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.25)", color: "#00AEEF",
        }}>📂 Create Folder</button>
        <button onClick={() => setShowNewCollection(v => !v)} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
          background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.25)", color: "#00AEEF",
        }}>🗂️ New Collection</button>
      </div>

      {/* New Collection inline form */}
      {showNewCollection && (
        <div style={{ marginBottom: 20, padding: "14px 16px", borderRadius: 10, background: "rgba(0,174,239,0.05)", border: "1px solid rgba(0,174,239,0.2)", display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={newCollectionName} onChange={e => setNewCollectionName(e.target.value)}
            placeholder="Collection name…"
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: "rgba(0,174,239,0.06)", border: "1px solid rgba(0,174,239,0.25)", color: "#E2E8F0", fontSize: 13, outline: "none" }}
          />
          <button onClick={() => { setShowNewCollection(false); setNewCollectionName(""); }} style={{
            padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
            background: "rgba(0,174,239,0.1)", border: "1.5px solid rgba(0,174,239,0.35)", color: "#00AEEF",
          }}>+ Create</button>
          <button onClick={() => setShowNewCollection(false)} style={{
            padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748B",
          }}>Cancel</button>
        </div>
      )}

      {/* Section tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 22, flexWrap: "wrap" }}>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setActiveSection(s.key)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700,
            background: activeSection === s.key ? "rgba(0,174,239,0.12)" : "rgba(255,255,255,0.02)",
            border: activeSection === s.key ? "1.5px solid rgba(0,174,239,0.45)" : "1px solid rgba(255,255,255,0.07)",
            color: activeSection === s.key ? "#00AEEF" : "#64748B",
          }}>
            <span>{s.icon}</span>{s.label}
          </button>
        ))}
      </div>

      {/* Active section */}
      {activeSection === "browser" && (
        <AssetBrowser
          assets={MOCK_ASSETS} search={search} setSearch={setSearch}
          sort={sort} setSort={setSort} filter={filter} setFilter={setFilter}
          viewMode={viewMode} setViewMode={setViewMode}
          favorites={favorites} toggleFav={toggleFav}
        />
      )}
      {activeSection === "collections" && <CollectionsSection />}
      {activeSection === "brand"       && <BrandAssetsSection />}
      {activeSection === "prompts"     && <PromptLibrarySection />}
      {activeSection === "usage"       && <UsagePanel />}
      {activeSection === "activity"    && <RecentActivitySection />}
    </AppShell>
  );
}
