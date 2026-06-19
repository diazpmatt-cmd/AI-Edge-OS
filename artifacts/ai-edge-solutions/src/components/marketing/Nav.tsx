import { useState, useEffect } from "react";
import { useLocation } from "wouter";

const LINKS = [
  { label: "Home", href: "/", icon: "⌂" },
  { label: "Services", href: "/services", icon: "⚙" },
  { label: "Why Us", href: "/#why-us", icon: "◈", anchor: true },
  { label: "Products", href: "/products", icon: "⬡" },
  { label: "Case Studies", href: "/case-studies", icon: "↗" },
  { label: "Pricing", href: "/pricing", icon: "◇" },
  { label: "FAQ", href: "/pricing", icon: "?", faqAnchor: true },
];

const logoSrc = `${import.meta.env.BASE_URL}logo-transparent.png`;

function scrollToWhyUs() {
  const el = document.getElementById("why-us");
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

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

  function handleLink(link: typeof LINKS[0]) {
    if (link.anchor) {
      if (location === "/") {
        scrollToWhyUs();
      } else {
        navigate("/");
        setTimeout(scrollToWhyUs, 300);
      }
    } else if ((link as any).faqAnchor) {
      if (location === "/pricing") {
        document.getElementById("faq")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        navigate("/pricing");
        setTimeout(() => document.getElementById("faq")?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
      }
    } else {
      navigate(link.href);
    }
  }

  return (
    <>
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? "rgba(3,6,18,0.97)" : "rgba(3,6,18,0.75)",
        backdropFilter: "blur(20px)",
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
            <img src={logoSrc} alt="AI Edge Solutions" style={{ height: 46, width: "auto", objectFit: "contain" }} />
          </a>

          {/* Desktop nav — silver pill buttons */}
          <nav style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", marginRight: 20 }}>
            {LINKS.map((link) => {
              const active = !link.anchor && !(link as any).faqAnchor && (location === link.href || location.startsWith(link.href + "/"));
              return (
                <button
                  key={link.label}
                  onClick={() => handleLink(link)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: active
                      ? "1px solid rgba(0,174,239,0.5)"
                      : "1px solid rgba(180,195,220,0.18)",
                    background: active
                      ? "rgba(0,174,239,0.12)"
                      : "rgba(160,180,210,0.09)",
                    color: active ? "#00AEEF" : "rgba(210,220,235,0.85)",
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    letterSpacing: "-0.1px",
                    transition: "all 0.2s ease",
                    backdropFilter: "blur(8px)",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      const el = e.currentTarget;
                      el.style.background = "rgba(180,200,230,0.18)";
                      el.style.border = "1px solid rgba(180,200,230,0.35)";
                      el.style.color = "#FFFFFF";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      const el = e.currentTarget;
                      el.style.background = "rgba(160,180,210,0.09)";
                      el.style.border = "1px solid rgba(180,195,220,0.18)";
                      el.style.color = "rgba(210,220,235,0.85)";
                    }
                  }}
                >
                  <span style={{ fontSize: 11, opacity: 0.75 }}>{link.icon}</span>
                  {link.label}
                </button>
              );
            })}
          </nav>

          {/* CTA — solid blue */}
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
              whiteSpace: "nowrap",
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
            Book Strategy Call
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
              <button
                key={link.label}
                onClick={() => handleLink(link)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "12px 0", color: "#C0C0C0", background: "none", border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  fontSize: 16, fontWeight: 500, cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontSize: 12, opacity: 0.6 }}>{link.icon}</span>
                {link.label}
              </button>
            ))}
            <button
              onClick={() => navigate("/contact")}
              style={{
                marginTop: 16, width: "100%", padding: "13px",
                borderRadius: 10, background: "#00AEEF", border: "none",
                color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}
            >
              Book Strategy Call
            </button>
          </div>
        )}
      </header>

      <style>{`
        @media (max-width: 900px) {
          nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
      `}</style>
    </>
  );
}
