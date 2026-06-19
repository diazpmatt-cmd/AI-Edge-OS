import { useLocation } from "wouter";

const FEATURES = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00AEEF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.86 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.77 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.09 6.09l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
    ),
    title: "Instant Text-Back",
    description: "Automatically send a personalized SMS the moment a call is missed. Capture leads before they call a competitor.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00AEEF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.5 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6.5"/><path d="M17.5 2.5a2.121 2.121 0 0 1 3 3L12 14l-4 1 1-4Z"/>
      </svg>
    ),
    title: "Missed Call Tracking",
    description: "Every missed call is logged, timestamped, and tied to a lead profile. Never lose track of a potential customer again.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00AEEF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    title: "Two-Way SMS",
    description: "Have real conversations with prospects directly from your dashboard. Reply, schedule, and close — all in one thread.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00AEEF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    title: "Revenue Dashboard",
    description: "See exactly how much revenue each recovered lead generates. Track ROI in real time with clear, actionable metrics.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00AEEF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
    title: "Twilio-Powered Reliability",
    description: "Built on Twilio's enterprise infrastructure. 99.95% uptime, instant delivery, and carrier-grade message reliability.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00AEEF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    title: "Follow-Up Scheduling",
    description: "Set automated multi-step follow-up sequences. Reach out at the right time, every time, without lifting a finger.",
  },
];

const TESTIMONIALS = [
  {
    quote: "We recovered 14 leads in the first week alone. The instant text-back feature is a game changer for our HVAC business.",
    name: "Marcus D.",
    role: "Owner, CoolBreeze HVAC",
  },
  {
    quote: "I was losing $3,000 a week in missed calls. Lead Recovery AI paid for itself in the first 48 hours. No exaggeration.",
    name: "Tricia R.",
    role: "CEO, Pristine Plumbing Co.",
  },
  {
    quote: "Our booking rate jumped 38% in 30 days. The two-way SMS feels personal and our customers actually respond.",
    name: "Jerome L.",
    role: "Director, Metro Pest Solutions",
  },
];

export default function LandingPage() {
  const [, navigate] = useLocation();

  return (
    <div style={{ background: "#000000", minHeight: "100vh", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: "#FFFFFF" }}>
      {/* Header */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(192,192,192,0.12)",
        padding: "0 24px",
      }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: "linear-gradient(135deg, #00AEEF 0%, #007BBF 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 12px rgba(0,174,239,0.4)",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.86 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.77 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.09 6.09l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.3px", color: "#FFFFFF" }}>Lead Recovery AI</span>
          </div>

          {/* Nav */}
          <nav style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <a
              href="#features"
              style={{ color: "#C0C0C0", textDecoration: "none", fontSize: 15, fontWeight: 500, transition: "all 0.2s" }}
              onMouseEnter={e => {
                (e.target as HTMLElement).style.color = "#00AEEF";
                (e.target as HTMLElement).style.textShadow = "0 0 10px rgba(0,174,239,0.6)";
              }}
              onMouseLeave={e => {
                (e.target as HTMLElement).style.color = "#C0C0C0";
                (e.target as HTMLElement).style.textShadow = "none";
              }}
            >Features</a>
            <a
              href="#pricing"
              style={{ color: "#C0C0C0", textDecoration: "none", fontSize: 15, fontWeight: 500, transition: "all 0.2s" }}
              onMouseEnter={e => {
                (e.target as HTMLElement).style.color = "#00AEEF";
                (e.target as HTMLElement).style.textShadow = "0 0 10px rgba(0,174,239,0.6)";
              }}
              onMouseLeave={e => {
                (e.target as HTMLElement).style.color = "#C0C0C0";
                (e.target as HTMLElement).style.textShadow = "none";
              }}
            >Pricing</a>
            <button
              onClick={() => navigate("/sign-in")}
              style={{ color: "#C0C0C0", background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 500, transition: "all 0.2s", padding: 0 }}
              onMouseEnter={e => {
                (e.target as HTMLElement).style.color = "#00AEEF";
                (e.target as HTMLElement).style.textShadow = "0 0 10px rgba(0,174,239,0.6)";
              }}
              onMouseLeave={e => {
                (e.target as HTMLElement).style.color = "#C0C0C0";
                (e.target as HTMLElement).style.textShadow = "none";
              }}
            >Sign In</button>
            <CtaButton onClick={() => navigate("/sign-up")} small>Get More Leads</CtaButton>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section style={{ padding: "96px 24px 80px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        {/* Background glow */}
        <div style={{
          position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)",
          width: 600, height: 400, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(0,174,239,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative", maxWidth: 780, margin: "0 auto" }}>
          <div style={{
            display: "inline-block", marginBottom: 20,
            background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.3)",
            borderRadius: 100, padding: "6px 18px",
            fontSize: 13, fontWeight: 600, color: "#00AEEF", letterSpacing: "0.5px",
          }}>
            AI-POWERED LEAD RECOVERY
          </div>
          <h1 style={{
            fontSize: "clamp(36px, 6vw, 68px)", fontWeight: 800, lineHeight: 1.1,
            letterSpacing: "-1.5px", marginBottom: 24,
            background: "linear-gradient(135deg, #FFFFFF 40%, #C0C0C0 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            More Leads.<br />More Revenue.<br />
            <span style={{
              background: "linear-gradient(135deg, #00AEEF, #007BBF)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>Zero Missed Opportunities.</span>
          </h1>
          <p style={{ fontSize: 20, color: "#9CA3B0", lineHeight: 1.65, marginBottom: 40, maxWidth: 560, margin: "0 auto 40px" }}>
            Every missed call is a missed sale. Lead Recovery AI instantly texts back prospects, tracks follow-ups, and converts lost calls into booked jobs.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <CtaButton onClick={() => navigate("/sign-up")}>Get More Leads</CtaButton>
            <button
              onClick={() => navigate("/sign-in")}
              style={{
                padding: "14px 32px", borderRadius: 10,
                background: "transparent", border: "1px solid rgba(192,192,192,0.3)",
                color: "#C0C0C0", fontSize: 16, fontWeight: 600, cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget;
                el.style.borderColor = "#C0C0C0";
                el.style.color = "#FFFFFF";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget;
                el.style.borderColor = "rgba(192,192,192,0.3)";
                el.style.color = "#C0C0C0";
              }}
            >Sign In</button>
          </div>
          {/* Stats strip */}
          <div style={{ marginTop: 64, display: "flex", justifyContent: "center", gap: 48, flexWrap: "wrap" }}>
            {[["94%", "Lead recovery rate"], ["< 5s", "Text-back speed"], ["3.8×", "Average ROI"]].map(([stat, label]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#00AEEF", letterSpacing: "-1px" }}>{stat}</div>
                <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: "80px 24px", maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>Features</div>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, letterSpacing: "-0.5px", color: "#FFFFFF", marginBottom: 16 }}>
            Built to recover every lead
          </h2>
          <p style={{ fontSize: 18, color: "#6B7280", maxWidth: 520, margin: "0 auto" }}>
            A complete AI system that works around the clock to capture, engage, and convert missed callers.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" style={{ padding: "80px 24px", background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(192,192,192,0.08)", borderBottom: "1px solid rgba(192,192,192,0.08)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>Testimonials</div>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, letterSpacing: "-0.5px", color: "#FFFFFF" }}>
              What our customers say
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
            {TESTIMONIALS.map((t) => (
              <TestimonialCard key={t.name} quote={t.quote} name={t.name} role={t.role} />
            ))}
          </div>
        </div>
      </section>

      {/* Pricing CTA */}
      <section id="pricing" style={{ padding: "96px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 16 }}>Pricing</div>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.5px", marginBottom: 16 }}>
            Start recovering leads today
          </h2>
          <p style={{ fontSize: 18, color: "#6B7280", marginBottom: 40, lineHeight: 1.6 }}>
            Flat monthly pricing. No per-message fees. No surprises. Cancel anytime.
          </p>
          <CtaButton onClick={() => navigate("/sign-up")}>Get More Leads</CtaButton>
          <p style={{ marginTop: 20, fontSize: 14, color: "#4B5563" }}>14-day free trial · No credit card required</p>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid rgba(192,192,192,0.1)", padding: "32px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 14, color: "#4B5563" }}>© 2026 Lead Recovery AI. All rights reserved.</p>
      </footer>
    </div>
  );
}

function CtaButton({ onClick, children, small }: { onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: small ? "10px 22px" : "14px 36px",
        borderRadius: 10,
        background: "#00AEEF",
        border: "none",
        color: "#FFFFFF",
        fontSize: small ? 14 : 16,
        fontWeight: 700,
        cursor: "pointer",
        transition: "all 0.2s",
        boxShadow: "0 0 0 rgba(0,174,239,0)",
        letterSpacing: "-0.1px",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget;
        el.style.background = "#00C1FF";
        el.style.boxShadow = "0 0 24px rgba(0,174,239,0.55), 0 4px 16px rgba(0,174,239,0.3)";
        el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        el.style.background = "#00AEEF";
        el.style.boxShadow = "0 0 0 rgba(0,174,239,0)";
        el.style.transform = "translateY(0)";
      }}
    >
      {children}
    </button>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div
      style={{
        background: "#D9D9D9",
        borderRadius: 16,
        padding: "32px 28px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15)",
        transition: "all 0.2s",
        cursor: "default",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget;
        el.style.boxShadow = "0 8px 32px rgba(0,0,0,0.35), 0 0 20px rgba(0,174,239,0.15)";
        el.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        el.style.boxShadow = "0 4px 20px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15)";
        el.style.transform = "translateY(0)";
      }}
    >
      <div style={{ marginBottom: 16 }}>{icon}</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0B1220", marginBottom: 10, letterSpacing: "-0.2px" }}>{title}</h3>
      <p style={{ fontSize: 15, color: "#2D3748", lineHeight: 1.65 }}>{description}</p>
    </div>
  );
}

function TestimonialCard({ quote, name, role }: { quote: string; name: string; role: string }) {
  return (
    <div style={{
      background: "#00AEEF",
      borderRadius: 16,
      padding: "32px 28px",
      boxShadow: "0 8px 32px rgba(0,174,239,0.35), 0 2px 8px rgba(0,0,0,0.2)",
      display: "flex",
      flexDirection: "column",
      gap: 20,
    }}>
      {/* Quote mark */}
      <div style={{ fontSize: 48, lineHeight: 1, color: "rgba(11,18,32,0.25)", fontFamily: "Georgia, serif", marginBottom: -16 }}>"</div>
      <p style={{ fontSize: 16, color: "#0B1220", lineHeight: 1.7, fontStyle: "italic" }}>{quote}</p>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0B1220" }}>{name}</div>
        <div style={{ fontSize: 13, color: "rgba(11,18,32,0.7)", marginTop: 2 }}>{role}</div>
      </div>
    </div>
  );
}
