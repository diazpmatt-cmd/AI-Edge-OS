import { useLocation } from "wouter";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

const PLANS = [
  {
    name: "Starter",
    tagline: "For businesses just getting started with AI",
    price: "$997",
    period: "/month",
    description: "The essentials to stop losing leads and start recovering revenue.",
    highlight: false,
    badge: null,
    services: [
      { included: true, label: "Lead Recovery AI" },
      { included: true, label: "Review Generation (automated)" },
      { included: true, label: "Google Business Profile Automation" },
      { included: false, label: "AI Receptionist" },
      { included: false, label: "Local SEO" },
      { included: false, label: "Website Design" },
      { included: false, label: "Social Media Distribution" },
      { included: false, label: "AI Visibility / GEO Optimization" },
    ],
    cta: "Get Started",
    note: "14-day free trial",
  },
  {
    name: "Growth",
    tagline: "For businesses ready to dominate their market",
    price: "$2,497",
    period: "/month",
    description: "The full AI stack — every system working together to compound your results.",
    highlight: true,
    badge: "Most Popular",
    services: [
      { included: true, label: "Lead Recovery AI" },
      { included: true, label: "Review Generation (automated)" },
      { included: true, label: "Google Business Profile Automation" },
      { included: true, label: "AI Receptionist (250 min/mo)" },
      { included: true, label: "Local SEO (3 target areas)" },
      { included: false, label: "Website Design" },
      { included: true, label: "Social Media Distribution" },
      { included: false, label: "AI Visibility / GEO Optimization" },
    ],
    cta: "Start Growing",
    note: "Fastest path to ROI",
  },
  {
    name: "Dominator",
    tagline: "For businesses that refuse to be #2",
    price: "Custom",
    period: "",
    description: "Unlimited AI services, dedicated account team, and full-market domination.",
    highlight: false,
    badge: "Enterprise",
    services: [
      { included: true, label: "Lead Recovery AI (unlimited)" },
      { included: true, label: "Review Generation (automated)" },
      { included: true, label: "Google Business Profile Automation" },
      { included: true, label: "AI Receptionist (unlimited min)" },
      { included: true, label: "Local SEO (unlimited areas)" },
      { included: true, label: "Custom Website Design" },
      { included: true, label: "Social Media Distribution" },
      { included: true, label: "AI Visibility / GEO Optimization" },
    ],
    cta: "Talk to Sales",
    note: "Dedicated account manager",
  },
];

const FAQS = [
  {
    q: "How quickly will I see results?",
    a: "Lead Recovery AI starts working within 24 hours of setup. Most clients see their first recovered leads on day one. SEO results typically appear within 30–90 days.",
  },
  {
    q: "Is there a contract or commitment?",
    a: "No long-term contracts. All plans are month-to-month. We earn your business every month with results. That said, AI compounds — clients who stick with us see exponential growth over time.",
  },
  {
    q: "Do you work with any business type?",
    a: "We specialize in local service businesses: pest control, HVAC, plumbing, roofing, landscaping, cleaning, dental, chiropractic, legal, and more. If you depend on local customers, we can help.",
  },
  {
    q: "What's included in the free strategy call?",
    a: "A 30-minute call where we audit your current digital presence, identify your top 3 revenue opportunities, and show you exactly what a tailored AI system would look like for your business. Zero pitch pressure.",
  },
  {
    q: "How do I get started?",
    a: "Book a free strategy call. We'll learn about your business, identify the right services, and get you set up within 48–72 hours. No complicated onboarding.",
  },
];

export default function PricingPage() {
  const [, navigate] = useLocation();

  return (
    <div style={{ background: "#030612", minHeight: "100vh", color: "#FFFFFF", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <Nav />

      {/* Hero */}
      <section style={{ paddingTop: 136, paddingBottom: 64, paddingLeft: 24, paddingRight: 24, textAlign: "center", position: "relative" }}>
        <div style={{
          position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: 700, height: 400,
          background: "radial-gradient(ellipse, rgba(0,174,239,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative", maxWidth: 680, margin: "0 auto" }}>
          <div style={{
            display: "inline-block", marginBottom: 20,
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)",
            borderRadius: 100, padding: "6px 18px",
            fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px", textTransform: "uppercase",
          }}>
            Pricing
          </div>
          <h1 style={{
            fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 900,
            letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: 20,
            background: "linear-gradient(135deg, #FFFFFF 40%, #C0C0C0)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Simple Pricing.<br />Serious Results.
          </h1>
          <p style={{ fontSize: 18, color: "#6B7280", lineHeight: 1.65, maxWidth: 500, margin: "0 auto" }}>
            No per-message fees. No hidden costs. Just flat monthly pricing and measurable ROI.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section style={{ padding: "16px 24px 96px", maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              style={{
                background: plan.highlight
                  ? "linear-gradient(135deg, rgba(0,174,239,0.1) 0%, rgba(0,100,180,0.08) 100%)"
                  : "rgba(255,255,255,0.025)",
                border: plan.highlight
                  ? "2px solid rgba(0,174,239,0.4)"
                  : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 24,
                padding: "36px 32px",
                position: "relative",
                boxShadow: plan.highlight ? "0 0 40px rgba(0,174,239,0.15)" : "none",
              }}
            >
              {plan.badge && (
                <div style={{
                  position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                  background: plan.highlight ? "#00AEEF" : "rgba(192,192,192,0.15)",
                  border: plan.highlight ? "none" : "1px solid rgba(192,192,192,0.3)",
                  borderRadius: 100, padding: "4px 18px",
                  fontSize: 12, fontWeight: 700,
                  color: plan.highlight ? "#FFFFFF" : "#C0C0C0",
                  whiteSpace: "nowrap",
                }}>
                  {plan.badge}
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: "#FFFFFF", marginBottom: 6, letterSpacing: "-0.3px" }}>
                  {plan.name}
                </h2>
                <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5, marginBottom: 20 }}>{plan.tagline}</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 4 }}>
                  <span style={{
                    fontSize: plan.price === "Custom" ? 36 : 44, fontWeight: 900, letterSpacing: "-1px",
                    background: plan.highlight
                      ? "linear-gradient(135deg, #00AEEF, #00D4FF)"
                      : "linear-gradient(135deg, #FFFFFF, #C0C0C0)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  }}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span style={{ fontSize: 16, color: "#6B7280", marginLeft: 2 }}>{plan.period}</span>
                  )}
                </div>
                <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>{plan.description}</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 32 }}>
                {plan.services.map(({ included, label }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: included
                        ? "rgba(0,174,239,0.12)"
                        : "rgba(255,255,255,0.03)",
                      border: included
                        ? "1px solid rgba(0,174,239,0.3)"
                        : "1px solid rgba(255,255,255,0.06)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {included ? (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="#00AEEF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <div style={{ width: 2, height: 8, background: "rgba(255,255,255,0.1)", borderRadius: 1 }} />
                      )}
                    </div>
                    <span style={{ fontSize: 14, color: included ? "#C0C0C0" : "#374151" }}>{label}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => navigate("/contact")}
                style={{
                  width: "100%", padding: "13px",
                  borderRadius: 12,
                  background: plan.highlight ? "#00AEEF" : "transparent",
                  border: plan.highlight ? "none" : "1px solid rgba(192,192,192,0.25)",
                  color: plan.highlight ? "#FFFFFF" : "#C0C0C0",
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                  boxShadow: plan.highlight ? "0 0 24px rgba(0,174,239,0.35)" : "none",
                  transition: "all 0.25s",
                  marginBottom: 12,
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  if (plan.highlight) {
                    el.style.background = "#00C4FF";
                    el.style.boxShadow = "0 0 40px rgba(0,174,239,0.55)";
                  } else {
                    el.style.borderColor = "rgba(0,174,239,0.4)";
                    el.style.color = "#00AEEF";
                    el.style.background = "rgba(0,174,239,0.06)";
                  }
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  if (plan.highlight) {
                    el.style.background = "#00AEEF";
                    el.style.boxShadow = "0 0 24px rgba(0,174,239,0.35)";
                  } else {
                    el.style.borderColor = "rgba(192,192,192,0.25)";
                    el.style.color = "#C0C0C0";
                    el.style.background = "transparent";
                  }
                }}
              >
                {plan.cta}
              </button>
              <div style={{ textAlign: "center", fontSize: 12, color: "#4B5563" }}>{plan.note}</div>
            </div>
          ))}
        </div>

        {/* Guarantee */}
        <div style={{
          marginTop: 48,
          background: "rgba(0,174,239,0.04)", border: "1px solid rgba(0,174,239,0.12)",
          borderRadius: 20, padding: "32px 40px",
          display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap",
        }}>
          <div style={{ fontSize: 48 }}>🛡️</div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#FFFFFF", marginBottom: 6 }}>Results Guarantee</h3>
            <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.65, maxWidth: 680 }}>
              If Lead Recovery AI doesn't recover at least 3× its monthly cost in your first 30 days, we'll refund your first month. That's how confident we are in the results.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: "0 24px 96px", maxWidth: 760, margin: "0 auto" }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.5px", marginBottom: 40, textAlign: "center" }}>
          Frequently Asked Questions
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {FAQS.map(({ q, a }) => (
            <div key={q} style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16, padding: "24px 28px",
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#FFFFFF", marginBottom: 10 }}>{q}</h3>
              <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.7 }}>{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "64px 24px 96px", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{
            fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800,
            letterSpacing: "-1px", color: "#FFFFFF", marginBottom: 16,
          }}>
            Not sure which plan? Start with a call.
          </h2>
          <p style={{ fontSize: 17, color: "#6B7280", lineHeight: 1.65, marginBottom: 36 }}>
            We'll help you identify which services will have the biggest impact on your specific business — no upsell pressure, just honest guidance.
          </p>
          <button
            onClick={() => navigate("/contact")}
            style={{
              padding: "15px 40px", borderRadius: 12, background: "#00AEEF",
              border: "none", color: "#fff", fontSize: 17, fontWeight: 700,
              cursor: "pointer", boxShadow: "0 0 30px rgba(0,174,239,0.3)",
              transition: "all 0.25s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "#00C4FF";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 50px rgba(0,174,239,0.55)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "#00AEEF";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px rgba(0,174,239,0.3)";
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
