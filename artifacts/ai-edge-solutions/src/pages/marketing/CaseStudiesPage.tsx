import { useLocation } from "wouter";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

const TIMELINE = [
  {
    week: "Week 1",
    title: "Diagnosis & Setup",
    description: "We audited their entire digital presence. Found 14 missed calls per day, zero review request system, GBP profile barely touched in 6 months, and website converting at 0.8%.",
  },
  {
    week: "Week 2",
    title: "Lead Recovery AI Deployed",
    description: "Installed Lead Recovery AI on their business line. Within 48 hours, 91% of missed calls were being responded to in under 5 seconds. First 3 booked jobs recovered.",
  },
  {
    week: "Week 3–4",
    title: "AI Receptionist + Review System",
    description: "Launched AI Receptionist to handle after-hours and overflow calls. Deployed review generation system. 23 new 5-star Google reviews in 14 days.",
  },
  {
    week: "Week 5–8",
    title: "Local SEO Campaign",
    description: "Published 12 hyper-local service pages. Built 140 local citations. GBP posting went to 7x per week. Google rankings jumped from page 3 to page 1 for 22 key terms.",
  },
  {
    week: "Day 60",
    title: "Results",
    description: "Booked out 3 weeks in advance. Hired two additional technicians. Monthly revenue up $28,000. Owner called it \"the best business decision I ever made.\"",
    highlight: true,
  },
];

const METRICS = [
  { value: "312%", label: "Increase in inbound leads", icon: "📈" },
  { value: "$28K", label: "Additional monthly revenue", icon: "💰" },
  { value: "4.9★", label: "Google rating (was 3.8)", icon: "⭐" },
  { value: "22", label: "Keywords on page 1", icon: "🔍" },
  { value: "94%", label: "Missed call recovery rate", icon: "📞" },
  { value: "3 weeks", label: "Booked out in advance", icon: "📅" },
];

const SERVICES_USED = [
  "Lead Recovery AI",
  "AI Receptionist",
  "Review Generation",
  "Local SEO",
  "Business Edge Profile Automation",
];

export default function CaseStudiesPage() {
  const [, navigate] = useLocation();

  return (
    <div style={{ background: "#030612", minHeight: "100vh", color: "#FFFFFF", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <Nav />

      {/* Hero */}
      <section style={{ paddingTop: 136, paddingBottom: 64, paddingLeft: 24, paddingRight: 24, position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: 900, height: 500,
          background: "radial-gradient(ellipse, rgba(0,174,239,0.07) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative", maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{
              display: "inline-block", marginBottom: 20,
              background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)",
              borderRadius: 100, padding: "6px 18px",
              fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px", textTransform: "uppercase",
            }}>
              Case Studies
            </div>
            <h1 style={{
              fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 900,
              letterSpacing: "-1.5px", lineHeight: 1.1,
              background: "linear-gradient(135deg, #FFFFFF 40%, #C0C0C0)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              Real Results for Real Businesses
            </h1>
          </div>

          {/* Case Study Card */}
          <div style={{
            background: "linear-gradient(135deg, rgba(0,174,239,0.06) 0%, rgba(0,30,60,0.1) 100%)",
            border: "1px solid rgba(0,174,239,0.2)",
            borderRadius: 28,
            overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              background: "rgba(0,174,239,0.08)",
              borderBottom: "1px solid rgba(0,174,239,0.15)",
              padding: "36px 48px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 24,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 18,
                  background: "linear-gradient(135deg, #0A2940, #0D3D60)",
                  border: "2px solid rgba(0,174,239,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 36,
                  boxShadow: "0 0 24px rgba(0,174,239,0.2)",
                }}>
                  🪲
                </div>
                <div>
                  <h2 style={{ fontSize: 28, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.5px", marginBottom: 4 }}>
                    Bed Bugs & Beyond
                  </h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, color: "#6B7280" }}>🏙️ Phoenix, Arizona</span>
                    <span style={{ fontSize: 14, color: "#6B7280" }}>🔨 Pest Control & Extermination</span>
                    <span style={{
                      background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)",
                      borderRadius: 6, padding: "3px 10px",
                      fontSize: 12, fontWeight: 700, color: "#00AEEF",
                    }}>
                      ✓ ACTIVE CLIENT
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 4 }}>Time to results</div>
                <div style={{
                  fontSize: 32, fontWeight: 900, letterSpacing: "-1px",
                  background: "linear-gradient(135deg, #00AEEF, #00D4FF)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}>
                  60 days
                </div>
              </div>
            </div>

            {/* The Problem */}
            <div style={{ padding: "48px 48px 0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, marginBottom: 56 }}>
                <div>
                  <h3 style={{
                    fontSize: 13, fontWeight: 700, color: "#EF4444", letterSpacing: "1.5px",
                    textTransform: "uppercase", marginBottom: 16,
                  }}>
                    The Problem
                  </h3>
                  <p style={{ fontSize: 16, color: "#8B9AB0", lineHeight: 1.8, marginBottom: 20 }}>
                    Family-owned pest control company with 8 years in business. Great reputation among existing customers, but bleeding leads through cracks in their digital presence.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[
                      "14 missed calls per day going unanswered",
                      "No review request system — stuck at 3.8 stars",
                      "GBP profile untouched for 6+ months",
                      "Website converting at just 0.8%",
                      "Zero presence for competitor keywords",
                      "Losing an estimated $12,000/month in missed leads",
                    ].map(p => (
                      <div key={p} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ color: "#EF4444", fontSize: 16, marginTop: 1, flexShrink: 0 }}>✗</div>
                        <span style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.5 }}>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 style={{
                    fontSize: 13, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px",
                    textTransform: "uppercase", marginBottom: 16,
                  }}>
                    Our Solution
                  </h3>
                  <p style={{ fontSize: 16, color: "#8B9AB0", lineHeight: 1.8, marginBottom: 20 }}>
                    We deployed a full AI stack — lead recovery, receptionist, review generation, and local SEO — as one coordinated system designed to close every gap simultaneously.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {SERVICES_USED.map(s => (
                      <div key={s} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                          background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="#00AEEF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <span style={{ fontSize: 14, color: "#C0C0C0" }}>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Metrics */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 56,
                background: "rgba(0,174,239,0.04)", borderRadius: 20,
                border: "1px solid rgba(0,174,239,0.1)", padding: 28,
              }}>
                {METRICS.map(({ value, label, icon }) => (
                  <div key={label} style={{ textAlign: "center", padding: "8px 0" }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
                    <div style={{
                      fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 900, letterSpacing: "-1px",
                      background: "linear-gradient(135deg, #00AEEF, #00D4FF)",
                      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                      marginBottom: 6,
                    }}>
                      {value}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.4 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <h3 style={{ fontSize: 22, fontWeight: 800, color: "#FFFFFF", marginBottom: 32, letterSpacing: "-0.3px" }}>
                The 60-Day Journey
              </h3>
              <div style={{ position: "relative", marginBottom: 56 }}>
                {/* Vertical line */}
                <div style={{
                  position: "absolute", left: 14, top: 24, bottom: 24, width: 2,
                  background: "linear-gradient(180deg, #00AEEF, rgba(0,174,239,0.1))",
                }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                  {TIMELINE.map(({ week, title, description, highlight }) => (
                    <div key={week} style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                        background: highlight ? "#00AEEF" : "rgba(0,174,239,0.15)",
                        border: `2px solid ${highlight ? "#00AEEF" : "rgba(0,174,239,0.3)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: highlight ? "0 0 16px rgba(0,174,239,0.6)" : "none",
                      }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: highlight ? "#fff" : "#00AEEF" }} />
                      </div>
                      <div style={{ paddingTop: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "0.5px", marginBottom: 4 }}>{week}</div>
                        <h4 style={{ fontSize: 17, fontWeight: 700, color: highlight ? "#00AEEF" : "#FFFFFF", marginBottom: 8 }}>{title}</h4>
                        <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.7 }}>{description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quote */}
              <div style={{
                background: "rgba(0,174,239,0.08)",
                border: "1px solid rgba(0,174,239,0.2)",
                borderRadius: 20, padding: 36, marginBottom: 48,
              }}>
                <div style={{ fontSize: 48, color: "rgba(0,174,239,0.4)", lineHeight: 1, marginBottom: -8, fontFamily: "Georgia, serif" }}>"</div>
                <p style={{ fontSize: 20, color: "#E2F4FF", lineHeight: 1.7, fontStyle: "italic", marginBottom: 20 }}>
                  I was skeptical at first — I'd tried other marketing agencies and got burned. But AI Edge Solutions was different. Within the first week, I was getting callbacks from leads I didn't even know I'd missed. Now we're booked three weeks out. I had to hire two more guys. Best business decision I ever made.
                </p>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Mike Cardenas</div>
                  <div style={{ fontSize: 13, color: "#6B7280" }}>Owner, Bed Bugs & Beyond · Phoenix, AZ</div>
                </div>
              </div>
            </div>

            {/* CTA in card */}
            <div style={{
              background: "rgba(0,174,239,0.06)",
              borderTop: "1px solid rgba(0,174,239,0.15)",
              padding: "36px 48px",
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 24,
            }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#FFFFFF", marginBottom: 6 }}>
                  Get results like Bed Bugs & Beyond
                </div>
                <div style={{ fontSize: 14, color: "#6B7280" }}>Book a free strategy call — we'll show you exactly what we'd do for your business.</div>
              </div>
              <button
                onClick={() => navigate("/contact")}
                style={{
                  padding: "13px 30px", borderRadius: 11, background: "#00AEEF",
                  border: "none", color: "#fff", fontSize: 15, fontWeight: 700,
                  cursor: "pointer", boxShadow: "0 0 24px rgba(0,174,239,0.35)",
                  whiteSpace: "nowrap", transition: "all 0.25s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = "#00C4FF";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 0 40px rgba(0,174,239,0.55)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = "#00AEEF";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 0 24px rgba(0,174,239,0.35)";
                }}
              >
                Book Free Strategy Call →
              </button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
