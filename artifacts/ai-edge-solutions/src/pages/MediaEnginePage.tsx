import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useTheme } from "@/contexts/theme-context";

type Studio = "image" | "video" | "audio" | "ad";

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
    features: ["5-step campaign wizard", "Multi-platform targeting", "Live ad preview", "Campaign package export"],
  },
];

// ── Image Studio ──────────────────────────────────────────────────────────────
function ImageStudio({ t }: { t: ReturnType<typeof useTheme>["colors"] }) {
  const [format, setFormat] = useState<"social" | "ad" | "banner">("social");
  const [style, setStyle] = useState("modern");
  const [prompt, setPrompt] = useState("");

  const formats = [
    { id: "social", label: "Social Graphic", size: "1080×1080" },
    { id: "ad",     label: "Ad Creative",    size: "1200×628" },
    { id: "banner", label: "Banner",          size: "1920×600" },
  ] as const;

  const styles = ["Modern", "Minimal", "Bold", "Corporate", "Playful", "Luxury"];

  const placeholders = [
    { label: "Logo + Brand Colors", icon: "🎨", desc: "Consistent brand identity" },
    { label: "CTA Overlay",         icon: "📣", desc: "Drives click-through" },
    { label: "Product Showcase",     icon: "📦", desc: "Highlight your service" },
    { label: "Testimonial Card",     icon: "⭐", desc: "Social proof creative" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Prompt row */}
      <div style={{ display: "flex", gap: 10 }}>
        <input
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Describe your image… e.g. 'Pest control team in uniform, bright blue, professional'"
          style={{
            flex: 1, padding: "13px 16px", borderRadius: 10,
            background: "rgba(0,174,239,0.06)", border: "1.5px solid rgba(0,174,239,0.2)",
            color: "#E2E8F0", fontSize: 14, outline: "none",
          }}
        />
        <GenButton accent="#00AEEF" label="✨ Generate Image" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Left: Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

          {/* Style */}
          <Panel label="Visual Style" accent="#00AEEF">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {styles.map(s => (
                <button key={s} onClick={() => setStyle(s.toLowerCase())} style={tagBtn(style === s.toLowerCase(), "#00AEEF")}>
                  {s}
                </button>
              ))}
            </div>
          </Panel>

          {/* Brand kit */}
          <Panel label="Brand Kit" accent="#00AEEF">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Primary Color", value: "#00AEEF" },
                { label: "Secondary",     value: "#C0C0C0" },
                { label: "Background",    value: "#030612" },
                { label: "Accent",        value: "#FFFFFF" },
              ].map(c => (
                <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 5, background: c.value, border: "1px solid rgba(255,255,255,0.15)" }} />
                  <span style={{ fontSize: 11.5, color: "#94A3B8" }}>{c.label}</span>
                </div>
              ))}
            </div>
          </Panel>

          {/* Export */}
          <Panel label="Export" accent="#00AEEF">
            <div style={{ display: "flex", gap: 12 }}>
              <ExportButton label="PNG" accent="#00AEEF" />
              <ExportButton label="JPG" accent="#00AEEF" />
              <ExportButton label="SVG" accent="#00AEEF" />
            </div>
          </Panel>
        </div>

        {/* Right: Canvas + recent */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel label="Canvas Preview" accent="#00AEEF">
            <div style={{
              aspectRatio: "1 / 1", background: "linear-gradient(135deg, #071828 0%, #0D2A3E 100%)",
              borderRadius: 10, border: "1.5px dashed rgba(0,174,239,0.25)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
            }}>
              <div style={{ fontSize: 36 }}>🖼️</div>
              <div style={{ fontSize: 13, color: "#475569", textAlign: "center" }}>
                Generated image will appear here
              </div>
              <div style={{ fontSize: 11, color: "#00AEEF", opacity: 0.6 }}>1080 × 1080 px</div>
            </div>
          </Panel>

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
function VideoStudio({ t }: { t: ReturnType<typeof useTheme>["colors"] }) {
  const [videoType, setVideoType] = useState("reel");
  const [duration, setDuration] = useState(15);

  const videoTypes = [
    { id: "reel",       label: "Reel / Short",    icon: "📱", size: "9:16" },
    { id: "social-ad",  label: "Social Ad",        icon: "📢", size: "1:1" },
    { id: "commercial", label: "Commercial Clip",  icon: "🎥", size: "16:9" },
    { id: "story",      label: "Story",            icon: "⚡", size: "9:16" },
  ];

  const transitions = ["Fade", "Slide", "Zoom", "Glitch", "Wipe", "Flash"];
  const music = ["No Music", "Upbeat Corporate", "Cinematic", "Energetic", "Calm & Professional", "Hip Hop Beat"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <input
          placeholder="Describe your video… e.g. 'BB&B pest control team treating home, fast cuts, bold text overlays'"
          style={{
            flex: 1, padding: "13px 16px", borderRadius: 10,
            background: "rgba(167,139,250,0.06)", border: "1.5px solid rgba(167,139,250,0.2)",
            color: "#E2E8F0", fontSize: 14, outline: "none",
          }}
        />
        <GenButton accent="#A78BFA" label="✨ Generate Video" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

          <Panel label="Duration" accent="#A78BFA">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="range" min={5} max={60} value={duration} onChange={e => setDuration(+e.target.value)}
                style={{ flex: 1, accentColor: "#A78BFA" }} />
              <span style={{ minWidth: 40, fontSize: 14, fontWeight: 700, color: "#A78BFA" }}>{duration}s</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {[7, 15, 30, 60].map(d => (
                <button key={d} onClick={() => setDuration(d)} style={tagBtn(duration === d, "#A78BFA")}>{d}s</button>
              ))}
            </div>
          </Panel>

          <Panel label="Transitions" accent="#A78BFA">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {transitions.map((tr, i) => (
                <button key={tr} style={tagBtn(i === 0, "#A78BFA")}>{tr}</button>
              ))}
            </div>
          </Panel>

          <Panel label="Background Music" accent="#A78BFA">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {music.map((m, i) => (
                <button key={m} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                  background: i === 0 ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.02)",
                  border: i === 0 ? "1px solid rgba(167,139,250,0.4)" : "1px solid rgba(255,255,255,0.05)",
                }}>
                  <span style={{ fontSize: 13 }}>{i === 0 ? "🔇" : "🎵"}</span>
                  <span style={{ fontSize: 12, color: i === 0 ? "#A78BFA" : "#94A3B8" }}>{m}</span>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel label="Preview" accent="#A78BFA">
            <div style={{
              aspectRatio: "9 / 16", maxHeight: 320, background: "linear-gradient(135deg, #120A28 0%, #1E1040 100%)",
              borderRadius: 10, border: "1.5px dashed rgba(167,139,250,0.25)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
            }}>
              <div style={{ fontSize: 40 }}>🎬</div>
              <div style={{ fontSize: 13, color: "#475569", textAlign: "center" }}>Video preview appears here</div>
              <div style={{
                display: "flex", alignItems: "center", gap: 6, marginTop: 8,
                padding: "6px 14px", borderRadius: 20, background: "rgba(167,139,250,0.1)",
                border: "1px solid rgba(167,139,250,0.25)",
              }}>
                <span style={{ fontSize: 14 }}>▶</span>
                <span style={{ fontSize: 12, color: "#A78BFA" }}>Play Preview</span>
              </div>
            </div>
          </Panel>

          <Panel label="Export" accent="#A78BFA">
            <div style={{ display: "flex", gap: 12 }}>
              <ExportButton label="MP4 HD" accent="#A78BFA" />
              <ExportButton label="MP4 4K" accent="#A78BFA" />
              <ExportButton label="GIF" accent="#A78BFA" />
            </div>
          </Panel>

          <Panel label="Scene Builder" accent="#A78BFA">
            {["Intro — Brand reveal", "Scene 1 — Hook statement", "Scene 2 — Service showcase", "Scene 3 — Testimonial", "Outro — CTA"].map((scene, i) => (
              <div key={scene} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", marginBottom: 6, borderRadius: 8,
                background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.1)",
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6, background: "rgba(167,139,250,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: "#A78BFA", flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: 12, color: "#94A3B8", flex: 1 }}>{scene}</span>
                <span style={{ fontSize: 11, color: "#475569", cursor: "pointer" }}>✏️</span>
              </div>
            ))}
            <button style={{
              width: "100%", padding: "9px", borderRadius: 8, cursor: "pointer", marginTop: 4,
              background: "rgba(167,139,250,0.06)", border: "1px dashed rgba(167,139,250,0.25)",
              color: "#A78BFA", fontSize: 12, fontWeight: 600,
            }}>+ Add Scene</button>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Audio Studio ──────────────────────────────────────────────────────────────
function AudioStudio({ t }: { t: ReturnType<typeof useTheme>["colors"] }) {
  const [audioType, setAudioType] = useState("voiceover");
  const [voice, setVoice] = useState("Joanna");
  const [script, setScript] = useState("");

  const audioTypes = [
    { id: "voiceover",   label: "Voiceover",          icon: "🎤" },
    { id: "receptionist", label: "AI Receptionist",    icon: "🤖" },
    { id: "ad-audio",    label: "Ad Audio",            icon: "📻" },
    { id: "jingle",      label: "Jingle / Music",      icon: "🎵" },
  ];

  const voices = [
    { id: "Joanna",   label: "Joanna",   desc: "Professional female",  accent: "US English" },
    { id: "Matthew",  label: "Matthew",  desc: "Authoritative male",   accent: "US English" },
    { id: "Salli",    label: "Salli",    desc: "Warm female",          accent: "US English" },
    { id: "Joey",     label: "Joey",     desc: "Friendly male",        accent: "US English" },
    { id: "Kendra",   label: "Kendra",   desc: "Clear female",         accent: "US English" },
    { id: "Kevin",    label: "Kevin",    desc: "Young male",           accent: "US English" },
  ];

  const defaultScripts: Record<string, string> = {
    voiceover: "Welcome to Bed Bugs and Beyond Pest Control — Baldwin County's most trusted pest control experts. We eliminate pests fast, guaranteed.",
    receptionist: "Hi, thank you for calling Bed Bugs and Beyond Pest Control. To speak directly with us, press 1. To request a callback, press 2. To leave a voicemail, press 3.",
    "ad-audio": "Bed bugs keeping you up at night? Bed Bugs and Beyond has you covered. Serving Baldwin County with fast, effective, guaranteed results. Call today.",
    jingle: "Bed Bugs and Beyond — we've got your back. Pest-free living, that's a fact!",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel label="Audio Type" accent="#34D399">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {audioTypes.map(a => (
                <button key={a.id} onClick={() => {
                  setAudioType(a.id);
                  setScript(defaultScripts[a.id] || "");
                }} style={{
                  padding: "12px 10px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                  background: audioType === a.id ? "rgba(52,211,153,0.12)" : "rgba(52,211,153,0.04)",
                  border: audioType === a.id ? "1.5px solid #34D399" : "1.5px solid rgba(52,211,153,0.15)",
                }}>
                  <div style={{ fontSize: 22, marginBottom: 5 }}>{a.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: audioType === a.id ? "#34D399" : "#CBD5E1" }}>{a.label}</div>
                </button>
              ))}
            </div>
          </Panel>

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
                  }}>
                    🎙️
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: voice === v.id ? "#34D399" : "#CBD5E1" }}>{v.label}</div>
                    <div style={{ fontSize: 11, color: "#64748B" }}>{v.desc} · {v.accent}</div>
                  </div>
                  {voice === v.id && <span style={{ fontSize: 12, color: "#34D399" }}>▶ Play</span>}
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel label="Script Editor" accent="#34D399">
            <textarea
              value={script || defaultScripts[audioType]}
              onChange={e => setScript(e.target.value)}
              rows={8}
              style={{
                width: "100%", padding: "12px 14px", borderRadius: 9, resize: "vertical",
                background: "rgba(52,211,153,0.04)", border: "1.5px solid rgba(52,211,153,0.18)",
                color: "#E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box",
                fontFamily: "inherit", lineHeight: 1.6,
              }}
              placeholder="Type or paste your script here…"
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 11, color: "#475569" }}>
                {(script || defaultScripts[audioType]).split(" ").length} words · ~{Math.ceil((script || defaultScripts[audioType]).split(" ").length / 2.5)}s
              </span>
              <GenButton accent="#34D399" label="🎙️ Generate Audio" />
            </div>
          </Panel>

          {/* Waveform player */}
          <Panel label="Audio Player" accent="#34D399">
            <div style={{
              padding: "20px 16px", borderRadius: 10, background: "rgba(52,211,153,0.04)",
              border: "1.5px dashed rgba(52,211,153,0.2)",
            }}>
              {/* Fake waveform */}
              <div style={{ display: "flex", alignItems: "center", height: 48, gap: 2, marginBottom: 14 }}>
                {Array.from({ length: 60 }, (_, i) => (
                  <div key={i} style={{
                    flex: 1, borderRadius: 2,
                    height: `${20 + Math.sin(i * 0.4) * 16 + Math.random() * 12}%`,
                    background: `rgba(52,211,153,${0.2 + Math.sin(i * 0.3) * 0.15})`,
                  }} />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button disabled title="Playback coming soon" style={{
                  width: 36, height: 36, borderRadius: "50%", cursor: "not-allowed",
                  background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.1)",
                  color: "#374151", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                }}>▶</button>
                <div style={{ flex: 1, height: 3, background: "rgba(52,211,153,0.12)", borderRadius: 2 }}>
                  <div style={{ width: "0%", height: "100%", background: "#34D399", borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 11, color: "#475569" }}>0:00</span>
              </div>
            </div>
          </Panel>

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
function AdCreator({ t }: { t: ReturnType<typeof useTheme>["colors"] }) {
  const [goal, setGoal] = useState("awareness");
  const [step, setStep] = useState(1);

  const goals = [
    { id: "awareness",    label: "Brand Awareness",  icon: "👁️" },
    { id: "leads",        label: "Lead Generation",  icon: "🎯" },
    { id: "conversions",  label: "Conversions",      icon: "💰" },
    { id: "retargeting",  label: "Retargeting",      icon: "🔄" },
  ];

  const platforms = [
    { id: "fb",  label: "Facebook",  icon: "📘", checked: true },
    { id: "ig",  label: "Instagram", icon: "📸", checked: true },
    { id: "tt",  label: "TikTok",    icon: "🎵", checked: false },
    { id: "yt",  label: "YouTube",   icon: "▶️",  checked: false },
    { id: "ggl", label: "Google",    icon: "🔍", checked: false },
  ];

  const steps = [
    { n: 1, label: "Campaign Goal" },
    { n: 2, label: "Creative Assets" },
    { n: 3, label: "Ad Copy" },
    { n: 4, label: "Targeting" },
    { n: 5, label: "Review & Export" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Stepper */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
            <button onClick={() => setStep(s.n)} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              cursor: "pointer", background: "none", border: "none", padding: 0,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: step === s.n ? "#FB923C" : step > s.n ? "rgba(251,146,60,0.3)" : "rgba(255,255,255,0.05)",
                border: step >= s.n ? "2px solid #FB923C" : "2px solid rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, color: step >= s.n ? (step === s.n ? "#FFF" : "#FB923C") : "#475569",
              }}>
                {step > s.n ? "✓" : s.n}
              </div>
              <span style={{ fontSize: 10, color: step >= s.n ? "#FB923C" : "#475569", whiteSpace: "nowrap" }}>{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: step > s.n ? "#FB923C" : "rgba(255,255,255,0.06)", margin: "0 6px", marginBottom: 16 }} />
            )}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Panel label="Campaign Goal" accent="#FB923C">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {goals.map(g => (
                <button key={g.id} onClick={() => setGoal(g.id)} style={{
                  padding: "18px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                  background: goal === g.id ? "rgba(251,146,60,0.12)" : "rgba(251,146,60,0.04)",
                  border: goal === g.id ? "1.5px solid #FB923C" : "1.5px solid rgba(251,146,60,0.15)",
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{g.icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: goal === g.id ? "#FB923C" : "#CBD5E1" }}>{g.label}</div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel label="Platforms" accent="#FB923C">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {platforms.map(p => (
                <button key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "9px 14px",
                  borderRadius: 8, cursor: "pointer",
                  background: p.checked ? "rgba(251,146,60,0.1)" : "rgba(255,255,255,0.02)",
                  border: p.checked ? "1.5px solid rgba(251,146,60,0.5)" : "1.5px solid rgba(255,255,255,0.06)",
                }}>
                  <span style={{ fontSize: 16 }}>{p.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: p.checked ? "#FB923C" : "#64748B" }}>{p.label}</span>
                  {p.checked && <span style={{ fontSize: 11, color: "#FB923C" }}>✓</span>}
                </button>
              ))}
            </div>
          </Panel>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setStep(2)} style={genBtn("#FB923C")}>Next: Creative Assets →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel label="Creative Assets" accent="#FB923C">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { type: "Image",  icon: "🖼️", formats: "PNG, JPG", studio: "Image Studio", accent: "#00AEEF", status: "ready" },
                { type: "Video",  icon: "🎬", formats: "MP4",       studio: "Video Studio", accent: "#A78BFA", status: "none"  },
                { type: "Audio",  icon: "🎙️", formats: "MP3, WAV",  studio: "Audio Studio", accent: "#34D399", status: "none"  },
              ].map(asset => (
                <div key={asset.type} style={{
                  padding: "16px 14px", borderRadius: 10, textAlign: "center",
                  background: asset.status === "ready" ? `rgba(0,174,239,0.08)` : "rgba(255,255,255,0.02)",
                  border: asset.status === "ready" ? `1.5px solid rgba(0,174,239,0.35)` : "1.5px dashed rgba(255,255,255,0.08)",
                }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{asset.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#CBD5E1", marginBottom: 4 }}>{asset.type}</div>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}>{asset.formats}</div>
                  {asset.status === "ready"
                    ? <div style={{ fontSize: 11, color: "#22C55E", fontWeight: 700 }}>✓ Ready</div>
                    : <button style={{
                        padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                        background: `rgba(${asset.accent === "#A78BFA" ? "167,139,250" : "52,211,153"},0.1)`,
                        border: `1px solid ${asset.accent}44`, color: asset.accent, fontSize: 11, fontWeight: 600,
                      }}>
                        Open {asset.studio}
                      </button>
                  }
                </div>
              ))}
            </div>
          </Panel>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => setStep(1)} style={{ ...exportBtn, color: "#94A3B8" }}>← Back</button>
            <button onClick={() => setStep(3)} style={genBtn("#FB923C")}>Next: Ad Copy →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <Panel label="Ad Copy" accent="#FB923C">
              {[
                { label: "Headline",       placeholder: "Pest-Free Living Starts Here",             rows: 2 },
                { label: "Primary Text",   placeholder: "Baldwin County's #1 pest control service…", rows: 4 },
                { label: "Call to Action", placeholder: "Call Now",                                   rows: 1 },
                { label: "URL",            placeholder: "https://bedbugsandbeyond.com",               rows: 1 },
              ].map(field => (
                <div key={field.label} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#FB923C", marginBottom: 6 }}>{field.label}</div>
                  <textarea rows={field.rows} placeholder={field.placeholder} style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8, resize: "vertical",
                    background: "rgba(251,146,60,0.04)", border: "1.5px solid rgba(251,146,60,0.18)",
                    color: "#E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                  }} />
                </div>
              ))}
              <GenButton accent="#FB923C" label="✨ AI Generate Copy" />
            </Panel>

            <Panel label="Ad Preview" accent="#FB923C">
              {/* Mock Facebook ad */}
              <div style={{
                borderRadius: 12, overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.08)", background: "#1C1C1E",
              }}>
                <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#00AEEF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🐛</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>Bed Bugs & Beyond</div>
                    <div style={{ fontSize: 11, color: "#64748B" }}>Sponsored · 📍 Baldwin County, AL</div>
                  </div>
                </div>
                <div style={{ height: 160, background: "linear-gradient(135deg, #071828 0%, #0D2A3E 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 36 }}>🖼️</span>
                </div>
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0", marginBottom: 4 }}>Pest-Free Living Starts Here</div>
                  <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.5, marginBottom: 10 }}>Baldwin County's #1 pest control service. Fast, effective, guaranteed.</div>
                  <button style={{
                    width: "100%", padding: "9px", borderRadius: 7, cursor: "pointer",
                    background: "#1877F2", border: "none", color: "#fff", fontSize: 13, fontWeight: 700,
                  }}>Call Now</button>
                </div>
              </div>
            </Panel>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => setStep(2)} style={{ ...exportBtn, color: "#94A3B8" }}>← Back</button>
            <button onClick={() => setStep(4)} style={genBtn("#FB923C")}>Next: Targeting →</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <Panel label="Audience Targeting" accent="#FB923C">
              {[
                { label: "Location",   value: "Baldwin County, AL (25 mi radius)" },
                { label: "Age Range",  value: "28 – 65+" },
                { label: "Interests",  value: "Home ownership, pest control, real estate" },
                { label: "Budget",     value: "$15 / day" },
                { label: "Duration",   value: "7 days" },
              ].map(f => (
                <div key={f.label} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#FB923C", marginBottom: 5 }}>{f.label}</div>
                  <input defaultValue={f.value} style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8, boxSizing: "border-box",
                    background: "rgba(251,146,60,0.04)", border: "1.5px solid rgba(251,146,60,0.18)",
                    color: "#E2E8F0", fontSize: 13, outline: "none",
                  }} />
                </div>
              ))}
            </Panel>
            <Panel label="Estimated Reach" accent="#FB923C">
              {[
                { label: "Est. Daily Reach",    value: "1,200 – 3,500",    icon: "👁️" },
                { label: "Est. Impressions",    value: "8,400 – 24,500",   icon: "📊" },
                { label: "Est. Clicks",         value: "180 – 520",        icon: "🖱️" },
                { label: "Est. Leads",          value: "12 – 35",          icon: "🎯" },
                { label: "Total Budget",        value: "$105 / week",      icon: "💰" },
                { label: "Est. Cost Per Lead",  value: "$3 – $9",          icon: "💡" },
              ].map(stat => (
                <div key={stat.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "11px 14px", borderRadius: 9, marginBottom: 8,
                  background: "rgba(251,146,60,0.06)", border: "1px solid rgba(251,146,60,0.12)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{stat.icon}</span>
                    <span style={{ fontSize: 12, color: "#94A3B8" }}>{stat.label}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#FB923C" }}>{stat.value}</span>
                </div>
              ))}
            </Panel>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => setStep(3)} style={{ ...exportBtn, color: "#94A3B8" }}>← Back</button>
            <button onClick={() => setStep(5)} style={genBtn("#FB923C")}>Next: Review & Export →</button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel label="Campaign Summary" accent="#FB923C">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Goal",      value: "Lead Generation",                icon: "🎯" },
                { label: "Platforms", value: "Facebook, Instagram",            icon: "📢" },
                { label: "Budget",    value: "$105 / week",                    icon: "💰" },
                { label: "Creative",  value: "1 image, 1 voiceover",           icon: "🎨" },
                { label: "Duration",  value: "7 days",                         icon: "📅" },
                { label: "Audience",  value: "Baldwin County, AL · 28–65+",    icon: "👥" },
              ].map(s => (
                <div key={s.label} style={{
                  padding: "14px 12px", borderRadius: 10,
                  background: "rgba(251,146,60,0.06)", border: "1px solid rgba(251,146,60,0.15)",
                }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#CBD5E1" }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 140, position: "relative" }}>
                <button disabled title="Export coming soon" style={{ ...exportBtn, width: "100%", opacity: 0.5 }}>🚀 Export Campaign</button>
                <span style={{ position: "absolute", top: -7, right: -4, padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase" as const, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24" }}>Soon</span>
              </div>
              <div style={{ flex: 1, minWidth: 140, position: "relative" }}>
                <button disabled title="Export coming soon" style={{ ...exportBtn, width: "100%", opacity: 0.5 }}>📋 Export Media Kit</button>
                <span style={{ position: "absolute", top: -7, right: -4, padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase" as const, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24" }}>Soon</span>
              </div>
              <button style={{ flex: 1, minWidth: 140, padding: "9px 14px", borderRadius: 8, cursor: "pointer", background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.25)", color: "#FB923C", fontSize: 12, fontWeight: 600 }}>💾 Save Draft</button>
            </div>
          </Panel>
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <button onClick={() => setStep(4)} style={{ ...exportBtn, color: "#94A3B8" }}>← Back</button>
          </div>
        </div>
      )}
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MediaEnginePage() {
  const { colors: t } = useTheme();
  const [activeStudio, setActiveStudio] = useState<Studio>("image");

  const studio = STUDIOS.find(s => s.id === activeStudio)!;

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
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
          <span style={{
            padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
            background: `${studio.accent}15`, border: `1px solid ${studio.accent}33`, color: studio.accent,
          }}>
            BETA
          </span>
        </div>

        {activeStudio === "image" && <ImageStudio t={t} />}
        {activeStudio === "video" && <VideoStudio t={t} />}
        {activeStudio === "audio" && <AudioStudio t={t} />}
        {activeStudio === "ad"    && <AdCreator t={t} />}
      </div>
    </AppShell>
  );
}
