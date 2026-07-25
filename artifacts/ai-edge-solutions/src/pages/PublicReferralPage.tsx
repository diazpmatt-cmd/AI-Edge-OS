import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { apiFetch } from "@/lib/api";

interface PublicProgram {
  businessName: string;
  name: string;
  description: string | null;
  rewardType: string;
  rewardValue: string;
  promoMessage: string | null;
  referralCode: string;
}

const emptyForm = {
  referrerName: "",
  referrerEmail: "",
  referrerPhone: "",
  referredName: "",
  referredEmail: "",
  referredPhone: "",
  notes: "",
  website: "",
};

export default function PublicReferralPage() {
  const { code = "" } = useParams<{ code: string }>();
  const [program, setProgram] = useState<PublicProgram | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<PublicProgram>(`/referrals/public/${encodeURIComponent(code)}`)
      .then(result => {
        if (active) setProgram(result);
      })
      .catch(() => {
        if (active) setError("This referral program is unavailable or has ended.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [code]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.referrerEmail.trim() && !form.referrerPhone.trim()) {
      setError("Please provide your email address or phone number.");
      return;
    }
    if (!form.referredEmail.trim() && !form.referredPhone.trim()) {
      setError("Please provide the referred customer's email address or phone number.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiFetch(`/referrals/public/${encodeURIComponent(code)}`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSubmitted(true);
      setForm(emptyForm);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("self_referral_not_allowed")) {
        setError("The referrer and referred customer must be different people.");
      } else if (message.includes("referral_already_submitted")) {
        setError("This referral has already been submitted.");
      } else {
        setError("We could not submit the referral. Please review the information and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    borderRadius: 9,
    border: "1px solid rgba(148,163,184,0.25)",
    background: "#0B1629",
    color: "#E2E8F0",
    fontSize: 14,
    outline: "none",
  };

  const field = (
    label: string,
    key: keyof typeof emptyForm,
    options: { type?: string; required?: boolean; placeholder?: string } = {},
  ) => (
    <label style={{ display: "grid", gap: 5, fontSize: 12, color: "#94A3B8" }}>
      <span>{label}{options.required ? " *" : ""}</span>
      <input
        type={options.type ?? "text"}
        required={options.required}
        value={form[key]}
        placeholder={options.placeholder}
        onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))}
        style={inputStyle}
      />
    </label>
  );

  return (
    <main style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, #102542 0, #030612 52%)",
      color: "#E2E8F0",
      padding: "32px 16px",
    }}>
      <div style={{ width: "100%", maxWidth: 680, margin: "0 auto" }}>
        <section style={{
          border: "1px solid rgba(34,197,94,0.22)",
          borderRadius: 18,
          background: "rgba(8,18,33,0.94)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}>
          <header style={{
            padding: "24px 28px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            background: "linear-gradient(135deg, rgba(34,197,94,0.13), rgba(56,189,248,0.05))",
          }}>
            <div style={{ color: "#22C55E", fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>
              CUSTOMER REFERRAL
            </div>
            <h1 style={{ margin: "8px 0 4px", fontSize: 27, lineHeight: 1.1 }}>
              {program?.businessName ?? "Referral Program"}
            </h1>
            <p style={{ margin: 0, color: "#94A3B8", fontSize: 14 }}>
              {loading ? "Loading referral details…" : program?.name ?? "Program unavailable"}
            </p>
          </header>

          <div style={{ padding: "26px 28px 30px" }}>
            {loading && <p style={{ color: "#94A3B8" }}>Loading…</p>}

            {!loading && program && !submitted && (
              <>
                {(program.description || program.promoMessage) && (
                  <div style={{
                    padding: 14,
                    marginBottom: 22,
                    borderRadius: 11,
                    background: "rgba(34,197,94,0.06)",
                    border: "1px solid rgba(34,197,94,0.14)",
                    color: "#CBD5E1",
                    lineHeight: 1.5,
                    fontSize: 13,
                  }}>
                    {program.promoMessage || program.description}
                  </div>
                )}

                <form onSubmit={submit} style={{ display: "grid", gap: 20 }}>
                  <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 12 }}>
                    <legend style={{ fontWeight: 800, marginBottom: 10 }}>Your information</legend>
                    {field("Your name", "referrerName", { required: true })}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                      {field("Your email", "referrerEmail", { type: "email", placeholder: "you@example.com" })}
                      {field("Your phone", "referrerPhone", { type: "tel", placeholder: "(251) 555-0123" })}
                    </div>
                  </fieldset>

                  <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 12 }}>
                    <legend style={{ fontWeight: 800, marginBottom: 10 }}>Who are you referring?</legend>
                    {field("Customer name", "referredName", { required: true })}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                      {field("Customer email", "referredEmail", { type: "email" })}
                      {field("Customer phone", "referredPhone", { type: "tel" })}
                    </div>
                  </fieldset>

                  <label aria-hidden="true" style={{ position: "absolute", left: "-10000px" }}>
                    Website
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.website}
                      onChange={event => setForm(current => ({ ...current, website: event.target.value }))}
                    />
                  </label>

                  {error && (
                    <div role="alert" style={{
                      padding: 11,
                      borderRadius: 9,
                      color: "#FCA5A5",
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      fontSize: 13,
                    }}>{error}</div>
                  )}

                  <p style={{ margin: 0, color: "#64748B", fontSize: 11, lineHeight: 1.5 }}>
                    Provide an email address or phone number for both people. By submitting, you confirm you have permission to share this information.
                  </p>

                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      padding: "12px 18px",
                      borderRadius: 10,
                      border: "1px solid rgba(34,197,94,0.45)",
                      background: submitting ? "rgba(34,197,94,0.08)" : "rgba(34,197,94,0.18)",
                      color: "#4ADE80",
                      fontWeight: 800,
                      fontSize: 14,
                      cursor: submitting ? "wait" : "pointer",
                    }}
                  >
                    {submitting ? "Submitting…" : "Submit Referral"}
                  </button>
                </form>
              </>
            )}

            {!loading && submitted && (
              <div style={{ textAlign: "center", padding: "28px 0" }}>
                <div style={{ fontSize: 42 }}>✓</div>
                <h2 style={{ margin: "10px 0 6px", color: "#4ADE80" }}>Referral received</h2>
                <p style={{ color: "#94A3B8", lineHeight: 1.5 }}>
                  Thank you. {program?.businessName} can now follow up with the referred customer.
                </p>
              </div>
            )}

            {!loading && !program && (
              <div style={{ textAlign: "center", padding: "28px 0" }}>
                <div style={{ fontSize: 38 }}>⌛</div>
                <h2>This referral program is unavailable</h2>
                <p style={{ color: "#94A3B8" }}>{error}</p>
              </div>
            )}
          </div>
        </section>

        <footer style={{ textAlign: "center", marginTop: 18, fontSize: 11, color: "#64748B" }}>
          <Link href="/privacy">Privacy</Link>
          <span> · </span>
          <Link href="/terms">Terms</Link>
        </footer>
      </div>
    </main>
  );
}
