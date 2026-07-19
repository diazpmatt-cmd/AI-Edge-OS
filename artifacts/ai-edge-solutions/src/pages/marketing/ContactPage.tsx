import { useState } from "react";
import { useSearch } from "wouter";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

const PACKAGE_LABELS: Record<string, string> = {
  core: "Core Package",
  growth: "Growth Package",
  enterprise: "Enterprise",
};

const SERVICES = [
  "Lead Recovery AI",
  "AI Receptionist",
  "Business Edge Profile",
  "Review Generation",
  "Local SEO",
  "Website Design",
  "Social Media Distribution",
  "AI Edge Visibility",
  "Full AI Stack (Best Value)",
];

const INDUSTRIES = [
  "HVAC", "Plumbing", "Pest Control", "Roofing", "Landscaping",
  "Cleaning Services", "Electrical", "Dental / Healthcare", "Legal",
  "Chiropractic", "Auto Repair", "Restaurants", "Other",
];

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  business: string;
  industry: string;
  services: string[];
  message: string;
  packageKey: string;
  packageLabel: string;
};

export default function ContactPage() {
  const search = useSearch();
  const packageParam = new URLSearchParams(search).get("package") ?? "";
  const packageLabel = PACKAGE_LABELS[packageParam] ?? "";

  const [form, setForm] = useState<FormData>({
    firstName: "", lastName: "", email: "", phone: "",
    business: "", industry: "", services: [], message: "",
    packageKey: packageParam,
    packageLabel: packageLabel,
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 1000;

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    let lastError: string | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          lastError = `Server error (${res.status})`;
          if (res.status < 500) {
            break;
          }
        } else {
          setSubmitted(true);
          setSubmitting(false);
          return;
        }
      } catch {
        lastError = "Something went wrong. Please try again or email us directly.";
      }

      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAY_MS);
      }
    }

    setSubmitError(lastError ?? "Something went wrong. Please try again or email us directly.");
    setSubmitting(false);
  };

  const toggleService = (service: string) => {
    setForm(f => ({
      ...f,
      services: f.services.includes(service)
        ? f.services.filter(s => s !== service)
        : [...f.services, service],
    }));
  };

  if (submitted) {
    return (
      <div style={{ background: "#030612", minHeight: "100vh", color: "#FFFFFF", fontFamily: "'Inter', -apple-system, sans-serif" }}>
        <Nav />
        <div style={{
          paddingTop: 136, paddingBottom: 96, paddingLeft: 24, paddingRight: 24,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          minHeight: "80vh", textAlign: "center",
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "rgba(0,174,239,0.12)", border: "2px solid rgba(0,174,239,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36, marginBottom: 28,
            boxShadow: "0 0 40px rgba(0,174,239,0.25)",
          }}>
            ✓
          </div>
          <h1 style={{
            fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 900, letterSpacing: "-1px",
            background: "linear-gradient(135deg, #FFFFFF, #C0C0C0)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            marginBottom: 16,
          }}>
            We'll be in touch soon!
          </h1>
          <p style={{ fontSize: 18, color: "#6B7280", lineHeight: 1.65, maxWidth: 480, marginBottom: 16 }}>
            Thanks, {form.firstName}. We've received your request and will contact you within 1 business day to schedule your free strategy call.
          </p>
          <p style={{ fontSize: 15, color: "#4B5563" }}>
            Check your email at <span style={{ color: "#00AEEF" }}>{form.email}</span> for a confirmation.
          </p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div style={{ background: "#030612", minHeight: "100vh", color: "#FFFFFF", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <Nav />

      {/* Hero */}
      <section style={{ paddingTop: 136, paddingBottom: 48, paddingLeft: 24, paddingRight: 24, textAlign: "center", position: "relative" }}>
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
            Free Strategy Call
          </div>
          <h1 style={{
            fontSize: "clamp(36px, 6vw, 60px)", fontWeight: 900,
            letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: 20,
            background: "linear-gradient(135deg, #FFFFFF 40%, #C0C0C0)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Let's Talk About Optimizing Your Growth
          </h1>
          <p style={{ fontSize: 18, color: "#6B7280", lineHeight: 1.65, maxWidth: 500, margin: "0 auto" }}>
            Book your free 30-minute strategy call. No pitch. No pressure. Just a clear plan to grow your business with AI.
          </p>
        </div>
      </section>

      {/* Form + Info */}
      <section style={{ padding: "32px 24px 96px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 48, alignItems: "start" }}>
          {/* Form */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 24, padding: 40,
          }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#FFFFFF", marginBottom: packageLabel ? 16 : 32, letterSpacing: "-0.3px" }}>
              Tell us about your business
            </h2>

            {packageLabel && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.28)",
                borderRadius: 10, padding: "12px 16px", marginBottom: 24,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#00AEEF", boxShadow: "0 0 8px rgba(0,174,239,0.7)", flexShrink: 0,
                }} />
                <span style={{ fontSize: 14, color: "#94A3B8" }}>
                  You're inquiring about:{" "}
                  <strong style={{ color: "#00AEEF", fontWeight: 700 }}>{packageLabel}</strong>
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Name row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <FieldLabel>First name *</FieldLabel>
                  <Input
                    placeholder="John"
                    value={form.firstName}
                    onChange={v => setForm(f => ({ ...f, firstName: v }))}
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Last name *</FieldLabel>
                  <Input
                    placeholder="Smith"
                    value={form.lastName}
                    onChange={v => setForm(f => ({ ...f, lastName: v }))}
                    required
                  />
                </div>
              </div>

              {/* Email + Phone */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <FieldLabel>Email *</FieldLabel>
                  <Input
                    placeholder="john@business.com"
                    type="email"
                    value={form.email}
                    onChange={v => setForm(f => ({ ...f, email: v }))}
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Phone *</FieldLabel>
                  <Input
                    placeholder="(602) 867-5300"
                    type="tel"
                    value={form.phone}
                    onChange={v => setForm(f => ({ ...f, phone: v }))}
                    required
                  />
                </div>
              </div>

              {/* Business name */}
              <div style={{ marginBottom: 16 }}>
                <FieldLabel>Business name *</FieldLabel>
                <Input
                  placeholder="Your Business LLC"
                  value={form.business}
                  onChange={v => setForm(f => ({ ...f, business: v }))}
                  required
                />
              </div>

              {/* Industry */}
              <div style={{ marginBottom: 24 }}>
                <FieldLabel>Industry *</FieldLabel>
                <select
                  value={form.industry}
                  onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                  required
                  style={{
                    width: "100%", padding: "11px 16px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 10, color: form.industry ? "#FFFFFF" : "#6B7280",
                    fontSize: 15, outline: "none", cursor: "pointer",
                    appearance: "none",
                  }}
                >
                  <option value="" disabled>Select your industry</option>
                  {INDUSTRIES.map(i => (
                    <option key={i} value={i} style={{ background: "#0A0F1C", color: "#FFFFFF" }}>{i}</option>
                  ))}
                </select>
              </div>

              {/* Services */}
              <div style={{ marginBottom: 24 }}>
                <FieldLabel>Services you're interested in</FieldLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                  {SERVICES.map(service => {
                    const selected = form.services.includes(service);
                    return (
                      <button
                        key={service}
                        type="button"
                        onClick={() => toggleService(service)}
                        style={{
                          padding: "7px 14px", borderRadius: 8,
                          background: selected ? "rgba(0,174,239,0.15)" : "rgba(255,255,255,0.04)",
                          border: selected ? "1px solid rgba(0,174,239,0.4)" : "1px solid rgba(255,255,255,0.08)",
                          color: selected ? "#00AEEF" : "#6B7280",
                          fontSize: 13, fontWeight: selected ? 600 : 400,
                          cursor: "pointer", transition: "all 0.2s",
                        }}
                      >
                        {service}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message */}
              <div style={{ marginBottom: 32 }}>
                <FieldLabel>Biggest challenge right now</FieldLabel>
                <textarea
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="Tell us what's holding your business back..."
                  rows={4}
                  style={{
                    width: "100%", padding: "12px 16px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 10, color: "#FFFFFF",
                    fontSize: 15, outline: "none", resize: "vertical",
                    fontFamily: "inherit", lineHeight: 1.6,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* ── SMS Consent Disclosure (10DLC required) ── */}
              <div style={{
                background: "rgba(0,174,239,0.05)",
                border: "1px solid rgba(0,174,239,0.18)",
                borderRadius: 10,
                padding: "14px 18px",
                marginBottom: 20,
              }}>
                <p style={{
                  fontSize: 12, color: "#6B7280", lineHeight: 1.7, margin: 0,
                }}>
                  <span style={{ color: "#9CA3AF", fontWeight: 600 }}>📱 SMS Consent:</span>{" "}
                  By submitting this form, you agree to receive text messages from{" "}
                  <strong style={{ color: "#C0C0C0" }}>Bed Bugs &amp; Beyond</strong> regarding your
                  quote request, appointment, service updates, and missed-call follow-up.
                  Message frequency varies. Message and data rates may apply.
                  Reply <strong style={{ color: "#C0C0C0" }}>STOP</strong> to opt out or{" "}
                  <strong style={{ color: "#C0C0C0" }}>HELP</strong> for help.
                  SMS opt-in data is not shared with third parties for marketing.
                  See our{" "}
                  <a href="/privacy-policy" style={{ color: "#00AEEF", textDecoration: "underline" }}>
                    Privacy Policy
                  </a>
                  {" "}for details.
                </p>
              </div>

              {submitError && (
                <div style={{
                  marginBottom: 16,
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  color: "#FCA5A5",
                  fontSize: 14,
                  lineHeight: 1.55,
                }}>
                  ⚠ Submission failed — {submitError}. Please try again or email us at{" "}
                  <a href="mailto:hello@aiedgesolutions.com" style={{ color: "#F87171", textDecoration: "underline" }}>
                    hello@aiedgesolutions.com
                  </a>.
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%", padding: "15px",
                  borderRadius: 12, background: submitting ? "rgba(0,174,239,0.5)" : "#00AEEF",
                  border: "none", color: "#fff",
                  fontSize: 16, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
                  boxShadow: "0 0 30px rgba(0,174,239,0.35)",
                  transition: "all 0.25s",
                  opacity: submitting ? 0.7 : 1,
                }}
                onMouseEnter={e => {
                  if (!submitting) {
                    (e.currentTarget as HTMLElement).style.background = "#00C4FF";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 0 50px rgba(0,174,239,0.55)";
                  }
                }}
                onMouseLeave={e => {
                  if (!submitting) {
                    (e.currentTarget as HTMLElement).style.background = "#00AEEF";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px rgba(0,174,239,0.35)";
                  }
                }}
              >
                {submitting ? "Sending…" : "Book My Free Strategy Call →"}
              </button>
              <p style={{ textAlign: "center", fontSize: 13, color: "#4B5563", marginTop: 14 }}>
                We respond within 1 business day. No spam, ever.
              </p>
            </form>
          </div>

          {/* Info sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* What to expect */}
            <div style={{
              background: "rgba(0,174,239,0.06)",
              border: "1px solid rgba(0,174,239,0.18)",
              borderRadius: 20, padding: 28,
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#FFFFFF", marginBottom: 20 }}>
                What happens on the call
              </h3>
              {[
                { num: "01", title: "Audit your presence", desc: "We'll review your current digital footprint and find every leak." },
                { num: "02", title: "Identify top opportunities", desc: "We'll show you the 2–3 changes that will have the biggest impact." },
                { num: "03", title: "Build your AI roadmap", desc: "You'll leave with a clear, custom plan — even if you don't work with us." },
              ].map(({ num, title, desc }) => (
                <div key={num} style={{ display: "flex", gap: 16, marginBottom: 20 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800, color: "#00AEEF",
                  }}>
                    {num}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.55 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Trust signals */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 20, padding: 28,
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#6B7280", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 18 }}>
                Why businesses trust us
              </h3>
              {[
                { icon: "🏆", label: "500+ local businesses helped" },
                { icon: "📈", label: "Average 3.8× ROI in 60 days" },
                { icon: "🔒", label: "No long-term contracts" },
                { icon: "⭐", label: "4.9 star average client rating" },
                { icon: "💬", label: "Dedicated account manager" },
              ].map(({ icon, label }) => (
                <div key={label} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <span style={{ fontSize: 14, color: "#C0C0C0" }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Mini testimonial */}
            <div style={{
              background: "rgba(0,174,239,0.06)",
              border: "1px solid rgba(0,174,239,0.18)",
              borderRadius: 20, padding: 24,
            }}>
              <div style={{ fontSize: 32, color: "rgba(0,174,239,0.4)", fontFamily: "Georgia, serif", lineHeight: 1, marginBottom: 4 }}>"</div>
              <p style={{ fontSize: 14, color: "#8B9AB0", lineHeight: 1.7, fontStyle: "italic", marginBottom: 16 }}>
                The strategy call was eye-opening. They showed me exactly how much money I was leaving on the table. Worth every second.
              </p>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>Sarah T.</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>Owner, Clean & Clear Plumbing</div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#C0C0C0", marginBottom: 8, letterSpacing: "0.2px" }}>
      {children}
    </label>
  );
}

function Input({ placeholder, value, onChange, type = "text", required }: {
  placeholder: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      required={required}
      style={{
        width: "100%", padding: "11px 16px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10, color: "#FFFFFF",
        fontSize: 15, outline: "none",
        fontFamily: "inherit", boxSizing: "border-box",
        transition: "border-color 0.2s",
      }}
      onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,174,239,0.4)"}
      onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)"}
    />
  );
}
