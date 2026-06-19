import { useState } from "react";
import { useLocation } from "wouter";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

const PLANS = [
  {
    name: "Edge Starter",
    tagline: "Start capturing more leads without adding more work.",
    price: "$299–$499",
    period: "/month",
    highlight: false,
    badge: null,
    featured: false,
    cta: "Get Started",
    items: [
      "Missed Call Text Back",
      "Lead Capture",
      "CRM Intake",
      "Basic Follow-Up",
      "Basic Reporting",
    ],
    prevTier: null,
  },
  {
    name: "Edge Pro",
    tagline: "Automate follow-up, reviews, and customer communication.",
    price: "$599–$999",
    period: "/month",
    highlight: false,
    badge: "Most Popular",
    featured: false,
    cta: "Book a Demo",
    items: [
      "AI Receptionist",
      "Review Generation",
      "Follow-Up Automation",
      "Google Business Profile Optimization",
      "Monthly Performance Report",
    ],
    prevTier: "Everything in Edge Starter, plus:",
  },
  {
    name: "Edge Elite",
    tagline: "Advanced AI growth systems for businesses ready to scale.",
    price: "$1,500–$2,500",
    period: "/month",
    highlight: false,
    badge: null,
    featured: false,
    cta: "Build My Growth System",
    items: [
      "Local SEO",
      "Website Optimization",
      "Content Automation",
      "Multi-Channel Distribution",
      "Advanced Reporting Dashboard",
    ],
    prevTier: "Everything in Edge Pro, plus:",
  },
];

const ECOSYSTEM = {
  name: "AI Edge Ecosystem",
  tagline: "Your complete AI-powered growth engine.",
  price: "Starting at $3,500+",
  period: "/month",
  badge: "Best for Full Growth",
  cta: "Apply for Ecosystem",
  prevTier: "Everything in Edge Elite, plus:",
  items: [
    "Lead Recovery AI",
    "AI Receptionist",
    "LocalBizAI",
    "SEO + GEO / AI Search Optimization",
    "Website Design",
    "Content Engine",
    "Review Engine",
    "Backlink Strategy",
    "Monthly Strategy Consulting",
  ],
};

const FAQS = [
  {
    q: "How quickly will I see results?",
    a: "Lead Recovery AI and missed call text-back start working within 24 hours of setup. Most clients see their first recovered leads on day one. SEO and content results typically appear within 30–90 days.",
  },
  {
    q: "Is there a contract or long-term commitment?",
    a: "No long-term contracts. All packages are month-to-month. We earn your business every month with results. AI systems compound over time — clients who stay with us see exponential growth.",
  },
  {
    q: "What types of businesses do you work with?",
    a: "We specialize in local service businesses: pest control, HVAC, plumbing, roofing, landscaping, cleaning, dental, chiropractic, legal, and more. If you depend on local customers, we can help.",
  },
  {
    q: "What's the free business assessment?",
    a: "A 30-minute call where we audit your current digital presence, identify your top revenue opportunities, and recommend the exact package that fits your stage of growth — zero pressure.",
  },
  {
    q: "Can I upgrade my package later?",
    a: "Absolutely. Most clients start with Edge Starter or Edge Pro and scale up as they see results. We make upgrades seamless with no setup fees when moving between tiers.",
  },
  {
    q: "How do I get started?",
    a: "Book a free strategy call. We'll learn about your business, recommend the right package, and have your systems live within 48–72 hours. No complicated onboarding.",
  },
];

function scrollToFaq() {
  document.getElementById("faq")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function PricingPage() {
  const [, navigate] = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ background: "#0B1629", minHeight: "100vh", color: "#FFFFFF", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <Nav />

      {/* ── HERO ── */}
      <section style={{ paddingTop: 140, paddingBottom: 72, paddingLeft: 24, paddingRight: 24, textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: 800, height: 500, pointerEvents: "none",
          background: "radial-gradient(ellipse, rgba(0,174,239,0.10) 0%, transparent 70%)",
        }} />
        {/* Grid */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(0,174,239,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,174,239,0.05) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black, transparent)",
        }} />

        <div style={{ position: "relative", maxWidth: 700, margin: "0 auto" }}>
          <div style={{
            display: "inline-block", marginBottom: 20,
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.25)",
            borderRadius: 100, padding: "6px 20px",
            fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px", textTransform: "uppercase",
          }}>
            Packages & Pricing
          </div>

          <h1 style={{
            fontSize: "clamp(38px, 6vw, 68px)", fontWeight: 900,
            letterSpacing: "-2px", lineHeight: 1.05, marginBottom: 22,
            color: "#FFFFFF",
          }}>
            Transparent Pricing.<br />
            <span style={{ color: "#00AEEF", textShadow: "0 0 40px rgba(0,174,239,0.4)" }}>Transformative Results.</span>
          </h1>

          <p style={{ fontSize: 18, color: "#6B7280", lineHeight: 1.65, maxWidth: 520, margin: "0 auto 36px" }}>
            Pick the package that matches your stage of growth. Every tier builds on the last — start anywhere, scale whenever.
          </p>

          {/* FAQ Jump Button */}
          <button
            onClick={scrollToFaq}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "9px 22px", borderRadius: 9,
              background: "rgba(160,180,210,0.09)", border: "1px solid rgba(180,195,220,0.2)",
              color: "rgba(210,225,245,0.8)", fontSize: 14, fontWeight: 600,
              cursor: "pointer", transition: "all 0.2s", backdropFilter: "blur(8px)",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget;
              el.style.background = "rgba(180,200,230,0.18)";
              el.style.borderColor = "rgba(0,174,239,0.35)";
              el.style.color = "#00AEEF";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget;
              el.style.background = "rgba(160,180,210,0.09)";
              el.style.borderColor = "rgba(180,195,220,0.2)";
              el.style.color = "rgba(210,225,245,0.8)";
            }}
          >
            <span style={{ fontSize: 13 }}>❓</span>
            View FAQ
          </button>
        </div>
      </section>

      {/* ── THREE TIER CARDS ── */}
      <section style={{ padding: "0 24px 40px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} onCta={() => navigate("/contact")} />
          ))}
        </div>
      </section>

      {/* ── ECOSYSTEM FEATURED CARD ── */}
      <section style={{ padding: "0 24px 40px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{
          position: "relative",
          background: "linear-gradient(135deg, rgba(0,20,50,0.95) 0%, rgba(0,10,30,0.98) 100%)",
          border: "1.5px solid transparent",
          borderRadius: 28,
          padding: "48px 48px 44px",
          overflow: "hidden",
          boxShadow: "0 0 0 1px rgba(0,174,239,0.25), 0 0 80px rgba(0,174,239,0.12), 0 24px 60px rgba(0,0,0,0.5)",
          backgroundClip: "padding-box",
        }}>
          {/* Animated glow border overlay */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: 28, pointerEvents: "none",
            background: "linear-gradient(135deg, rgba(0,174,239,0.18) 0%, rgba(192,192,192,0.08) 50%, rgba(0,174,239,0.15) 100%)",
            maskImage: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            padding: "1.5px",
          }} />

          {/* Background grid */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: 28, pointerEvents: "none", overflow: "hidden",
            backgroundImage: "linear-gradient(rgba(0,174,239,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,174,239,0.04) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }} />

          {/* Corner glows */}
          <div style={{ position: "absolute", top: -60, right: -60, width: 300, height: 300, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(ellipse, rgba(0,174,239,0.18) 0%, transparent 70%)" }} />
          <div style={{ position: "absolute", bottom: -60, left: -60, width: 250, height: 250, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(ellipse, rgba(192,192,192,0.07) 0%, transparent 70%)" }} />

          {/* Badge */}
          <div style={{
            position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)",
            background: "linear-gradient(90deg, #00AEEF, #00D4FF)",
            borderRadius: "0 0 14px 14px",
            padding: "6px 28px",
            fontSize: 12, fontWeight: 800, color: "#FFFFFF", letterSpacing: "1px", textTransform: "uppercase",
            boxShadow: "0 4px 20px rgba(0,174,239,0.4)",
          }}>
            ⚡ {ECOSYSTEM.badge}
          </div>

          <div style={{ position: "relative", zIndex: 2 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "flex-start" }}>

              {/* Left */}
              <div>
                <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-1px", marginBottom: 8, color: "#FFFFFF" }}>
                  {ECOSYSTEM.name}
                </h2>
                <p style={{ fontSize: 16, color: "#8B9AB0", marginBottom: 28, lineHeight: 1.55 }}>{ECOSYSTEM.tagline}</p>

                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 42, fontWeight: 900, letterSpacing: "-1.5px",
                    background: "linear-gradient(135deg, #00AEEF 0%, #00D4FF 50%, #C0C0C0 100%)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                    filter: "drop-shadow(0 0 20px rgba(0,174,239,0.4))",
                  }}>
                    {ECOSYSTEM.price}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: "#4B5563", marginBottom: 32 }}>{ECOSYSTEM.period}</div>

                <button
                  onClick={() => navigate("/contact")}
                  style={{
                    padding: "14px 36px", borderRadius: 12, border: "none",
                    background: "linear-gradient(135deg, #00AEEF 0%, #0077BB 100%)",
                    color: "#FFFFFF", fontSize: 16, fontWeight: 800,
                    cursor: "pointer", letterSpacing: "-0.2px",
                    boxShadow: "0 0 40px rgba(0,174,239,0.45), 0 4px 16px rgba(0,0,0,0.3)",
                    transition: "all 0.3s ease",
                    display: "inline-flex", alignItems: "center", gap: 10,
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget;
                    el.style.background = "linear-gradient(135deg, #00C4FF 0%, #0099DD 100%)";
                    el.style.boxShadow = "0 0 60px rgba(0,174,239,0.65), 0 8px 24px rgba(0,0,0,0.3)";
                    el.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget;
                    el.style.background = "linear-gradient(135deg, #00AEEF 0%, #0077BB 100%)";
                    el.style.boxShadow = "0 0 40px rgba(0,174,239,0.45), 0 4px 16px rgba(0,0,0,0.3)";
                    el.style.transform = "translateY(0)";
                  }}
                >
                  {ECOSYSTEM.cta} →
                </button>

                <div style={{ marginTop: 16, fontSize: 13, color: "#374151" }}>
                  Includes onboarding + dedicated strategy team
                </div>
              </div>

              {/* Right — feature list */}
              <div>
                <div style={{ fontSize: 13, color: "#4B5563", marginBottom: 16, fontStyle: "italic" }}>{ECOSYSTEM.prevTier}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" }}>
                  {ECOSYSTEM.items.map(item => (
                    <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                        background: "rgba(0,174,239,0.15)", border: "1px solid rgba(0,174,239,0.4)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="#00AEEF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <span style={{ fontSize: 13.5, color: "#C0C0C0", lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ── ADVISOR NOTE ── */}
      <section style={{ padding: "0 24px 64px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
          background: "rgba(0,174,239,0.05)", border: "1px solid rgba(0,174,239,0.15)",
          borderRadius: 16, padding: "22px 32px",
        }}>
          <span style={{ fontSize: 28 }}>💡</span>
          <p style={{ fontSize: 15, color: "#8B9AB0", lineHeight: 1.6, flex: 1, margin: 0 }}>
            <strong style={{ color: "#FFFFFF" }}>Not sure which package fits?</strong>{" "}
            We'll recommend the right setup after a free business assessment.
          </p>
          <button
            onClick={() => navigate("/contact")}
            style={{
              padding: "10px 24px", borderRadius: 10, border: "1px solid rgba(0,174,239,0.35)",
              background: "rgba(0,174,239,0.08)", color: "#00AEEF",
              fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
              flexShrink: 0, whiteSpace: "nowrap",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget;
              el.style.background = "rgba(0,174,239,0.15)";
              el.style.boxShadow = "0 0 20px rgba(0,174,239,0.25)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget;
              el.style.background = "rgba(0,174,239,0.08)";
              el.style.boxShadow = "none";
            }}
          >
            Book Free Assessment →
          </button>
        </div>
      </section>

      {/* ── GUARANTEE ── */}
      <section style={{ padding: "0 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 20, padding: "32px 40px",
          display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap",
        }}>
          <div style={{ fontSize: 44 }}>🛡️</div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#FFFFFF", marginBottom: 6 }}>Results Guarantee</h3>
            <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.65, maxWidth: 680 }}>
              If Lead Recovery AI doesn't recover at least 3× its monthly cost in your first 30 days, we'll refund your first month. That's how confident we are in what we build.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ padding: "0 24px 96px", maxWidth: 800, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 14 }}>FAQ</div>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 900, letterSpacing: "-1px", color: "#FFFFFF" }}>
            Common Questions
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {FAQS.map(({ q, a }, i) => (
            <div
              key={q}
              style={{
                background: openFaq === i ? "rgba(0,174,239,0.06)" : "rgba(255,255,255,0.025)",
                border: openFaq === i ? "1px solid rgba(0,174,239,0.25)" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 16, overflow: "hidden",
                transition: "all 0.25s",
              }}
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "20px 24px", background: "none", border: "none",
                  color: "#FFFFFF", fontSize: 15, fontWeight: 700, cursor: "pointer",
                  textAlign: "left", gap: 16,
                }}
              >
                <span>{q}</span>
                <span style={{
                  fontSize: 20, color: "#00AEEF", flexShrink: 0,
                  transition: "transform 0.25s",
                  transform: openFaq === i ? "rotate(45deg)" : "rotate(0deg)",
                }}>+</span>
              </button>
              {openFaq === i && (
                <div style={{ padding: "0 24px 20px" }}>
                  <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.75, margin: 0 }}>{a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{ padding: "64px 24px 96px", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, letterSpacing: "-1px", color: "#FFFFFF", marginBottom: 16 }}>
            Not sure which plan? Start with a call.
          </h2>
          <p style={{ fontSize: 17, color: "#6B7280", lineHeight: 1.65, marginBottom: 36 }}>
            We'll help you identify which services will have the biggest impact on your business — no upsell pressure, just honest guidance.
          </p>
          <button
            onClick={() => navigate("/contact")}
            style={{
              padding: "15px 44px", borderRadius: 12, background: "#00AEEF",
              border: "none", color: "#fff", fontSize: 17, fontWeight: 700,
              cursor: "pointer", boxShadow: "0 0 30px rgba(0,174,239,0.35)",
              transition: "all 0.25s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "#00C4FF";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 50px rgba(0,174,239,0.6)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "#00AEEF";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px rgba(0,174,239,0.35)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }}
          >
            Book Free Strategy Call →
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function PlanCard({ plan, onCta }: { plan: typeof PLANS[0]; onCta: () => void }) {
  const isPopular = plan.badge === "Most Popular";
  return (
    <div style={{
      background: isPopular
        ? "linear-gradient(135deg, rgba(0,174,239,0.08) 0%, rgba(0,80,160,0.06) 100%)"
        : "rgba(255,255,255,0.025)",
      border: isPopular ? "1.5px solid rgba(0,174,239,0.35)" : "1px solid rgba(255,255,255,0.07)",
      borderRadius: 24, padding: "36px 30px",
      position: "relative",
      boxShadow: isPopular ? "0 0 40px rgba(0,174,239,0.12)" : "none",
      display: "flex", flexDirection: "column",
    }}>
      {/* Badge */}
      {plan.badge && (
        <div style={{
          position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
          background: isPopular ? "#00AEEF" : "rgba(192,192,192,0.15)",
          border: isPopular ? "none" : "1px solid rgba(192,192,192,0.3)",
          borderRadius: 100, padding: "4px 20px",
          fontSize: 12, fontWeight: 700,
          color: isPopular ? "#FFFFFF" : "#C0C0C0",
          whiteSpace: "nowrap",
        }}>
          {plan.badge}
        </div>
      )}

      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#FFFFFF", marginBottom: 6, letterSpacing: "-0.3px" }}>
        {plan.name}
      </h2>
      <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5, marginBottom: 20 }}>{plan.tagline}</p>

      <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 28 }}>
        <span style={{
          fontSize: 34, fontWeight: 900, letterSpacing: "-1px",
          background: isPopular
            ? "linear-gradient(135deg, #00AEEF, #00D4FF)"
            : "linear-gradient(135deg, #FFFFFF, #C0C0C0)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          {plan.price}
        </span>
        <span style={{ fontSize: 14, color: "#4B5563", marginLeft: 3 }}>{plan.period}</span>
      </div>

      {/* Feature list */}
      <div style={{ flex: 1 }}>
        {plan.prevTier && (
          <div style={{ fontSize: 12, color: "#4B5563", marginBottom: 12, fontStyle: "italic" }}>{plan.prevTier}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {plan.items.map(item => (
            <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                background: "rgba(0,174,239,0.10)", border: "1px solid rgba(0,174,239,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="#00AEEF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span style={{ fontSize: 14, color: "#C0C0C0", lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onCta}
        style={{
          width: "100%", padding: "13px",
          borderRadius: 12,
          background: isPopular ? "#00AEEF" : "rgba(160,180,210,0.08)",
          border: isPopular ? "none" : "1px solid rgba(180,195,220,0.2)",
          color: isPopular ? "#FFFFFF" : "rgba(210,225,245,0.85)",
          fontSize: 14, fontWeight: 700, cursor: "pointer",
          boxShadow: isPopular ? "0 0 24px rgba(0,174,239,0.35)" : "none",
          transition: "all 0.25s",
          backdropFilter: "blur(8px)",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          if (isPopular) {
            el.style.background = "#00C4FF";
            el.style.boxShadow = "0 0 40px rgba(0,174,239,0.55)";
          } else {
            el.style.background = "rgba(180,200,230,0.18)";
            el.style.borderColor = "rgba(0,174,239,0.4)";
            el.style.color = "#FFFFFF";
          }
          el.style.transform = "translateY(-2px)";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          if (isPopular) {
            el.style.background = "#00AEEF";
            el.style.boxShadow = "0 0 24px rgba(0,174,239,0.35)";
          } else {
            el.style.background = "rgba(160,180,210,0.08)";
            el.style.borderColor = "rgba(180,195,220,0.2)";
            el.style.color = "rgba(210,225,245,0.85)";
          }
          el.style.transform = "translateY(0)";
        }}
      >
        {plan.cta}
      </button>
    </div>
  );
}
