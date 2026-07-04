import { useState, useEffect, useCallback } from "react";

type Platform = "apple" | "bing" | "nextdoor";

interface PlatformConfig {
  label: string;
  accentColor: string;
  accentRgb: string;
  cadenceDays: number;
  cadenceLabel: string;
  dashboardUrl: string;
  dashboardLabel: string;
  captions: string[];
  steps: { num: number; title: string; detail: string }[];
  tips: string[];
}

const CONFIGS: Record<Platform, PlatformConfig> = {
  apple: {
    label: "Apple Business Connect",
    accentColor: "#A2AAAD",
    accentRgb: "162,170,173",
    cadenceDays: 7,
    cadenceLabel: "1-2x per week",
    dashboardUrl: "https://businessconnect.apple.com",
    dashboardLabel: "Open Apple Business Connect",
    captions: [
      "Baldwin County's trusted pest control. Bed Bugs & Beyond removes bed bugs, wasps & mosquitoes. Fast response, local experts. Call (251) 324-9090 or visit bedbugsandbeyond.net",
      "Bed bug problem? Call Bed Bugs & Beyond -- licensed local experts serving Foley, Gulf Shores & Fairhope. Guaranteed removal. (251) 324-9090 | bedbugsandbeyond.net",
      "Mosquito control, bed bug removal & more. Bed Bugs & Beyond serves all of Baldwin County, AL. Locally owned, locally trusted. Call (251) 324-9090",
      "Pest control you can trust in Baldwin County. Bed Bugs & Beyond -- heat treatment, inspections & fast service. Call (251) 324-9090",
      "Gulf Shores & Foley pest control experts. Bed Bugs & Beyond handles bed bugs, wasps, mosquitoes & more. Schedule today: (251) 324-9090",
    ],
    steps: [
      { num: 1, title: "Sign in", detail: "Go to businessconnect.apple.com and sign in with your Apple ID." },
      { num: 2, title: "Select your location", detail: "Choose the Bed Bugs & Beyond location from your dashboard." },
      { num: 3, title: "Open Showcases", detail: 'Click "Showcases" in the left sidebar.' },
      { num: 4, title: "Create new Showcase", detail: 'Click "+ New Showcase" and pick a category -- Promotion, Update, or Announcement.' },
      { num: 5, title: "Add your caption", detail: "Paste the generated caption into the description field. Keep it under 500 characters for best display in Siri/Maps." },
      { num: 6, title: "Add a photo", detail: "Upload a photo if available (recommended: 1000x600 px minimum, JPG or PNG)." },
      { num: 7, title: "Set dates", detail: "Set a start date (today). End date is optional -- 7-14 days works well." },
      { num: 8, title: "Publish", detail: "Click Publish. The Showcase becomes visible on Apple Maps and in Siri results immediately." },
      { num: 9, title: "Mark as posted", detail: 'Hit "Mark as Posted" below so the tracker updates your next recommended date.' },
    ],
    tips: [
      "Showcases appear directly on your Apple Maps listing card -- keep captions concise and action-oriented.",
      "Include your phone number so Siri can dial it directly from the listing.",
      "Rotate between Promotion and Update categories to keep content fresh.",
    ],
  },

  bing: {
    label: "Bing Places for Business",
    accentColor: "#00ADEF",
    accentRgb: "0,173,239",
    cadenceDays: 7,
    cadenceLabel: "1-2x per week",
    dashboardUrl: "https://www.bingplaces.com",
    dashboardLabel: "Open Bing Places",
    captions: [
      "Pest control Baldwin County AL -- Bed Bugs & Beyond. Licensed local exterminators serving Foley, Gulf Shores, Orange Beach, Fairhope, Daphne & Spanish Fort. Fast response. Call (251) 324-9090.",
      "Bed bug exterminator Gulf Shores AL | Bed Bugs & Beyond offers heat treatment, inspections & guaranteed removal. Baldwin County's trusted pest control. (251) 324-9090 | bedbugsandbeyond.net",
      "Mosquito control Foley AL | Bed Bugs & Beyond -- seasonal mosquito barrier treatments, wasp removal & more. Serving all of Baldwin County. Call (251) 324-9090.",
      "Wasp nest removal Baldwin County AL | Licensed pest control technicians. Bed Bugs & Beyond -- same-day service available. bedbugsandbeyond.net | (251) 324-9090.",
      "Bed bug inspection & heat treatment Orange Beach AL | Bed Bugs & Beyond. Certified specialists. Free quote available. Call (251) 324-9090.",
    ],
    steps: [
      { num: 1, title: "Sign in to Bing Places", detail: "Go to bingplaces.com and sign in with your Microsoft account." },
      { num: 2, title: "Select your listing", detail: "Click on the Bed Bugs & Beyond listing from your dashboard." },
      { num: 3, title: "Update Business Description", detail: "Go to Business Info and edit the Business Description using the caption below as your SEO-rich text. Focus on keywords like pest control, Baldwin County, and your city list." },
      { num: 4, title: "Add or update Services", detail: "Under Services, ensure these are listed: Bed Bug Inspection, Bed Bug Heat Treatment, Mosquito Control, Wasp Removal, Pest Control." },
      { num: 5, title: "Upload a photo (optional)", detail: "Add a new photo under Photos. Bing Maps shows photos prominently -- 1200x800 px preferred." },
      { num: 6, title: "Save changes", detail: "Click Save and confirm. Changes typically go live within 3-5 business days." },
      { num: 7, title: "Note on Posts", detail: "Bing Places does not have a traditional Posts feature like Google. SEO impact comes from description freshness, categories, and Google sync." },
      { num: 8, title: "Mark as posted", detail: 'Hit "Mark as Posted" below so the tracker updates your next recommended update date.' },
    ],
    tips: [
      "Bing is synced from your Google Business Profile -- keep GBP up to date and Bing inherits most changes automatically.",
      "Bing Places description updates are your primary SEO lever here -- refresh with keyword-rich copy weekly.",
      "Microsoft Copilot AI now surfaces Bing Places data -- accurate, keyword-rich descriptions help Copilot recommend your business.",
    ],
  },

  nextdoor: {
    label: "Nextdoor Business",
    accentColor: "#8DC641",
    accentRgb: "141,198,65",
    cadenceDays: 4,
    cadenceLabel: "2-3x per week",
    dashboardUrl: "https://business.nextdoor.com",
    dashboardLabel: "Open Nextdoor Business",
    captions: [
      "Neighbors! Mosquito season is here. Bed Bugs & Beyond is your local pest control team serving all of Baldwin County -- Foley, Gulf Shores, Fairhope & more. Give us a call: (251) 324-9090.",
      "Hey Gulf Shores neighbors! Found a wasp nest you can't reach? We remove them safely and fast. Locally owned and operated -- Bed Bugs & Beyond. Call us: (251) 324-9090.",
      "Heads up from your local pest control team. Bed bug season picks up in summer -- if you notice any signs, don't wait! Bed Bugs & Beyond serves Baldwin County with fast, guaranteed treatment. (251) 324-9090",
      "Foley neighbors -- hosting guests this summer? Make sure your home is pest-free! Bed Bugs & Beyond offers inspections and same-day service. bedbugsandbeyond.net | (251) 324-9090",
      "Daphne & Fairhope community: Bed Bugs & Beyond is your neighborhood pest control team. We handle mosquitoes, bed bugs & more with safe, effective treatments. Call (251) 324-9090 anytime.",
    ],
    steps: [
      { num: 1, title: "Sign in to Nextdoor Business", detail: "Go to business.nextdoor.com and sign in with your email." },
      { num: 2, title: "Go to Posts", detail: "Click Posts in the top navigation bar." },
      { num: 3, title: "Create a post", detail: "Click Create a post (blue button, top right)." },
      { num: 4, title: "Choose post type", detail: "Select Business Update or Announcement -- Announcements get higher neighborhood reach." },
      { num: 5, title: "Paste your caption", detail: "Copy the caption below and paste it into the post body. You can lightly edit to personalize." },
      { num: 6, title: "Add a photo (recommended)", detail: "Upload a photo -- posts with images get 2-3x more engagement. Recommended size: 1200x628 px." },
      { num: 7, title: "Select neighborhoods", detail: "Choose all relevant neighborhoods: Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Spanish Fort." },
      { num: 8, title: "Post", detail: "Click Post. Your update will appear in the selected neighborhoods' feeds immediately." },
      { num: 9, title: "Mark as posted", detail: 'Hit "Mark as Posted" below so the tracker updates your next recommended date.' },
    ],
    tips: [
      "Posts with a local callout (Hey neighbors!) get more engagement than generic ads.",
      "Posting 2-3x per week keeps you in the neighborhood feed consistently -- don't post more than once per day.",
      "Enable Business Recommendations so satisfied customers can recommend you directly on your Nextdoor page.",
    ],
  },
};

const LS_KEY = (platform: Platform) => `lpe_publishing_${platform}`;

interface PostRecord {
  date: string;
  caption: string;
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

interface PublishingHubTabProps {
  platform: Platform;
}

export function PublishingHubTab({ platform }: PublishingHubTabProps) {
  const cfg = CONFIGS[platform];
  const [captionIdx, setCaptionIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [marked, setMarked] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [history, setHistory] = useState<PostRecord[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY(platform));
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, [platform]);

  const lastPosted = history.length > 0 ? new Date(history[history.length - 1].date) : null;
  const nextDue = lastPosted ? addDays(lastPosted, cfg.cadenceDays) : new Date();
  const daysUntilDue = lastPosted ? daysBetween(new Date(), nextDue) : 0;
  const isDue = daysUntilDue <= 0;
  const isDueSoon = daysUntilDue === 1;

  const caption = cfg.captions[captionIdx];

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(caption).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, [caption]);

  const handleNextCaption = useCallback(() => {
    setCaptionIdx(i => (i + 1) % cfg.captions.length);
  }, [cfg.captions.length]);

  const handleMarkPosted = useCallback(() => {
    const record: PostRecord = { date: new Date().toISOString(), caption };
    const next = [...history, record].slice(-10);
    setHistory(next);
    setMarked(true);
    setTimeout(() => setMarked(false), 2500);
    try {
      localStorage.setItem(LS_KEY(platform), JSON.stringify(next));
    } catch {}
  }, [history, caption, platform]);

  const accent = cfg.accentColor;
  const accentAlpha = (a: number) => `rgba(${cfg.accentRgb},${a})`;

  const statusColor  = isDue ? "#22C55E" : isDueSoon ? "#F59E0B" : "#64748B";
  const statusBg     = isDue ? "rgba(34,197,94,0.10)"   : isDueSoon ? "rgba(245,158,11,0.10)"  : "rgba(100,116,139,0.07)";
  const statusBorder = isDue ? "rgba(34,197,94,0.25)"   : isDueSoon ? "rgba(245,158,11,0.2)"   : "rgba(100,116,139,0.15)";
  const statusLabel  = isDue
    ? (lastPosted ? "Post Due -- Time to publish!" : "No posts yet -- post today!")
    : isDueSoon ? "Post due tomorrow"
    : `Next post in ${daysUntilDue} days`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Cadence Status Banner */}
      <div style={{
        padding: "12px 16px", borderRadius: 10,
        background: statusBg, border: `1px solid ${statusBorder}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            display: "inline-block", width: 9, height: 9, borderRadius: "50%",
            background: statusColor, boxShadow: `0 0 8px ${statusColor}`,
          }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{statusLabel}</div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
              Cadence: {cfg.cadenceLabel}&nbsp;&nbsp;
              {lastPosted
                ? `Last posted: ${formatDate(lastPosted)}`
                : "No posting history yet"}
            </div>
          </div>
        </div>
        <div style={{
          fontSize: 11.5, fontWeight: 600, color: accent, padding: "5px 10px",
          borderRadius: 7, background: accentAlpha(0.08), border: `1px solid ${accentAlpha(0.2)}`,
        }}>
          Due: {formatDate(nextDue)}
        </div>
      </div>

      {/* Caption Generator */}
      <div style={{
        borderRadius: 12, background: "rgba(255,255,255,0.025)",
        border: `1px solid ${accentAlpha(0.18)}`,
        overflow: "hidden",
      }}>
        <div style={{
          padding: "11px 16px", background: accentAlpha(0.06),
          borderBottom: `1px solid ${accentAlpha(0.12)}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>&#x270D;</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#CBD5E1" }}>Generated Caption</span>
            <span style={{
              fontSize: 10.5, padding: "2px 7px", borderRadius: 5,
              background: accentAlpha(0.12), color: accent, fontWeight: 600,
            }}>
              {captionIdx + 1} / {cfg.captions.length}
            </span>
          </div>
          <button
            onClick={handleNextCaption}
            style={{
              fontSize: 11.5, fontWeight: 600, color: accent, padding: "4px 10px",
              borderRadius: 6, background: accentAlpha(0.1), border: `1px solid ${accentAlpha(0.25)}`,
              cursor: "pointer",
            }}
          >
            Next Caption &rarr;
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{
            fontSize: 13.5, color: "#E2E8F0", lineHeight: 1.65,
            background: "rgba(0,0,0,0.15)", borderRadius: 9,
            padding: "14px 16px", border: "1px solid rgba(255,255,255,0.05)",
            whiteSpace: "pre-wrap", userSelect: "text",
          }}>
            {caption}
          </div>

          <div style={{ marginTop: 4, display: "flex", justifyContent: "flex-end" }}>
            <span style={{ fontSize: 10.5, color: "#475569" }}>
              {caption.length} characters
            </span>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button
              onClick={handleCopy}
              style={{
                flex: 1, minWidth: 120,
                fontSize: 12.5, fontWeight: 700,
                padding: "10px 16px", borderRadius: 8,
                background: copied ? "rgba(34,197,94,0.15)" : accentAlpha(0.12),
                color: copied ? "#22C55E" : accent,
                border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : accentAlpha(0.3)}`,
                cursor: "pointer", transition: "all 0.2s",
              }}
            >
              {copied ? "Copied!" : "Copy Caption"}
            </button>
            <button
              onClick={handleMarkPosted}
              style={{
                flex: 1, minWidth: 120,
                fontSize: 12.5, fontWeight: 700,
                padding: "10px 16px", borderRadius: 8,
                background: marked ? "rgba(34,197,94,0.25)" : "rgba(34,197,94,0.12)",
                color: "#22C55E",
                border: "1px solid rgba(34,197,94,0.28)",
                cursor: "pointer", transition: "all 0.2s",
              }}
            >
              {marked ? "Marked!" : "Mark as Posted"}
            </button>
          </div>
        </div>
      </div>

      {/* Platform Tips */}
      <div style={{
        borderRadius: 10, padding: "12px 14px",
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.06em", marginBottom: 8, textTransform: "uppercase" }}>
          Platform Tips
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {cfg.tips.map((tip, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <span style={{ color: accent, fontSize: 12, marginTop: 1, flexShrink: 0 }}>&rsaquo;</span>
              <span style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.55 }}>{tip}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step-by-Step Instructions */}
      <div style={{
        borderRadius: 12, overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <button
          onClick={() => setShowInstructions(p => !p)}
          style={{
            width: "100%", padding: "12px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "rgba(255,255,255,0.03)", border: "none", cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13 }}>&#x1F4CB;</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#CBD5E1" }}>
              Step-by-Step: How to Post on {cfg.label}
            </span>
          </div>
          <span style={{ fontSize: 12, color: "#475569" }}>{showInstructions ? "Hide" : "Show"}</span>
        </button>

        {showInstructions && (
          <div style={{ padding: "4px 16px 16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {cfg.steps.map((step) => (
                <div
                  key={step.num}
                  style={{
                    display: "flex", gap: 12, alignItems: "flex-start",
                    padding: "10px 13px", borderRadius: 9,
                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                    background: accentAlpha(0.12), border: `1px solid ${accentAlpha(0.3)}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, color: accent,
                  }}>
                    {step.num}
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#CBD5E1", marginBottom: 3 }}>
                      {step.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.55 }}>
                      {step.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, textAlign: "center" }}>
              <a
                href={cfg.dashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  fontSize: 12.5, fontWeight: 700, color: accent,
                  padding: "9px 20px", borderRadius: 8,
                  background: accentAlpha(0.1), border: `1px solid ${accentAlpha(0.3)}`,
                  textDecoration: "none",
                }}
              >
                {cfg.dashboardLabel} &#x2197;
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Post History */}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.06em", marginBottom: 10, textTransform: "uppercase" }}>
            Recent Posts
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[...history].reverse().slice(0, 5).map((r, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 13px", borderRadius: 9,
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                  display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "start",
                }}
              >
                <div style={{
                  fontSize: 10.5, fontWeight: 700, color: "#475569",
                  paddingTop: 2, whiteSpace: "nowrap",
                }}>
                  {formatDate(new Date(r.date))}
                </div>
                <div style={{
                  fontSize: 11.5, color: "#64748B", lineHeight: 1.5,
                  overflow: "hidden", display: "-webkit-box",
                  WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                }}>
                  {r.caption}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
