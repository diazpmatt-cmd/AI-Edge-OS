import { useLocation } from "wouter";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

const SERVICES = [
  {
    icon: "📞",
    title: "Lead Recovery AI",
    tagline: "Turn missed calls into booked jobs",
    description: "Every missed call is a missed sale. Lead Recovery AI instantly sends a personalized SMS the moment a call is missed, then manages the conversation until the lead is booked.",
    features: [
      "Instant text-back in under 5 seconds",
      "Two-way SMS conversation management",
      "Automated multi-step follow-up sequences",
      "Lead tracking & revenue dashboard",
      "CRM integration",
      "Twilio-powered enterprise reliability",
    ],
    result: "Average 94% lead recovery rate",
    accent: "#00AEEF",
  },
  {
    icon: "🤖",
    title: "AI Receptionist",
    tagline: "Answer every call, 24/7",
    description: "An AI that sounds human, qualifies leads intelligently, books appointments directly to your calendar, and handles the most common customer questions — all without you lifting a finger.",
    features: [
      "Natural-language call answering",
      "Lead qualification & scoring",
      "Calendar booking integration",
      "FAQ & objection handling",
      "Call transcripts & summaries",
      "Escalation to live agent",
    ],
    result: "47% reduction in missed opportunities",
    accent: "#00AEEF",
  },
  {
    icon: "📍",
    title: "Business Edge Profile Automation",
    tagline: "Own your local presence",
    description: "Your GBP is your most powerful free marketing asset. We automate consistent posting, photo uploads, Q&A responses, and profile optimization to keep you ranked at the top of local search.",
    features: [
      "Daily automated GBP posts",
      "AI-generated photo captions",
      "Q&A monitoring & response",
      "Category & attribute optimization",
      "Competitor tracking",
      "Monthly performance reporting",
    ],
    result: "3–5× more profile views on average",
    accent: "#00AEEF",
  },
  {
    icon: "⭐",
    title: "Review Generation",
    tagline: "Build a reputation that sells itself",
    description: "Automatically request reviews from every satisfied customer via SMS and email at the perfect moment. Monitor responses, manage your reputation, and turn happy customers into your best salespeople.",
    features: [
      "Post-job automated review requests",
      "Multi-platform: Google, Yelp, Facebook",
      "Negative review early detection",
      "AI-powered response drafting",
      "Review analytics dashboard",
      "Team notification alerts",
    ],
    result: "Average 4.9★ rating within 90 days",
    accent: "#00AEEF",
  },
  {
    icon: "🔍",
    title: "Local SEO",
    tagline: "Rank #1 where your customers search",
    description: "Precision local SEO that targets every service + city combination you care about. From on-page optimization to local citation building — we do it all.",
    features: [
      "Keyword research & strategy",
      "On-page & technical SEO",
      "Local citation building",
      "Service area page creation",
      "Monthly content publishing",
      "Rank tracking & reporting",
    ],
    result: "Page 1 rankings within 90 days",
    accent: "#00AEEF",
  },
  {
    icon: "🌐",
    title: "Website Design",
    tagline: "Convert visitors into customers",
    description: "Fast, mobile-first, and built to convert. We design and build websites that match your brand, load in under 2 seconds, and turn visitors into booked appointments.",
    features: [
      "Custom design to match your brand",
      "Mobile-first responsive build",
      "Conversion rate optimization",
      "Integrated contact & booking forms",
      "Page speed optimization",
      "Hosting & maintenance included",
    ],
    result: "Average 35% increase in conversion rate",
    accent: "#00AEEF",
  },
  {
    icon: "📲",
    title: "Social Media Content Distribution",
    tagline: "AI content across every platform",
    description: "We take your service photos, customer stories, and business updates and transform them into a stream of platform-optimized social content — published on schedule, every week.",
    features: [
      "AI content generation from your assets",
      "Multi-platform publishing (IG, FB, GMB, X)",
      "Scheduling & calendar management",
      "Hashtag & reach optimization",
      "Monthly content strategy",
      "Performance analytics",
    ],
    result: "3× more social engagement on average",
    accent: "#00AEEF",
  },
  {
    icon: "🧠",
    title: "AI Visibility / GEO Optimization",
    tagline: "Get found by AI-powered search",
    description: "ChatGPT, Gemini, Perplexity, and AI assistants are the new search engines. We optimize your business to be cited, recommended, and featured by these AI systems — the next frontier of local discovery.",
    features: [
      "AI search landscape audit",
      "Entity optimization & schema markup",
      "Authoritative content for AI citation",
      "Structured data implementation",
      "GEO keyword targeting",
      "Monthly AI visibility reporting",
    ],
    result: "Future-proof visibility as search evolves",
    accent: "#00AEEF",
  },
];

export default function ServicesPage() {
  const [, navigate] = useLocation();

  return (
    <div style={{ background: "#030612", minHeight: "100vh", color: "#FFFFFF", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <Nav />

      {/* Hero */}
      <section style={{ paddingTop: 136, paddingBottom: 72, paddingLeft: 24, paddingRight: 24, textAlign: "center", position: "relative" }}>
        <div style={{
          position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: 700, height: 400, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(0,174,239,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative", maxWidth: 740, margin: "0 auto" }}>
          <div style={{
            display: "inline-block", marginBottom: 20,
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)",
            borderRadius: 100, padding: "6px 18px",
            fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px", textTransform: "uppercase",
          }}>
            Our Services
          </div>
          <h1 style={{
            fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 900,
            letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: 20,
            background: "linear-gradient(135deg, #FFFFFF 40%, #C0C0C0)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Eight AI Systems.<br />One Competitive Advantage.
          </h1>
          <p style={{ fontSize: 19, color: "#6B7280", lineHeight: 1.65, marginBottom: 36, maxWidth: 560, margin: "0 auto 36px" }}>
            Each service is a fully managed AI system that runs around the clock to grow your business.
          </p>
          <button
            onClick={() => navigate("/contact")}
            style={{
              padding: "14px 36px", borderRadius: 12, background: "#00AEEF",
              border: "none", color: "#fff", fontSize: 16, fontWeight: 700,
              cursor: "pointer", boxShadow: "0 0 30px rgba(0,174,239,0.3)",
              transition: "all 0.25s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "#00C4FF";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 50px rgba(0,174,239,0.55)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "#00AEEF";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px rgba(0,174,239,0.3)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }}
          >
            Book Free Strategy Call →
          </button>
        </div>
      </section>

      {/* Services list */}
      <section style={{ padding: "48px 24px 96px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {SERVICES.map((service, i) => (
            <ServiceDetail key={i} {...service} index={i} onCta={() => navigate("/contact")} />
          ))}
        </div>
      </section>

      {/* Pricing CTA */}
      <section style={{
        padding: "80px 24px",
        borderTop: "1px solid rgba(0,174,239,0.1)",
        textAlign: "center",
        background: "rgba(0,174,239,0.03)",
      }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{
            display: "inline-block", marginBottom: 20,
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)",
            borderRadius: 100, padding: "6px 18px",
            fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px", textTransform: "uppercase",
          }}>
            Simple Pricing
          </div>
          <h2 style={{
            fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800,
            letterSpacing: "-1px", color: "#FFFFFF", marginBottom: 16,
          }}>
            Ready to see what it costs?
          </h2>
          <p style={{ fontSize: 17, color: "#6B7280", lineHeight: 1.65, marginBottom: 36 }}>
            We offer straightforward packages designed for local service businesses. No hidden fees, no long-term lock-ins.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/pricing")}
              style={{
                padding: "15px 40px", borderRadius: 12, background: "#00AEEF",
                border: "none", color: "#fff", fontSize: 17, fontWeight: 700,
                cursor: "pointer", boxShadow: "0 0 30px rgba(0,174,239,0.3)",
                transition: "all 0.25s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "#00C4FF";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 0 50px rgba(0,174,239,0.55)";
                (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "#00AEEF";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px rgba(0,174,239,0.3)";
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
              }}
            >
              View Packages →
            </button>
            <button
              onClick={() => navigate("/contact")}
              style={{
                padding: "15px 40px", borderRadius: 12,
                background: "transparent",
                border: "1px solid rgba(0,174,239,0.35)", color: "#C0C0C0", fontSize: 17, fontWeight: 700,
                cursor: "pointer", transition: "all 0.25s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,174,239,0.7)";
                (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,174,239,0.35)";
                (e.currentTarget as HTMLElement).style.color = "#C0C0C0";
              }}
            >
              Book Free Strategy Call
            </button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function ServiceDetail({ icon, title, tagline, description, features, result, index, onCta }: {
  icon: string; title: string; tagline: string; description: string;
  features: string[]; result: string; accent: string; index: number; onCta: () => void;
}) {
  const even = index % 2 === 0;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 48,
      alignItems: "center",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 24,
      padding: "48px",
      transition: "border-color 0.3s",
    }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,174,239,0.2)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.05)"}
    >
      <div style={{ order: even ? 0 : 1 }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>{icon}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>
          {tagline}
        </div>
        <h2 style={{ fontSize: "clamp(22px, 3vw, 34px)", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.5px", marginBottom: 16 }}>
          {title}
        </h2>
        <p style={{ fontSize: 16, color: "#6B7280", lineHeight: 1.75, marginBottom: 28 }}>{description}</p>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.25)",
          borderRadius: 8, padding: "8px 16px", marginBottom: 28,
        }}>
          <span style={{ fontSize: 16 }}>📈</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#00AEEF" }}>{result}</span>
        </div>
        <br />
        <button
          onClick={onCta}
          style={{
            padding: "11px 26px", borderRadius: 10, background: "#00AEEF",
            border: "none", color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: "pointer", transition: "all 0.25s",
            boxShadow: "0 0 20px rgba(0,174,239,0.25)",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = "#00C4FF";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 0 36px rgba(0,174,239,0.5)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = "#00AEEF";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(0,174,239,0.25)";
          }}
        >
          Get Started →
        </button>
      </div>

      <div style={{ order: even ? 1 : 0 }}>
        <div style={{
          background: "rgba(0,174,239,0.04)",
          border: "1px solid rgba(0,174,239,0.12)",
          borderRadius: 18,
          padding: 28,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#6B7280", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 18 }}>
            What's included
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {features.map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                  background: "rgba(0,174,239,0.15)", border: "1px solid rgba(0,174,239,0.35)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#00AEEF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span style={{ fontSize: 14, color: "#C0C0C0", lineHeight: 1.5 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 900px) { .service-detail-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
