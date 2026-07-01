import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type FormData = {
  businessName: string; industry: string; city: string; state: string;
  websiteUrl: string; gbpUrl: string; facebookUrl: string; instagramUrl: string;
  contactName: string; contactEmail: string; contactPhone: string; contactMethod: string;
};

type Scores = {
  overall: number; leadRecovery: number; localPresence: number;
  aiVisibility: number; reviewStrength: number;
};

const LOADING_MESSAGES = [
  "Scanning business presence...",
  "Checking local visibility...",
  "Analyzing AI discoverability...",
  "Evaluating competitor positioning...",
  "Running growth opportunity analysis...",
  "Generating AI Edge assessment...",
];

const INDUSTRIES = [
  "Pest Control","HVAC","Plumbing","Electrical","Roofing","Landscaping",
  "Cleaning Services","Auto Repair","Dental","Chiropractic","Law Firm",
  "Real Estate","Insurance","Veterinary","Salon / Spa","Restaurant","Other",
];

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

// ─────────────────────────────────────────────────────────────────────────────
// Scoring engine
// ─────────────────────────────────────────────────────────────────────────────
function computeScores(form: FormData): Scores {
  const hasWebsite  = !!form.websiteUrl.trim();
  const hasGBP      = !!form.gbpUrl.trim();
  const hasFacebook = !!form.facebookUrl.trim();
  const hasInsta    = !!form.instagramUrl.trim();
  const platformCount = (hasWebsite ? 1 : 0) + (hasGBP ? 1 : 0) + (hasFacebook ? 1 : 0) + (hasInsta ? 1 : 0);

  const localPresence = Math.min(18 + (hasGBP ? 20 : 0) + (hasFacebook ? 8 : 0) + (hasInsta ? 5 : 0) + (hasWebsite ? 5 : 0), 72);
  const leadRecovery  = Math.min(22 + (hasWebsite ? 25 : 0) + (hasFacebook ? 18 : 0) + (hasInsta ? 8 : 0), 88);
  const aiVisibility  = Math.min(22 + (hasGBP ? 12 : 0) + (hasWebsite ? 10 : 0), 55);
  const reviewStrength = Math.min(38 + (hasGBP ? 18 : 0) + (platformCount * 3), 78);
  const overall = Math.round((localPresence + leadRecovery + aiVisibility + reviewStrength) / 4);

  return { overall, leadRecovery, localPresence, aiVisibility, reviewStrength };
}

function scoreLabel(n: number): { label: string; color: string } {
  if (n >= 75) return { label: "Strong", color: "#10B981" };
  if (n >= 55) return { label: "Moderate", color: "#F59E0B" };
  if (n >= 35) return { label: "Needs Improvement", color: "#F97316" };
  return { label: "Low / Critical", color: "#EF4444" };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI atoms
// ─────────────────────────────────────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.5px", textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: "#00AEEF", marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 9, padding: "11px 14px", fontSize: 14, color: "#FFFFFF",
  outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  transition: "border-color 0.15s",
};

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} style={{ ...inputStyle, appearance: "none", cursor: "pointer", ...props.style }}>
      {props.children}
    </select>
  );
}

function ScoreRing({ value, color, size = 96 }: { value: number; color: string; size?: number }) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1s ease" }} />
    </svg>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ height: 7, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 4, transition: "width 1s ease" }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────
type Phase = "form" | "loading" | "results";

export default function BusinessAssessmentPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState<Phase>("form");
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [loadingPct, setLoadingPct] = useState(0);
  const [scores, setScores] = useState<Scores | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<FormData>({
    businessName: "", industry: "", city: "", state: "",
    websiteUrl: "", gbpUrl: "", facebookUrl: "", instagramUrl: "",
    contactName: "", contactEmail: "", contactPhone: "", contactMethod: "email",
  });

  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Loading animation
  useEffect(() => {
    if (phase !== "loading") return;
    let pct = 0;
    const pctInterval = setInterval(() => {
      pct = Math.min(pct + 2, 100);
      setLoadingPct(pct);
      if (pct >= 100) clearInterval(pctInterval);
    }, 60);
    const msgInterval = setInterval(() => {
      setLoadingMsgIdx(i => (i + 1) % LOADING_MESSAGES.length);
    }, 700);
    const timer = setTimeout(async () => {
      clearInterval(pctInterval);
      clearInterval(msgInterval);
      const computed = computeScores(form);
      setScores(computed);
      // Save to API (fire-and-forget, no auth required)
      try {
        const base = import.meta.env.BASE_URL ?? "/";
        await fetch(`${base}api/assessments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, ...{ scoreOverall: computed.overall, scoreLeadRecovery: computed.leadRecovery, scoreLocalPresence: computed.localPresence, scoreAiVisibility: computed.aiVisibility, scoreReviewStrength: computed.reviewStrength } }),
        });
      } catch { /* non-blocking */ }
      setPhase("results");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }, 4200);
    return () => { clearInterval(pctInterval); clearInterval(msgInterval); clearTimeout(timer); };
  }, [phase]);

  const canAdvance1 = form.businessName.trim() && form.industry && form.city.trim() && form.state;
  const canAdvance2 = true; // step 2 optional
  const canSubmit   = form.contactName.trim() && form.contactEmail.trim();

  function handleNext() {
    if (step < 3) setStep(s => s + 1);
    else {
      setPhase("loading");
      setLoadingPct(0);
      setLoadingMsgIdx(0);
    }
  }

  // ── Form Phase ──
  if (phase === "form") {
    return (
      <div style={{ background: "#030612", minHeight: "100vh", color: "#FFFFFF", fontFamily: "'Inter', -apple-system, sans-serif" }}>
        <Nav />
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "100px 24px 80px" }}>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 20,
              background: "rgba(0,174,239,0.09)", border: "1px solid rgba(0,174,239,0.25)",
              borderRadius: 20, padding: "5px 16px",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#00AEEF" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#00AEEF", letterSpacing: "1px", textTransform: "uppercase" }}>Free AI Business Assessment</span>
            </div>
            <h1 style={{ fontSize: "clamp(28px,4vw,46px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1.1, marginBottom: 14 }}>
              See Where Your Business is{" "}
              <span style={{ color: "#00AEEF", textShadow: "0 0 28px rgba(0,174,239,0.4)" }}>Losing Revenue</span>
            </h1>
            <p style={{ fontSize: 16, color: "#6B7280", lineHeight: 1.7, maxWidth: 500, margin: "0 auto" }}>
              Get an instant AI-powered report showing your Lead Recovery Score, Local Presence, AI Visibility, and exactly what to fix first.
            </p>
          </div>

          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 36 }}>
            {[
              { n: 1, label: "Business Info"   },
              { n: 2, label: "Online Presence" },
              { n: 3, label: "Contact"         },
            ].map((s, i) => (
              <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: step >= s.n ? (step > s.n ? "#10B981" : "rgba(0,174,239,0.15)") : "rgba(255,255,255,0.05)",
                    border: step >= s.n ? (step > s.n ? "2px solid #10B981" : "2px solid #00AEEF") : "1px solid rgba(255,255,255,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 900,
                    color: step >= s.n ? (step > s.n ? "#10B981" : "#00AEEF") : "#475569",
                  }}>
                    {step > s.n ? "✓" : s.n}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: step >= s.n ? "#CBD5E1" : "#475569", whiteSpace: "nowrap" }}>{s.label}</span>
                </div>
                {i < 2 && <div style={{ width: 80, height: 1, background: step > s.n ? "#10B981" : "rgba(255,255,255,0.08)", margin: "0 8px", marginBottom: 18, transition: "background 0.3s" }} />}
              </div>
            ))}
          </div>

          {/* Form card */}
          <div style={{
            background: "linear-gradient(160deg, rgba(11,22,41,0.98), rgba(3,6,18,0.95))",
            border: "1px solid rgba(0,174,239,0.15)", borderRadius: 20,
            padding: "36px 40px",
            boxShadow: "0 0 60px rgba(0,174,239,0.06)",
          }}>

            {/* Step 1 */}
            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ marginBottom: 4 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: "#FFFFFF", margin: "0 0 4px" }}>Business Information</h2>
                  <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>Tell us about your business to personalize your assessment.</p>
                </div>
                <Field label="Business Name" required>
                  <Input value={form.businessName} onChange={e => set("businessName", e.target.value)} placeholder="e.g. Bed Bugs & Beyond" />
                </Field>
                <Field label="Industry" required>
                  <Select value={form.industry} onChange={e => set("industry", e.target.value)}>
                    <option value="">Select your industry...</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </Select>
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <Field label="City" required>
                    <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="e.g. Gulf Shores" />
                  </Field>
                  <Field label="State" required>
                    <Select value={form.state} onChange={e => set("state", e.target.value)}>
                      <option value="">State</option>
                      {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </Field>
                </div>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ marginBottom: 4 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: "#FFFFFF", margin: "0 0 4px" }}>Online Presence</h2>
                  <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>These help us detect visibility gaps. All fields optional but improve accuracy.</p>
                </div>
                <Field label="Website URL">
                  <Input type="url" value={form.websiteUrl} onChange={e => set("websiteUrl", e.target.value)} placeholder="https://yourbusiness.com" />
                </Field>
                <Field label="Google Business Profile URL">
                  <Input type="url" value={form.gbpUrl} onChange={e => set("gbpUrl", e.target.value)} placeholder="https://maps.google.com/..." />
                </Field>
                <Field label="Facebook Page URL">
                  <Input type="url" value={form.facebookUrl} onChange={e => set("facebookUrl", e.target.value)} placeholder="https://facebook.com/yourbusiness" />
                </Field>
                <Field label="Instagram URL">
                  <Input type="url" value={form.instagramUrl} onChange={e => set("instagramUrl", e.target.value)} placeholder="https://instagram.com/yourbusiness" />
                </Field>
                <div style={{
                  background: "rgba(0,174,239,0.04)", border: "1px solid rgba(0,174,239,0.15)",
                  borderRadius: 10, padding: "12px 14px",
                  fontSize: 12, color: "#64748B", lineHeight: 1.5,
                }}>
                  💡 No Google Business Profile? That's a major discovery gap — our assessment will highlight exactly what you're missing.
                </div>
              </div>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ marginBottom: 4 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: "#FFFFFF", margin: "0 0 4px" }}>Contact Information</h2>
                  <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>We'll send your assessment report and can walk you through it on a free strategy call.</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <Field label="Your Name" required>
                    <Input value={form.contactName} onChange={e => set("contactName", e.target.value)} placeholder="First & Last Name" />
                  </Field>
                  <Field label="Business Email" required>
                    <Input type="email" value={form.contactEmail} onChange={e => set("contactEmail", e.target.value)} placeholder="you@business.com" />
                  </Field>
                </div>
                <Field label="Phone Number">
                  <Input type="tel" value={form.contactPhone} onChange={e => set("contactPhone", e.target.value)} placeholder="(555) 000-0000" />
                </Field>
                <Field label="Best Way to Reach You">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {["email","phone","text"].map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => set("contactMethod", m)}
                        style={{
                          padding: "9px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          background: form.contactMethod === m ? "rgba(0,174,239,0.18)" : "rgba(255,255,255,0.04)",
                          border: form.contactMethod === m ? "1px solid rgba(0,174,239,0.5)" : "1px solid rgba(255,255,255,0.08)",
                          color: form.contactMethod === m ? "#00AEEF" : "#64748B",
                          textTransform: "capitalize",
                        }}
                      >{m === "email" ? "📧 Email" : m === "phone" ? "📞 Phone" : "💬 Text"}</button>
                    ))}
                  </div>
                </Field>
                <div style={{
                  background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)",
                  borderRadius: 10, padding: "12px 14px",
                  fontSize: 12, color: "#64748B", lineHeight: 1.5,
                }}>
                  🔒 Your information is never shared. AI Edge uses it only to deliver your personalized assessment and follow-up strategy.
                </div>
              </div>
            )}

            {/* Nav buttons */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 28 }}>
              {step > 1 ? (
                <button onClick={() => setStep(s => s - 1)} style={{
                  padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "#64748B",
                }}>← Back</button>
              ) : <div />}

              <button
                onClick={handleNext}
                disabled={step === 1 ? !canAdvance1 : step === 3 ? !canSubmit : false}
                style={{
                  padding: "12px 32px", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer",
                  background: (step === 1 ? !canAdvance1 : step === 3 ? !canSubmit : false) ? "rgba(0,174,239,0.2)" : "linear-gradient(135deg, #00AEEF, #0080C0)",
                  border: "none", color: "#FFFFFF",
                  boxShadow: "0 0 24px rgba(0,174,239,0.3)",
                  opacity: (step === 1 ? !canAdvance1 : step === 3 ? !canSubmit : false) ? 0.5 : 1,
                  transition: "all 0.2s",
                }}
              >
                {step < 3 ? "Continue →" : "🚀 Run My Assessment"}
              </button>
            </div>
          </div>

        </div>
        <Footer />
      </div>
    );
  }

  // ── Loading Phase ──
  if (phase === "loading") {
    return (
      <div style={{
        background: "#030612", minHeight: "100vh", color: "#FFFFFF",
        fontFamily: "'Inter', -apple-system, sans-serif",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "40px 24px",
      }}>
        {/* Grid background */}
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none",
          backgroundImage: `linear-gradient(rgba(0,174,239,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,174,239,0.05) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }} />

        <div style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: 480 }}>
          {/* Animated logo ring */}
          <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 32px" }}>
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              border: "2px solid rgba(0,174,239,0.15)",
              animation: "spin 3s linear infinite",
            }} />
            <div style={{
              position: "absolute", inset: 6, borderRadius: "50%",
              border: "2px solid transparent",
              borderTopColor: "#00AEEF",
              animation: "spin 1.5s linear infinite",
            }} />
            <div style={{
              position: "absolute", inset: 16, borderRadius: "50%",
              border: "1px solid rgba(0,174,239,0.3)",
              animation: "spin 2s linear infinite reverse",
            }} />
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 32,
            }}>⚡</div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 12 }}>
            AI Edge Assessment Engine
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 900, color: "#FFFFFF", marginBottom: 8 }}>
            Analyzing {form.businessName || "Your Business"}
          </h2>
          <p style={{ fontSize: 14, color: "#475569", marginBottom: 36 }}>
            Running 6 AI diagnostic modules...
          </p>

          {/* Rotating message */}
          <div style={{
            background: "rgba(0,174,239,0.06)", border: "1px solid rgba(0,174,239,0.18)",
            borderRadius: 12, padding: "14px 22px", marginBottom: 28,
            fontSize: 14, color: "#94A3B8", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ marginRight: 8 }}>🔍</span>
            {LOADING_MESSAGES[loadingMsgIdx]}
          </div>

          {/* Progress bar */}
          <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
            <div style={{
              height: "100%", width: `${loadingPct}%`, borderRadius: 3,
              background: "linear-gradient(90deg, #0080C0, #00AEEF)",
              transition: "width 0.1s linear",
              boxShadow: "0 0 12px rgba(0,174,239,0.5)",
            }} />
          </div>
          <div style={{ fontSize: 12, color: "#334155" }}>{loadingPct}% complete</div>
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Results Phase ──
  if (!scores) return null;
  const overallLabel = scores.overall >= 70 ? "Good Foundation" : scores.overall >= 50 ? "Growth Opportunity Detected" : "Significant Growth Potential";
  const overallColor = scores.overall >= 70 ? "#10B981" : scores.overall >= 50 ? "#F59E0B" : "#EF4444";

  const PAIN_POINTS = [
    { issue: "Apple Business Connect not claimed",        severity: "critical", impact: "Siri and Apple Maps discoveries blocked"         },
    { issue: "Bing Places not verified",                  severity: "critical", impact: "Bing Copilot and Microsoft AI blind spot"         },
    { issue: "Nextdoor Business page missing",            severity: "high",     impact: "Missing hyperlocal neighbor discovery"           },
    { issue: "Weak AI search visibility",                 severity: "critical", impact: "ChatGPT, Perplexity not recommending business"   },
    ...(!form.gbpUrl ? [{ issue: "Google Business Profile not verified",  severity: "critical", impact: "Major local SEO and Google AI ranking gap" }] : []),
    { issue: "Low review velocity",                       severity: "high",     impact: "Competitors winning trust with more reviews"     },
    { issue: "Weak citation authority",                   severity: "high",     impact: "AI engines can't verify business legitimacy"    },
    { issue: "Missing schema markup",                     severity: "medium",   impact: "AI systems can't parse services and location"   },
    { issue: `No ${form.city}-specific landing pages`,    severity: "medium",   impact: "Losing high-intent local search traffic"        },
  ];

  const SEVERITY_STYLE: Record<string, { color: string; label: string }> = {
    critical: { color: "#EF4444", label: "Critical" },
    high:     { color: "#F59E0B", label: "High"     },
    medium:   { color: "#00AEEF", label: "Medium"   },
  };

  return (
    <div ref={resultsRef} style={{ background: "#030612", minHeight: "100vh", color: "#FFFFFF", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "100px 24px 80px" }}>

        {/* ── Overall Score ── */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 18,
            background: `${overallColor}12`, border: `1px solid ${overallColor}30`,
            borderRadius: 20, padding: "5px 16px",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: overallColor }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: overallColor, letterSpacing: "1px", textTransform: "uppercase" }}>{overallLabel}</span>
          </div>

          <h1 style={{ fontSize: "clamp(26px,4vw,44px)", fontWeight: 900, letterSpacing: "-1px", marginBottom: 8 }}>
            {form.businessName || "Your Business"} Assessment
          </h1>
          <p style={{ fontSize: 15, color: "#6B7280", marginBottom: 32 }}>
            {form.city}, {form.state} · {form.industry} · AI Edge found several high-impact growth opportunities.
          </p>

          {/* Big score */}
          <div style={{
            display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 0,
            background: "linear-gradient(160deg, rgba(11,22,41,0.98), rgba(3,6,18,0.9))",
            border: `2px solid ${overallColor}30`,
            borderRadius: 24, padding: "36px 56px",
            boxShadow: `0 0 60px ${overallColor}14`,
          }}>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <ScoreRing value={scores.overall} color={overallColor} size={140} />
              <div style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: 38, fontWeight: 900, color: overallColor, lineHeight: 1 }}>{scores.overall}</span>
                <span style={{ fontSize: 14, color: "#475569" }}>/100</span>
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", letterSpacing: "1px", textTransform: "uppercase" }}>Overall Business Score</div>
          </div>
        </div>

        {/* ── Score Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
          {[
            { label: "Lead Recovery",   value: scores.leadRecovery,   icon: "📞" },
            { label: "Local Presence",  value: scores.localPresence,  icon: "📍" },
            { label: "AI Visibility",   value: scores.aiVisibility,   icon: "✨" },
            { label: "Review Strength", value: scores.reviewStrength, icon: "⭐" },
          ].map(card => {
            const sl = scoreLabel(card.value);
            return (
              <div key={card.label} style={{
                background: "rgba(11,22,41,0.8)", border: `1px solid ${sl.color}20`,
                borderTop: `2px solid ${sl.color}50`, borderRadius: 14, padding: "20px 18px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 22, marginBottom: 10 }}>{card.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: sl.color, marginBottom: 2 }}>{card.value}/100</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 6 }}>{card.label}</div>
                <span style={{ fontSize: 10, fontWeight: 800, color: sl.color, background: `${sl.color}15`, padding: "2px 8px", borderRadius: 20 }}>{sl.label}</span>
                <div style={{ marginTop: 10 }}>
                  <ProgressBar value={card.value} color={sl.color} />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Opportunity Section ── */}
        <div style={{ marginBottom: 32 }}>
          <Divider>Revenue & Growth Opportunities Identified</Divider>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {[
              { icon: "💰", label: "Revenue Recovery Opportunity",  value: "+$3,200/month",  color: "#10B981", note: "Missed call recovery + lead conversion optimization" },
              { icon: "📍", label: "Local Visibility Opportunity",  value: "+28% discovery", color: "#00AEEF", note: "Apple, Bing, Nextdoor listings not yet claimed"        },
              { icon: "✨", label: "AI Visibility Opportunity",     value: "+42% mentions",  color: "#8B5CF6", note: "AI search engines not recommending your business"      },
              { icon: "⭐", label: "Lead Conversion Opportunity",   value: "+18% rate",      color: "#F59E0B", note: "Review velocity and trust signals below competitors"   },
            ].map(op => (
              <div key={op.label} style={{
                background: "rgba(11,22,41,0.7)", border: `1px solid ${op.color}20`,
                borderLeft: `3px solid ${op.color}`, borderRadius: 12, padding: "16px 18px",
                display: "flex", gap: 14, alignItems: "flex-start",
              }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{op.icon}</span>
                <div>
                  <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 3 }}>{op.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: op.color, marginBottom: 4 }}>{op.value}</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>{op.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Pain Points ── */}
        <div style={{ marginBottom: 32 }}>
          <Divider>Issues Found in Your Business Presence</Divider>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PAIN_POINTS.map((p, i) => {
              const sv = SEVERITY_STYLE[p.severity];
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
                  borderLeft: `3px solid ${sv.color}50`, borderRadius: 10, padding: "12px 16px",
                }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: `${sv.color}15`, border: `1px solid ${sv.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: sv.color, fontWeight: 900 }}>✕</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{p.issue}</div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Impact: {p.impact}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, color: sv.color, background: `${sv.color}14`, border: `1px solid ${sv.color}25`, padding: "2px 9px", borderRadius: 20, flexShrink: 0 }}>{sv.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── AI Edge Recommendations ── */}
        <div style={{ marginBottom: 32 }}>
          <Divider>AI Edge Priority Action Plan</Divider>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { rank: 1, action: "Claim & optimize Apple Business Connect",                   impact: "High", time: "30 min" },
              { rank: 2, action: "Claim & verify Bing Places for Business",                  impact: "High", time: "30 min" },
              { rank: 3, action: "Improve AI search visibility with content + schema",       impact: "High", time: "2–3 hrs" },
              { rank: 4, action: `Create ${form.city}-specific pest control landing pages`,  impact: "High", time: "1 day"  },
              { rank: 5, action: "Deploy Lead Recovery AI + missed call text-back",          impact: "High", time: "1 day"  },
            ].map(a => (
              <div key={a.rank} style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10, padding: "13px 16px",
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                  background: a.rank <= 2 ? "rgba(0,174,239,0.15)" : "rgba(255,255,255,0.05)",
                  border: a.rank <= 2 ? "1px solid rgba(0,174,239,0.4)" : "1px solid rgba(255,255,255,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 900, color: a.rank <= 2 ? "#00AEEF" : "#475569",
                }}>{a.rank}</div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#E2E8F0" }}>{a.action}</div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "#64748B", background: "rgba(255,255,255,0.04)", padding: "3px 9px", borderRadius: 6 }}>⏱ {a.time}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", padding: "3px 9px", borderRadius: 6 }}>{a.impact}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 90-Day Value Projection ── */}
        <div style={{ marginBottom: 40 }}>
          <Divider>Projected Impact — Within 90 Days (with AI Edge)</Divider>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {[
              { label: "+42%",      sub: "AI Visibility",        color: "#8B5CF6" },
              { label: "+28%",      sub: "Local Discovery",      color: "#00AEEF" },
              { label: "+18%",      sub: "Lead Conversion",      color: "#F59E0B" },
              { label: "+$3,200",   sub: "Monthly Revenue Est.", color: "#10B981" },
            ].map(p => (
              <div key={p.sub} style={{
                background: `${p.color}08`, border: `1px solid ${p.color}20`,
                borderRadius: 12, padding: "18px 14px", textAlign: "center",
              }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: p.color, marginBottom: 4 }}>{p.label}</div>
                <div style={{ fontSize: 12, color: "#64748B" }}>{p.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA ── */}
        <div style={{
          background: "linear-gradient(160deg, rgba(0,80,140,0.25), rgba(0,40,80,0.15))",
          border: "1px solid rgba(0,174,239,0.25)", borderRadius: 22,
          padding: "48px 40px", textAlign: "center",
          boxShadow: "0 0 80px rgba(0,174,239,0.08)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#00AEEF", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>
            AI Edge Solutions — {form.city}, {form.state}
          </div>
          <h2 style={{ fontSize: "clamp(24px,3.5vw,38px)", fontWeight: 900, letterSpacing: "-0.8px", marginBottom: 12 }}>
            Ready to fix these growth gaps?
          </h2>
          <p style={{ fontSize: 16, color: "#6B7280", maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.7 }}>
            Our team will walk you through a custom implementation plan — at no cost. Most businesses see results within 30 days.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/contact")}
              style={{
                padding: "14px 32px", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer",
                background: "linear-gradient(135deg, #00AEEF, #0080C0)", border: "none", color: "#FFFFFF",
                boxShadow: "0 0 32px rgba(0,174,239,0.35)",
              }}
            >📅 Book Free Strategy Call</button>
            <button
              onClick={() => navigate("/contact")}
              style={{
                padding: "14px 28px", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer",
                background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.35)", color: "#00AEEF",
              }}
            >💬 Talk to AI Edge</button>
            <button
              onClick={() => navigate("/contact")}
              style={{
                padding: "14px 28px", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8",
              }}
            >📋 Get Custom Growth Plan</button>
          </div>
          <div style={{ marginTop: 20, fontSize: 12, color: "#334155" }}>
            No sales pressure · No long-term contracts · Results-first approach
          </div>
        </div>

      </div>
      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────
function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{children}</div>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}
