import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useTheme } from "@/contexts/theme-context";
import { useApiFetch } from "@/lib/api";

type Studio = "image" | "video" | "audio" | "ad" | "integrations";
type Brand  = "bbb" | "aie";
type ProjectStatus = "Draft" | "In Progress" | "Complete";

interface MediaProject {
  id: string;
  name: string;
  type: Studio;
  status: ProjectStatus;
  brand: Brand;
  createdAt: Date;
}

interface BrandKitData {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  tone: string;
  industry: string;
}

interface StudioSeed {
  prompt?: string;
  format?: "social" | "ad" | "banner";
  style?: string;
  videoType?: string;
  duration?: number;
  audioType?: string;
  voice?: string;
  script?: string;
  adGoal?: string;
}

type TemplateCategory = "Social Post" | "Facebook Ad" | "Instagram Ad" | "Commercial Video" | "AI Receptionist Greeting" | "Voiceover Ad";

interface TemplatePreset {
  id: string;
  name: string;
  category: TemplateCategory;
  brand: Brand | "both";
  studio: Studio;
  desc: string;
  seed: StudioSeed;
}

const STUDIOS: { id: Studio; icon: string; label: string; tagline: string; accent: string; bg: string; features: string[] }[] = [
  {
    id: "image", icon: "🖼️", label: "Image Studio",  tagline: "Branded graphics & ad creatives", accent: "#00AEEF", bg: "#071828",
    features: ["Social graphics (1080×1080)", "Ad creatives (1200×628)", "Brand kit integration", "PNG / JPG / SVG export"],
  },
  {
    id: "video", icon: "🎬", label: "Video Studio",  tagline: "Short-form video & social ads",    accent: "#A78BFA", bg: "#120A28",
    features: ["Reels, stories & social ads", "Scene-by-scene builder", "Music & transitions", "MP4 HD / 4K export"],
  },
  {
    id: "audio", icon: "🎙️", label: "Audio Studio",  tagline: "Voiceovers, greetings & ad audio", accent: "#34D399", bg: "#071A12",
    features: ["AI receptionist greetings", "6 Polly voice options", "Script editor w/ timing", "MP3 / WAV export"],
  },
  {
    id: "ad",    icon: "🚀", label: "Ad Creator",    tagline: "Full campaign from media assets",  accent: "#FB923C", bg: "#1E0C04",
    features: ["Campaign brief builder", "Multi-platform selector", "Asset builder + copy", "Campaign prompt export"],
  },
  {
    id: "integrations", icon: "🔌", label: "AI Integrations", tagline: "Connect AI providers & ad platforms", accent: "#00AEEF", bg: "#030D1A",
    features: ["OpenAI · Runway · ElevenLabs", "Meta & Google Ads export", "Generation pipeline preview", "Coming Soon — Next release"],
  },
];

// ── Image Studio ──────────────────────────────────────────────────────────────
function ImageStudio({ t, seed }: { t: ReturnType<typeof useTheme>["colors"]; seed?: StudioSeed }) {
  const [format, setFormat] = useState<"social" | "ad" | "banner">(seed?.format ?? "social");
  const [style, setStyle]   = useState(seed?.style ?? "modern");
  const apiFetch = useApiFetch();
  const [imageReady, setImageReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const generationKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  // MEDIA_STUDIO_IMAGE_EXECUTION_V2: fail closed unless the authenticated
  // server readiness boundary proves the image provider is explicitly enabled.
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ readiness?: { capabilities?: { image?: boolean } } }>("/media-generation/readiness")
      .then(result => { if (!cancelled) setImageReady(result.readiness?.capabilities?.image === true); })
      .catch(() => { if (!cancelled) setImageReady(false); });
    return () => { cancelled = true; };
  }, [apiFetch]);

  // Prompt Builder fields
  const [goal,     setGoal]     = useState(seed?.prompt ? "" : "");
  const [audience, setAudience] = useState("");
  const [offer,    setOffer]    = useState("");
  const [service,  setService]  = useState("");
  const [location, setLocation] = useState("");
  const [cta,      setCta]      = useState("");
  const [copied,   setCopied]   = useState(false);

  const formats = [
    { id: "social", label: "Social Graphic", size: "1080×1080" },
    { id: "ad",     label: "Ad Creative",    size: "1200×628"  },
    { id: "banner", label: "Banner",          size: "1920×600"  },
  ] as const;

  const styles = ["Modern", "Minimal", "Bold", "Corporate", "Playful", "Luxury"];

  const formatMeta: Record<string, string> = {
    social: "1080×1080 square (social graphic)",
    ad:     "1200×628 landscape (ad creative)",
    banner: "1920×600 wide (banner)",
  };

  // Build a polished prompt from builder fields
  const parts: string[] = [];
  if (service)  parts.push(service);
  if (goal)     parts.push(`campaign goal: ${goal}`);
  if (audience) parts.push(`targeting ${audience}`);
  if (offer)    parts.push(offer);
  if (location) parts.push(`in ${location}`);
  if (cta)      parts.push(`CTA: "${cta}"`);
  parts.push(`${style} visual style`);
  parts.push(`formatted for ${formatMeta[format]}`);
  parts.push("professional, brand-consistent, high quality");

  // Fall back to seed prompt if builder is empty
  const hasBuilderInput = goal || audience || offer || service || location || cta;
  const generatedPrompt = hasBuilderInput
    ? parts.join(", ")
    : (seed?.prompt ?? "Fill in the Prompt Builder fields below to generate your image prompt.");

  function copyPrompt() {
    if (!hasBuilderInput && !seed?.prompt) return;
    navigator.clipboard.writeText(generatedPrompt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function generateImage() {
    if (!imageReady || (!hasBuilderInput && !seed?.prompt) || generating) return;
    setGenerating(true);
    setGenerationError(null);
    try {
      const size = format === "social" ? "1024x1024" : "1536x1024";
      const fingerprint = `${size}:${generatedPrompt}`;
      if (!generationKeyRef.current || generationKeyRef.current.fingerprint !== fingerprint) {
        generationKeyRef.current = {
          fingerprint,
          key: `media-studio:${crypto.randomUUID()}`,
        };
      }
      const generated = await apiFetch<{ generationId: string }>("/auto-content/generate-image", {
        method: "POST",
        body: JSON.stringify({
          prompt: generatedPrompt,
          size,
          idempotencyKey: generationKeyRef.current.key,
        }),
      });
      const access = await apiFetch<{ signedUrl: string }>(
        `/auto-content/generate-image/${generated.generationId}/signed-url`,
      );
      setGeneratedImageUrl(access.signedUrl);
    } catch (error) {
      setGeneratedImageUrl(null);
      setGenerationError(error instanceof Error ? error.message : "Image generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const placeholders = [
    { label: "Logo + Brand Colors", icon: "🎨", desc: "Consistent brand identity" },
    { label: "CTA Overlay",         icon: "📣", desc: "Drives click-through" },
    { label: "Product Showcase",     icon: "📦", desc: "Highlight your service" },
    { label: "Testimonial Card",     icon: "⭐", desc: "Social proof creative" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Generated Prompt Preview (full width) ── */}
      <div style={{
        padding: "18px 20px", borderRadius: 12,
        background: "linear-gradient(135deg, rgba(0,174,239,0.07) 0%, rgba(0,174,239,0.03) 100%)",
        border: "1.5px solid rgba(0,174,239,0.28)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14 }}>✨</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#00AEEF", textTransform: "uppercase", letterSpacing: "0.7px" }}>
            Generated Image Prompt
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={copyPrompt}
            disabled={!hasBuilderInput && !seed?.prompt}
            title="Copy prompt to clipboard"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 13px", borderRadius: 7, cursor: hasBuilderInput || seed?.prompt ? "pointer" : "not-allowed",
              background: copied ? "rgba(34,197,94,0.12)" : "rgba(0,174,239,0.1)",
              border: copied ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(0,174,239,0.3)",
              color: copied ? "#22C55E" : "#00AEEF",
              fontSize: 12, fontWeight: 700, transition: "all 0.15s",
            }}
          >
            {copied ? "✓ Copied!" : "📋 Copy Prompt"}
          </button>
          <span style={{
            padding: "3px 9px", borderRadius: 5, fontSize: 9, fontWeight: 800, letterSpacing: "0.5px",
            background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",
          }}>
            PROMPT READY
          </span>
        </div>
        <div style={{
          fontSize: 13, color: hasBuilderInput || seed?.prompt ? "#CBD5E1" : "#334155",
          lineHeight: 1.65, fontStyle: hasBuilderInput || seed?.prompt ? "normal" : "italic",
          minHeight: 44,
        }}>
          {generatedPrompt}
        </div>
        {(hasBuilderInput || seed?.prompt) && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {[
              { label: `📐 ${formatMeta[format]}`, accent: "#00AEEF" },
              { label: `🎨 ${style.charAt(0).toUpperCase() + style.slice(1)} style`, accent: "#A78BFA" },
            ].map(chip => (
              <span key={chip.label} style={{
                padding: "3px 9px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                background: `${chip.accent}12`, border: `1px solid ${chip.accent}33`, color: chip.accent,
              }}>
                {chip.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Main two-column grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* ── LEFT: Prompt Builder + Format + Style ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Prompt Builder */}
          <Panel label="Prompt Builder" accent="#00AEEF">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {([
                { key: "goal",     label: "Campaign Goal",         value: goal,     set: setGoal,     ph: "e.g. Drive service bookings, increase brand awareness" },
                { key: "audience", label: "Target Audience",        value: audience, set: setAudience, ph: "e.g. Homeowners in Baldwin County, AL aged 30–60" },
                { key: "offer",    label: "Offer / Promotion",      value: offer,    set: setOffer,    ph: "e.g. Free inspection + 20% off first treatment" },
                { key: "service",  label: "Service or Product",     value: service,  set: setService,  ph: "e.g. Bed bug extermination, pest control service" },
                { key: "location", label: "Location / Service Area", value: location, set: setLocation, ph: "e.g. Baldwin County, Gulf Shores, Foley AL" },
                { key: "cta",      label: "Call to Action",          value: cta,      set: setCta,      ph: "e.g. Call Today, Book Now, Get a Free Quote" },
              ] as { key: string; label: string; value: string; set: (v: string) => void; ph: string }[]).map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#00AEEF", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>
                    {f.label}
                  </div>
                  <input
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.ph}
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8, boxSizing: "border-box",
                      background: "rgba(0,174,239,0.05)", border: "1.5px solid rgba(0,174,239,0.18)",
                      color: "#E2E8F0", fontSize: 12.5, outline: "none",
                    }}
                  />
                </div>
              ))}
              <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>
                💡 Prompt updates automatically as you type
              </div>
            </div>
          </Panel>

          {/* Format */}
          <Panel label="Format" accent="#00AEEF">
            <div style={{ display: "flex", gap: 8 }}>
              {formats.map(f => (
                <button key={f.id} onClick={() => setFormat(f.id)} style={chipBtn(format === f.id, "#00AEEF")}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{f.label}</div>
                  <div style={{ fontSize: 10, opacity: 0.65 }}>{f.size}</div>
                </button>
              ))}
            </div>
          </Panel>

          {/* Visual Style */}
          <Panel label="Visual Style" accent="#00AEEF">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {styles.map(s => (
                <button key={s} onClick={() => setStyle(s.toLowerCase())} style={tagBtn(style === s.toLowerCase(), "#00AEEF")}>
                  {s}
                </button>
              ))}
            </div>
          </Panel>

          {/* Brand handling is enforced server-side from canonical tenant policy. */}
          <Panel label="Brand Handling" accent="#00AEEF">
            <div style={{ fontSize: 11.5, color: "#94A3B8", lineHeight: 1.6 }}>
              Brand rules come from the active client context. Bed Bugs & Beyond receives its official overlay; other tenants stay unbranded until their own brand kit is configured.
            </div>
          </Panel>

          {/* Export is available only for a real provider-confirmed asset. */}
          <Panel label="Export" accent="#00AEEF">
            {generatedImageUrl ? (
              <a
                href={generatedImageUrl}
                download="ai-edge-generated-image.png"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  padding: "9px 14px", borderRadius: 8, textDecoration: "none",
                  background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.3)",
                  color: "#00AEEF", fontSize: 12, fontWeight: 700,
                }}
              >
                Download PNG
              </a>
            ) : (
              <span style={{ fontSize: 11.5, color: "#64748B" }}>Generate an image before export is available.</span>
            )}
          </Panel>
        </div>

        {/* ── RIGHT: Image Preview + Actions + Quick Templates ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Mock Generated Image Preview */}
          <Panel label="AI Image Output" accent="#00AEEF">
            <div style={{ position: "relative" }}>
              {/* Real provider result is rendered only after the signed asset URL is returned. */}
              <div style={{
                aspectRatio: format === "banner" ? "16 / 5" : format === "ad" ? "1200 / 628" : "1 / 1",
                background: "linear-gradient(135deg, #071828 0%, #091E32 40%, #071222 100%)",
                borderRadius: 12, border: "1.5px solid rgba(0,174,239,0.2)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 12, padding: 20, position: "relative", overflow: "hidden",
              }}>
                {generatedImageUrl && (
                  <img
                    src={generatedImageUrl}
                    alt="Generated campaign creative"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 3 }}
                  />
                )}
                {/* Decorative background grid */}
                <div style={{
                  position: "absolute", inset: 0, opacity: 0.04,
                  backgroundImage: "repeating-linear-gradient(0deg,#00AEEF,#00AEEF 1px,transparent 1px,transparent 40px), repeating-linear-gradient(90deg,#00AEEF,#00AEEF 1px,transparent 1px,transparent 40px)",
                }} />
                {/* Glowing orb */}
                <div style={{
                  position: "absolute", width: 160, height: 160, borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(0,174,239,0.12) 0%, transparent 70%)",
                }} />

                <div style={{ position: "relative", fontSize: 42, filter: "drop-shadow(0 0 12px rgba(0,174,239,0.4))" }}>🖼️</div>
                <div style={{ position: "relative", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8", marginBottom: 6 }}>
                    AI image output will appear here
                  </div>
                  <div style={{ fontSize: 11, color: "#475569" }}>
                    {formatMeta[format]}
                  </div>
                </div>

                {/* Fake progress bar */}
                <div style={{
                  position: "relative", width: "60%", height: 3, borderRadius: 2,
                  background: "rgba(0,174,239,0.12)",
                }}>
                  <div style={{
                    width: "38%", height: "100%", borderRadius: 2,
                    background: "linear-gradient(90deg, #00AEEF, rgba(0,174,239,0.3))",
                  }} />
                </div>
                <div style={{ position: "relative", fontSize: 10, color: "#334155" }}>
                  Waiting for generation…
                </div>
              </div>
            </div>

            {generationError && (
              <div style={{ marginTop: 10, fontSize: 11, color: "#FCA5A5", lineHeight: 1.5 }}>
                Generation blocked or failed: {generationError}
              </div>
            )}
            {!imageReady && (
              <div style={{ marginTop: 10, fontSize: 11, color: "#FBBF24", lineHeight: 1.5 }}>
                Image generation remains disabled until the server-side provider gate is explicitly enabled.
              </div>
            )}

            {/* Prompt Actions row */}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                onClick={copyPrompt}
                disabled={!hasBuilderInput && !seed?.prompt}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "10px", borderRadius: 9, cursor: hasBuilderInput || seed?.prompt ? "pointer" : "not-allowed",
                  background: copied ? "rgba(34,197,94,0.1)" : "rgba(0,174,239,0.08)",
                  border: copied ? "1.5px solid rgba(34,197,94,0.35)" : "1.5px solid rgba(0,174,239,0.28)",
                  color: copied ? "#22C55E" : "#00AEEF",
                  fontSize: 12, fontWeight: 700, transition: "all 0.15s",
                }}
              >
                {copied ? "✓ Copied!" : "📋 Copy Prompt"}
              </button>
              <button
                onClick={() => void generateImage()}
                disabled={!imageReady || (!hasBuilderInput && !seed?.prompt) || generating}
                title={imageReady ? "Generate a real provider-backed image" : "Image provider is not enabled"}
                style={{
                  flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  padding: "10px", borderRadius: 9,
                  cursor: imageReady && (hasBuilderInput || seed?.prompt) && !generating ? "pointer" : "not-allowed",
                  background: imageReady ? "rgba(0,174,239,0.1)" : "rgba(0,174,239,0.04)",
                  border: "1.5px solid rgba(0,174,239,0.2)",
                  color: imageReady ? "#00AEEF" : "#475569", fontSize: 12, fontWeight: 700,
                }}
              >
                <span style={{ fontSize: 13 }}>✨</span>
                {generating ? "Generating…" : "Generate Image"}
              </button>
            </div>
          </Panel>

          {/* Quick Templates */}
          <Panel label="Quick Templates" accent="#00AEEF">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {placeholders.map(p => (
                <button key={p.label} style={{
                  padding: "12px 10px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                  background: "rgba(0,174,239,0.05)", border: "1px solid rgba(0,174,239,0.12)",
                }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{p.icon}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#CBD5E1" }}>{p.label}</div>
                  <div style={{ fontSize: 10.5, color: "#64748B", marginTop: 2 }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Video Studio ──────────────────────────────────────────────────────────────
interface VideoScene {
  id: string;
  title: string;
  visual: string;
  onscreen: string;
  voiceover: string;
}

const DEFAULT_VIDEO_SCENES: VideoScene[] = [
  {
    id: "hook",
    title: "Hook",
    visual: "Pest infestation close-up — quick cuts, high energy",
    onscreen: "Are pests taking over your home?",
    voiceover: "Bed bugs, roaches, rodents — they don't sleep, and neither should your protection.",
  },
  {
    id: "problem",
    title: "Problem",
    visual: "Worried homeowner inspecting walls and furniture",
    onscreen: "Don't let pests ruin your peace of mind.",
    voiceover: "Every day you wait, the problem gets worse. Baldwin County homeowners trust one name.",
  },
  {
    id: "solution",
    title: "Solution",
    visual: "BB&B technician treating home, logo visible, professional uniform",
    onscreen: "Bed Bugs & Beyond — Guaranteed Results.",
    voiceover: "Bed Bugs and Beyond delivers fast, effective, guaranteed pest control. Licensed, local, and here for you.",
  },
  {
    id: "cta",
    title: "Call to Action",
    visual: "Happy family in clean, pest-free home — bright, warm lighting",
    onscreen: "Call Today — Free Inspection!",
    voiceover: "Call Bed Bugs and Beyond today for your free inspection. Your pest-free life starts now.",
  },
];

function VideoStudio({ t, seed }: { t: ReturnType<typeof useTheme>["colors"]; seed?: StudioSeed }) {
  const [videoType, setVideoType]   = useState(seed?.videoType ?? "reel");
  const [duration, setDuration]     = useState(seed?.duration ?? 15);
  const [transition, setTransition] = useState("Fade");
  const [musicTrack, setMusicTrack] = useState("No Music");

  // Video Brief fields
  const [vGoal,     setVGoal]     = useState("");
  const [vAudience, setVAudience] = useState("");
  const [vOffer,    setVOffer]    = useState("");
  const [vService,  setVService]  = useState("");
  const [vLocation, setVLocation] = useState("");
  const [vCta,      setVCta]      = useState("");

  // Scene state
  const [scenes, setScenes]             = useState<VideoScene[]>(DEFAULT_VIDEO_SCENES);
  const [expandedScene, setExpandedScene] = useState<string>("hook");
  const [copied, setCopied]             = useState(false);

  const videoTypes = [
    { id: "reel",       label: "Reel / Short",   icon: "📱", size: "9:16",  aspect: "9/16"  },
    { id: "social-ad",  label: "Social Ad",       icon: "📢", size: "1:1",   aspect: "1/1"   },
    { id: "commercial", label: "Commercial Clip", icon: "🎥", size: "16:9",  aspect: "16/9"  },
    { id: "story",      label: "Story",           icon: "⚡", size: "9:16",  aspect: "9/16"  },
  ];
  const transitions = ["Fade", "Slide", "Zoom", "Glitch", "Wipe", "Flash"];
  const musicTracks = ["No Music", "Upbeat Corporate", "Cinematic", "Energetic", "Calm & Professional", "Hip Hop Beat"];

  const currentType = videoTypes.find(v => v.id === videoType)!;

  function updateScene(id: string, field: keyof VideoScene, value: string) {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }

  // Build generated prompt
  const hasBrief = vGoal || vAudience || vOffer || vService || vLocation || vCta;
  const briefParts: string[] = [];
  if (vService)  briefParts.push(vService);
  if (vGoal)     briefParts.push(`goal: ${vGoal}`);
  if (vAudience) briefParts.push(`audience: ${vAudience}`);
  if (vOffer)    briefParts.push(vOffer);
  if (vLocation) briefParts.push(`in ${vLocation}`);
  if (vCta)      briefParts.push(`CTA: "${vCta}"`);

  const sceneSummary = scenes
    .map((s, i) => `Scene ${i + 1} (${s.title}): "${s.onscreen}" — ${s.visual}`)
    .join(" | ");

  const generatedPrompt = hasBrief
    ? [
        briefParts.join(", "),
        `${currentType.label} format (${currentType.size})`,
        `${duration}s duration`,
        `${transition} transitions`,
        musicTrack !== "No Music" ? `music: ${musicTrack}` : null,
        `Scenes: ${sceneSummary}`,
        "cinematic, professional, brand-consistent",
      ].filter(Boolean).join(" | ")
    : `Fill in the Video Brief fields to generate your prompt. Scenes: ${sceneSummary}`;

  function copyPrompt() {
    navigator.clipboard.writeText(generatedPrompt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const sceneColors = ["#A78BFA", "#818CF8", "#6366F1", "#4F46E5"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Generated Video Prompt Preview (full width) ── */}
      <div style={{
        padding: "18px 20px", borderRadius: 12,
        background: "linear-gradient(135deg, rgba(167,139,250,0.08) 0%, rgba(167,139,250,0.03) 100%)",
        border: "1.5px solid rgba(167,139,250,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14 }}>🎬</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#A78BFA", textTransform: "uppercase", letterSpacing: "0.7px" }}>
            Generated Video Prompt
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={copyPrompt} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 13px", borderRadius: 7, cursor: "pointer",
            background: copied ? "rgba(34,197,94,0.12)" : "rgba(167,139,250,0.1)",
            border: copied ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(167,139,250,0.3)",
            color: copied ? "#22C55E" : "#A78BFA",
            fontSize: 12, fontWeight: 700, transition: "all 0.15s",
          }}>
            {copied ? "✓ Copied!" : "📋 Copy Prompt"}
          </button>
          <span style={{
            padding: "3px 9px", borderRadius: 5, fontSize: 9, fontWeight: 800, letterSpacing: "0.5px",
            background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",
          }}>PROMPT READY</span>
        </div>
        <div style={{
          fontSize: 12.5, color: "#CBD5E1", lineHeight: 1.7,
          maxHeight: 72, overflow: "hidden",
        }}>
          {generatedPrompt}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {[
            { label: `📐 ${currentType.size} · ${currentType.label}`, c: "#A78BFA" },
            { label: `⏱ ${duration}s`,                                  c: "#818CF8" },
            { label: `✂️ ${transition}`,                                  c: "#6366F1" },
            { label: `🎵 ${musicTrack}`,                                  c: "#475569" },
          ].map(chip => (
            <span key={chip.label} style={{
              padding: "3px 9px", borderRadius: 5, fontSize: 10, fontWeight: 700,
              background: `${chip.c}12`, border: `1px solid ${chip.c}33`, color: chip.c,
            }}>{chip.label}</span>
          ))}
        </div>
      </div>

      {/* ── Two-column grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* LEFT: Brief + Type + Duration + Transitions + Music */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Video Brief Builder */}
          <Panel label="Video Brief Builder" accent="#A78BFA">
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {([
                { key: "goal",     label: "Campaign Goal",          value: vGoal,     set: setVGoal,     ph: "e.g. Drive service calls, grow brand awareness" },
                { key: "audience", label: "Target Audience",         value: vAudience, set: setVAudience, ph: "e.g. Homeowners in Baldwin County, AL aged 30–60" },
                { key: "offer",    label: "Offer / Promotion",       value: vOffer,    set: setVOffer,    ph: "e.g. Free inspection + 20% off first treatment" },
                { key: "service",  label: "Service or Product",      value: vService,  set: setVService,  ph: "e.g. Bed bug extermination, pest control service" },
                { key: "location", label: "Location / Service Area", value: vLocation, set: setVLocation, ph: "e.g. Baldwin County, Gulf Shores, Foley AL" },
                { key: "cta",      label: "Call to Action",           value: vCta,      set: setVCta,      ph: "e.g. Call Today, Book Now, Get a Free Quote" },
              ] as { key: string; label: string; value: string; set: (v: string) => void; ph: string }[]).map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#A78BFA", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>
                    {f.label}
                  </div>
                  <input
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.ph}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: 8, boxSizing: "border-box",
                      background: "rgba(167,139,250,0.05)", border: "1.5px solid rgba(167,139,250,0.18)",
                      color: "#E2E8F0", fontSize: 12.5, outline: "none",
                    }}
                  />
                </div>
              ))}
              <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>💡 Prompt updates automatically as you type</div>
            </div>
          </Panel>

          {/* Video Type */}
          <Panel label="Video Type" accent="#A78BFA">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {videoTypes.map(v => (
                <button key={v.id} onClick={() => setVideoType(v.id)} style={{
                  padding: "12px 10px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                  background: videoType === v.id ? "rgba(167,139,250,0.15)" : "rgba(167,139,250,0.04)",
                  border: videoType === v.id ? "1.5px solid #A78BFA" : "1.5px solid rgba(167,139,250,0.15)",
                }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{v.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: videoType === v.id ? "#A78BFA" : "#CBD5E1" }}>{v.label}</div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>{v.size}</div>
                </button>
              ))}
            </div>
          </Panel>

          {/* Duration */}
          <Panel label="Duration" accent="#A78BFA">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="range" min={5} max={60} value={duration}
                onChange={e => setDuration(+e.target.value)}
                style={{ flex: 1, accentColor: "#A78BFA" }} />
              <span style={{ minWidth: 40, fontSize: 14, fontWeight: 700, color: "#A78BFA" }}>{duration}s</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {[7, 15, 30, 60].map(d => (
                <button key={d} onClick={() => setDuration(d)} style={tagBtn(duration === d, "#A78BFA")}>{d}s</button>
              ))}
            </div>
          </Panel>

          {/* Transitions */}
          <Panel label="Transitions" accent="#A78BFA">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {transitions.map(tr => (
                <button key={tr} onClick={() => setTransition(tr)} style={tagBtn(transition === tr, "#A78BFA")}>{tr}</button>
              ))}
            </div>
          </Panel>

          {/* Background Music */}
          <Panel label="Background Music" accent="#A78BFA">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {musicTracks.map(m => (
                <button key={m} onClick={() => setMusicTrack(m)} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                  background: musicTrack === m ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.02)",
                  border: musicTrack === m ? "1px solid rgba(167,139,250,0.4)" : "1px solid rgba(255,255,255,0.05)",
                }}>
                  <span style={{ fontSize: 13 }}>{m === "No Music" ? "🔇" : "🎵"}</span>
                  <span style={{ fontSize: 12, color: musicTrack === m ? "#A78BFA" : "#94A3B8" }}>{m}</span>
                  {musicTrack === m && <span style={{ marginLeft: "auto", fontSize: 10, color: "#A78BFA", fontWeight: 700 }}>✓</span>}
                </button>
              ))}
            </div>
          </Panel>
        </div>

        {/* RIGHT: Scene Builder + Video Preview + Actions + Export */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Scene Builder */}
          <Panel label="Scene Builder" accent="#A78BFA">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {scenes.map((scene, i) => {
                const isOpen = expandedScene === scene.id;
                const color  = sceneColors[i] ?? "#A78BFA";
                return (
                  <div key={scene.id} style={{
                    borderRadius: 10, overflow: "hidden",
                    border: isOpen ? `1.5px solid ${color}55` : "1px solid rgba(167,139,250,0.12)",
                    background: isOpen ? `${color}08` : "rgba(255,255,255,0.01)",
                  }}>
                    {/* Scene header (click to expand) */}
                    <button
                      onClick={() => setExpandedScene(isOpen ? "" : scene.id)}
                      style={{
                        width: "100%", padding: "10px 14px", cursor: "pointer", textAlign: "left",
                        background: "transparent", border: "none",
                        display: "flex", alignItems: "center", gap: 10,
                      }}
                    >
                      <div style={{
                        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                        background: isOpen ? color : "rgba(167,139,250,0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800, color: isOpen ? "#fff" : "#A78BFA",
                      }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: isOpen ? "#E2E8F0" : "#94A3B8" }}>
                          {scene.title}
                        </div>
                        {!isOpen && (
                          <div style={{ fontSize: 10.5, color: "#475569", marginTop: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: 200 }}>
                            {scene.onscreen || "No on-screen text set"}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: "#475569" }}>{isOpen ? "▲" : "▼"}</span>
                    </button>

                    {/* Expanded fields */}
                    {isOpen && (
                      <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                        {([
                          { field: "visual",    label: "Visual Direction", ph: "Describe what the camera sees…" },
                          { field: "onscreen",  label: "On-Screen Text",   ph: "Bold headline or caption…"      },
                          { field: "voiceover", label: "Voiceover Line",   ph: "What the narrator says…"        },
                        ] as { field: keyof VideoScene; label: string; ph: string }[]).map(f => (
                          <div key={f.field}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: color, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>
                              {f.label}
                            </div>
                            <textarea
                              value={scene[f.field]}
                              onChange={e => updateScene(scene.id, f.field, e.target.value)}
                              placeholder={f.ph}
                              rows={2}
                              style={{
                                width: "100%", padding: "8px 11px", borderRadius: 8, resize: "vertical",
                                background: `${color}06`, border: `1px solid ${color}28`,
                                color: "#E2E8F0", fontSize: 12, outline: "none",
                                boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.55,
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Mock Video Preview */}
          <Panel label="Video Output Preview" accent="#A78BFA">
            <div style={{ position: "relative" }}>
              {/* Coming Soon badge */}
              <div style={{
                position: "absolute", top: 10, right: 10, zIndex: 2,
                padding: "4px 10px", borderRadius: 6, fontSize: 9, fontWeight: 800, letterSpacing: "0.6px",
                background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "#FBBF24",
              }}>COMING SOON</div>

              {/* Video canvas */}
              <div style={{
                aspectRatio: currentType.aspect,
                maxHeight: videoType === "commercial" ? 200 : 260,
                background: "linear-gradient(135deg, #120A28 0%, #180E35 50%, #0E0620 100%)",
                borderRadius: 10, border: "1.5px solid rgba(167,139,250,0.2)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 10, padding: 16, position: "relative", overflow: "hidden",
              }}>
                {/* Decorative grid */}
                <div style={{
                  position: "absolute", inset: 0, opacity: 0.04,
                  backgroundImage: "repeating-linear-gradient(0deg,#A78BFA,#A78BFA 1px,transparent 1px,transparent 36px),repeating-linear-gradient(90deg,#A78BFA,#A78BFA 1px,transparent 1px,transparent 36px)",
                }} />
                {/* Glow orb */}
                <div style={{
                  position: "absolute", width: 140, height: 140, borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(167,139,250,0.14) 0%, transparent 70%)",
                }} />
                <div style={{ position: "relative", fontSize: 38, filter: "drop-shadow(0 0 14px rgba(167,139,250,0.5))" }}>🎬</div>
                <div style={{ position: "relative", textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", marginBottom: 4 }}>
                    AI video output will appear here
                  </div>
                  <div style={{ fontSize: 11, color: "#475569" }}>{currentType.size} · {duration}s · {currentType.label}</div>
                </div>

                {/* Scene markers strip */}
                <div style={{ position: "relative", width: "80%", display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                  <div style={{ display: "flex", gap: 3, height: 6 }}>
                    {scenes.map((s, i) => (
                      <div key={s.id} style={{
                        flex: 1, height: "100%", borderRadius: 3,
                        background: sceneColors[i] ?? "#A78BFA", opacity: 0.7,
                      }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {scenes.map((s, i) => (
                      <div key={s.id} style={{ flex: 1, textAlign: "center", fontSize: 8, color: "#334155" }}>{s.title}</div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Timeline bar */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#475569" }}>0:00</span>
                  <span style={{ fontSize: 10, color: "#475569" }}>0:{duration.toString().padStart(2, "0")}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "rgba(167,139,250,0.12)", position: "relative" }}>
                  {/* Scene segment markers */}
                  {scenes.map((_, i) => (
                    <div key={i} style={{
                      position: "absolute", left: `${(i / scenes.length) * 100}%`,
                      top: -2, width: 2, height: 8, borderRadius: 1,
                      background: sceneColors[i] ?? "#A78BFA",
                    }} />
                  ))}
                  <div style={{ width: "0%", height: "100%", background: "#A78BFA", borderRadius: 2 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-around", marginTop: 5 }}>
                  {scenes.map((s, i) => (
                    <div key={s.id} style={{ textAlign: "center" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: sceneColors[i], margin: "0 auto 2px" }} />
                      <div style={{ fontSize: 9, color: "#334155" }}>{s.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={copyPrompt} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px", borderRadius: 9, cursor: "pointer",
                background: copied ? "rgba(34,197,94,0.1)" : "rgba(167,139,250,0.08)",
                border: copied ? "1.5px solid rgba(34,197,94,0.35)" : "1.5px solid rgba(167,139,250,0.28)",
                color: copied ? "#22C55E" : "#A78BFA",
                fontSize: 12, fontWeight: 700, transition: "all 0.15s",
              }}>
                {copied ? "✓ Copied!" : "📋 Copy Prompt"}
              </button>
              <button disabled title="AI video generation coming in next release" style={{
                flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "10px", borderRadius: 9, cursor: "not-allowed",
                background: "rgba(167,139,250,0.04)", border: "1.5px solid rgba(167,139,250,0.15)",
                color: "#334155", fontSize: 12, fontWeight: 700,
              }}>
                <span style={{ fontSize: 13 }}>✨</span>
                Generate Video
                <span style={{
                  padding: "2px 7px", borderRadius: 4, fontSize: 9, fontWeight: 800,
                  background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",
                }}>SOON</span>
              </button>
            </div>
          </Panel>

          {/* Export */}
          <Panel label="Export" accent="#A78BFA">
            <div style={{ display: "flex", gap: 12 }}>
              <ExportButton label="MP4 HD" accent="#A78BFA" />
              <ExportButton label="MP4 4K" accent="#A78BFA" />
              <ExportButton label="GIF"    accent="#A78BFA" />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Audio Studio ──────────────────────────────────────────────────────────────
interface AudioScriptSections {
  greeting: string;
  valueProposition: string;
  offerMessage: string;
  callToAction: string;
  closing: string;
}

const AUDIO_DEFAULT_SECTIONS: Record<string, AudioScriptSections> = {
  voiceover: {
    greeting:          "Welcome to Bed Bugs and Beyond Pest Control.",
    valueProposition:  "Baldwin County's most trusted pest control experts. We eliminate pests fast, guaranteed.",
    offerMessage:      "",
    callToAction:      "Call today for fast, effective pest control.",
    closing:           "Bed Bugs and Beyond — protecting your home.",
  },
  receptionist: {
    greeting:          "Hi, thank you for calling Bed Bugs and Beyond Pest Control.",
    valueProposition:  "We're Baldwin County's most trusted pest control experts.",
    offerMessage:      "To speak directly with us, press 1. To request a callback, press 2. To leave a voicemail, press 3.",
    callToAction:      "We look forward to speaking with you!",
    closing:           "Goodbye and have a pest-free day!",
  },
  "ad-audio": {
    greeting:          "Bed bugs keeping you up at night?",
    valueProposition:  "Bed Bugs and Beyond has you covered.",
    offerMessage:      "Serving Baldwin County with fast, effective, guaranteed results.",
    callToAction:      "Call today.",
    closing:           "",
  },
  jingle: {
    greeting:          "Bed Bugs and Beyond —",
    valueProposition:  "we've got your back.",
    offerMessage:      "Pest-free living, that's a fact!",
    callToAction:      "",
    closing:           "",
  },
};

function AudioStudio({ t, seed }: { t: ReturnType<typeof useTheme>["colors"]; seed?: StudioSeed }) {
  const [audioType, setAudioType] = useState(seed?.audioType ?? "voiceover");
  const [voice,     setVoice]     = useState(seed?.voice ?? "Joanna");

  // Audio Brief fields
  const [aPurpose,  setAPurpose]  = useState("");
  const [aAudience, setAAudience] = useState("");
  const [aOffer,    setAOffer]    = useState("");
  const [aService,  setAService]  = useState("");
  const [aLocation, setALocation] = useState("");
  const [aCta,      setACta]      = useState("");

  // Voice Controls
  const [voiceStyle, setVoiceStyle] = useState("Professional");
  const [emotion,    setEmotion]    = useState("Neutral");
  const [speed,      setSpeed]      = useState(1.0);
  const [energy,     setEnergy]     = useState(0.6);
  const [accent,     setAccent]     = useState("US English");
  const [bgMusic,    setBgMusic]    = useState(false);

  // Script sections — auto-filled from BB&B defaults
  const [sections, setSections] = useState<AudioScriptSections>(
    AUDIO_DEFAULT_SECTIONS[seed?.audioType ?? "voiceover"]
  );

  const [copied, setCopied] = useState(false);

  const audioTypes = [
    { id: "voiceover",    label: "Voiceover",       icon: "🎤" },
    { id: "receptionist", label: "AI Receptionist",  icon: "🤖" },
    { id: "ad-audio",     label: "Ad Audio",         icon: "📻" },
    { id: "jingle",       label: "Jingle / Music",   icon: "🎵" },
  ];

  const voices = [
    { id: "Joanna",  label: "Joanna",  desc: "Professional female", accent: "US English" },
    { id: "Matthew", label: "Matthew", desc: "Authoritative male",  accent: "US English" },
    { id: "Salli",   label: "Salli",   desc: "Warm female",         accent: "US English" },
    { id: "Joey",    label: "Joey",    desc: "Friendly male",        accent: "US English" },
    { id: "Kendra",  label: "Kendra",  desc: "Clear female",         accent: "US English" },
    { id: "Kevin",   label: "Kevin",   desc: "Young male",           accent: "US English" },
  ];

  const voiceStyles  = ["Professional", "Conversational", "Energetic", "Calm", "Authoritative", "Friendly"];
  const emotions     = ["Neutral", "Happy", "Urgent", "Empathetic", "Excited", "Serious"];
  const accents      = ["US English", "Southern US", "British", "Australian", "Canadian"];

  function selectAudioType(id: string) {
    setAudioType(id);
    setSections(AUDIO_DEFAULT_SECTIONS[id] ?? AUDIO_DEFAULT_SECTIONS.voiceover);
  }

  function updateSection(key: keyof AudioScriptSections, val: string) {
    setSections(prev => ({ ...prev, [key]: val }));
  }

  // Build full script text from sections
  const fullScript = [
    sections.greeting,
    sections.valueProposition,
    sections.offerMessage,
    sections.callToAction,
    sections.closing,
  ].filter(Boolean).join(" ");

  const wordCount = fullScript.trim() ? fullScript.trim().split(/\s+/).length : 0;
  const estSeconds = wordCount ? Math.ceil(wordCount / (speed * 2.5)) : 0;

  // Generated prompt
  const hasBrief = aPurpose || aAudience || aOffer || aService || aLocation || aCta;
  const briefParts: string[] = [];
  if (aService)  briefParts.push(aService);
  if (aPurpose)  briefParts.push(`purpose: ${aPurpose}`);
  if (aAudience) briefParts.push(`audience: ${aAudience}`);
  if (aOffer)    briefParts.push(aOffer);
  if (aLocation) briefParts.push(`in ${aLocation}`);
  if (aCta)      briefParts.push(`CTA: "${aCta}"`);

  const selectedVoice = voices.find(v => v.id === voice)!;
  const voicePart = `${selectedVoice.label} (${selectedVoice.desc}, ${selectedVoice.accent})`;

  const generatedPrompt = [
    hasBrief ? briefParts.join(", ") : null,
    `audio type: ${audioTypes.find(a => a.id === audioType)?.label}`,
    `voice: ${voicePart}`,
    `style: ${voiceStyle}`,
    `emotion: ${emotion}`,
    `speed: ${speed.toFixed(2)}x`,
    `energy: ${Math.round(energy * 100)}%`,
    `accent: ${accent}`,
    bgMusic ? "background music: on" : null,
    fullScript ? `Script: "${fullScript}"` : null,
  ].filter(Boolean).join(" | ");

  function copyPrompt() {
    navigator.clipboard.writeText(generatedPrompt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Fixed waveform heights (deterministic, no Math.random in render)
  const WAVE_HEIGHTS = [30,45,62,78,55,88,70,40,58,82,66,48,72,90,60,35,50,75,85,55,42,68,80,52,38,65,78,44,60,85,70,48,56,74,88,62,40,54,70,84,58,46,72,90,64,38,52,76,86,58,44,68,80,50,36,60,74,88,64,42];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Generated Audio Prompt Preview (full width) ── */}
      <div style={{
        padding: "18px 20px", borderRadius: 12,
        background: "linear-gradient(135deg, rgba(52,211,153,0.08) 0%, rgba(52,211,153,0.03) 100%)",
        border: "1.5px solid rgba(52,211,153,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14 }}>🎙️</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#34D399", textTransform: "uppercase", letterSpacing: "0.7px" }}>
            Generated Audio Prompt
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={copyPrompt} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 13px", borderRadius: 7, cursor: "pointer",
            background: copied ? "rgba(34,197,94,0.12)" : "rgba(52,211,153,0.1)",
            border: copied ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(52,211,153,0.3)",
            color: copied ? "#22C55E" : "#34D399",
            fontSize: 12, fontWeight: 700, transition: "all 0.15s",
          }}>
            {copied ? "✓ Copied!" : "📋 Copy Prompt"}
          </button>
          <span style={{
            padding: "3px 9px", borderRadius: 5, fontSize: 9, fontWeight: 800, letterSpacing: "0.5px",
            background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",
          }}>PROMPT READY</span>
        </div>
        <div style={{ fontSize: 12.5, color: "#CBD5E1", lineHeight: 1.7, maxHeight: 72, overflow: "hidden" }}>
          {generatedPrompt}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {[
            { label: `🎤 ${audioTypes.find(a => a.id === audioType)?.label}`, c: "#34D399" },
            { label: `🗣️ ${voice} · ${voiceStyle}`,                           c: "#10B981" },
            { label: `⚡ ${emotion}`,                                           c: "#6EE7B7" },
            { label: `⏱ ${speed.toFixed(2)}x · ~${estSeconds}s`,              c: "#475569" },
          ].map(chip => (
            <span key={chip.label} style={{
              padding: "3px 9px", borderRadius: 5, fontSize: 10, fontWeight: 700,
              background: `${chip.c}12`, border: `1px solid ${chip.c}33`, color: chip.c,
            }}>{chip.label}</span>
          ))}
        </div>
      </div>

      {/* ── Two-column grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* LEFT: Brief + Audio Type + Voice Selection + Voice Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Audio Brief Builder */}
          <Panel label="Audio Brief Builder" accent="#34D399">
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {([
                { key: "purpose",  label: "Audio Purpose",          value: aPurpose,  set: setAPurpose,  ph: "e.g. Phone greeting, radio ad, social voiceover" },
                { key: "audience", label: "Target Audience",         value: aAudience, set: setAAudience, ph: "e.g. Baldwin County homeowners aged 30–60"        },
                { key: "offer",    label: "Offer / Promotion",       value: aOffer,    set: setAOffer,    ph: "e.g. Free inspection + 20% off first treatment"    },
                { key: "service",  label: "Service or Product",      value: aService,  set: setAService,  ph: "e.g. Bed bug extermination, pest control"          },
                { key: "location", label: "Location / Service Area", value: aLocation, set: setALocation, ph: "e.g. Baldwin County, Gulf Shores, Foley AL"        },
                { key: "cta",      label: "Call to Action",           value: aCta,      set: setACta,      ph: "e.g. Call Today, Book Now, Get a Free Quote"       },
              ] as { key: string; label: string; value: string; set: (v: string) => void; ph: string }[]).map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#34D399", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>
                    {f.label}
                  </div>
                  <input
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.ph}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: 8, boxSizing: "border-box",
                      background: "rgba(52,211,153,0.05)", border: "1.5px solid rgba(52,211,153,0.18)",
                      color: "#E2E8F0", fontSize: 12.5, outline: "none",
                    }}
                  />
                </div>
              ))}
              <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>💡 Prompt updates automatically as you type</div>
            </div>
          </Panel>

          {/* Audio Type */}
          <Panel label="Audio Type" accent="#34D399">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {audioTypes.map(a => (
                <button key={a.id} onClick={() => selectAudioType(a.id)} style={{
                  padding: "12px 10px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                  background: audioType === a.id ? "rgba(52,211,153,0.12)" : "rgba(52,211,153,0.04)",
                  border: audioType === a.id ? "1.5px solid #34D399" : "1.5px solid rgba(52,211,153,0.15)",
                }}>
                  <div style={{ fontSize: 22, marginBottom: 5 }}>{a.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: audioType === a.id ? "#34D399" : "#CBD5E1" }}>{a.label}</div>
                  {audioType === a.id && <div style={{ fontSize: 10, color: "#34D399", marginTop: 2 }}>✓ Auto-filled</div>}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "#334155" }}>
              💡 Switching type auto-fills the Script Builder with BB&B defaults
            </div>
          </Panel>

          {/* Voice Selection */}
          <Panel label="Voice Selection" accent="#34D399">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {voices.map(v => (
                <button key={v.id} onClick={() => setVoice(v.id)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                  borderRadius: 8, cursor: "pointer", textAlign: "left",
                  background: voice === v.id ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.02)",
                  border: voice === v.id ? "1px solid rgba(52,211,153,0.5)" : "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: voice === v.id ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.05)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                  }}>🎙️</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: voice === v.id ? "#34D399" : "#CBD5E1" }}>{v.label}</div>
                    <div style={{ fontSize: 11, color: "#64748B" }}>{v.desc} · {v.accent}</div>
                  </div>
                  {voice === v.id && <span style={{ fontSize: 12, color: "#34D399", fontWeight: 700 }}>✓</span>}
                </button>
              ))}
            </div>
          </Panel>

          {/* Voice Controls */}
          <Panel label="Voice Controls" accent="#34D399">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Voice Style */}
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#34D399", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 7 }}>Voice Style</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {voiceStyles.map(s => (
                    <button key={s} onClick={() => setVoiceStyle(s)} style={tagBtn(voiceStyle === s, "#34D399")}>{s}</button>
                  ))}
                </div>
              </div>

              {/* Emotion */}
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#34D399", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 7 }}>Emotion</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {emotions.map(e => (
                    <button key={e} onClick={() => setEmotion(e)} style={tagBtn(emotion === e, "#34D399")}>{e}</button>
                  ))}
                </div>
              </div>

              {/* Speed */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#34D399", textTransform: "uppercase", letterSpacing: "0.6px" }}>Speed</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#34D399" }}>{speed.toFixed(2)}x</span>
                </div>
                <input type="range" min={75} max={150} step={5}
                  value={Math.round(speed * 100)}
                  onChange={e => setSpeed(+e.target.value / 100)}
                  style={{ width: "100%", accentColor: "#34D399" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 9, color: "#334155" }}>0.75x Slow</span>
                  <span style={{ fontSize: 9, color: "#334155" }}>1.00x Normal</span>
                  <span style={{ fontSize: 9, color: "#334155" }}>1.50x Fast</span>
                </div>
              </div>

              {/* Energy */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#34D399", textTransform: "uppercase", letterSpacing: "0.6px" }}>Energy</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#34D399" }}>{Math.round(energy * 100)}%</span>
                </div>
                <input type="range" min={0} max={100} step={5}
                  value={Math.round(energy * 100)}
                  onChange={e => setEnergy(+e.target.value / 100)}
                  style={{ width: "100%", accentColor: "#34D399" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 9, color: "#334155" }}>Low</span>
                  <span style={{ fontSize: 9, color: "#334155" }}>Medium</span>
                  <span style={{ fontSize: 9, color: "#334155" }}>High</span>
                </div>
              </div>

              {/* Accent */}
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#34D399", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 7 }}>Accent</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {accents.map(a => (
                    <button key={a} onClick={() => setAccent(a)} style={tagBtn(accent === a, "#34D399")}>{a}</button>
                  ))}
                </div>
              </div>

              {/* Background Music toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#34D399", textTransform: "uppercase", letterSpacing: "0.6px" }}>Background Music</div>
                  <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>Soft ambient track under voiceover</div>
                </div>
                <button onClick={() => setBgMusic(v => !v)} style={{
                  width: 44, height: 24, borderRadius: 12, cursor: "pointer", position: "relative",
                  background: bgMusic ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.06)",
                  border: bgMusic ? "1px solid #34D399" : "1px solid rgba(255,255,255,0.1)",
                  transition: "all 0.2s",
                }}>
                  <div style={{
                    position: "absolute", top: 3, width: 18, height: 18, borderRadius: "50%",
                    background: bgMusic ? "#34D399" : "#334155",
                    left: bgMusic ? 23 : 3,
                    transition: "all 0.2s",
                  }} />
                </button>
              </div>
            </div>
          </Panel>
        </div>

        {/* RIGHT: Script Builder + Mock Preview + Actions + Export */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Script Builder */}
          <Panel label="Script Builder" accent="#34D399">
            <div style={{ fontSize: 11, color: "#334155", marginBottom: 12 }}>
              ✨ Auto-filled from BB&B defaults — edit any section
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {([
                { key: "greeting",         label: "Greeting",           icon: "👋", ph: "Opening line…"                },
                { key: "valueProposition", label: "Value Proposition",  icon: "⭐", ph: "Why choose us…"              },
                { key: "offerMessage",     label: "Offer / Message",    icon: "🎁", ph: "Special offer or key info…"   },
                { key: "callToAction",     label: "Call to Action",     icon: "📞", ph: "What to do next…"             },
                { key: "closing",          label: "Closing",            icon: "🏁", ph: "Sign-off line…"               },
              ] as { key: keyof AudioScriptSections; label: string; icon: string; ph: string }[]).map(f => (
                <div key={f.key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 12 }}>{f.icon}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#34D399", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                      {f.label}
                    </span>
                    {sections[f.key] && (
                      <span style={{ marginLeft: "auto", fontSize: 9, color: "#34D399", fontWeight: 700 }}>✓</span>
                    )}
                  </div>
                  <textarea
                    value={sections[f.key]}
                    onChange={e => updateSection(f.key, e.target.value)}
                    placeholder={f.ph}
                    rows={2}
                    style={{
                      width: "100%", padding: "8px 11px", borderRadius: 8, resize: "vertical",
                      background: sections[f.key] ? "rgba(52,211,153,0.05)" : "rgba(255,255,255,0.01)",
                      border: sections[f.key] ? "1px solid rgba(52,211,153,0.28)" : "1px solid rgba(52,211,153,0.1)",
                      color: "#E2E8F0", fontSize: 12, outline: "none",
                      boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.55,
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.1)" }}>
              <div style={{ fontSize: 11, color: "#34D399", fontWeight: 600 }}>
                📝 Full Script Preview
              </div>
              <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 4, lineHeight: 1.6 }}>
                {fullScript || <span style={{ color: "#334155" }}>Script sections will appear here…</span>}
              </div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 6 }}>
                {wordCount} words · ~{estSeconds}s at {speed.toFixed(2)}x speed
              </div>
            </div>
          </Panel>

          {/* Mock Audio Preview */}
          <Panel label="Audio Output Preview" accent="#34D399">
            <div style={{ position: "relative" }}>
              {/* COMING SOON badge */}
              <div style={{
                position: "absolute", top: 0, right: 0, zIndex: 2,
                padding: "4px 10px", borderRadius: 6, fontSize: 9, fontWeight: 800, letterSpacing: "0.6px",
                background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "#FBBF24",
              }}>COMING SOON</div>

              <div style={{
                padding: "20px 16px 14px", borderRadius: 10,
                background: "linear-gradient(135deg, rgba(52,211,153,0.05) 0%, rgba(16,185,129,0.02) 100%)",
                border: "1.5px solid rgba(52,211,153,0.18)",
              }}>
                {/* Waveform bars */}
                <div style={{ display: "flex", alignItems: "center", height: 60, gap: 1.5, marginBottom: 14 }}>
                  {WAVE_HEIGHTS.map((h, i) => (
                    <div key={i} style={{
                      flex: 1, borderRadius: 2,
                      height: `${h}%`,
                      background: i < 20
                        ? `rgba(52,211,153,${0.15 + (h / 100) * 0.3})`
                        : `rgba(52,211,153,0.08)`,
                      transition: "height 0.3s",
                    }} />
                  ))}
                </div>

                {/* Controls row */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button disabled title="Playback coming soon" style={{
                    width: 36, height: 36, borderRadius: "50%", cursor: "not-allowed", flexShrink: 0,
                    background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.1)",
                    color: "#374151", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>▶</button>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 4, background: "rgba(52,211,153,0.12)", borderRadius: 2, marginBottom: 4 }}>
                      <div style={{ width: "0%", height: "100%", background: "#34D399", borderRadius: 2 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, color: "#475569" }}>0:00</span>
                      <span style={{ fontSize: 10, color: "#475569" }}>
                        0:{estSeconds.toString().padStart(2, "0")}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: "#334155", flexShrink: 0 }}>
                    {wordCount} words
                  </span>
                </div>

                <div style={{ textAlign: "center", marginTop: 10 }}>
                  <div style={{ fontSize: 12, color: "#475569" }}>AI audio output will appear here</div>
                  <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>
                    {audioTypes.find(a => a.id === audioType)?.label} · {voice} · {voiceStyle}
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={copyPrompt} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px", borderRadius: 9, cursor: "pointer",
                background: copied ? "rgba(34,197,94,0.1)" : "rgba(52,211,153,0.08)",
                border: copied ? "1.5px solid rgba(34,197,94,0.35)" : "1.5px solid rgba(52,211,153,0.28)",
                color: copied ? "#22C55E" : "#34D399",
                fontSize: 12, fontWeight: 700, transition: "all 0.15s",
              }}>
                {copied ? "✓ Copied!" : "📋 Copy Prompt"}
              </button>
              <button disabled title="AI audio generation coming in next release" style={{
                flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "10px", borderRadius: 9, cursor: "not-allowed",
                background: "rgba(52,211,153,0.04)", border: "1.5px solid rgba(52,211,153,0.15)",
                color: "#334155", fontSize: 12, fontWeight: 700,
              }}>
                <span style={{ fontSize: 13 }}>🎙️</span>
                Generate Audio
                <span style={{
                  padding: "2px 7px", borderRadius: 4, fontSize: 9, fontWeight: 800,
                  background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",
                }}>SOON</span>
              </button>
            </div>
          </Panel>

          {/* Export */}
          <Panel label="Export" accent="#34D399">
            <div style={{ display: "flex", gap: 12 }}>
              <ExportButton label="MP3" accent="#34D399" />
              <ExportButton label="WAV" accent="#34D399" />
              <ExportButton label="OGG" accent="#34D399" />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Ad Creator ────────────────────────────────────────────────────────────────
function AdCreator({ t, seed }: { t: ReturnType<typeof useTheme>["colors"]; seed?: StudioSeed }) {
  // Campaign Brief
  const [cObjective, setCObjective] = useState(seed?.adGoal ?? "awareness");
  const [cGoal,      setCGoal]      = useState("");
  const [cAudience,  setCAudience]  = useState("");
  const [cOffer,     setCOffer]     = useState("");
  const [cService,   setCService]   = useState("");
  const [cLocation,  setCLocation]  = useState("");
  const [cCta,       setCCta]       = useState("");

  // Platform Selector (stateful)
  const [platforms, setPlatforms] = useState<Set<string>>(new Set(["fb", "ig"]));

  // Campaign Asset Builder
  const [imgConcept,  setImgConcept]  = useState("");
  const [vidConcept,  setVidConcept]  = useState("");
  const [voScript,    setVoScript]    = useState("");
  const [primaryCopy, setPrimaryCopy] = useState("");
  const [headline,    setHeadline]    = useState("");
  const [description, setDescription] = useState("");

  const [copied, setCopied] = useState(false);

  const objectiveDefs = [
    { id: "awareness",   label: "Brand Awareness", icon: "👁️" },
    { id: "leads",       label: "Lead Generation", icon: "🎯" },
    { id: "conversions", label: "Conversions",     icon: "💰" },
    { id: "retargeting", label: "Retargeting",     icon: "🔄" },
  ];

  const platformDefs = [
    { id: "fb",      label: "Facebook",       icon: "📘", color: "#1877F2" },
    { id: "ig",      label: "Instagram",      icon: "📸", color: "#E1306C" },
    { id: "google",  label: "Google Display", icon: "🔍", color: "#34A853" },
    { id: "tiktok",  label: "TikTok",         icon: "🎵", color: "#69C9D0" },
    { id: "youtube", label: "YouTube Shorts", icon: "▶️",  color: "#FF0000" },
  ];

  const steps = [
    { n: 1, label: "Campaign Goal" },
    { n: 2, label: "Creative Assets" },
    { n: 3, label: "Ad Copy" },
    { n: 4, label: "Targeting" },
    { n: 5, label: "Review & Export" },
  ];

  // Derived state
  function togglePlatform(id: string) {
    setPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectedPlatformLabels = platformDefs.filter(p => platforms.has(p.id)).map(p => p.label);
  const objLabel = objectiveDefs.find(o => o.id === cObjective)?.label ?? "Brand Awareness";

  const generatedPrompt = [
    cService  ? cService                                     : "Bed Bugs & Beyond Pest Control",
    `objective: ${cGoal || objLabel}`,
    cAudience ? `audience: ${cAudience}`                    : "homeowners in Baldwin County, AL",
    cOffer    ? `offer: ${cOffer}`                          : null,
    cLocation ? `in ${cLocation}`                           : null,
    cCta      ? `CTA: "${cCta}"`                            : null,
    `platforms: ${selectedPlatformLabels.join(", ") || "Facebook, Instagram"}`,
    headline    ? `headline: "${headline}"`                 : null,
    primaryCopy ? `copy: "${primaryCopy}"`                  : null,
    description ? `description: "${description}"`           : null,
    imgConcept  ? `image concept: ${imgConcept}`            : null,
    vidConcept  ? `video concept: ${vidConcept}`            : null,
    voScript    ? `voiceover: "${voScript}"`                : null,
    "brand colors: #00355F / #00AEEF / #FF6B4A · tone: professional, local, trustworthy",
  ].filter(Boolean).join(" | ");

  function copyPrompt() {
    navigator.clipboard.writeText(generatedPrompt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Generated Campaign Prompt Preview (full width) ── */}
      <div style={{
        padding: "18px 20px", borderRadius: 12,
        background: "linear-gradient(135deg, rgba(251,146,60,0.08) 0%, rgba(251,146,60,0.03) 100%)",
        border: "1.5px solid rgba(251,146,60,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14 }}>🚀</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#FB923C", textTransform: "uppercase", letterSpacing: "0.7px" }}>
            Generated Campaign Prompt
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={copyPrompt} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 13px", borderRadius: 7, cursor: "pointer",
            background: copied ? "rgba(34,197,94,0.12)" : "rgba(251,146,60,0.1)",
            border: copied ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(251,146,60,0.3)",
            color: copied ? "#22C55E" : "#FB923C",
            fontSize: 12, fontWeight: 700, transition: "all 0.15s",
          }}>
            {copied ? "✓ Copied!" : "📋 Copy Prompt"}
          </button>
          <span style={{
            padding: "3px 9px", borderRadius: 5, fontSize: 9, fontWeight: 800, letterSpacing: "0.5px",
            background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",
          }}>PROMPT READY</span>
        </div>
        <div style={{ fontSize: 12.5, color: "#CBD5E1", lineHeight: 1.7, maxHeight: 72, overflow: "hidden" }}>
          {generatedPrompt}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {[
            { label: `🎯 ${objLabel}`,                                                           c: "#FB923C" },
            { label: `📢 ${selectedPlatformLabels.slice(0,3).join(", ") || "Facebook, Instagram"}`, c: "#F97316" },
            { label: `📝 ${headline ? `"${headline.slice(0,20)}…"` : "Add headline →"}`,        c: "#FDBA74" },
            { label: `💰 ${cOffer ? cOffer.slice(0,22) : "Add offer →"}`,                       c: "#475569" },
          ].map(chip => (
            <span key={chip.label} style={{
              padding: "3px 9px", borderRadius: 5, fontSize: 10, fontWeight: 700,
              background: `${chip.c}12`, border: `1px solid ${chip.c}33`, color: chip.c,
            }}>{chip.label}</span>
          ))}
        </div>
      </div>

      {/* ── Two-column grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* LEFT: Campaign Brief + Objective + Platform Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Campaign Brief Builder */}
          <Panel label="Campaign Brief Builder" accent="#FB923C">
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {([
                { key: "goal",     label: "Campaign Objective",     value: cGoal,     set: setCGoal,     ph: "e.g. Drive pest control service calls in Baldwin County" },
                { key: "audience", label: "Target Audience",         value: cAudience, set: setCAudience, ph: "e.g. Homeowners 30–60 in Gulf Shores, Foley, Daphne AL"   },
                { key: "offer",    label: "Offer / Promotion",       value: cOffer,    set: setCOffer,    ph: "e.g. Free inspection + 20% off first treatment"           },
                { key: "service",  label: "Service or Product",      value: cService,  set: setCService,  ph: "e.g. Bed bug extermination, general pest control"         },
                { key: "location", label: "Location / Service Area", value: cLocation, set: setCLocation, ph: "e.g. Baldwin County, Gulf Shores, Foley AL"               },
                { key: "cta",      label: "Call to Action",           value: cCta,      set: setCCta,      ph: "e.g. Call Today, Book Now, Get a Free Quote"              },
              ] as { key: string; label: string; value: string; set: (v: string) => void; ph: string }[]).map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#FB923C", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>{f.label}</div>
                  <input
                    value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: 8, boxSizing: "border-box",
                      background: "rgba(251,146,60,0.05)", border: "1.5px solid rgba(251,146,60,0.18)",
                      color: "#E2E8F0", fontSize: 12.5, outline: "none",
                    }}
                  />
                </div>
              ))}
              <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>💡 Prompt updates automatically as you type</div>
            </div>
          </Panel>

          {/* Campaign Objective */}
          <Panel label="Campaign Objective" accent="#FB923C">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {objectiveDefs.map(o => (
                <button key={o.id} onClick={() => setCObjective(o.id)} style={{
                  padding: "14px 12px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                  background: cObjective === o.id ? "rgba(251,146,60,0.14)" : "rgba(251,146,60,0.04)",
                  border: cObjective === o.id ? "1.5px solid #FB923C" : "1.5px solid rgba(251,146,60,0.15)",
                }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{o.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: cObjective === o.id ? "#FB923C" : "#CBD5E1" }}>{o.label}</div>
                </button>
              ))}
            </div>
          </Panel>

          {/* Platform Selector */}
          <Panel label="Platform Selector" accent="#FB923C">
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {platformDefs.map(p => {
                const active = platforms.has(p.id);
                return (
                  <button key={p.id} onClick={() => togglePlatform(p.id)} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                    borderRadius: 9, cursor: "pointer", textAlign: "left",
                    background: active ? "rgba(251,146,60,0.09)" : "rgba(255,255,255,0.02)",
                    border: active ? "1.5px solid rgba(251,146,60,0.45)" : "1.5px solid rgba(255,255,255,0.06)",
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: active ? `${p.color}22` : "rgba(255,255,255,0.04)",
                      border: active ? `1px solid ${p.color}55` : "1px solid rgba(255,255,255,0.06)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                    }}>{p.icon}</div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: active ? "#E2E8F0" : "#64748B" }}>{p.label}</span>
                    <div style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      background: active ? "#FB923C" : "rgba(255,255,255,0.04)",
                      border: active ? "none" : "1.5px solid rgba(255,255,255,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, color: "#fff", fontWeight: 800,
                    }}>{active ? "✓" : ""}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "#334155" }}>
              {platforms.size} platform{platforms.size !== 1 ? "s" : ""} selected
            </div>
          </Panel>
        </div>

        {/* RIGHT: Campaign Asset Builder + Mock Preview + Actions + Export */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Campaign Asset Builder */}
          <Panel label="Campaign Asset Builder" accent="#FB923C">
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {([
                { key: "imgConcept",  label: "Image Concept",     value: imgConcept,  set: setImgConcept,  rows: 2, ph: "e.g. BB&B technician in uniform treating home, clean bright lighting" },
                { key: "vidConcept",  label: "Video Concept",     value: vidConcept,  set: setVidConcept,  rows: 2, ph: "e.g. Fast cuts — pest problem → BB&B solution → happy family"         },
                { key: "voScript",    label: "Voiceover Script",  value: voScript,    set: setVoScript,    rows: 2, ph: "e.g. Bed bugs keeping you up? Call Bed Bugs and Beyond today."          },
                { key: "primaryCopy", label: "Primary Ad Copy",   value: primaryCopy, set: setPrimaryCopy, rows: 2, ph: "e.g. Baldwin County's most trusted pest control — guaranteed results."  },
                { key: "headline",    label: "Headline",          value: headline,    set: setHeadline,    rows: 1, ph: "e.g. Pest-Free Living Starts Here"                                      },
                { key: "description", label: "Description",       value: description, set: setDescription, rows: 2, ph: "e.g. Fast, effective, guaranteed. Serving Gulf Shores, Foley & beyond." },
              ] as { key: string; label: string; value: string; set: (v: string) => void; rows: number; ph: string }[]).map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#FB923C", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>{f.label}</div>
                  <textarea
                    value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph} rows={f.rows}
                    style={{
                      width: "100%", padding: "8px 11px", borderRadius: 8, resize: "vertical",
                      background: f.value ? "rgba(251,146,60,0.05)" : "rgba(255,255,255,0.01)",
                      border: f.value ? "1px solid rgba(251,146,60,0.28)" : "1px solid rgba(251,146,60,0.12)",
                      color: "#E2E8F0", fontSize: 12, outline: "none",
                      boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.5,
                    }}
                  />
                </div>
              ))}
            </div>
          </Panel>

          {/* Mock Campaign Preview */}
          <Panel label="Campaign Preview" accent="#FB923C">
            <div style={{ position: "relative" }}>
              <div style={{
                position: "absolute", top: 0, right: 0, zIndex: 2,
                padding: "4px 10px", borderRadius: 6, fontSize: 9, fontWeight: 800, letterSpacing: "0.6px",
                background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "#FBBF24",
              }}>COMING SOON</div>

              {/* Facebook-style mockup */}
              <div style={{
                borderRadius: 12, overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.1)", background: "#1A1A2E",
              }}>
                {/* Ad header */}
                <div style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 9, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #00355F, #00AEEF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🐛</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>Bed Bugs & Beyond</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>Sponsored · 📍 Baldwin County, AL</div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {selectedPlatformLabels.slice(0, 2).map(pl => (
                      <span key={pl} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.25)", color: "#FB923C", fontWeight: 700 }}>{pl}</span>
                    ))}
                  </div>
                </div>

                {/* Creative area */}
                <div style={{
                  height: 140,
                  background: "linear-gradient(135deg, #071828 0%, #0D2A3E 50%, #071828 100%)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                  position: "relative", overflow: "hidden",
                }}>
                  <div style={{ position: "absolute", inset: 0, opacity: 0.04, backgroundImage: "repeating-linear-gradient(0deg,#00AEEF,#00AEEF 1px,transparent 1px,transparent 28px),repeating-linear-gradient(90deg,#00AEEF,#00AEEF 1px,transparent 1px,transparent 28px)" }} />
                  <div style={{ fontSize: 32, filter: "drop-shadow(0 0 12px rgba(0,174,239,0.4))" }}>🖼️</div>
                  <div style={{ fontSize: 11, color: "#334155" }}>
                    {imgConcept ? imgConcept.slice(0, 40) + (imgConcept.length > 40 ? "…" : "") : "AI-generated creative appears here"}
                  </div>
                </div>

                {/* Ad body */}
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0", marginBottom: 3 }}>
                    {headline || "Pest-Free Living Starts Here"}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#94A3B8", lineHeight: 1.5, marginBottom: 10 }}>
                    {primaryCopy || "Baldwin County's #1 pest control service. Fast, effective, guaranteed."}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
                    <span style={{ fontSize: 10, color: "#334155" }}>bedbugsandbeyond.com</span>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
                  </div>
                  <button disabled style={{
                    width: "100%", padding: "9px", borderRadius: 7, cursor: "not-allowed",
                    background: "#1877F2", border: "none", color: "#fff", fontSize: 13, fontWeight: 700,
                    opacity: 0.7,
                  }}>{cCta || "Call Now"}</button>
                </div>

                {/* Platform pills */}
                <div style={{ padding: "8px 14px 12px", display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {platformDefs.filter(p => platforms.has(p.id)).map(p => (
                    <span key={p.id} style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 10,
                      background: `${p.color}15`, border: `1px solid ${p.color}33`, color: p.color, fontWeight: 600,
                    }}>{p.icon} {p.label}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={copyPrompt} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px", borderRadius: 9, cursor: "pointer",
                background: copied ? "rgba(34,197,94,0.1)" : "rgba(251,146,60,0.08)",
                border: copied ? "1.5px solid rgba(34,197,94,0.35)" : "1.5px solid rgba(251,146,60,0.28)",
                color: copied ? "#22C55E" : "#FB923C",
                fontSize: 12, fontWeight: 700, transition: "all 0.15s",
              }}>
                {copied ? "✓ Copied!" : "📋 Copy Prompt"}
              </button>
              <button disabled title="AI campaign generation coming in next release" style={{
                flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "10px", borderRadius: 9, cursor: "not-allowed",
                background: "rgba(251,146,60,0.04)", border: "1.5px solid rgba(251,146,60,0.15)",
                color: "#334155", fontSize: 12, fontWeight: 700,
              }}>
                <span style={{ fontSize: 13 }}>✨</span>
                Generate Campaign
                <span style={{
                  padding: "2px 7px", borderRadius: 4, fontSize: 9, fontWeight: 800,
                  background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",
                }}>SOON</span>
              </button>
            </div>
          </Panel>

          {/* Export */}
          <Panel label="Export Campaign Assets" accent="#FB923C">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <ExportButton label="Campaign ZIP" accent="#FB923C" />
              <ExportButton label="Media Kit"    accent="#FB923C" />
              <ExportButton label="Ad Package"   accent="#FB923C" />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── AI Integration Control Center ─────────────────────────────────────────────
function AIIntegrationsCenter({ t }: { t: ReturnType<typeof useTheme>["colors"] }) {
  const providers = [
    { name: "OpenAI Images",        purpose: "AI image generation (DALL·E 3)",            icon: "🤖", reqType: "API Key",           color: "#00A67E", category: "Generation" },
    { name: "Runway Video",         purpose: "AI video generation (Gen-3 Alpha)",          icon: "🎬", reqType: "API Key",           color: "#7C3AED", category: "Generation" },
    { name: "ElevenLabs Voice",     purpose: "Realistic AI voice synthesis & cloning",     icon: "🎙️", reqType: "API Key",           color: "#9B59B6", category: "Generation" },
    { name: "HeyGen Avatar Video",  purpose: "AI talking avatar video creation",           icon: "👤", reqType: "API Key + OAuth",   color: "#06B6D4", category: "Generation" },
    { name: "Cloudinary Storage",   purpose: "Cloud media storage, CDN & transformation", icon: "☁️", reqType: "API Key + Webhook", color: "#3448C5", category: "Infrastructure" },
    { name: "Meta Ads Export",      purpose: "Direct Facebook & Instagram ad publishing",  icon: "📘", reqType: "OAuth",             color: "#1877F2", category: "Distribution" },
    { name: "Google Ads Export",    purpose: "Google Display & YouTube Shorts ad export",  icon: "🔍", reqType: "OAuth",             color: "#34A853", category: "Distribution" },
  ];

  const pipeline = [
    { step: 1, label: "Prompt Builder",       icon: "✍️",  desc: "Brief, brand tone, target" },
    { step: 2, label: "Brand Kit",            icon: "🎨",  desc: "Colors, logo, voice style" },
    { step: 3, label: "AI Provider",          icon: "🤖",  desc: "Generate image / video / audio" },
    { step: 4, label: "Preview Output",       icon: "👁️",  desc: "Review, refine, approve" },
    { step: 5, label: "Export & Campaign",    icon: "🚀",  desc: "Publish to ad platforms" },
  ];

  const categoryColors: Record<string, string> = {
    Generation:     "#A78BFA",
    Infrastructure: "#00AEEF",
    Distribution:   "#FB923C",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Section header */}
      <div style={{
        padding: "18px 20px", borderRadius: 12,
        background: "linear-gradient(135deg, rgba(0,174,239,0.07) 0%, rgba(0,174,239,0.02) 100%)",
        border: "1.5px solid rgba(0,174,239,0.25)",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          background: "linear-gradient(135deg, rgba(0,174,239,0.2), rgba(167,139,250,0.2))",
          border: "1.5px solid rgba(0,174,239,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
        }}>🔌</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#E2E8F0", marginBottom: 3 }}>AI Integration Control Center</div>
          <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.5 }}>
            Connect AI generation providers and ad distribution platforms. All integrations are ready to configure — backend activation ships in the next release.
          </div>
        </div>
        <span style={{
          padding: "5px 13px", borderRadius: 20, fontSize: 10, fontWeight: 800, letterSpacing: "0.6px", flexShrink: 0,
          background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",
        }}>PHASE 8 COMING SOON</span>
      </div>

      {/* Provider Cards */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#00AEEF", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 14 }}>
          AI Provider Cards
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {providers.map(prov => {
            const catColor = categoryColors[prov.category] ?? "#00AEEF";
            return (
              <div key={prov.name} style={{
                padding: "18px 16px", borderRadius: 14,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
                display: "flex", flexDirection: "column", gap: 10,
                transition: "border-color 0.15s",
              }}>
                {/* Provider header */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: `${prov.color}14`, border: `1.5px solid ${prov.color}33`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                  }}>{prov.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prov.name}</div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                      background: `${catColor}14`, border: `1px solid ${catColor}33`, color: catColor,
                    }}>{prov.category}</span>
                  </div>
                </div>

                {/* Purpose */}
                <div style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.5 }}>{prov.purpose}</div>

                {/* Status + Requirement */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#374151", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "#374151", fontWeight: 700 }}>Not Connected</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#334155" }}>
                    Required: <span style={{ color: "#475569", fontWeight: 600 }}>{prov.reqType}</span>
                  </div>
                </div>

                {/* Connect button */}
                <button disabled title="Integration coming in next release" style={{
                  width: "100%", padding: "8px", borderRadius: 8, cursor: "not-allowed",
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
                  color: "#334155", fontSize: 11.5, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  🔗 Connect
                  <span style={{
                    padding: "1px 5px", borderRadius: 3, fontSize: 8, fontWeight: 800,
                    background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",
                  }}>SOON</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Generation Pipeline Preview */}
      <Panel label="Generation Pipeline Preview" accent="#00AEEF">
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 16 }}>
          End-to-end AI media generation flow — from brief to published campaign
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {pipeline.map((step, i) => (
            <div key={step.step} style={{ display: "flex", alignItems: "center", flex: i < pipeline.length - 1 ? 1 : "none" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 50, height: 50, borderRadius: 14,
                  background: "linear-gradient(135deg, rgba(0,174,239,0.12) 0%, rgba(167,139,250,0.08) 100%)",
                  border: "1.5px solid rgba(0,174,239,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                }}>{step.icon}</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#CBD5E1", whiteSpace: "nowrap" }}>{step.label}</div>
                  <div style={{ fontSize: 9.5, color: "#475569", marginTop: 2, whiteSpace: "nowrap" }}>{step.desc}</div>
                </div>
              </div>
              {i < pipeline.length - 1 && (
                <div style={{
                  flex: 1, height: 2, margin: "0 8px", marginBottom: 30,
                  background: "linear-gradient(90deg, rgba(0,174,239,0.3), rgba(167,139,250,0.3))",
                  borderRadius: 1,
                }}>
                  <div style={{ display: "flex", justifyContent: "center", marginTop: -4 }}>
                    <span style={{ fontSize: 12, color: "rgba(0,174,239,0.4)" }}>›</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: 10, background: "rgba(0,174,239,0.04)", border: "1px solid rgba(0,174,239,0.12)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>⚡</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#00AEEF", marginBottom: 2 }}>Ready to activate</div>
              <div style={{ fontSize: 11, color: "#334155" }}>
                All prompt builders and brand kits are complete. Connect providers in Phase 8 to unlock full AI generation.
              </div>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ── Shared style helpers ──────────────────────────────────────────────────────
function Panel({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 12,
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 12 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ComingSoonBadge() {
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px", borderRadius: 5,
      fontSize: 9, fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase",
      background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)",
      color: "#FBBF24", marginLeft: 7, verticalAlign: "middle",
    }}>
      Coming Soon
    </span>
  );
}

function GenButton({ accent, label }: { accent: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      <button disabled title="Generation coming soon" style={{
        padding: "11px 20px", borderRadius: 9, whiteSpace: "nowrap",
        background: "rgba(255,255,255,0.03)", border: "1.5px solid rgba(255,255,255,0.08)",
        color: "#475569", fontSize: 13, fontWeight: 700, cursor: "not-allowed", opacity: 0.7,
      }}>
        {label}
      </button>
      <ComingSoonBadge />
    </div>
  );
}

function ExportButton({ label, accent }: { label: string; accent: string }) {
  return (
    <div style={{ position: "relative", flex: 1 }}>
      <button disabled title="Export coming soon" style={{
        width: "100%", padding: "9px 14px", borderRadius: 8,
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        color: "#374151", fontSize: 12, fontWeight: 600, cursor: "not-allowed",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
      }}>
        <span style={{ opacity: 0.4 }}>⬇</span>
        <span style={{ opacity: 0.5 }}>{label}</span>
      </button>
      <span style={{
        position: "absolute", top: -7, right: -4,
        padding: "1px 5px", borderRadius: 4,
        fontSize: 8, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase",
        background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)",
        color: "#FBBF24", whiteSpace: "nowrap",
      }}>
        Soon
      </span>
    </div>
  );
}

function genBtn(accent: string): React.CSSProperties {
  return {
    padding: "11px 20px", borderRadius: 9, whiteSpace: "nowrap",
    background: "rgba(255,255,255,0.03)", border: "1.5px solid rgba(255,255,255,0.08)",
    color: "#475569", fontSize: 13, fontWeight: 700, cursor: "not-allowed", opacity: 0.7,
  };
}

function chipBtn(active: boolean, accent: string): React.CSSProperties {
  return {
    flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer", textAlign: "center" as const,
    background: active ? `${accent}18` : "rgba(255,255,255,0.02)",
    border: active ? `1.5px solid ${accent}` : "1.5px solid rgba(255,255,255,0.06)",
    color: active ? accent : "#94A3B8",
  };
}

function tagBtn(active: boolean, accent: string): React.CSSProperties {
  return {
    padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600,
    background: active ? `${accent}18` : "rgba(255,255,255,0.03)",
    border: active ? `1px solid ${accent}66` : "1px solid rgba(255,255,255,0.06)",
    color: active ? accent : "#64748B",
  };
}

const exportBtn: React.CSSProperties = {
  flex: 1, padding: "9px 14px", borderRadius: 8, cursor: "not-allowed",
  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
  color: "#374151", fontSize: 12, fontWeight: 600, opacity: 0.6,
};

// ── Brand Kit defaults ────────────────────────────────────────────────────────
const DEFAULT_BRAND_KITS: Record<Brand, BrandKitData> = {
  bbb: {
    name: "Bed Bugs & Beyond",
    primaryColor: "#00355F",
    secondaryColor: "#00AEEF",
    accentColor: "#FF6B4A",
    tone: "Professional, trustworthy, local",
    industry: "Pest Control",
  },
  aie: {
    name: "AI Edge Solutions",
    primaryColor: "#00AEEF",
    secondaryColor: "#C0C0C0",
    accentColor: "#030612",
    tone: "Futuristic, intelligent, premium",
    industry: "AI Automation",
  },
};

// ── Template presets ──────────────────────────────────────────────────────────
const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "bbb-social-post",
    name: "BB&B Social Post",
    category: "Social Post",
    brand: "bbb",
    studio: "image",
    desc: "1080×1080 professional pest control graphic with bold CTA",
    seed: {
      format: "social",
      style: "bold",
      prompt: "Bed Bugs & Beyond pest control team in blue uniforms treating a home exterior, bright sunlight, professional service van visible, bold text overlay 'Pest-Free Living Starts Here'",
    },
  },
  {
    id: "bbb-facebook-ad",
    name: "BB&B Facebook Lead Ad",
    category: "Facebook Ad",
    brand: "bbb",
    studio: "ad",
    desc: "Lead generation campaign targeting Baldwin County homeowners",
    seed: { adGoal: "leads" },
  },
  {
    id: "bbb-instagram-ad",
    name: "BB&B Instagram Ad",
    category: "Instagram Ad",
    brand: "bbb",
    studio: "image",
    desc: "1200×628 ad creative for Instagram feed placement",
    seed: {
      format: "ad",
      style: "modern",
      prompt: "Clean, professional pest-free home interior, Bed Bugs & Beyond branding, navy and aqua color palette, 'Call Today — Guaranteed Results' headline overlay",
    },
  },
  {
    id: "bbb-commercial-video",
    name: "BB&B 30s Commercial",
    category: "Commercial Video",
    brand: "bbb",
    studio: "video",
    desc: "30-second commercial clip for YouTube and Facebook",
    seed: { videoType: "commercial", duration: 30 },
  },
  {
    id: "bbb-receptionist",
    name: "BB&B AI Receptionist",
    category: "AI Receptionist Greeting",
    brand: "bbb",
    studio: "audio",
    desc: "Professional IVR greeting for Bed Bugs & Beyond",
    seed: {
      audioType: "receptionist",
      voice: "Joanna",
      script: "Hi, thank you for calling Bed Bugs and Beyond Pest Control. To speak directly with us, press 1. To request a callback, press 2. To leave a voicemail, press 3.",
    },
  },
  {
    id: "bbb-voiceover-ad",
    name: "BB&B Radio Voiceover",
    category: "Voiceover Ad",
    brand: "bbb",
    studio: "audio",
    desc: "30-second voiceover ad script for radio and digital audio",
    seed: {
      audioType: "ad-audio",
      voice: "Matthew",
      script: "Bed bugs keeping you up at night? Bed Bugs and Beyond has you covered. Serving Baldwin County with fast, effective, guaranteed pest control. Call today for a free inspection.",
    },
  },
  {
    id: "aie-social-post",
    name: "AI Edge Social Post",
    category: "Social Post",
    brand: "aie",
    studio: "image",
    desc: "Premium 1080×1080 tech-forward brand graphic",
    seed: {
      format: "social",
      style: "luxury",
      prompt: "Futuristic AI dashboard interface with glowing cyan neural network visualization, dark navy background, AI Edge Solutions logo, metallic silver typography, premium SaaS aesthetic",
    },
  },
  {
    id: "aie-facebook-ad",
    name: "AI Edge Lead Gen Ad",
    category: "Facebook Ad",
    brand: "aie",
    studio: "ad",
    desc: "High-converting awareness campaign for AI automation services",
    seed: { adGoal: "awareness" },
  },
];

// ── Brand Kit Section ─────────────────────────────────────────────────────────
function BrandKitSection({ activeBrand, onBrandChange }: {
  activeBrand: Brand;
  onBrandChange: (b: Brand) => void;
}) {
  const [kits, setKits] = useState<Record<Brand, BrandKitData>>(DEFAULT_BRAND_KITS);

  const kit = kits[activeBrand];

  function update(field: keyof BrandKitData, value: string) {
    setKits(prev => ({ ...prev, [activeBrand]: { ...prev[activeBrand], [field]: value } }));
  }

  const brandTabs: { id: Brand; label: string; icon: string; accent: string }[] = [
    { id: "bbb", label: "Bed Bugs & Beyond", icon: "🐛", accent: "#00AEEF" },
    { id: "aie", label: "AI Edge Solutions",  icon: "⚡", accent: "#A78BFA" },
  ];

  const colorFields: { key: keyof BrandKitData; label: string }[] = [
    { key: "primaryColor",   label: "Primary" },
    { key: "secondaryColor", label: "Secondary" },
    { key: "accentColor",    label: "Accent" },
  ];

  const accent = brandTabs.find(b => b.id === activeBrand)!.accent;

  return (
    <div style={{ marginTop: 36 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ height: 1, width: 20, background: "rgba(255,255,255,0.06)" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.9px", whiteSpace: "nowrap" }}>
          🎨 Brand Kit
        </span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
        <span style={{
          padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.18)", color: "#00AEEF",
        }}>
          CENTRAL BRAND SETTINGS
        </span>
      </div>

      <div style={{
        padding: "24px", borderRadius: 16,
        background: "rgba(255,255,255,0.01)",
        border: `1.5px solid ${accent}22`,
      }}>
        {/* Brand selector tabs */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          {brandTabs.map(b => (
            <button key={b.id} onClick={() => onBrandChange(b.id)} style={{
              display: "flex", alignItems: "center", gap: 9, padding: "11px 18px",
              borderRadius: 10, cursor: "pointer",
              background: activeBrand === b.id
                ? `linear-gradient(135deg, ${b.accent}18 0%, ${b.accent}08 100%)`
                : "rgba(255,255,255,0.02)",
              border: activeBrand === b.id ? `1.5px solid ${b.accent}` : "1.5px solid rgba(255,255,255,0.07)",
              boxShadow: activeBrand === b.id ? `0 0 16px ${b.accent}18` : "none",
            }}>
              <span style={{ fontSize: 18 }}>{b.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: activeBrand === b.id ? "#E2E8F0" : "#475569" }}>
                {b.label}
              </span>
              {activeBrand === b.id && (
                <span style={{
                  padding: "2px 7px", borderRadius: 4, fontSize: 9, fontWeight: 800,
                  background: `${b.accent}22`, border: `1px solid ${b.accent}55`, color: b.accent,
                }}>ACTIVE</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Brand Name */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7 }}>
                Brand Name
              </label>
              <input
                value={kit.name}
                onChange={e => update("name", e.target.value)}
                style={{
                  width: "100%", padding: "11px 14px", borderRadius: 9, boxSizing: "border-box",
                  background: `${accent}06`, border: `1.5px solid ${accent}28`,
                  color: "#E2E8F0", fontSize: 14, fontWeight: 600, outline: "none",
                }}
              />
            </div>

            {/* Colors */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 10 }}>
                Brand Colors
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {colorFields.map(cf => (
                  <div key={cf.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="color"
                      value={kit[cf.key]}
                      onChange={e => update(cf.key, e.target.value)}
                      style={{
                        width: 38, height: 38, borderRadius: 8, border: `1.5px solid ${accent}33`,
                        background: "transparent", cursor: "pointer", padding: 2, flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 3 }}>{cf.label}</div>
                      <input
                        value={kit[cf.key]}
                        onChange={e => update(cf.key, e.target.value)}
                        maxLength={7}
                        style={{
                          width: "100%", padding: "6px 10px", borderRadius: 7, boxSizing: "border-box",
                          background: `${accent}06`, border: `1px solid ${accent}22`,
                          color: "#E2E8F0", fontSize: 12, fontFamily: "monospace", outline: "none",
                        }}
                      />
                    </div>
                    <div style={{
                      width: 32, height: 32, borderRadius: 7, flexShrink: 0,
                      background: kit[cf.key], border: "1.5px solid rgba(255,255,255,0.12)",
                    }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Logo upload placeholder */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7 }}>
                Logo
              </label>
              <div style={{
                padding: "24px 16px", borderRadius: 10, textAlign: "center", cursor: "pointer",
                background: `${accent}06`, border: `2px dashed ${accent}33`,
                transition: "border-color 0.15s",
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🖼️</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 4 }}>Upload Logo</div>
                <div style={{ fontSize: 11, color: "#334155" }}>PNG, SVG or WebP — max 2 MB</div>
                <div style={{
                  display: "inline-block", marginTop: 12, padding: "6px 14px", borderRadius: 7,
                  background: `${accent}12`, border: `1px solid ${accent}44`, color: accent,
                  fontSize: 11, fontWeight: 700,
                }}>
                  Browse Files
                </div>
              </div>
            </div>

            {/* Tone / Voice */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7 }}>
                Tone / Voice
              </label>
              <input
                value={kit.tone}
                onChange={e => update("tone", e.target.value)}
                style={{
                  width: "100%", padding: "11px 14px", borderRadius: 9, boxSizing: "border-box",
                  background: `${accent}06`, border: `1.5px solid ${accent}28`,
                  color: "#E2E8F0", fontSize: 13, outline: "none",
                }}
              />
            </div>

            {/* Industry */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7 }}>
                Industry
              </label>
              <input
                value={kit.industry}
                onChange={e => update("industry", e.target.value)}
                style={{
                  width: "100%", padding: "11px 14px", borderRadius: 9, boxSizing: "border-box",
                  background: `${accent}06`, border: `1.5px solid ${accent}28`,
                  color: "#E2E8F0", fontSize: 13, outline: "none",
                }}
              />
            </div>

            {/* Color preview strip */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7 }}>
                Color Preview
              </label>
              <div style={{ display: "flex", gap: 0, borderRadius: 10, overflow: "hidden", height: 44 }}>
                <div style={{ flex: 1, background: kit.primaryColor }}   title={`Primary ${kit.primaryColor}`}   />
                <div style={{ flex: 1, background: kit.secondaryColor }} title={`Secondary ${kit.secondaryColor}`} />
                <div style={{ flex: 1, background: kit.accentColor }}    title={`Accent ${kit.accentColor}`}    />
              </div>
              <div style={{ display: "flex", marginTop: 4 }}>
                {["Primary", "Secondary", "Accent"].map(l => (
                  <div key={l} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "#334155", fontWeight: 600 }}>{l}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Kit applied notice */}
        <div style={{
          marginTop: 20, padding: "10px 14px", borderRadius: 8,
          background: `${accent}08`, border: `1px solid ${accent}22`,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 13 }}>💡</span>
          <span style={{ fontSize: 12, color: "#475569" }}>
            These brand settings are automatically applied when using <strong style={{ color: accent }}>Use Template</strong> below and inform Image Studio, Ad Creator, and Audio Studio defaults.
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Template Engine Section ───────────────────────────────────────────────────
const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "Social Post", "Facebook Ad", "Instagram Ad",
  "Commercial Video", "AI Receptionist Greeting", "Voiceover Ad",
];

const CATEGORY_META: Record<TemplateCategory, { icon: string; studio: Studio; accent: string }> = {
  "Social Post":              { icon: "📱", studio: "image", accent: "#00AEEF" },
  "Facebook Ad":              { icon: "📘", studio: "ad",    accent: "#1877F2" },
  "Instagram Ad":             { icon: "📸", studio: "image", accent: "#E1306C" },
  "Commercial Video":         { icon: "🎥", studio: "video", accent: "#A78BFA" },
  "AI Receptionist Greeting": { icon: "🤖", studio: "audio", accent: "#34D399" },
  "Voiceover Ad":             { icon: "🎙️", studio: "audio", accent: "#34D399" },
};

const BRAND_LABELS: Record<Brand | "both", { label: string; icon: string }> = {
  bbb:  { label: "BB&B",            icon: "🐛" },
  aie:  { label: "AI Edge",         icon: "⚡" },
  both: { label: "Both brands",     icon: "🔀" },
};

function TemplateEngineSection({ onUseTemplate }: {
  onUseTemplate: (preset: TemplatePreset) => void;
}) {
  const [catFilter, setCatFilter] = useState<TemplateCategory | "all">("all");
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());

  const visible = catFilter === "all"
    ? TEMPLATE_PRESETS
    : TEMPLATE_PRESETS.filter(p => p.category === catFilter);

  function handleUse(preset: TemplatePreset) {
    setUsedIds(prev => new Set([...prev, preset.id]));
    onUseTemplate(preset);
  }

  return (
    <div style={{ marginTop: 36 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ height: 1, width: 20, background: "rgba(255,255,255,0.06)" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.9px", whiteSpace: "nowrap" }}>
          ⚡ Template Engine
        </span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
        <span style={{
          padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", color: "#A78BFA",
        }}>
          {TEMPLATE_PRESETS.length} TEMPLATES
        </span>
      </div>

      {/* Category filter pills */}
      <div style={{ display: "flex", gap: 7, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={() => setCatFilter("all")} style={{
          padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600,
          background: catFilter === "all" ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.03)",
          border: catFilter === "all" ? "1.5px solid rgba(167,139,250,0.45)" : "1px solid rgba(255,255,255,0.07)",
          color: catFilter === "all" ? "#A78BFA" : "#475569",
        }}>
          🗂 All Templates
        </button>
        {TEMPLATE_CATEGORIES.map(cat => {
          const meta = CATEGORY_META[cat];
          const active = catFilter === cat;
          return (
            <button key={cat} onClick={() => setCatFilter(cat)} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 13px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: active ? `${meta.accent}14` : "rgba(255,255,255,0.03)",
              border: active ? `1.5px solid ${meta.accent}66` : "1px solid rgba(255,255,255,0.07)",
              color: active ? meta.accent : "#475569",
            }}>
              <span style={{ fontSize: 12 }}>{meta.icon}</span>
              {cat}
            </button>
          );
        })}
      </div>

      {/* Template cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {visible.map(preset => {
          const catMeta   = CATEGORY_META[preset.category];
          const brandMeta = BRAND_LABELS[preset.brand];
          const studioMeta = STUDIO_META[preset.studio];
          const used = usedIds.has(preset.id);

          return (
            <div key={preset.id} style={{
              padding: "20px 20px 18px", borderRadius: 14, position: "relative", overflow: "hidden",
              background: "linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)",
              border: `1px solid ${catMeta.accent}28`,
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}>
              {/* Top accent strip */}
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, transparent, ${catMeta.accent}88, transparent)`,
              }} />

              {/* Header row */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: `${catMeta.accent}14`, border: `1px solid ${catMeta.accent}33`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                  }}>
                    {catMeta.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0", lineHeight: 1.2 }}>{preset.name}</div>
                    <div style={{ fontSize: 10.5, color: catMeta.accent, fontWeight: 600, marginTop: 2 }}>{preset.category}</div>
                  </div>
                </div>
                {used && (
                  <span style={{
                    padding: "3px 8px", borderRadius: 5, fontSize: 9, fontWeight: 800,
                    background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22C55E",
                  }}>LOADED</span>
                )}
              </div>

              {/* Description */}
              <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5, marginBottom: 14 }}>
                {preset.desc}
              </div>

              {/* Meta row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94A3B8",
                }}>
                  {brandMeta.icon} {brandMeta.label}
                </span>
                <span style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                  background: `${studioMeta.accent}0E`, border: `1px solid ${studioMeta.accent}28`, color: studioMeta.accent,
                }}>
                  {studioMeta.icon} {studioMeta.label}
                </span>
              </div>

              {/* Use Template button */}
              <button onClick={() => handleUse(preset)} style={{
                width: "100%", padding: "10px", borderRadius: 9, cursor: "pointer",
                background: used
                  ? "rgba(34,197,94,0.08)"
                  : `linear-gradient(135deg, ${catMeta.accent}1A 0%, ${catMeta.accent}0A 100%)`,
                border: used
                  ? "1.5px solid rgba(34,197,94,0.3)"
                  : `1.5px solid ${catMeta.accent}55`,
                color: used ? "#22C55E" : catMeta.accent,
                fontSize: 12, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                {used ? "✓ Template Loaded — Open Studio ↑" : `⚡ Use Template → ${studioMeta.label}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Save Project Modal ────────────────────────────────────────────────────────
interface SaveModalState { open: boolean; type: Studio; }

function SaveProjectModal({
  state, onClose, onSave,
}: {
  state: SaveModalState;
  onClose: () => void;
  onSave: (p: Omit<MediaProject, "id" | "createdAt">) => void;
}) {
  const studio = STUDIOS.find(s => s.id === state.type)!;
  const [name, setName]   = useState(`${studio.label} Project`);
  const [brand, setBrand] = useState<Brand>("bbb");

  if (!state.open) return null;

  const brands: { id: Brand; label: string; icon: string }[] = [
    { id: "bbb", label: "Bed Bugs & Beyond",   icon: "🐛" },
    { id: "aie", label: "AI Edge Solutions",    icon: "⚡" },
  ];

  function handleSave() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), type: state.type, status: "Draft", brand });
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(3,6,18,0.82)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={onClose}>
      <div style={{
        width: "100%", maxWidth: 420, borderRadius: 16, padding: "28px 28px 24px",
        background: "linear-gradient(135deg, #0B1629 0%, #060E1E 100%)",
        border: `1.5px solid ${studio.accent}44`,
        boxShadow: `0 0 40px ${studio.accent}18`,
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <span style={{ fontSize: 22 }}>{studio.icon}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#E2E8F0" }}>Save as Project</div>
            <div style={{ fontSize: 11, color: "#475569" }}>{studio.label}</div>
          </div>
          <button onClick={onClose} style={{
            marginLeft: "auto", width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#64748B", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        {/* Project name */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: studio.accent, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7 }}>
            Project Name
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSave()}
            autoFocus
            style={{
              width: "100%", padding: "11px 14px", borderRadius: 9, boxSizing: "border-box",
              background: `${studio.accent}08`, border: `1.5px solid ${studio.accent}33`,
              color: "#E2E8F0", fontSize: 14, outline: "none",
            }}
          />
        </div>

        {/* Brand */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: studio.accent, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 7 }}>
            Brand
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {brands.map(b => (
              <button key={b.id} onClick={() => setBrand(b.id)} style={{
                flex: 1, padding: "11px 10px", borderRadius: 9, cursor: "pointer", textAlign: "center",
                background: brand === b.id ? `${studio.accent}14` : "rgba(255,255,255,0.02)",
                border: brand === b.id ? `1.5px solid ${studio.accent}` : "1.5px solid rgba(255,255,255,0.08)",
              }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{b.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: brand === b.id ? "#E2E8F0" : "#64748B" }}>{b.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "11px", borderRadius: 9, cursor: "pointer",
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            color: "#64748B", fontSize: 13, fontWeight: 600,
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            flex: 2, padding: "11px", borderRadius: 9, cursor: "pointer",
            background: `linear-gradient(135deg, ${studio.accent}28 0%, ${studio.accent}14 100%)`,
            border: `1.5px solid ${studio.accent}88`, color: studio.accent,
            fontSize: 13, fontWeight: 700,
          }}>💾 Save as Draft</button>
        </div>
      </div>
    </div>
  );
}

// ── Saved Projects Section ────────────────────────────────────────────────────
const STUDIO_META: Record<Studio, { icon: string; label: string; accent: string }> = {
  image:        { icon: "🖼️", label: "Image Studio",          accent: "#00AEEF" },
  video:        { icon: "🎬", label: "Video Studio",          accent: "#A78BFA" },
  audio:        { icon: "🎙️", label: "Audio Studio",          accent: "#34D399" },
  ad:           { icon: "🚀", label: "Ad Creator",            accent: "#FB923C" },
  integrations: { icon: "🔌", label: "AI Integrations",       accent: "#00AEEF" },
};

const BRAND_META: Record<Brand, { label: string; icon: string; color: string }> = {
  bbb: { label: "Bed Bugs & Beyond",  icon: "🐛", color: "#00AEEF" },
  aie: { label: "AI Edge Solutions",  icon: "⚡", color: "#A78BFA" },
};

function SavedProjectsSection({
  projects, onDelete, onJump,
}: {
  projects: MediaProject[];
  onDelete: (id: string) => void;
  onJump: (type: Studio) => void;
}) {
  const [filter, setFilter] = useState<Studio | "all">("all");

  const filters: { id: Studio | "all"; label: string; icon: string }[] = [
    { id: "all",   label: "All",          icon: "📁" },
    { id: "image", label: "Image Studio", icon: "🖼️" },
    { id: "video", label: "Video Studio", icon: "🎬" },
    { id: "audio", label: "Audio Studio", icon: "🎙️" },
    { id: "ad",    label: "Ad Creator",   icon: "🚀" },
  ];

  const visible = filter === "all" ? projects : projects.filter(p => p.type === filter);

  function formatDate(d: Date) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div style={{ marginTop: 36 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ height: 1, width: 20, background: "rgba(255,255,255,0.06)" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.9px", whiteSpace: "nowrap" }}>
          📁 Saved Projects
        </span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
        {projects.length > 0 && (
          <span style={{
            padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.2)", color: "#00AEEF",
          }}>
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 7, marginBottom: 20, flexWrap: "wrap" }}>
        {filters.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 13px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600,
            background: filter === f.id ? "rgba(0,174,239,0.12)" : "rgba(255,255,255,0.03)",
            border: filter === f.id ? "1.5px solid rgba(0,174,239,0.45)" : "1px solid rgba(255,255,255,0.07)",
            color: filter === f.id ? "#00AEEF" : "#475569",
            transition: "all 0.12s",
          }}>
            <span style={{ fontSize: 13 }}>{f.icon}</span>
            {f.label}
            {f.id !== "all" && projects.filter(p => p.type === f.id).length > 0 && (
              <span style={{
                padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 800,
                background: "rgba(0,174,239,0.15)", color: "#00AEEF",
              }}>
                {projects.filter(p => p.type === f.id).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <div style={{
          padding: "48px 24px", borderRadius: 14, textAlign: "center",
          background: "rgba(255,255,255,0.01)", border: "1.5px dashed rgba(255,255,255,0.07)",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>
            {filter === "all" ? "📁" : STUDIO_META[filter].icon}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
            {filter === "all" ? "No saved projects yet" : `No ${STUDIO_META[filter].label} projects yet`}
          </div>
          <div style={{ fontSize: 13, color: "#1E293B", marginBottom: 20 }}>
            Configure a studio above, then click{" "}
            <span style={{ fontWeight: 700, color: "#64748B" }}>Save as Project</span>{" "}
            to track it here.
          </div>
          {filter !== "all" && (
            <button onClick={() => onJump(filter as Studio)} style={{
              padding: "9px 20px", borderRadius: 9, cursor: "pointer",
              background: `${STUDIO_META[filter as Studio].accent}14`,
              border: `1.5px solid ${STUDIO_META[filter as Studio].accent}44`,
              color: STUDIO_META[filter as Studio].accent, fontSize: 13, fontWeight: 700,
            }}>
              Open {STUDIO_META[filter as Studio].label}
            </button>
          )}
        </div>
      )}

      {/* Project cards grid */}
      {visible.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {visible.map(p => {
            const meta  = STUDIO_META[p.type];
            const brand = BRAND_META[p.brand];
            return (
              <div key={p.id} style={{
                padding: "18px 18px 16px", borderRadius: 13,
                background: "rgba(255,255,255,0.02)", border: `1px solid ${meta.accent}22`,
                position: "relative", overflow: "hidden",
              }}>
                {/* Subtle glow strip */}
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 2,
                  background: `linear-gradient(90deg, transparent, ${meta.accent}66, transparent)`,
                }} />

                {/* Top row: type icon + status badge */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: `${meta.accent}14`, border: `1px solid ${meta.accent}33`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
                    }}>
                      {meta.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: meta.accent }}>{meta.label}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                      background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",
                    }}>
                      {p.status}
                    </span>
                  </div>
                </div>

                {/* Project name */}
                <div style={{ fontSize: 14, fontWeight: 800, color: "#E2E8F0", marginBottom: 10, lineHeight: 1.3 }}>
                  {p.name}
                </div>

                {/* Meta row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 13 }}>{brand.icon}</span>
                  <span style={{ fontSize: 11.5, color: "#475569", flex: 1 }}>{brand.label}</span>
                  <span style={{ fontSize: 11, color: "#334155" }}>{formatDate(p.createdAt)}</span>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 7 }}>
                  <button onClick={() => onJump(p.type)} style={{
                    flex: 1, padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                    background: `${meta.accent}0E`, border: `1px solid ${meta.accent}33`,
                    color: meta.accent, fontSize: 11, fontWeight: 700,
                  }}>
                    ✏️ Open Studio
                  </button>
                  <button onClick={() => onDelete(p.id)} style={{
                    padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                    background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)",
                    color: "#EF4444", fontSize: 11, fontWeight: 700,
                  }}>
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MediaEnginePage() {
  const { colors: t } = useTheme();
  const [activeStudio, setActiveStudio] = useState<Studio>("image");
  const [projects, setProjects]         = useState<MediaProject[]>([]);
  const [modal, setModal]               = useState<SaveModalState>({ open: false, type: "image" });
  const [activeBrand, setActiveBrand]   = useState<Brand>("bbb");
  const [seed, setSeed]                 = useState<StudioSeed | undefined>(undefined);
  const [seedKey, setSeedKey]           = useState(0);

  const studio = STUDIOS.find(s => s.id === activeStudio)!;

  function openSaveModal() {
    setModal({ open: true, type: activeStudio });
  }

  function handleSaveProject(data: Omit<MediaProject, "id" | "createdAt">) {
    setProjects(prev => [{
      ...data,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date(),
    }, ...prev]);
  }

  function deleteProject(id: string) {
    setProjects(prev => prev.filter(p => p.id !== id));
  }

  function applyTemplate(preset: TemplatePreset) {
    setSeed(preset.seed);
    setSeedKey(k => k + 1);
    setActiveStudio(preset.studio);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <AppShell>
      {/* Frontend Preview Only notice */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 20,
        padding: "11px 16px", borderRadius: 10,
        background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)",
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>🔧</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#FBBF24" }}>Frontend Preview Only</span>
          <span style={{ fontSize: 12, color: "#92400E", marginLeft: 8 }}>
            UI configuration is fully functional. AI generation and file export require backend integration — coming in the next release.
          </span>
        </div>
        <span style={{
          padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 800, letterSpacing: "0.5px", whiteSpace: "nowrap",
          background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",
        }}>
          v0.1 BETA
        </span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg, rgba(0,174,239,0.2) 0%, rgba(167,139,250,0.2) 100%)",
            border: "1.5px solid rgba(0,174,239,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
          }}>
            🎥
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#E2E8F0", lineHeight: 1.1 }}>
              Media Engine
            </h1>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 3 }}>
              Central media generation hub — images, video, audio & ad campaigns
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span style={{
              padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.25)", color: "#00AEEF",
            }}>
              AI POWERED
            </span>
          </div>
        </div>
      </div>

      {/* Studio selector */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 28 }}>
        {STUDIOS.map(s => {
          const active = activeStudio === s.id;
          return (
            <button key={s.id} onClick={() => setActiveStudio(s.id)} style={{
              padding: "18px 14px", borderRadius: 14, cursor: "pointer", textAlign: "left",
              background: active
                ? `linear-gradient(135deg, ${s.bg} 0%, ${s.accent}18 100%)`
                : s.bg,
              border: active ? `2px solid ${s.accent}` : `2px solid ${s.accent}22`,
              boxShadow: active ? `0 0 20px ${s.accent}22` : "none",
              transition: "all 0.15s",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 28 }}>{s.icon}</span>
                {active && (
                  <span style={{
                    padding: "3px 8px", borderRadius: 5, fontSize: 9, fontWeight: 800, letterSpacing: "0.5px",
                    background: `${s.accent}22`, border: `1px solid ${s.accent}55`, color: s.accent,
                  }}>ACTIVE</span>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: active ? "#FFFFFF" : "#CBD5E1", marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 11, color: active ? s.accent : "#475569", lineHeight: 1.4, marginBottom: 10 }}>
                {s.tagline}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {s.features.map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 9, color: active ? s.accent : "#374151" }}>▸</span>
                    <span style={{ fontSize: 10.5, color: active ? "rgba(255,255,255,0.7)" : "#475569" }}>{f}</span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Studio content */}
      <div style={{
        padding: "24px", borderRadius: 16,
        background: "rgba(255,255,255,0.01)",
        border: `1.5px solid ${studio.accent}22`,
        boxShadow: `inset 0 0 40px ${studio.accent}08`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <span style={{ fontSize: 20 }}>{studio.icon}</span>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#E2E8F0" }}>{studio.label}</h2>
          <div style={{ height: 1, flex: 1, background: `${studio.accent}22` }} />
          <button onClick={openSaveModal} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 8, cursor: "pointer",
            background: `${studio.accent}14`, border: `1.5px solid ${studio.accent}55`,
            color: studio.accent, fontSize: 12, fontWeight: 700,
          }}>
            💾 Save as Project
          </button>
          <span style={{
            padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
            background: `${studio.accent}15`, border: `1px solid ${studio.accent}33`, color: studio.accent,
          }}>
            BETA
          </span>
        </div>

        {activeStudio === "image"        && <ImageStudio          key={seedKey} t={t} seed={seed} />}
        {activeStudio === "video"        && <VideoStudio          key={seedKey} t={t} seed={seed} />}
        {activeStudio === "audio"        && <AudioStudio          key={seedKey} t={t} seed={seed} />}
        {activeStudio === "ad"           && <AdCreator            key={seedKey} t={t} seed={seed} />}
        {activeStudio === "integrations" && <AIIntegrationsCenter key={seedKey} t={t} />}
      </div>

      <BrandKitSection
        activeBrand={activeBrand}
        onBrandChange={setActiveBrand}
      />

      <TemplateEngineSection
        onUseTemplate={applyTemplate}
      />

      <SavedProjectsSection
        projects={projects}
        onDelete={deleteProject}
        onJump={type => setActiveStudio(type)}
      />

      <SaveProjectModal
        state={modal}
        onClose={() => setModal(m => ({ ...m, open: false }))}
        onSave={handleSaveProject}
      />
    </AppShell>
  );
}
