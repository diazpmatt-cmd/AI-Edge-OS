import { useState } from "react";
import { useLocation } from "wouter";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Edge Starter",
    price: "$297",
    priceNote: "$399/mo month-to-month",
    setup: "$499 one-time (waived w/ 6-mo commitment)",
    period: "/mo",
    badge: null,
    popular: false,
    bestFor: "Small local businesses that need missed-call recovery and basic automation.",
    cta: "Start With Edge Starter",
    color: "#C0C0C0",
    prevTier: null,
    items: [
      "Lead Recovery AI",
      "Missed Call Text-Back",
      "Basic SMS Follow-Up",
      "Basic Review Request Automation",
      "Business Assessment Dashboard",
      "Monthly Performance Summary",
      "Basic Support",
    ],
  },
  {
    name: "Edge Pro",
    price: "$997",
    priceNote: "Setup waived with 6-mo commitment",
    setup: "$999 one-time",
    period: "/mo",
    badge: "Most Popular",
    popular: true,
    bestFor: "Growth-focused local businesses that want AI automation, local visibility, and reputation growth.",
    cta: "Choose Edge Pro",
    color: "#00AEEF",
    prevTier: "Everything in Starter, plus:",
    items: [
      "AI Receptionist",
      "Local Presence Engine",
      "Google Business Profile Optimization",
      "Apple / Bing / Nextdoor Setup Guidance",
      "AI Visibility Engine",
      "Review Automation",
      "Social Publishing Support",
      "Monthly Strategy Recommendations",
      "Priority Support",
    ],
  },
  {
    name: "Edge Elite",
    price: "$1,997",
    priceNote: "Starting at $1,997/mo",
    setup: "$1,500–$2,500 (based on scope)",
    period: "/mo",
    badge: null,
    popular: false,
    bestFor: "Established businesses that want advanced visibility, automation, and competitive growth.",
    cta: "Apply for Edge Elite",
    color: "#3B82F6",
    prevTier: "Everything in Pro, plus:",
    items: [
      "Advanced AI Automation",
      "SEO + AI Visibility Optimization",
      "Content Automation Engine",
      "Publishing Center",
      "Competitor Intelligence",
      "Backlink & Citation Strategy",
      "Advanced Reporting",
      "Local Landing Page Strategy",
      "Custom Growth Recommendations",
    ],
  },
];

const ECOSYSTEM = {
  name: "AI Edge Ecosystem",
  price: "Custom",
  priceRange: "$3,500–$5,000+/mo",
  setup: "Custom onboarding",
  badge: "Full Platform",
  bestFor: "Businesses that want the full AI growth operating system — from calls to content to conversions.",
  cta: "Book Ecosystem Strategy Call",
  prevTier: "Everything in Elite, plus:",
  items: [
    "Full AI Edge Platform Setup",
    "Custom Workflows",
    "Full SEO Execution",
    "AI Receptionist Customization",
    "Omnichannel Visibility Management",
    "Dedicated Growth Strategy",
    "Multi-Location Support",
    "Advanced Automation Consulting",
    "Premium Support",
  ],
};

const COMPARISON_FEATURES = [
  { feature: "Lead Recovery AI",                  starter: true,   pro: true,   elite: true,  eco: true   },
  { feature: "Missed Call Text-Back",             starter: true,   pro: true,   elite: true,  eco: true   },
  { feature: "AI Receptionist",                   starter: "Add-on", pro: true, elite: true,  eco: "Custom" },
  { feature: "Local Presence Engine",             starter: false,  pro: true,   elite: true,  eco: true   },
  { feature: "Google Business Profile Optim.",    starter: false,  pro: true,   elite: true,  eco: true   },
  { feature: "Apple / Bing / Nextdoor Setup",     starter: false,  pro: true,   elite: true,  eco: true   },
  { feature: "AI Visibility Engine",              starter: false,  pro: true,   elite: true,  eco: true   },
  { feature: "Social Publishing",                 starter: false,  pro: "Basic", elite: true, eco: true   },
  { feature: "Review Automation",                 starter: "Basic", pro: true,  elite: true,  eco: true   },
  { feature: "SEO Strategy",                      starter: false,  pro: false,  elite: true,  eco: true   },
  { feature: "Competitor Intelligence",           starter: false,  pro: false,  elite: true,  eco: true   },
  { feature: "Backlink / Citation Strategy",      starter: false,  pro: false,  elite: true,  eco: true   },
  { feature: "Custom Automations",                starter: false,  pro: false,  elite: false, eco: true   },
  { feature: "Multi-Location Support",            starter: false,  pro: false,  elite: false, eco: true   },
  { feature: "Dedicated Strategy Support",        starter: false,  pro: false,  elite: false, eco: true   },
];

const ADDONS = [
  { name: "Website Build",                price: "$1,500–$3,000+",      note: "One-time project" },
  { name: "SEO Growth Package",           price: "$500–$1,500/mo",      note: "Ongoing managed SEO" },
  { name: "AI Voice Receptionist",        price: "$100–$300/mo",        note: "If purchased separately" },
  { name: "Extra Location",              price: "$250–$750/mo",         note: "Depends on package tier" },
  { name: "Custom Automation",            price: "Quoted individually",  note: "Scoped per project" },
  { name: "Ecommerce / Seller Edge AI",   price: "Coming Soon",          note: "Join waitlist" },
];

const FAQS = [
  { q: "Do I need all features right away?",       a: "No. Most businesses start with Starter or Pro and upgrade as they see results. We make upgrades seamless with no additional setup fees." },
  { q: "Can setup fees be waived?",                a: "Yes. Setup fees are waived with qualified 6 or 12-month agreements on most packages. Ask about our commitment options." },
  { q: "Is this software or done-for-you service?", a: "AI Edge combines software, automation, visibility systems, and strategy support depending on your package level. You're not just buying a dashboard — we build and manage it with you." },
  { q: "Can this replace multiple tools?",          a: "Yes. AI Edge is designed to reduce or eliminate the need for separate lead recovery, reputation management, listing management, AI visibility, and social publishing tools — all in one platform." },
  { q: "What businesses is this best for?",         a: "Local service businesses, home services, medical and wellness offices, legal practices, ecommerce brands, and any business that depends on inbound leads and local customers." },
  { q: "Is AI Receptionist included?",              a: "Included in Pro and above. Available as an optional add-on ($100–$300/mo) for Starter clients." },
  { q: "Do you support ecommerce?",                 a: "Seller Edge AI for ecommerce automation is coming soon. Get in touch to join the early access waitlist." },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [, navigate] = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ background: "#030612", minHeight: "100vh", color: "#FFFFFF", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <Nav />

      {/* ══════════════════════════════════════════════════════════ HERO ══ */}
      <section style={{ paddingTop: 140, paddingBottom: 80, paddingLeft: 24, paddingRight: 24, textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 900, height: 560, pointerEvents: "none", background: "radial-gradient(ellipse, rgba(0,174,239,0.10) 0%, transparent 68%)" }} />
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(0,174,239,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,174,239,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black, transparent)",
        }} />

        <div style={{ position: "relative", maxWidth: 760, margin: "0 auto" }}>
          <div style={{
            display: "inline-block", marginBottom: 20,
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.22)",
            borderRadius: 100, padding: "6px 22px",
            fontSize: 11, fontWeight: 800, color: "#00AEEF", letterSpacing: "1.8px", textTransform: "uppercase",
          }}>AI Growth Packages</div>

          <h1 style={{ fontSize: "clamp(36px, 5.5vw, 66px)", fontWeight: 900, letterSpacing: "-2px", lineHeight: 1.05, marginBottom: 22, color: "#FFFFFF" }}>
            AI Growth Packages Built<br />
            <span style={{ color: "#00AEEF", textShadow: "0 0 40px rgba(0,174,239,0.45)" }}>for Local Businesses</span>
          </h1>

          <p style={{ fontSize: 18, color: "#6B7280", lineHeight: 1.65, maxWidth: 560, margin: "0 auto 14px" }}>
            Recover missed leads, improve local visibility, get found in AI search, and automate customer follow-up — from one powerful platform.
          </p>
          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, maxWidth: 520, margin: "0 auto 36px" }}>
            Plans designed to replace scattered tools, disconnected dashboards, and expensive manual marketing workflows.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/business-assessment")}
              style={{
                padding: "13px 30px", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg, #00AEEF, #0077BB)",
                color: "#FFF", fontSize: 15, fontWeight: 800, cursor: "pointer",
                boxShadow: "0 0 32px rgba(0,174,239,0.4)", transition: "all 0.25s",
              }}
              onMouseEnter={e => { const el = e.currentTarget; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 0 50px rgba(0,174,239,0.6)"; }}
              onMouseLeave={e => { const el = e.currentTarget; el.style.transform = "translateY(0)"; el.style.boxShadow = "0 0 32px rgba(0,174,239,0.4)"; }}
            >⚡ Get Free Business Assessment</button>
            <button
              onClick={() => navigate("/contact")}
              style={{
                padding: "13px 30px", borderRadius: 12,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.15)",
                color: "#C0C0C0", fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "all 0.25s",
              }}
              onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = "rgba(0,174,239,0.4)"; el.style.color = "#00AEEF"; }}
              onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = "rgba(255,255,255,0.15)"; el.style.color = "#C0C0C0"; }}
            >📅 Book Strategy Call</button>
          </div>

          {/* Positioning strip */}
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", marginTop: 40 }}>
            {["Replaces 6+ tools", "One platform", "Done-with-you setup", "Month-to-month options"].map(t => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="8" height="8" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="#00AEEF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                </div>
                <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════ PRICING CARDS ══ */}
      <section style={{ padding: "0 24px 48px", maxWidth: 1280, margin: "0 auto" }}>
        <div className="pricing-cards-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {PLANS.map(plan => (
            <PlanCard key={plan.name} plan={plan} onCta={() => navigate("/contact")} />
          ))}
        </div>
      </section>

      {/* Ecosystem featured card */}
      <section style={{ padding: "0 24px 64px", maxWidth: 1280, margin: "0 auto" }}>
        <div style={{
          position: "relative",
          background: "linear-gradient(135deg, rgba(0,20,50,0.97) 0%, rgba(3,6,18,0.99) 100%)",
          borderRadius: 28, padding: "48px 52px",
          boxShadow: "0 0 0 1px rgba(0,174,239,0.25), 0 0 80px rgba(0,174,239,0.1), 0 24px 60px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}>
          {/* Glows */}
          <div style={{ position: "absolute", top: -80, right: -80, width: 400, height: 400, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(ellipse, rgba(0,174,239,0.14) 0%, transparent 70%)" }} />
          <div style={{ position: "absolute", bottom: -60, left: -60, width: 300, height: 300, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(ellipse, rgba(59,130,246,0.08) 0%, transparent 70%)" }} />
          <div style={{
            position: "absolute", inset: 0, borderRadius: 28, pointerEvents: "none", overflow: "hidden",
            backgroundImage: "linear-gradient(rgba(0,174,239,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,174,239,0.035) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }} />
          {/* Badge top-center */}
          <div style={{
            position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
            background: "linear-gradient(90deg, #00AEEF, #00D4FF)", borderRadius: "0 0 14px 14px",
            padding: "6px 28px", fontSize: 11, fontWeight: 900, color: "#FFF", letterSpacing: "1.5px", textTransform: "uppercase",
            boxShadow: "0 4px 20px rgba(0,174,239,0.4)",
          }}>⚡ {ECOSYSTEM.badge}</div>

          <div className="pricing-ecosystem-inner" style={{ position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 52, alignItems: "flex-start" }}>
            <div>
              <h2 style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-1px", marginBottom: 8, color: "#FFF" }}>{ECOSYSTEM.name}</h2>
              <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.6, marginBottom: 24 }}>{ECOSYSTEM.bestFor}</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 46, fontWeight: 900, letterSpacing: "-2px", background: "linear-gradient(135deg, #00AEEF, #00D4FF, #C0C0C0)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", filter: "drop-shadow(0 0 20px rgba(0,174,239,0.4))" }}>{ECOSYSTEM.price}</span>
              </div>
              <div style={{ fontSize: 14, color: "#475569", marginBottom: 6 }}>Suggested: {ECOSYSTEM.priceRange}</div>
              <div style={{ fontSize: 13, color: "#374151", marginBottom: 32 }}>Setup: {ECOSYSTEM.setup}</div>
              <button
                onClick={() => navigate("/contact")}
                style={{
                  padding: "14px 36px", borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg, #00AEEF, #0077BB)",
                  color: "#FFF", fontSize: 16, fontWeight: 800, cursor: "pointer",
                  boxShadow: "0 0 40px rgba(0,174,239,0.45)", transition: "all 0.3s",
                }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 0 60px rgba(0,174,239,0.65)"; }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.transform = "translateY(0)"; el.style.boxShadow = "0 0 40px rgba(0,174,239,0.45)"; }}
              >{ECOSYSTEM.cta} →</button>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 14, fontStyle: "italic" }}>{ECOSYSTEM.prevTier}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
                {ECOSYSTEM.items.map(item => (
                  <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <CheckCircle color="#00AEEF" />
                    <span style={{ fontSize: 13.5, color: "#C0C0C0", lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════ COMPARISON TABLE ══ */}
      <section style={{ padding: "0 24px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#00AEEF", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 12 }}>Compare</div>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 900, letterSpacing: "-1px", color: "#FFF" }}>Feature Comparison</h2>
        </div>
        <div className="pricing-comparison-scroll" style={{ background: "rgba(11,22,41,0.8)", border: "1px solid rgba(0,174,239,0.1)", borderRadius: 18, overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1fr 1fr", background: "rgba(0,174,239,0.05)", borderBottom: "1px solid rgba(0,174,239,0.12)" }}>
            <div style={{ padding: "16px 20px", fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px" }}>Feature</div>
            {[
              { label: "Starter", color: "#C0C0C0" },
              { label: "Pro", color: "#00AEEF" },
              { label: "Elite", color: "#3B82F6" },
              { label: "Ecosystem", color: "#22C55E" },
            ].map(col => (
              <div key={col.label} style={{ padding: "16px 12px", textAlign: "center", fontSize: 13, fontWeight: 800, color: col.color }}>{col.label}</div>
            ))}
          </div>
          {COMPARISON_FEATURES.map((row, i) => (
            <div key={row.feature} style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1fr 1fr", borderBottom: i < COMPARISON_FEATURES.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
              <div style={{ padding: "13px 20px", fontSize: 13, color: "#94A3B8" }}>{row.feature}</div>
              <CompareCell value={row.starter} />
              <CompareCell value={row.pro}     highlight />
              <CompareCell value={row.elite}   />
              <CompareCell value={row.eco}     />
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ ADD-ONS ══ */}
      <section style={{ padding: "0 24px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#00AEEF", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 12 }}>Modular</div>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 900, letterSpacing: "-1px", color: "#FFF" }}>Optional Add-Ons</h2>
          <p style={{ fontSize: 15, color: "#475569", marginTop: 10 }}>Bolt on exactly what you need — no bloat, no bundles you'll never use.</p>
        </div>
        <div className="addons-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {ADDONS.map(a => (
            <div key={a.name} style={{
              background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
              borderTop: "2px solid rgba(0,174,239,0.25)", borderRadius: 14, padding: "20px 22px",
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#E2E8F0", marginBottom: 6 }}>{a.name}</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: a.price === "Coming Soon" ? "#475569" : "#00AEEF", marginBottom: 4 }}>{a.price}</div>
              <div style={{ fontSize: 12, color: "#374151" }}>{a.note}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ SETUP ══ */}
      <section style={{ padding: "0 24px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <div className="setup-grid" style={{
          background: "rgba(11,22,41,0.8)", border: "1px solid rgba(0,174,239,0.12)",
          borderRadius: 20, padding: "40px 44px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#00AEEF", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 14 }}>Onboarding</div>
            <h2 style={{ fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 900, letterSpacing: "-0.5px", color: "#FFF", marginBottom: 12 }}>What's Included in Setup</h2>
            <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.7, marginBottom: 20 }}>
              Your setup fee isn't just account activation. It's a full build-out of your AI growth system, done with you by our team.
            </p>
            <div style={{ padding: "12px 16px", background: "rgba(0,174,239,0.05)", border: "1px solid rgba(0,174,239,0.15)", borderRadius: 10, fontSize: 13, color: "#6B7280", lineHeight: 1.65 }}>
              💡 Setup may be waived with qualified <strong style={{ color: "#00AEEF" }}>6 or 12-month agreements</strong>. Ask about our commitment options.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px" }}>
            {[
              "Account & dashboard setup",
              "Business profile configuration",
              "Tool integrations",
              "Phone & SMS configuration",
              "Initial automation build",
              "First growth assessment",
              "AI Receptionist setup",
              "Kickoff strategy session",
            ].map(item => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <CheckCircle color="#22C55E" size={16} />
                <span style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.4 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════ PERFORMANCE MODEL ══ */}
      <section style={{ padding: "0 24px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{
          background: "linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(0,174,239,0.04) 100%)",
          border: "1px solid rgba(59,130,246,0.2)", borderRadius: 20, padding: "40px 44px",
          display: "grid", gridTemplateColumns: "1fr auto", gap: 40, alignItems: "center",
        }} className="performance-grid">
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#3B82F6", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 14 }}>Performance Pricing</div>
            <h2 style={{ fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 900, letterSpacing: "-0.5px", color: "#FFF", marginBottom: 12 }}>Prefer Performance-Based Pricing?</h2>
            <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.7, marginBottom: 16 }}>
              We offer a lower monthly retainer paired with a performance fee per recovered lead or booked appointment.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: "#3B82F6" }}>Starting at $497/mo</span>
              <span style={{ fontSize: 14, color: "#374151" }}>+ performance fee</span>
            </div>
            <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.6 }}>
              Available for approved businesses with clear lead tracking in place. We verify this before recommending it.
            </p>
          </div>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <button
              onClick={() => navigate("/contact")}
              style={{
                padding: "13px 28px", borderRadius: 12,
                background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.35)",
                color: "#3B82F6", fontSize: 14, fontWeight: 800, cursor: "pointer", transition: "all 0.2s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { const el = e.currentTarget; el.style.background = "rgba(59,130,246,0.2)"; el.style.boxShadow = "0 0 20px rgba(59,130,246,0.3)"; }}
              onMouseLeave={e => { const el = e.currentTarget; el.style.background = "rgba(59,130,246,0.12)"; el.style.boxShadow = "none"; }}
            >Ask About Performance Pricing →</button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════ FAQ ══ */}
      <section id="faq" style={{ padding: "0 24px 96px", maxWidth: 800, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#00AEEF", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 12 }}>FAQ</div>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 900, letterSpacing: "-1px", color: "#FFF" }}>Common Questions</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FAQS.map(({ q, a }, i) => (
            <div key={q} style={{
              background: openFaq === i ? "rgba(0,174,239,0.05)" : "rgba(255,255,255,0.025)",
              border: openFaq === i ? "1px solid rgba(0,174,239,0.22)" : "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14, overflow: "hidden", transition: "all 0.2s",
            }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", background: "none", border: "none", color: "#FFF", fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left", gap: 16 }}
              >
                <span>{q}</span>
                <span style={{ fontSize: 20, color: "#00AEEF", flexShrink: 0, transition: "transform 0.2s", transform: openFaq === i ? "rotate(45deg)" : "rotate(0deg)" }}>+</span>
              </button>
              {openFaq === i && (
                <div style={{ padding: "0 22px 18px" }}>
                  <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.75, margin: 0 }}>{a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════ BOTTOM CTA ══ */}
      <section style={{ padding: "64px 24px 100px", textAlign: "center", background: "rgba(0,174,239,0.025)", borderTop: "1px solid rgba(0,174,239,0.07)" }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, letterSpacing: "-1px", color: "#FFF", marginBottom: 14 }}>
            Not Sure Which Package Fits?
          </h2>
          <p style={{ fontSize: 17, color: "#475569", lineHeight: 1.65, marginBottom: 36 }}>
            Start with a free AI Business Assessment and see exactly where your business is losing leads, visibility, and revenue.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/business-assessment")}
              style={{
                padding: "14px 32px", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg, #00AEEF, #0077BB)",
                color: "#FFF", fontSize: 16, fontWeight: 800, cursor: "pointer",
                boxShadow: "0 0 32px rgba(0,174,239,0.4)", transition: "all 0.25s",
              }}
              onMouseEnter={e => { const el = e.currentTarget; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 0 50px rgba(0,174,239,0.6)"; }}
              onMouseLeave={e => { const el = e.currentTarget; el.style.transform = "translateY(0)"; el.style.boxShadow = "0 0 32px rgba(0,174,239,0.4)"; }}
            >⚡ Get Free AI Business Assessment</button>
            <button
              onClick={() => navigate("/contact")}
              style={{
                padding: "14px 32px", borderRadius: 12,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.14)",
                color: "#C0C0C0", fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "all 0.25s",
              }}
              onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = "rgba(0,174,239,0.4)"; el.style.color = "#00AEEF"; }}
              onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = "rgba(255,255,255,0.14)"; el.style.color = "#C0C0C0"; }}
            >📅 Book Strategy Call</button>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        @media (max-width: 768px) {
          .pricing-cards-grid { grid-template-columns: 1fr !important; }
          .addons-grid { grid-template-columns: 1fr !important; }
          .setup-grid { grid-template-columns: 1fr !important; gap: 28px !important; padding: 28px 22px !important; }
          .performance-grid { grid-template-columns: 1fr !important; gap: 24px !important; padding: 28px 22px !important; }
          .pricing-comparison-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .pricing-comparison-scroll > div { min-width: 600px; }
        }
        @media (max-width: 520px) {
          .pricing-ecosystem-inner { grid-template-columns: 1fr !important; gap: 28px !important; }
          .pricing-ecosystem-features { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function CheckCircle({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, marginTop: 2, background: `${color}18`, border: `1px solid ${color}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 12 12" fill="none">
        <path d="M2 6l3 3 5-5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function CompareCell({ value, highlight }: { value: boolean | string; highlight?: boolean }) {
  if (value === true) {
    return (
      <div style={{ padding: "13px 12px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: highlight ? "rgba(0,174,239,0.15)" : "rgba(34,197,94,0.12)", border: `1px solid ${highlight ? "rgba(0,174,239,0.4)" : "rgba(34,197,94,0.3)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke={highlight ? "#00AEEF" : "#22C55E"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    );
  }
  if (value === false) {
    return (
      <div style={{ padding: "13px 12px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <span style={{ fontSize: 16, color: "#1E293B" }}>—</span>
      </div>
    );
  }
  return (
    <div style={{ padding: "13px 12px", display: "flex", justifyContent: "center", alignItems: "center" }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: "#3B82F6", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", padding: "2px 8px", borderRadius: 10 }}>{value as string}</span>
    </div>
  );
}

function PlanCard({ plan, onCta }: { plan: typeof PLANS[0]; onCta: () => void }) {
  const c = plan.color;
  return (
    <div style={{
      background: plan.popular
        ? "linear-gradient(160deg, rgba(0,174,239,0.07) 0%, rgba(0,80,160,0.05) 100%)"
        : "rgba(11,22,41,0.8)",
      border: plan.popular ? `1.5px solid rgba(0,174,239,0.35)` : "1px solid rgba(255,255,255,0.07)",
      borderRadius: 22, padding: "36px 30px",
      position: "relative",
      boxShadow: plan.popular ? "0 0 40px rgba(0,174,239,0.1)" : "none",
      display: "flex", flexDirection: "column",
    }}>
      {plan.badge && (
        <div style={{
          position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
          background: "#00AEEF", borderRadius: 100, padding: "4px 20px",
          fontSize: 11, fontWeight: 800, color: "#FFF", whiteSpace: "nowrap", letterSpacing: "0.5px",
        }}>{plan.badge}</div>
      )}

      <h2 style={{ fontSize: 20, fontWeight: 900, color: "#FFF", marginBottom: 6, letterSpacing: "-0.3px" }}>{plan.name}</h2>
      <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, marginBottom: 20 }}>{plan.bestFor}</p>

      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-1.5px", background: `linear-gradient(135deg, ${c}, ${c}BB)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{plan.price}</span>
        <span style={{ fontSize: 14, color: "#374151" }}>{plan.period}</span>
      </div>
      <div style={{ fontSize: 11, color: "#334155", marginBottom: 6 }}>{plan.priceNote}</div>
      <div style={{ fontSize: 11, color: "#374151", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>Setup: {plan.setup}</div>

      <div style={{ flex: 1 }}>
        {plan.prevTier && <div style={{ fontSize: 11, color: "#374151", marginBottom: 12, fontStyle: "italic" }}>{plan.prevTier}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {plan.items.map(item => (
            <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <CheckCircle color={c} />
              <span style={{ fontSize: 13.5, color: "#C0C0C0", lineHeight: 1.4 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onCta}
        style={{
          width: "100%", padding: "13px", borderRadius: 11,
          background: plan.popular ? `linear-gradient(135deg, ${c}, #0077BB)` : `${c}12`,
          border: plan.popular ? "none" : `1px solid ${c}40`,
          color: plan.popular ? "#FFF" : c,
          fontSize: 14, fontWeight: 800, cursor: "pointer",
          boxShadow: plan.popular ? `0 0 28px ${c}40` : "none",
          transition: "all 0.25s",
        }}
        onMouseEnter={e => {
          if (plan.popular) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 0 44px ${c}55`; }
          else { e.currentTarget.style.background = `${c}20`; }
        }}
        onMouseLeave={e => {
          if (plan.popular) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 0 28px ${c}40`; }
          else { e.currentTarget.style.background = `${c}12`; }
        }}
      >{plan.cta} →</button>
    </div>
  );
}
