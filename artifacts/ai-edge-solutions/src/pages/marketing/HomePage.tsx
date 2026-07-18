import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

const logoSrc = `${import.meta.env.BASE_URL}logo-transparent.png`;

const SERVICES = [
  { icon: "📞", title: "Lead Recovery AI", tagline: "Never lose a missed call again", description: "Instant text-back, 2-way SMS, and automated follow-up sequences that convert missed calls into booked jobs — in seconds." },
  { icon: "🤖", title: "AI Receptionist", tagline: "24/7 intelligent call handling", description: "An AI that answers every call, qualifies leads, books appointments, and handles FAQs — so you never miss a customer again." },
  { icon: "📍", title: "Google Business Profile", tagline: "Optimize local visibility", description: "Automated GBP posting, photo uploads, Q&A management, and optimization that keeps your profile prominently ranked in local search." },
  { icon: "⭐", title: "Review Generation", tagline: "More 5-star reviews, on autopilot", description: "Automatically request reviews from satisfied customers via SMS. Respond intelligently and build a reputation that sells." },
  { icon: "🔍", title: "Local SEO", tagline: "Rank where it counts", description: "Hyper-targeted local SEO that puts your business at the top of Google for every service + city combination you need." },
  { icon: "🌐", title: "Website Design", tagline: "Sites that convert visitors", description: "Fast, mobile-first, conversion-optimized websites designed to turn visitors into paying customers — built on your brand." },
  { icon: "📲", title: "Social Media Distribution", tagline: "AI content across every platform", description: "Repurpose your content into social posts, schedule across platforms, and maintain a consistent presence without lifting a finger." },
  { icon: "🧠", title: "AI Visibility / GEO", tagline: "Get found by AI search", description: "Optimize your business to appear in ChatGPT, Gemini, Perplexity, and AI-assisted search — the next frontier of local discovery." },
];

const TRUST = [
  "No Long-Term Contracts",
  "Personalized Solutions",
  "Built for Local Businesses",
  "Proven AI Systems",
];

const RESULTS = [
  { metric: "312%", detail: "increase in inbound leads" },
  { metric: "47%", detail: "reduction in no-shows" },
  { metric: "$28K", detail: "additional monthly revenue" },
];

export default function HomePage() {
  const [, navigate] = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 500);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div style={{ background: "#0B1629", minHeight: "100vh", color: "#FFFFFF", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <Nav />

      {/* ── HERO ── */}
      <section style={{ position: "relative", overflow: "hidden", paddingTop: 80, minHeight: "100vh", display: "flex", alignItems: "center" }}>

        {/* Checkered grid background */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: `
            linear-gradient(rgba(0,174,239,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,174,239,0.07) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }} />

        {/* Subtle radial vignette so edges fade */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 80% 80% at 30% 50%, transparent 40%, rgba(11,22,41,0.85) 100%)",
        }} />

        {/* Blue glow behind AE on the right */}
        <div style={{
          position: "absolute", right: "5%", top: "50%", transform: "translateY(-50%)",
          width: 500, height: 500, borderRadius: "50%", pointerEvents: "none",
          background: "radial-gradient(ellipse, rgba(0,174,239,0.18) 0%, rgba(0,80,160,0.08) 40%, transparent 70%)",
        }} />

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px", width: "100%", position: "relative", zIndex: 2 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>

            {/* LEFT — content */}
            <div>
              {/* Badge */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 28,
                background: "rgba(0,174,239,0.10)", border: "1px solid rgba(0,174,239,0.30)",
                borderRadius: 6, padding: "6px 16px",
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.2px", textTransform: "uppercase" }}>
                  Built for Local Service Businesses
                </span>
              </div>

              {/* Headline */}
              <h1 style={{
                fontSize: "clamp(36px, 5vw, 62px)", fontWeight: 900,
                lineHeight: 1.08, letterSpacing: "-1.5px", marginBottom: 16,
              }}>
                AI Edge{" "}
                <span style={{ color: "#00AEEF", textShadow: "0 0 30px rgba(0,174,239,0.45)" }}>Solutions</span>
              </h1>

              {/* Subheading */}
              <p style={{ fontSize: "clamp(18px, 2.2vw, 24px)", fontWeight: 600, color: "#C0C0C0", lineHeight: 1.3, marginBottom: 24 }}>
                AI Automation That Gives Local Businesses an Edge
              </p>

              {/* Description */}
              <p style={{ fontSize: "clamp(15px, 1.8vw, 18px)", color: "#8B9AB0", lineHeight: 1.70, marginBottom: 40, maxWidth: 500 }}>
                We help service businesses capture more leads, automate follow-up, create content, and grow across Google, YouTube, Facebook, and more.
              </p>

              {/* CTAs */}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 44 }}>
                <GlowButton onClick={() => navigate("/contact")}>Book a Free Strategy Call</GlowButton>
                <button
                  onClick={() => navigate("/business-assessment")}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 800,
                    cursor: "pointer", border: "1.5px solid rgba(0,174,239,0.45)",
                    background: "rgba(0,174,239,0.1)", color: "#00AEEF",
                    letterSpacing: "0.1px", transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,174,239,0.18)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,174,239,0.7)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,174,239,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,174,239,0.45)"; }}
                >
                  ⚡ Get Free AI Assessment
                </button>
                <OutlineButton onClick={() => navigate("/services")}>See What We Automate</OutlineButton>
                <OutlineButton onClick={() => navigate("/pricing")}>View Packages</OutlineButton>
              </div>

              {/* Trust checkmarks */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 32px" }}>
                {TRUST.map(t => (
                  <div key={t} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%",
                      border: "1.5px solid rgba(0,174,239,0.5)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 10, color: "#00AEEF", lineHeight: 1 }}>✓</span>
                    </div>
                    <span style={{ fontSize: 13, color: "#8B9AB0", fontWeight: 500 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT — AE logo */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
              <img
                src={logoSrc}
                alt="AI Edge Solutions"
                style={{
                  width: "min(420px, 90%)",
                  height: "auto",
                  objectFit: "contain",
                  filter: "drop-shadow(0 0 60px rgba(0,174,239,0.35)) drop-shadow(0 0 120px rgba(0,80,160,0.2))",
                }}
              />
            </div>

          </div>
        </div>
      </section>

      {/* ── SERVICES GRID ── */}
      <section style={{ padding: "96px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <SectionLabel>Services</SectionLabel>
        <SectionTitle>Everything you need to optimize local visibility</SectionTitle>
        <SectionSub>Eight AI-powered systems, fully managed, delivering results while you sleep.</SectionSub>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginTop: 56,
        }}>
          {SERVICES.map((service, i) => (
            <ServiceCard key={i} {...service} onClick={() => navigate("/services")} />
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 48 }}>
          <OutlineButton onClick={() => navigate("/services")}>View All Services</OutlineButton>
        </div>
      </section>

      {/* ── WHY CHOOSE US ── */}
      <section id="why-us" style={{ padding: "96px 24px", background: "rgba(0,174,239,0.03)", borderTop: "1px solid rgba(0,174,239,0.08)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }}>

          {/* Left */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 18 }}>
              Why Choose Us
            </div>
            <h2 style={{ fontSize: "clamp(32px, 4.5vw, 54px)", fontWeight: 900, letterSpacing: "-1.5px", lineHeight: 1.08, marginBottom: 24, color: "#FFFFFF" }}>
              Why AI Edge<br />Solutions?
            </h2>
            <p style={{ fontSize: 17, color: "#6B7280", lineHeight: 1.75, marginBottom: 40, maxWidth: 440 }}>
              We don't build toys for tech bros. We build profit-generating systems for the guy running a 10-truck operation who wants his time back.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {[
                "Built explicitly for local service businesses",
                "More calls, more booked jobs, less manual work",
                "Multi-platform content publishing across Google, YouTube & Facebook",
                "Automation without confusing tech jargon",
              ].map(item => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    background: "rgba(0,174,239,0.12)", border: "1.5px solid rgba(0,174,239,0.35)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 11, color: "#00AEEF" }}>✓</span>
                  </div>
                  <span style={{ fontSize: 15, color: "#C0C0C0", lineHeight: 1.55, fontWeight: 500 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Edge Advantage card */}
          <div style={{
            background: "rgba(11,22,41,0.8)",
            border: "1px solid rgba(0,174,239,0.18)",
            borderRadius: 20,
            padding: 36,
            boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: "rgba(0,174,239,0.15)", border: "1px solid rgba(0,174,239,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18,
              }}>⚡</div>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#FFFFFF" }}>The Edge Advantage</span>
            </div>

            {[
              { label: "Average Response Time", value: "Under 60 Seconds", color: "#00AEEF" },
              { label: "Lead Capture Rate", value: "+214% Increase", color: "#00AEEF" },
              { label: "Admin Hours Saved", value: "40+ Hrs / Month", color: "#00AEEF" },
            ].map(({ label, value, color }, i) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "18px 0",
                borderTop: i === 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}>
                <span style={{ fontSize: 14, color: "#6B7280", fontWeight: 500 }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color }}>{value}</span>
              </div>
            ))}

            <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 14 }}>
                Curious what this looks like for your budget?
              </p>
              <button
                onClick={() => navigate("/pricing")}
                style={{
                  width: "100%", padding: "12px 20px", borderRadius: 10,
                  background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.35)",
                  color: "#00AEEF", fontSize: 14, fontWeight: 700,
                  cursor: "pointer", transition: "all 0.25s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(0,174,239,0.22)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,174,239,0.6)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(0,174,239,0.12)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,174,239,0.35)";
                }}
              >
                See Pricing & Packages →
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* ── CASE STUDY TEASER ── */}
      <section style={{
        padding: "96px 24px",
        background: "linear-gradient(180deg, transparent 0%, rgba(0,174,239,0.04) 50%, transparent 100%)",
        borderTop: "1px solid rgba(0,174,239,0.08)",
        borderBottom: "1px solid rgba(0,174,239,0.08)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <SectionLabel>Case Study</SectionLabel>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            alignItems: "center",
            marginTop: 24,
          }}>
            <div>
              <h2 style={{
                fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800,
                letterSpacing: "-1px", lineHeight: 1.15, marginBottom: 20,
                background: "linear-gradient(135deg, #FFFFFF, #C0C0C0)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>
                How Bed Bugs & Beyond Added $28K/Month in New Revenue
              </h2>
              <p style={{ fontSize: 17, color: "#6B7280", lineHeight: 1.7, marginBottom: 32 }}>
                A pest control company was bleeding $12,000/month in missed calls. We deployed Lead Recovery AI + AI Receptionist + Local SEO. Within 60 days, they were booked out 3 weeks in advance.
              </p>
              <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 36 }}>
                {RESULTS.map(({ metric, detail }) => (
                  <div key={detail}>
                    <div style={{
                      fontSize: 36, fontWeight: 900, letterSpacing: "-1px",
                      background: "linear-gradient(135deg, #00AEEF, #00D4FF)",
                      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                    }}>
                      {metric}
                    </div>
                    <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>{detail}</div>
                  </div>
                ))}
              </div>
              <OutlineButton onClick={() => navigate("/case-studies")}>Read Full Case Study →</OutlineButton>
            </div>

            <div style={{ position: "relative" }}>
              <div style={{
                background: "linear-gradient(135deg, rgba(0,174,239,0.08) 0%, rgba(0,100,180,0.06) 100%)",
                border: "1px solid rgba(0,174,239,0.2)",
                borderRadius: 24, padding: 40, position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%",
                  background: "radial-gradient(ellipse, rgba(0,174,239,0.15) 0%, transparent 70%)",
                }} />
                <div style={{
                  display: "flex", alignItems: "center", gap: 14, marginBottom: 32,
                  padding: "14px 18px", background: "rgba(255,255,255,0.04)",
                  borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <div style={{ fontSize: 28 }}>🪲</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Bed Bugs & Beyond</div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>Pest Control — Phoenix, AZ</div>
                  </div>
                  <div style={{
                    marginLeft: "auto", background: "rgba(0,174,239,0.15)",
                    border: "1px solid rgba(0,174,239,0.3)", borderRadius: 6,
                    padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#00AEEF",
                  }}>ACTIVE</div>
                </div>
                {[
                  { label: "Missed calls recovered", value: "94%", bar: 94 },
                  { label: "Review score", value: "4.9★", bar: 98 },
                  { label: "Ranking positions gained", value: "+47", bar: 78 },
                ].map(({ label, value, bar }) => (
                  <div key={label} style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: "#6B7280" }}>{label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#00AEEF" }}>{value}</span>
                    </div>
                    <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${bar}%`, borderRadius: 3, background: "linear-gradient(90deg, #00AEEF, #00D4FF)", boxShadow: "0 0 8px rgba(0,174,239,0.5)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{ padding: "96px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{
            display: "inline-block", marginBottom: 20, padding: "6px 18px",
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)",
            borderRadius: 100, fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px", textTransform: "uppercase",
          }}>
            Free Strategy Call
          </div>
          <h2 style={{
            fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 900,
            letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: 20,
            background: "linear-gradient(135deg, #FFFFFF, #C0C0C0)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Ready to Optimize Your Growth?
          </h2>
          <p style={{ fontSize: 19, color: "#6B7280", lineHeight: 1.65, marginBottom: 44 }}>
            Book a free 30-minute strategy call. We'll analyze your business, identify the biggest opportunities, and show you exactly how AI can transform your growth.
          </p>
          <GlowButton onClick={() => navigate("/contact")} large>
            Book Your Free Strategy Call →
          </GlowButton>
          <p style={{ marginTop: 20, fontSize: 14, color: "#374151" }}>
            No credit card. No commitment. Just a clear plan.
          </p>
        </div>
      </section>

      <Footer />

      {/* ── FLOATING CTA BUTTON ── */}
      <button
        onClick={() => navigate("/contact")}
        style={{
          position: "fixed",
          bottom: 32,
          right: 32,
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 24px",
          borderRadius: 50,
          background: "#00AEEF",
          border: "none",
          color: "#FFFFFF",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 4px 24px rgba(0,174,239,0.5), 0 2px 8px rgba(0,0,0,0.4)",
          transition: "all 0.35s cubic-bezier(0.34,1.56,0.64,1)",
          opacity: scrolled ? 1 : 0,
          transform: scrolled ? "translateY(0) scale(1)" : "translateY(20px) scale(0.9)",
          pointerEvents: scrolled ? "auto" : "none",
          letterSpacing: "-0.2px",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget;
          el.style.background = "#00C4FF";
          el.style.boxShadow = "0 8px 36px rgba(0,174,239,0.65), 0 2px 8px rgba(0,0,0,0.4)";
          el.style.transform = "translateY(-3px) scale(1.04)";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget;
          el.style.background = "#00AEEF";
          el.style.boxShadow = "0 4px 24px rgba(0,174,239,0.5), 0 2px 8px rgba(0,0,0,0.4)";
          el.style.transform = "translateY(0) scale(1)";
        }}
      >
        <span style={{ fontSize: 16 }}>📞</span>
        Book Strategy Call
      </button>

      <style>{`
        @media (max-width: 768px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .hero-ae { display: none !important; }
          .case-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "2px", textTransform: "uppercase" }}>
        {children}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 style={{
      textAlign: "center",
      fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800,
      letterSpacing: "-1px", lineHeight: 1.15,
      color: "#FFFFFF",
    }}>
      {children}
    </h2>
  );
}

function SectionSub({ children }: { children: string }) {
  return (
    <p style={{ textAlign: "center", fontSize: 18, color: "#6B7280", maxWidth: 560, margin: "16px auto 0", lineHeight: 1.65 }}>
      {children}
    </p>
  );
}

function ServiceCard({ icon, title, tagline, description, onClick }: { icon: string; title: string; tagline: string; description: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "linear-gradient(145deg, #D8E4EF 0%, #C8D8E8 50%, #B8CCDE 100%)",
        border: "1px solid rgba(255,255,255,0.6)",
        borderRadius: 18,
        padding: "26px 22px",
        cursor: "pointer",
        transition: "all 0.3s ease",
        boxShadow: "0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.5)",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "translateY(-5px)";
        el.style.boxShadow = "0 16px 48px rgba(0,0,0,0.35), 0 0 30px rgba(0,174,239,0.2), inset 0 1px 0 rgba(255,255,255,0.5)";
        el.style.background = "linear-gradient(145deg, #E4EEF8 0%, #D0E2F2 50%, #C0D4E8 100%)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.5)";
        el.style.background = "linear-gradient(145deg, #D8E4EF 0%, #C8D8E8 50%, #B8CCDE 100%)";
      }}
    >
      <div style={{ fontSize: 26, marginBottom: 12 }}>{icon}</div>
      <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0B1629", marginBottom: 3, letterSpacing: "-0.2px" }}>{title}</h3>
      <div style={{ fontSize: 11, color: "#1A5FA8", fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 10 }}>{tagline}</div>
      <p style={{ fontSize: 13, color: "#2D4A6A", lineHeight: 1.65 }}>{description}</p>
    </div>
  );
}

function GlowButton({ onClick, children, large }: { onClick: () => void; children: React.ReactNode; large?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: large ? "16px 40px" : "13px 32px",
        borderRadius: 10,
        background: "#00AEEF",
        border: "none",
        color: "#FFFFFF",
        fontSize: large ? 18 : 16,
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: "-0.2px",
        boxShadow: "0 0 28px rgba(0,174,239,0.35)",
        transition: "all 0.25s",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget;
        el.style.background = "#00C4FF";
        el.style.boxShadow = "0 0 50px rgba(0,174,239,0.6), 0 8px 24px rgba(0,174,239,0.3)";
        el.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        el.style.background = "#00AEEF";
        el.style.boxShadow = "0 0 28px rgba(0,174,239,0.35)";
        el.style.transform = "translateY(0)";
      }}
    >
      {children}
    </button>
  );
}

function OutlineButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "13px 32px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(192,192,192,0.3)",
        color: "#C0C0C0",
        fontSize: 16,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.25s",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget;
        el.style.borderColor = "rgba(0,174,239,0.5)";
        el.style.color = "#00AEEF";
        el.style.background = "rgba(0,174,239,0.08)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        el.style.borderColor = "rgba(192,192,192,0.3)";
        el.style.color = "#C0C0C0";
        el.style.background = "rgba(255,255,255,0.07)";
      }}
    >
      {children}
    </button>
  );
}
