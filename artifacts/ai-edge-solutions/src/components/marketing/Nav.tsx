import { useState, useEffect } from "react";
import { useLocation } from "wouter";

const LINKS = [
  { label: "Services", href: "/services" },
  { label: "Products", href: "/products" },
  { label: "Case Studies", href: "/case-studies" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
];

const logoSrc = `${import.meta.env.BASE_URL}logo-transparent.png`;

export default function Nav() {
  const [location, navigate] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location]);

  return (
    <>
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? "rgba(3,6,18,0.97)" : "rgba(3,6,18,0.75)",
        backdropFilter: "blur(16px)",
        borderBottom: scrolled ? "1px solid rgba(0,174,239,0.18)" : "1px solid rgba(255,255,255,0.04)",
        transition: "all 0.3s ease",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", height: 70 }}>
          {/* Logo */}
          <a
            href="/"
            onClick={e => { e.preventDefault(); navigate("/"); }}
            style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}
          >
            <img
              src={logoSrc}
              alt="AI Edge Solutions"
              style={{ height: 46, width: "auto", objectFit: "contain" }}
            />
          </a>

          {/* Desktop nav */}
          <nav style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto", marginRight: 24 }}>
            {LINKS.map((link) => {
              const active = location === link.href || location.startsWith(link.href + "/");
              return (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={e => { e.preventDefault(); navigate(link.href); }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    color: active ? "#00AEEF" : "#C0C0C0",
                    background: active ? "rgba(0,174,239,0.08)" : "transparent",
                    transition: "all 0.2s",
                    letterSpacing: "-0.1px",
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.color = "#C0C0C0";
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }
                  }}
                >
                  {link.label}
                </a>
              );
            })}
          </nav>

          {/* CTA */}
          <button
            onClick={() => navigate("/contact")}
            style={{
              padding: "9px 20px",
              borderRadius: 9,
              background: "#00AEEF",
              border: "none",
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "-0.1px",
              boxShadow: "0 0 0 rgba(0,174,239,0)",
              transition: "all 0.25s",
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              const el = e.currentTarget;
              el.style.background = "#00C4FF";
              el.style.boxShadow = "0 0 22px rgba(0,174,239,0.55)";
              el.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget;
              el.style.background = "#00AEEF";
              el.style.boxShadow = "0 0 0 rgba(0,174,239,0)";
              el.style.transform = "translateY(0)";
            }}
          >
            Book Free Call
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="mobile-menu-btn"
            style={{
              display: "none",
              marginLeft: 16,
              background: "none",
              border: "1px solid rgba(192,192,192,0.2)",
              borderRadius: 8,
              color: "#C0C0C0",
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div style={{
            background: "rgba(3,6,18,0.98)",
            borderTop: "1px solid rgba(0,174,239,0.15)",
            padding: "16px 24px 24px",
          }}>
            {LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                onClick={e => { e.preventDefault(); navigate(link.href); }}
                style={{
                  display: "block",
                  padding: "12px 0",
                  color: "#C0C0C0",
                  textDecoration: "none",
                  fontSize: 16,
                  fontWeight: 500,
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                {link.label}
              </a>
            ))}
            <button
              onClick={() => navigate("/contact")}
              style={{
                marginTop: 16, width: "100%", padding: "13px",
                borderRadius: 10, background: "#00AEEF", border: "none",
                color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}
            >
              Book Free Strategy Call
            </button>
          </div>
        )}
      </header>

      <style>{`
        @media (max-width: 768px) {
          nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
      `}</style>
    </>
  );
}
