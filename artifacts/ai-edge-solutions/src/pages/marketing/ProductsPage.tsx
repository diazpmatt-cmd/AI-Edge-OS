import { useLocation } from "wouter";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

export default function ProductsPage() {
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
            Our Products
          </div>
          <h1 style={{
            fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 900,
            letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: 20,
            background: "linear-gradient(135deg, #FFFFFF 40%, #C0C0C0)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            AI-Powered Products Built for Local Business
          </h1>
          <p style={{ fontSize: 18, color: "#6B7280", lineHeight: 1.65, maxWidth: 540, margin: "0 auto" }}>
            Standalone software products you can deploy in hours — not months.
          </p>
        </div>
      </section>

      {/* Product 1: Lead Recovery AI */}
      <section style={{ padding: "48px 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{
          background: "linear-gradient(135deg, rgba(0,174,239,0.06) 0%, rgba(0,50,100,0.08) 100%)",
          border: "1px solid rgba(0,174,239,0.2)",
          borderRadius: 28,
          padding: "64px 56px",
          position: "relative",
          overflow: "hidden",
          marginBottom: 32,
        }}>
          {/* Corner glow */}
          <div style={{
            position: "absolute", top: -80, right: -80, width: 320, height: 320, borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(0,174,239,0.2) 0%, transparent 70%)",
          }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center", position: "relative" }}>
            {/* Left */}
            <div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 24,
                background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.3)",
                borderRadius: 8, padding: "6px 14px",
              }}>
                <span style={{ fontSize: 16 }}>📞</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "1px", textTransform: "uppercase" }}>Product 01</span>
              </div>

              <h2 style={{
                fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 900,
                letterSpacing: "-1px", lineHeight: 1.15, marginBottom: 16,
                background: "linear-gradient(135deg, #FFFFFF, #C0C0C0)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>
                Lead Recovery AI
              </h2>
              <p style={{ fontSize: 17, color: "#8B9AB0", lineHeight: 1.75, marginBottom: 32 }}>
                The only AI system designed specifically to capture, engage, and convert the leads you're already losing to missed calls. Works 24/7, responds in under 5 seconds, and pays for itself on day one.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 36 }}>
                {[
                  { icon: "⚡", label: "< 5s response", sub: "Instant text-back" },
                  { icon: "💬", label: "2-way SMS", sub: "Full conversations" },
                  { icon: "📊", label: "Revenue tracking", sub: "Real-time ROI" },
                  { icon: "🔄", label: "Auto follow-up", sub: "Multi-step sequences" },
                ].map(({ icon, label, sub }) => (
                  <div key={label} style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12, padding: "16px 14px",
                  }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>{sub}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <button
                  onClick={() => navigate("/contact")}
                  style={{
                    padding: "13px 30px", borderRadius: 11, background: "#00AEEF",
                    border: "none", color: "#fff", fontSize: 15, fontWeight: 700,
                    cursor: "pointer", boxShadow: "0 0 24px rgba(0,174,239,0.35)",
                    transition: "all 0.25s",
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
                  Get Started →
                </button>
                <button
                  onClick={() => navigate("/pricing")}
                  style={{
                    padding: "13px 30px", borderRadius: 11, background: "transparent",
                    border: "1px solid rgba(192,192,192,0.25)", color: "#C0C0C0",
                    fontSize: 15, fontWeight: 600, cursor: "pointer", transition: "all 0.25s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,174,239,0.4)";
                    (e.currentTarget as HTMLElement).style.color = "#00AEEF";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(192,192,192,0.25)";
                    (e.currentTarget as HTMLElement).style.color = "#C0C0C0";
                  }}
                >
                  View Pricing
                </button>
              </div>
            </div>

            {/* Right: Live demo mock */}
            <div>
              <div style={{
                background: "#0A0F1C",
                border: "1px solid rgba(0,174,239,0.15)",
                borderRadius: 20,
                overflow: "hidden",
                boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
              }}>
                <div style={{
                  background: "rgba(0,174,239,0.08)",
                  borderBottom: "1px solid rgba(0,174,239,0.12)",
                  padding: "14px 20px",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#00AEEF", boxShadow: "0 0 8px rgba(0,174,239,0.8)" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#00AEEF" }}>Lead Recovery AI — Live</span>
                </div>
                <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                  {[
                    { time: "2:14 PM", type: "system", text: "📞 Missed call from (602) 867-5300 — Sarah M." },
                    { time: "2:14 PM", type: "ai", text: "Hi Sarah! Sorry we missed your call. This is Mike from Sunshine HVAC. How can we help you today?" },
                    { time: "2:15 PM", type: "customer", text: "Hey! My AC stopped working. Can someone come out today?" },
                    { time: "2:15 PM", type: "ai", text: "Absolutely! We have a 4 PM slot available today. Can I get your address to confirm the appointment?" },
                    { time: "2:15 PM", type: "customer", text: "Yes! 1420 E Oak St, Phoenix. That works!" },
                    { time: "2:15 PM", type: "system", text: "✅ Appointment booked — 4 PM today — $280 estimated job value" },
                  ].map((msg, i) => (
                    <div key={i} style={{
                      display: "flex", flexDirection: "column",
                      alignItems: msg.type === "customer" ? "flex-end" : "flex-start",
                    }}>
                      <div style={{
                        maxWidth: "85%",
                        background: msg.type === "system"
                          ? "rgba(0,174,239,0.1)"
                          : msg.type === "ai"
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,174,239,0.2)",
                        border: msg.type === "system"
                          ? "1px solid rgba(0,174,239,0.25)"
                          : "1px solid rgba(255,255,255,0.04)",
                        borderRadius: msg.type === "customer" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        padding: "10px 14px",
                      }}>
                        <div style={{
                          fontSize: 13,
                          color: msg.type === "system" ? "#00AEEF" : msg.type === "customer" ? "#E2F4FF" : "#C0C0C0",
                          lineHeight: 1.5,
                        }}>
                          {msg.text}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: "#374151", marginTop: 3, paddingLeft: 4, paddingRight: 4 }}>{msg.time}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Product 2: AI Receptionist */}
        <div style={{
          background: "linear-gradient(135deg, rgba(0,100,180,0.04) 0%, rgba(0,174,239,0.06) 100%)",
          border: "1px solid rgba(192,192,192,0.1)",
          borderRadius: 28,
          padding: "64px 56px",
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", bottom: -80, left: -80, width: 320, height: 320, borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(0,174,239,0.15) 0%, transparent 70%)",
          }} />

          <div style={{ position: "relative" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 24,
              background: "rgba(192,192,192,0.06)", border: "1px solid rgba(192,192,192,0.15)",
              borderRadius: 8, padding: "6px 14px",
            }}>
              <span style={{ fontSize: 16 }}>🤖</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#C0C0C0", letterSpacing: "1px", textTransform: "uppercase" }}>Product 02</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
              {/* Stats side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[
                  { icon: "📞", title: "Calls Answered", value: "100%", sub: "No more missed calls" },
                  { icon: "🗓️", title: "Bookings Made", value: "Auto", sub: "Direct to your calendar" },
                  { icon: "🧠", title: "Languages", value: "50+", sub: "Multilingual support" },
                  { icon: "⏱️", title: "Response Time", value: "Instant", sub: "Zero hold time" },
                  { icon: "📋", title: "Call Summaries", value: "Every call", sub: "Full transcripts" },
                  { icon: "🔊", title: "Voice Quality", value: "Human-like", sub: "Natural AI voices" },
                ].map(({ icon, title, value, sub }) => (
                  <div key={title} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 14, padding: "18px 16px",
                  }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#00AEEF" }}>{value}</div>
                    <div style={{ fontSize: 11, color: "#4B5563", marginTop: 2 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Description side */}
              <div>
                <h2 style={{
                  fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 900,
                  letterSpacing: "-1px", lineHeight: 1.15, marginBottom: 16,
                  background: "linear-gradient(135deg, #FFFFFF, #C0C0C0)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}>
                  AI Receptionist
                </h2>
                <p style={{ fontSize: 17, color: "#8B9AB0", lineHeight: 1.75, marginBottom: 28 }}>
                  An AI receptionist that answers every call in your brand voice, qualifies leads with intelligent questions, books appointments directly to your calendar, and handles FAQs — with zero wait time, zero bad days.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 36 }}>
                  {[
                    "Answers calls 24/7 in a human-like voice",
                    "Asks qualifying questions to filter serious leads",
                    "Integrates with Google Calendar, Acuity, Calendly",
                    "Sends appointment confirmation texts",
                    "Escalates complex situations to a live agent",
                    "Full call transcript delivered after every conversation",
                  ].map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                        background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="#00AEEF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <span style={{ fontSize: 14, color: "#C0C0C0", lineHeight: 1.55 }}>{f}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => navigate("/contact")}
                  style={{
                    padding: "13px 30px", borderRadius: 11, background: "#00AEEF",
                    border: "none", color: "#fff", fontSize: 15, fontWeight: 700,
                    cursor: "pointer", boxShadow: "0 0 24px rgba(0,174,239,0.35)",
                    transition: "all 0.25s",
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
                  Book a Demo →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
