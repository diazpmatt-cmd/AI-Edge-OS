import { useLocation } from "wouter";

const logoSrc = `${import.meta.env.BASE_URL}logo-transparent.png`;

const SERVICES = [
  "Lead Recovery AI",
  "AI Receptionist",
  "Google Business Profile",
  "Review Generation",
  "Local SEO",
  "Website Design",
  "Social Media Distribution",
  "AI Visibility / GEO",
];

const COMPANY = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
  { label: "Products", href: "/products" },
  { label: "Case Studies", href: "/case-studies" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
];

export default function Footer() {
  const [, navigate] = useLocation();
  const year = new Date().getFullYear();

  return (
    <footer style={{
      background: "#030612",
      borderTop: "1px solid rgba(0,174,239,0.12)",
      padding: "64px 24px 32px",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 48, marginBottom: 56 }}>
          {/* Brand */}
          <div>
            <a
              href="/"
              onClick={e => { e.preventDefault(); navigate("/"); }}
              style={{ display: "inline-block", marginBottom: 16, textDecoration: "none" }}
            >
              <img
                src={logoSrc}
                alt="AI Edge Solutions"
                style={{ height: 52, width: "auto", objectFit: "contain" }}
              />
            </a>
            <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.7, maxWidth: 240 }}>
              Helping local businesses grow with AI automation, intelligent lead recovery, and smarter digital strategy.
            </p>
            <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
              {["f", "in", "tw"].map(s => (
                <div key={s} style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#6B7280", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>
                  {s}
                </div>
              ))}
            </div>
          </div>

          {/* Company */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 20 }}>Company</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {COMPANY.map(item => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={e => { e.preventDefault(); navigate(item.href); }}
                  style={{ fontSize: 14, color: "#6B7280", textDecoration: "none", transition: "color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#C0C0C0"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#6B7280"}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>

          {/* Services */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 20 }}>Services</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {SERVICES.map(s => (
                <a
                  key={s}
                  href="/services"
                  onClick={e => { e.preventDefault(); navigate("/services"); }}
                  style={{ fontSize: 14, color: "#6B7280", textDecoration: "none", transition: "color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#C0C0C0"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#6B7280"}
                >
                  {s}
                </a>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#00AEEF", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 20 }}>Get Started</div>
            <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.65, marginBottom: 20 }}>
              Book a free 30-minute strategy call. No pressure. Just clarity.
            </p>
            <button
              onClick={() => navigate("/contact")}
              style={{
                padding: "11px 22px", borderRadius: 10, background: "#00AEEF",
                border: "none", color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: "pointer", width: "100%",
                boxShadow: "0 0 20px rgba(0,174,239,0.25)",
                transition: "all 0.25s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "#00C4FF";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 0 32px rgba(0,174,239,0.5)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "#00AEEF";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(0,174,239,0.25)";
              }}
            >
              Book Free Strategy Call
            </button>
            <div style={{ marginTop: 12, fontSize: 12, color: "#4B5563", textAlign: "center" }}>
              No credit card required
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingTop: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <p style={{ fontSize: 13, color: "#374151" }}>© {year} AI Edge Solutions. All rights reserved.</p>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            {[
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Terms of Service", href: "/terms" },
            ].map(({ label, href }) => (
              <a key={label} href={href}
                style={{ fontSize: 13, color: "#374151", textDecoration: "none", transition: "color 0.2s" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#6B7280"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#374151"}
              >
                {label}
              </a>
            ))}
            <a
              href="/admin-access"
              onClick={e => { e.preventDefault(); navigate("/admin-access"); }}
              style={{
                fontSize: 11, color: "#1F2937", textDecoration: "none",
                letterSpacing: "0.5px", transition: "color 0.2s",
                fontWeight: 500,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#4B5563"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#1F2937"}
            >
              Admin
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
