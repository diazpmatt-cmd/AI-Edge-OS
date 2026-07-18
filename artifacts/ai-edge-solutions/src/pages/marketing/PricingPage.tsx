import { useState } from "react";
import { useLocation } from "wouter";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

// ─────────────────────────────────────────────────────────────────────────────
// Data — mirrors the 3 tiers shown in the Command Center Pricing Packages card
// ─────────────────────────────────────────────────────────────────────────────

type Module = {
  name: string;
  icon: string;
  description: string;
};

type Plan = {
  name: string;
  tagline: string;
  badge: string;
  badgeColor: string;
  color: string;
  price: string;
  priceNote: string;
  period: string;
  bestFor: string;
  cta: string;
  ctaStyle: "primary" | "ghost" | "purple";
  modules: Module[];
  extras: string[];
};

const PLANS: Plan[] = [
  {
    name: "Core Package",
    tagline: "Foundation · Local Visibility",
    badge: "POPULAR",
    badgeColor: "#00AEEF",
    color: "#00AEEF",
    price: "$997",
    priceNote: "$1,197/mo month-to-month",
    period: "/mo",
    bestFor: "Local businesses that want to dominate Google Business Profile, automate reputation management, and get a daily operational view.",
    cta: "Get Started with Core",
    ctaStyle: "primary",
    modules: [
      { name: "GBP Audit Engine",   icon: "🔍", description: "Automated Google Business Profile health scoring, issue detection, and optimization recommendations." },
      { name: "Local Presence",      icon: "📍", description: "Listing consistency management across Google, Apple, Bing, and Nextdoor." },
      { name: "Reviews Engine",      icon: "⭐", description: "Automated review request campaigns and reputation monitoring with AI sentiment analysis." },
      { name: "Daily Command Center",icon: "📊", description: "Unified dashboard with KPIs, AI executive brief, and action queue updated every 24 hours." },
    ],
    extras: [
      "Done-with-you GBP setup & optimization",
      "Monthly performance summary",
      "Priority support",
      "Setup fee waived with 6-mo commitment",
    ],
  },
  {
    name: "Growth Package",
    tagline: "Lead Recovery · AI Automation",
    badge: "GROWTH",
    badgeColor: "#22C55E",
    color: "#22C55E",
    price: "Add-on",
    priceNote: "Bundled or standalone — contact for pricing",
    period: "",
    bestFor: "Growth-focused businesses that need AI to recover missed leads, analyze call performance, and have a virtual receptionist on call 24/7.",
    cta: "Add Growth Engine",
    ctaStyle: "ghost",
    modules: [
      { name: "Lead Recovery AI",    icon: "🎯", description: "Instant missed-call text-back, SMS follow-up sequences, and lead capture automation." },
      { name: "Call Intelligence",   icon: "📞", description: "AI transcription, sentiment scoring, and conversion analysis for every inbound call." },
      { name: "Growth Execution",    icon: "🚀", description: "Revenue campaign management, re-engagement flows, and upsell automation sequences." },
      { name: "AI Receptionist",     icon: "🤖", description: "24/7 AI voice and text receptionist that qualifies leads, answers FAQs, and books appointments." },
    ],
    extras: [
      "Missed-call text-back within 60 seconds",
      "SMS + voice AI response flows",
      "Call recording & transcription archive",
      "Appointment booking integration",
    ],
  },
  {
    name: "Enterprise",
    tagline: "Full AI OS · Competitive Intelligence",
    badge: "CUSTOM",
    badgeColor: "#A78BFA",
    color: "#A78BFA",
    price: "Custom",
    priceNote: "Scoped to your business — request a quote",
    period: "",
    bestFor: "Established businesses that want the complete AI Growth OS: competitor tracking, backlink strategy, content authority, and a dedicated AI CMO layer.",
    cta: "Request Enterprise Quote",
    ctaStyle: "purple",
    modules: [
      { name: "Competitor Intelligence", icon: "🔬", description: "Keyword gap analysis, competitor GBP tracking, and real-time market positioning data." },
      { name: "Authority & Backlink",    icon: "🔗", description: "Citation management, backlink strategy, and local authority building at scale." },
      { name: "AI CMO",                  icon: "🧠", description: "AI-generated monthly strategy briefs, content calendar automation, and growth roadmap recommendations." },
      { name: "All Engines Included",    icon: "⚡", description: "Everything in Core + Growth plus custom workflow automation and multi-location support." },
    ],
    extras: [
      "Everything in Core + Growth",
      "Custom workflow automation",
      "Multi-location support",
      "Dedicated growth strategy team",
    ],
  },
];

const MODULE_COMPARISON = [
  { module: "GBP Audit Engine",        core: true,  growth: false, enterprise: true  },
  { module: "Local Presence",           core: true,  growth: false, enterprise: true  },
  { module: "Reviews Engine",           core: true,  growth: false, enterprise: true  },
  { module: "Daily Command Center",     core: true,  growth: true,  enterprise: true  },
  { module: "Lead Recovery AI",         core: false, growth: true,  enterprise: true  },
  { module: "Call Intelligence",        core: false, growth: true,  enterprise: true  },
  { module: "Growth Execution Engine",  core: false, growth: true,  enterprise: true  },
  { module: "AI Receptionist",          core: "Add-on", growth: true, enterprise: true },
  { module: "Competitor Intelligence",  core: false, growth: false, enterprise: true  },
  { module: "Authority & Backlink",     core: false, growth: false, enterprise: true  },
  { module: "AI CMO",                   core: false, growth: false, enterprise: true  },
  { module: "Multi-Location Support",   core: false, growth: false, enterprise: true  },
  { module: "Custom Automations",       core: false, growth: false, enterprise: true  },
  { module: "Dedicated Strategy Team",  core: false, growth: false, enterprise: true  },
];

const ADDONS = [
  { name: "Website Build",               price: "$1,500–$3,000+",     note: "One-time project" },
  { name: "SEO Growth Package",          price: "$500–$1,500/mo",     note: "Ongoing managed SEO" },
  { name: "Extra Location",             price: "$250–$750/mo",        note: "Depends on package tier" },
  { name: "Custom Automation",           price: "Quoted individually", note: "Scoped per project" },
  { name: "Performance Pricing Model",   price: "Starting $497/mo",   note: "+ performance fee per lead" },
  { name: "Ecommerce / Seller Edge AI",  price: "Coming Soon",         note: "Join waitlist" },
];

const FAQS = [
  { q: "What's the difference between Core and Growth?",
    a: "Core Package focuses on local visibility — GBP optimization, reputation management, and your daily command center. Growth Package adds AI-powered lead recovery tools: missed-call text-back, call intelligence, and your AI receptionist. Most businesses start with Core and layer in Growth as their lead volume grows." },
  { q: "Can I get Growth without Core?",
    a: "Growth can be purchased standalone for businesses that already have visibility handled. However, the most impactful results come when both are running together — visibility + lead recovery is the full funnel." },
  { q: "What does the AI Receptionist actually do?",
    a: "It answers inbound calls and texts 24/7, qualifies leads by asking your screening questions, answers FAQs, and books appointments directly into your calendar. It's included in Growth Package and Enterprise, and available as an add-on for Core clients." },
  { q: "Is Enterprise priced per module or as a flat rate?",
    a: "Enterprise is custom-scoped based on your business size, location count, and which engines you need fully activated. Book a strategy call and we'll build a proposal within 48 hours." },
  { q: "Can setup fees be waived?",
    a: "Yes. Setup fees are waived with qualified 6 or 12-month agreements on Core and Growth packages. Enterprise onboarding is included in your custom contract." },
  { q: "What businesses is this best for?",
    a: "Local service businesses, home services, medical and wellness offices, legal practices, and any business that depends on inbound calls, local search visibility, and reputation to win customers." },
  { q: "Is this software or done-for-you?",
    a: "Both. AI Edge combines automation software, active campaign management, and strategy support. You get a dashboard to see everything, and a team that builds and monitors it with you." },
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

        <div style={{ position: "relative", maxWidth: 780, margin: "0 auto" }}>
          <div style={{
            display: "inline-block", marginBottom: 20,
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.22)",
            borderRadius: 100, padding: "6px 22px",
            fontSize: 11, fontWeight: 800, color: "#00AEEF", letterSpacing: "1.8px", textTransform: "uppercase",
          }}>AI Edge OS — Pricing Packages</div>

          <h1 style={{ fontSize: "clamp(36px, 5.5vw, 64px)", fontWeight: 900, letterSpacing: "-2px", lineHeight: 1.05, marginBottom: 22, color: "#FFFFFF" }}>
            Three Packages.<br />
            <span style={{ color: "#00AEEF", textShadow: "0 0 40px rgba(0,174,239,0.45)" }}>One AI Growth OS.</span>
          </h1>

          <p style={{ fontSize: 18, color: "#6B7280", lineHeight: 1.65, maxWidth: 580, margin: "0 auto 14px" }}>
            Start with local visibility. Layer in AI-powered lead recovery. Scale to full competitive intelligence — all from one platform built for local businesses.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: 36 }}>
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

          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", marginTop: 40 }}>
            {["Start with Core, scale up anytime", "Replaces 6+ tools", "Done-with-you setup", "Month-to-month options"].map(t => (
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

      {/* ══════════════════════════════════════════════ TIER LABEL STRIP ══ */}
      <section style={{ padding: "0 24px 12px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 0 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
          <div style={{ fontSize: 10, fontWeight: 800, color: "#374151", letterSpacing: "2px", textTransform: "uppercase", whiteSpace: "nowrap" }}>Choose your AI Edge layer</div>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════ PLAN CARDS ══ */}
      <section style={{ padding: "0 24px 72px", maxWidth: 1200, margin: "0 auto" }}>
        <div className="pricing-cards-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {PLANS.map(plan => {
            const slug = plan.name === "Core Package" ? "core" : plan.name === "Growth Package" ? "growth" : "enterprise";
            return <PlanCard key={plan.name} plan={plan} onCta={() => navigate(`/contact?package=${slug}`)} />;
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════ MODULE COMPARISON ══ */}
      <section style={{ padding: "0 24px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#00AEEF", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 12 }}>What's Included</div>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 900, letterSpacing: "-1px", color: "#FFF" }}>AI Edge OS Module Comparison</h2>
          <p style={{ fontSize: 15, color: "#475569", marginTop: 10 }}>Every module is a discrete AI engine. Activate the ones your business needs.</p>
        </div>
        <div className="pricing-comparison-scroll" style={{ background: "rgba(11,22,41,0.8)", border: "1px solid rgba(0,174,239,0.1)", borderRadius: 18, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1fr", background: "rgba(0,174,239,0.05)", borderBottom: "1px solid rgba(0,174,239,0.12)" }}>
            <div style={{ padding: "16px 20px", fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px" }}>AI Edge OS Module</div>
            {[
              { label: "Core", color: "#00AEEF" },
              { label: "Growth", color: "#22C55E" },
              { label: "Enterprise", color: "#A78BFA" },
            ].map(col => (
              <div key={col.label} style={{ padding: "16px 12px", textAlign: "center", fontSize: 13, fontWeight: 800, color: col.color }}>{col.label}</div>
            ))}
          </div>
          {MODULE_COMPARISON.map((row, i) => (
            <div key={row.module} style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1fr", borderBottom: i < MODULE_COMPARISON.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
              <div style={{ padding: "13px 20px", fontSize: 13, color: "#94A3B8" }}>{row.module}</div>
              <CompareCell value={row.core}       highlightColor="#00AEEF" />
              <CompareCell value={row.growth}     highlightColor="#22C55E" />
              <CompareCell value={row.enterprise} highlightColor="#A78BFA" />
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════ HOW IT STACKS ══ */}
      <section style={{ padding: "0 24px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#F59E0B", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 12 }}>Modular by Design</div>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 900, letterSpacing: "-1px", color: "#FFF" }}>Stack Packages as You Grow</h2>
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 0 }}>
          {/* Connector line */}
          <div style={{ position: "absolute", left: 28, top: 36, bottom: 36, width: 2, background: "linear-gradient(to bottom, #00AEEF44, #22C55E44, #A78BFA44)", borderRadius: 2 }} />
          {[
            { step: "1", title: "Core Package", sub: "GBP · Presence · Reviews · Command Center", color: "#00AEEF", note: "Start here — get your local foundation right." },
            { step: "2", title: "+ Growth Package", sub: "Lead Recovery · Call AI · Growth Execution · AI Receptionist", color: "#22C55E", note: "Layer in when you're ready to convert more leads." },
            { step: "3", title: "+ Enterprise", sub: "Competitor Intelligence · Authority · AI CMO · All Engines", color: "#A78BFA", note: "Scale to full AI Growth OS when you want to dominate your market." },
          ].map((item, i) => (
            <div key={i} className="stack-row" style={{ display: "flex", alignItems: "flex-start", gap: 20, padding: "20px 0", marginLeft: 0 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${item.color}15`, border: `2px solid ${item.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative", zIndex: 1 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: item.color }}>{item.step}</span>
              </div>
              <div style={{ paddingTop: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#E2E8F0", marginBottom: 3 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: item.color, fontWeight: 600, marginBottom: 4 }}>{item.sub}</div>
                <div style={{ fontSize: 13, color: "#475569" }}>{item.note}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════ SETUP ══ */}
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
              Your setup isn't just account activation — it's a full build-out of your AI growth system with our team alongside you.
            </p>
            <div style={{ padding: "12px 16px", background: "rgba(0,174,239,0.05)", border: "1px solid rgba(0,174,239,0.15)", borderRadius: 10, fontSize: 13, color: "#6B7280", lineHeight: 1.65 }}>
              💡 Setup fees are waived with qualified <strong style={{ color: "#00AEEF" }}>6 or 12-month agreements</strong>. Ask about commitment options.
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

      {/* ═══════════════════════════════════════════════════ ADD-ONS ══ */}
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
        @media (max-width: 900px) {
          .pricing-cards-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .addons-grid { grid-template-columns: 1fr 1fr !important; }
          .setup-grid { grid-template-columns: 1fr !important; gap: 28px !important; padding: 28px 22px !important; }
          .pricing-comparison-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .pricing-comparison-scroll > div { min-width: 560px; }
        }
        @media (max-width: 520px) {
          .addons-grid { grid-template-columns: 1fr !important; }
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

function CompareCell({ value, highlightColor }: { value: boolean | string; highlightColor: string }) {
  if (value === true) {
    return (
      <div style={{ padding: "13px 12px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${highlightColor}18`, border: `1px solid ${highlightColor}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke={highlightColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
      <span style={{ fontSize: 10, fontWeight: 800, color: highlightColor, background: `${highlightColor}12`, border: `1px solid ${highlightColor}28`, padding: "2px 8px", borderRadius: 10 }}>{value as string}</span>
    </div>
  );
}

function PlanCard({ plan, onCta }: { plan: Plan; onCta: () => void }) {
  const c = plan.color;

  const ctaBg =
    plan.ctaStyle === "primary" ? `linear-gradient(135deg, #00AEEF, #0077BB)` :
    plan.ctaStyle === "purple"  ? `linear-gradient(135deg, #A78BFA, #7C3AED)` :
    `rgba(34,197,94,0.1)`;

  const ctaBorder =
    plan.ctaStyle === "primary" ? "none" :
    plan.ctaStyle === "purple"  ? "none" :
    `1px solid rgba(34,197,94,0.35)`;

  const ctaColor =
    plan.ctaStyle === "ghost" ? "#22C55E" : "#FFF";

  const ctaShadow =
    plan.ctaStyle === "primary" ? "0 0 32px rgba(0,174,239,0.4)" :
    plan.ctaStyle === "purple"  ? "0 0 32px rgba(167,139,250,0.4)" :
    "none";

  return (
    <div style={{
      background: plan.ctaStyle === "primary"
        ? "linear-gradient(160deg, rgba(0,174,239,0.07) 0%, rgba(0,80,160,0.04) 100%)"
        : plan.ctaStyle === "purple"
        ? "linear-gradient(160deg, rgba(167,139,250,0.07) 0%, rgba(100,50,200,0.04) 100%)"
        : "rgba(11,22,41,0.8)",
      border: plan.ctaStyle === "primary"
        ? "1.5px solid rgba(0,174,239,0.35)"
        : plan.ctaStyle === "purple"
        ? "1.5px solid rgba(167,139,250,0.3)"
        : "1px solid rgba(255,255,255,0.07)",
      borderRadius: 24, padding: "36px 30px",
      position: "relative",
      boxShadow: plan.ctaStyle === "primary" ? "0 0 50px rgba(0,174,239,0.1)" :
                 plan.ctaStyle === "purple"  ? "0 0 50px rgba(167,139,250,0.08)" : "none",
      display: "flex", flexDirection: "column",
    }}>
      {/* Badge */}
      <div style={{
        position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
        background: c, borderRadius: 100, padding: "4px 20px",
        fontSize: 11, fontWeight: 800, color: "#FFF", whiteSpace: "nowrap", letterSpacing: "0.5px",
        boxShadow: `0 0 16px ${c}66`,
      }}>{plan.badge}</div>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "#FFF", marginBottom: 3, letterSpacing: "-0.3px" }}>{plan.name}</h2>
        <div style={{ fontSize: 11, fontWeight: 700, color: c, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 10 }}>{plan.tagline}</div>
        <p style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.6 }}>{plan.bestFor}</p>
      </div>

      {/* Price */}
      <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${c}18` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: plan.price === "Custom" || plan.price === "Add-on" ? 28 : 40, fontWeight: 900, letterSpacing: "-1.5px", background: `linear-gradient(135deg, ${c}, ${c}BB)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{plan.price}</span>
          {plan.period && <span style={{ fontSize: 14, color: "#374151" }}>{plan.period}</span>}
        </div>
        <div style={{ fontSize: 12, color: "#334155" }}>{plan.priceNote}</div>
      </div>

      {/* Modules */}
      <div style={{ marginBottom: 24, flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#374151", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 14 }}>AI Edge OS Modules</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {plan.modules.map(mod => (
            <div key={mod.name} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: `${c}12`, border: `1px solid ${c}28`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
              }}>{mod.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0", marginBottom: 2 }}>{mod.name}</div>
                <div style={{ fontSize: 11.5, color: "#475569", lineHeight: 1.5 }}>{mod.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Extras */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#374151", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>Also Included</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {plan.extras.map(extra => (
            <div key={extra} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <CheckCircle color={c} size={15} />
              <span style={{ fontSize: 12.5, color: "#94A3B8", lineHeight: 1.4 }}>{extra}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onCta}
        style={{
          width: "100%", padding: "13px 20px", borderRadius: 12,
          background: ctaBg, border: ctaBorder, color: ctaColor,
          fontSize: 14, fontWeight: 800, cursor: "pointer",
          boxShadow: ctaShadow, transition: "all 0.25s",
        }}
        onMouseEnter={e => { const el = e.currentTarget; el.style.transform = "translateY(-2px)"; el.style.filter = "brightness(1.1)"; }}
        onMouseLeave={e => { const el = e.currentTarget; el.style.transform = "translateY(0)"; el.style.filter = "brightness(1)"; }}
      >{plan.cta} →</button>
    </div>
  );
}
