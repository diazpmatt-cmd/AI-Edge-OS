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
  "HVAC",
  "Plumbing",
  "Pest Control",
  "Roofing",
  "Landscaping",
  "Cleaning Services",
  "Electrical",
  "Dental / Healthcare",
  "Legal",
  "Chiropractic",
  "Auto Repair",
  "Restaurants",
  "Other",
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

const PAGE = {
  bg: "#030612",
  panel: "rgba(255,255,255,0.025)",
  border: "rgba(255,255,255,0.08)",
  blue: "#00AEEF",
  white: "#FFFFFF",
  silver: "#C0C0C0",
  muted: "#6B7280",
};

export default function ContactPage() {
  const search = useSearch();
  const packageParam = new URLSearchParams(search).get("package") ?? "";
  const packageLabel = PACKAGE_LABELS[packageParam] ?? "";

  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    business: "",
    industry: "",
    services: [],
    message: "",
    packageKey: packageParam,
    packageLabel,
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const maxAttempts = 3;
    const retryDelayMs = 1000;
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });

        if (response.ok) {
          setSubmitted(true);
          setSubmitting(false);
          return;
        }

        lastError = `Server error (${response.status})`;
        if (response.status < 500) break;
      } catch {
        lastError = "Something went wrong. Please try again or email us directly.";
      }

      if (attempt < maxAttempts) await delay(retryDelayMs);
    }

    setSubmitError(lastError ?? "Something went wrong. Please try again or email us directly.");
    setSubmitting(false);
  };

  const toggleService = (service: string) => {
    setForm(current => ({
      ...current,
      services: current.services.includes(service)
        ? current.services.filter(item => item !== service)
        : [...current.services, service],
    }));
  };

  if (submitted) {
    return (
      <div style={{ background: PAGE.bg, minHeight: "100vh", color: PAGE.white, fontFamily: "'Inter', -apple-system, sans-serif" }}>
        <Nav />
        <main style={{ minHeight: "78vh", display: "grid", placeItems: "center", padding: "136px 24px 80px" }}>
          <section style={{ maxWidth: 620, textAlign: "center" }}>
            <div style={{
              width: 74,
              height: 74,
              borderRadius: "50%",
              margin: "0 auto 24px",
              display: "grid",
              placeItems: "center",
              fontSize: 32,
              background: "rgba(0,174,239,0.12)",
              border: "2px solid rgba(0,174,239,0.4)",
            }}>
              ✓
            </div>
            <h1 style={{ fontSize: "clamp(30px, 5vw, 48px)", margin: "0 0 14px", fontWeight: 900 }}>
              We received your request.
            </h1>
            <p style={{ color: "#94A3B8", fontSize: 17, lineHeight: 1.65, margin: "0 auto 12px" }}>
              Thanks, {form.firstName}. AI Edge Solutions will use the contact details you submitted to follow up about your inquiry.
            </p>
            <p style={{ color: PAGE.muted, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              Our current service target is to review new website leads within the same business day.
            </p>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div style={{ background: PAGE.bg, minHeight: "100vh", color: PAGE.white, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <Nav />

      <main>
        <section style={{ padding: "136px 24px 44px", textAlign: "center" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{
              display: "inline-block",
              marginBottom: 18,
              padding: "6px 16px",
              borderRadius: 999,
              border: "1px solid rgba(0,174,239,0.25)",
              background: "rgba(0,174,239,0.08)",
              color: PAGE.blue,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "1.4px",
              textTransform: "uppercase",
            }}>
              Free Strategy Conversation
            </div>
            <h1 style={{ fontSize: "clamp(38px, 6vw, 60px)", lineHeight: 1.08, margin: "0 0 18px", fontWeight: 900, letterSpacing: "-1.5px" }}>
              Let’s map the next growth opportunity for your business.
            </h1>
            <p style={{ maxWidth: 590, margin: "0 auto", color: "#94A3B8", fontSize: 17, lineHeight: 1.65 }}>
              Tell us where you want help. We’ll review the request and use the information you submit to prepare the next conversation.
            </p>
          </div>
        </section>

        <section style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 24px 96px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)", gap: 36, alignItems: "start" }}>
            <div style={{ background: PAGE.panel, border: `1px solid ${PAGE.border}`, borderRadius: 22, padding: 34 }}>
              <h2 style={{ margin: packageLabel ? "0 0 14px" : "0 0 28px", fontSize: 22 }}>Tell us about your business</h2>

              {packageLabel && (
                <div style={{ padding: "11px 14px", marginBottom: 22, borderRadius: 10, background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.25)", color: "#94A3B8", fontSize: 13 }}>
                  Package inquiry: <strong style={{ color: PAGE.blue }}>{packageLabel}</strong>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <FieldLabel>First name *</FieldLabel>
                    <Input placeholder="John" value={form.firstName} onChange={value => setForm(current => ({ ...current, firstName: value }))} required />
                  </div>
                  <div>
                    <FieldLabel>Last name *</FieldLabel>
                    <Input placeholder="Smith" value={form.lastName} onChange={value => setForm(current => ({ ...current, lastName: value }))} required />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <FieldLabel>Email *</FieldLabel>
                    <Input placeholder="john@business.com" type="email" value={form.email} onChange={value => setForm(current => ({ ...current, email: value }))} required />
                  </div>
                  <div>
                    <FieldLabel>Phone *</FieldLabel>
                    <Input placeholder="(555) 555-0100" type="tel" value={form.phone} onChange={value => setForm(current => ({ ...current, phone: value }))} required />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <FieldLabel>Business name *</FieldLabel>
                  <Input placeholder="Your Business LLC" value={form.business} onChange={value => setForm(current => ({ ...current, business: value }))} required />
                </div>

                <div style={{ marginBottom: 22 }}>
                  <FieldLabel>Industry *</FieldLabel>
                  <select
                    value={form.industry}
                    onChange={event => setForm(current => ({ ...current, industry: event.target.value }))}
                    required
                    style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${PAGE.border}`, background: "#090E1A", color: form.industry ? PAGE.white : PAGE.muted, fontSize: 14 }}
                  >
                    <option value="" disabled>Select your industry</option>
                    {INDUSTRIES.map(industry => <option key={industry} value={industry}>{industry}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: 22 }}>
                  <FieldLabel>Services you’re interested in</FieldLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 9 }}>
                    {SERVICES.map(service => {
                      const selected = form.services.includes(service);
                      return (
                        <button
                          key={service}
                          type="button"
                          onClick={() => toggleService(service)}
                          style={{ padding: "7px 11px", borderRadius: 8, cursor: "pointer", border: selected ? "1px solid rgba(0,174,239,0.5)" : `1px solid ${PAGE.border}`, background: selected ? "rgba(0,174,239,0.14)" : "rgba(255,255,255,0.025)", color: selected ? PAGE.blue : "#94A3B8", fontSize: 12.5 }}
                        >
                          {service}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <FieldLabel>Biggest challenge right now</FieldLabel>
                  <textarea
                    value={form.message}
                    onChange={event => setForm(current => ({ ...current, message: event.target.value }))}
                    rows={4}
                    placeholder="Tell us what you want to improve..."
                    style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: `1px solid ${PAGE.border}`, background: "rgba(255,255,255,0.035)", color: PAGE.white, fontFamily: "inherit", fontSize: 14, resize: "vertical" }}
                  />
                </div>

                <div style={{ padding: "13px 15px", marginBottom: 18, borderRadius: 10, border: "1px solid rgba(0,174,239,0.2)", background: "rgba(0,174,239,0.05)" }}>
                  <p style={{ margin: 0, color: "#7C8798", fontSize: 11.5, lineHeight: 1.65 }}>
                    <strong style={{ color: PAGE.silver }}>📱 SMS Consent:</strong>{" "}
                    By submitting this form, you agree to receive text messages from{" "}
                    <strong style={{ color: PAGE.silver }}>AI Edge Solutions</strong> regarding your inquiry, appointment, service updates, and missed-call follow-up. Message frequency varies. Message and data rates may apply. Reply{" "}
                    <strong style={{ color: PAGE.silver }}>STOP</strong> to opt out or{" "}
                    <strong style={{ color: PAGE.silver }}>HELP</strong> for help. SMS opt-in data is not shared with third parties for marketing. See our{" "}
                    <a href="/privacy-policy" style={{ color: PAGE.blue, textDecoration: "underline" }}>Privacy Policy</a> for details.
                  </p>
                </div>

                {submitError && (
                  <div role="alert" style={{ marginBottom: 15, padding: "11px 13px", borderRadius: 9, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#FCA5A5", fontSize: 13, lineHeight: 1.5 }}>
                    Submission failed — {submitError}. Please try again or email us at{" "}
                    <a href="mailto:hello@aiedgesolutions.com" style={{ color: "#F87171" }}>hello@aiedgesolutions.com</a>.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  style={{ width: "100%", padding: "14px", borderRadius: 11, border: 0, background: submitting ? "rgba(0,174,239,0.5)" : PAGE.blue, color: PAGE.white, fontSize: 15, fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.75 : 1 }}
                >
                  {submitting ? "Sending…" : "Send My Request →"}
                </button>
              </form>
            </div>

            <aside style={{ display: "grid", gap: 16 }}>
              <div style={{ background: PAGE.panel, border: `1px solid ${PAGE.border}`, borderRadius: 18, padding: 24 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 16 }}>What happens next</h3>
                {[
                  ["01", "We review the information you submitted."],
                  ["02", "We identify the most relevant AI Edge capabilities for the problem you described."],
                  ["03", "A human follow-up moves the lead through the documented AI Edge sales pipeline."],
                ].map(([number, copy]) => (
                  <div key={number} style={{ display: "flex", gap: 11, marginBottom: 14 }}>
                    <span style={{ color: PAGE.blue, fontSize: 11, fontWeight: 900 }}>{number}</span>
                    <span style={{ color: "#94A3B8", fontSize: 13, lineHeight: 1.55 }}>{copy}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: "rgba(0,174,239,0.05)", border: "1px solid rgba(0,174,239,0.18)", borderRadius: 18, padding: 24 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>What this form does</h3>
                <p style={{ color: "#94A3B8", fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
                  Your submission creates a website lead for AI Edge Solutions. It does not claim a booking is complete and it does not send a fabricated confirmation email.
                </p>
              </div>

              <div style={{ background: PAGE.panel, border: `1px solid ${PAGE.border}`, borderRadius: 18, padding: 24 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Prefer email?</h3>
                <a href="mailto:hello@aiedgesolutions.com" style={{ color: PAGE.blue, fontSize: 13 }}>hello@aiedgesolutions.com</a>
              </div>
            </aside>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 7, color: PAGE.silver, fontSize: 12.5, fontWeight: 700 }}>
      {children}
    </label>
  );
}

function Input({
  placeholder,
  value,
  onChange,
  type = "text",
  required,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={event => onChange(event.target.value)}
      required={required}
      style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 10, border: `1px solid ${PAGE.border}`, background: "rgba(255,255,255,0.035)", color: PAGE.white, fontSize: 14, fontFamily: "inherit" }}
    />
  );
}
