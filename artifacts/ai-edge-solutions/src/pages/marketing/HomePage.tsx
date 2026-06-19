import { useLocation } from "wouter";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

const SERVICES = [
  {
    icon: "📞",
    title: "Lead Recovery AI",
    tagline: "Never lose a missed call again",
    description: "Instant text-back, 2-way SMS, and automated follow-up sequences that convert missed calls into booked jobs — in seconds.",
    color: "#00AEEF",
  },
  {
    icon: "🤖",
    title: "AI Receptionist",
    tagline: "24/7 intelligent call handling",
    description: "An AI that answers every call, qualifies leads, books appointments, and handles FAQs — so you never miss a customer again.",
    color: "#00AEEF",
  },
  {
    icon: "📍",
    title: "Google Business Profile",
    tagline: "Dominate local search",
    description: "Automated GBP posting, photo uploads, Q&A management, and optimization that keeps your profile ranked #1 locally.",
    color: "#00AEEF",
  },
  {
    icon: "⭐",
    title: "Review Generation",
    tagline: "More 5-star reviews, on autopilot",
    description: "Automatically request reviews from satisfied customers via SMS. Respond intelligently and build a reputation that sells.",
    color: "#00AEEF",
  },
  {
    icon: "🔍",
    title: "Local SEO",
    tagline: "Rank where it counts",
    description: "Hyper-targeted local SEO that puts your business at the top of Google for every service + city combination you need.",
    color: "#00AEEF",
  },
  {
    icon: "🌐",
    title: "Website Design",
    tagline: "Sites that convert visitors",
    description: "Fast, mobile-first, conversion-optimized websites designed to turn visitors into paying customers — built on your brand.",
    color: "#00AEEF",
  },
  {
    icon: "📲",
    title: "Social Media Distribution",
    tagline: "AI content across every platform",
    description: "Repurpose your content into social posts, schedule across platforms, and maintain a consistent presence without lifting a finger.",
    color: "#00AEEF",
  },
  {
    icon: "🧠",
    title: "AI Visibility / GEO",
    tagline: "Get found by AI search",
    description: "Optimize your business to appear in ChatGPT, Gemini, Perplexity, and AI-assisted search — the next frontier of local discovery.",
    color: "#00AEEF",
  },
];

const STATS = [
  { value: "94%", label: "Lead recovery rate" },
  { value: "< 5s", label: "Text-back speed" },
  { value: "3.8×", label: "Average ROI" },
  { value: "500+", label: "Local businesses served" },
];

const RESULTS = [
  { metric: "312%", detail: "increase in inbound leads" },
  { metric: "47%", detail: "reduction in no-shows" },
  { metric: "$28K", detail: "additional monthly revenue" },
];

export default function HomePage() {
  const [, navigate] = useLocation();

  return (
    <div style={{ background: "#030612", minHeight: "100vh", color: "#FFFFFF", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <Nav />

      {/* Hero */}
      <section style={{ paddingTop: 148, paddingBottom: 96, paddingLeft: 24, paddingRight: 24, textAlign: "center", position: "relative", overflow: "hidden" }}>
        {/* Radial glow */}
        <div style={{
          position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: 900, height: 600, borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(0,174,239,0.1) 0%, rgba(0,100,180,0.04) 40%, transparent 70%)",
          pointerEvents: "none",
        }} />
        {/* Grid overlay */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(0,174,239,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,174,239,0.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 100%)",
        }} />

        <div style={{ position: "relative", maxWidth: 860, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 24,
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.25)",
            borderRadius: 100, padding: "6px 18px 6px 10px",
          }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#00AEEF", boxShadow: "0 0 8px rgba(0,174,239,0.8)" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#00AEEF", letterSpacing: "0.4px" }}>AI AUTOMATION FOR LOCAL BUSINESSES</span>
          </div>

          <h1 style={{
            fontSize: "clamp(40px, 7vw, 80px)", fontWeight: 900, lineHeight: 1.05,
            letterSpacing: "-2px", marginBottom: 28,
          }}>
            <span style={{
              background: "linear-gradient(135deg, #FFFFFF 30%, #C0C0C0 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              Dominate Your Market
            </span>
            <br />
            <span style={{
              background: "linear-gradient(90deg, #00AEEF 0%, #00D4FF 50%, #00AEEF 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 30px rgba(0,174,239,0.4))",
            }}>
              With AI Automation
            </span>
          </h1>

          <p style={{ fontSize: "clamp(17px, 2vw, 21px)", color: "#8B9AB0", lineHeight: 1.65, marginBottom: 44, maxWidth: 620, margin: "0 auto 44px" }}>
            We deploy intelligent AI systems that capture more leads, answer every call, generate 5-star reviews, and rank your business #1 — while you focus on serving customers.
          </p>

          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <GlowButton onClick={() => navigate("/contact")}>
              Book Free Strategy Call →
            </GlowButton>
            <OutlineButton onClick={() => navigate("/services")}>
              Explore Services
            </OutlineButton>
          </div>

          {/* Trust strip */}
          <div style={{
            marginTop: 64,
            display: "flex", justifyContent: "center", gap: "clamp(24px,4vw,64px)", flexWrap: "wrap",
          }}>
            {STATS.map(({ value, label }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 900, letterSpacing: "-1px",
                  background: "linear-gradient(135deg, #00AEEF, #00D4FF)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}>
                  {value}
                </div>
                <div style={{ fontSize: 13, color: "#4B5563", marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services grid */}
      <section style={{ padding: "96px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <SectionLabel>Services</SectionLabel>
        <SectionTitle>Everything you need to dominate local search</SectionTitle>
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

      {/* Case Study teaser */}
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
            {/* Text */}
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

            {/* Visual card */}
            <div style={{ position: "relative" }}>
              <div style={{
                background: "linear-gradient(135deg, rgba(0,174,239,0.08) 0%, rgba(0,100,180,0.06) 100%)",
                border: "1px solid rgba(0,174,239,0.2)",
                borderRadius: 24,
                padding: 40,
                position: "relative",
                overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", top: -40, right: -40,
                  width: 200, height: 200, borderRadius: "50%",
                  background: "radial-gradient(ellipse, rgba(0,174,239,0.15) 0%, transparent 70%)",
                }} />
                <div style={{
                  display: "flex", alignItems: "center", gap: 14, marginBottom: 32,
                  padding: "14px 18px",
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <div style={{ fontSize: 28 }}>🪲</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Bed Bugs & Beyond</div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>Pest Control — Phoenix, AZ</div>
                  </div>
                  <div style={{
                    marginLeft: "auto",
                    background: "rgba(0,174,239,0.15)", border: "1px solid rgba(0,174,239,0.3)",
                    borderRadius: 6, padding: "4px 10px",
                    fontSize: 11, fontWeight: 700, color: "#00AEEF",
                  }}>
                    ACTIVE
                  </div>
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
                      <div style={{
                        height: "100%", width: `${bar}%`, borderRadius: 3,
                        background: "linear-gradient(90deg, #00AEEF, #00D4FF)",
                        boxShadow: "0 0 8px rgba(0,174,239,0.5)",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <style>{`@media (max-width: 768px) { .case-grid { grid-template-columns: 1fr !important; } }`}</style>
      </section>

      {/* CTA Section */}
      <section style={{ padding: "96px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{
            display: "inline-block", marginBottom: 20,
            padding: "6px 18px",
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
            Ready to Dominate Your Market?
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
      background: "linear-gradient(135deg, #FFFFFF, #C0C0C0)",
      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
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

function ServiceCard({ icon, title, tagline, description, onClick }: { icon: string; title: string; tagline: string; description: string; color: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 20,
        padding: "28px 24px",
        cursor: "pointer",
        transition: "all 0.3s ease",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "rgba(0,174,239,0.06)";
        el.style.border = "1px solid rgba(0,174,239,0.25)";
        el.style.transform = "translateY(-4px)";
        el.style.boxShadow = "0 16px 48px rgba(0,0,0,0.4), 0 0 30px rgba(0,174,239,0.12)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "rgba(255,255,255,0.025)";
        el.style.border = "1px solid rgba(255,255,255,0.06)";
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "none";
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 14 }}>{icon}</div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "#FFFFFF", marginBottom: 4, letterSpacing: "-0.2px" }}>{title}</h3>
      <div style={{ fontSize: 12, color: "#00AEEF", fontWeight: 600, letterSpacing: "0.3px", marginBottom: 12 }}>{tagline}</div>
      <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.7 }}>{description}</p>
    </div>
  );
}

function GlowButton({ onClick, children, large }: { onClick: () => void; children: React.ReactNode; large?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: large ? "16px 40px" : "13px 32px",
        borderRadius: 12,
        background: "#00AEEF",
        border: "none",
        color: "#FFFFFF",
        fontSize: large ? 18 : 16,
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: "-0.2px",
        boxShadow: "0 0 30px rgba(0,174,239,0.3)",
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
        el.style.boxShadow = "0 0 30px rgba(0,174,239,0.3)";
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
        borderRadius: 12,
        background: "transparent",
        border: "1px solid rgba(192,192,192,0.25)",
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
        el.style.background = "rgba(0,174,239,0.06)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        el.style.borderColor = "rgba(192,192,192,0.25)";
        el.style.color = "#C0C0C0";
        el.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}
