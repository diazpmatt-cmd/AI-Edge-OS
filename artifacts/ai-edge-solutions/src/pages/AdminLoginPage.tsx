import { SignIn } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const logoSrc = `${import.meta.env.BASE_URL}logo-transparent.png`;

export default function AdminLoginPage() {
  return (
    <div style={{
      display: "flex", minHeight: "100vh", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, #060E1E 0%, #030612 60%, #060E1E 100%)",
      padding: 16,
    }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <img
          src={logoSrc}
          alt="AI Edge Solutions"
          style={{ height: 52, width: "auto", objectFit: "contain", marginBottom: 12 }}
        />
        <div style={{
          fontSize: 11, color: "#00AEEF", fontWeight: 700,
          letterSpacing: "1.2px", textTransform: "uppercase", opacity: 0.9,
        }}>
          Command Edge Center
        </div>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>
          Sign in to access your AI growth dashboard.
        </p>
      </div>

      <SignIn
        routing="path"
        path={`${basePath}/admin/login`}
        fallbackRedirectUrl={`${basePath}/admin/dashboard`}
        signUpUrl={undefined}
        appearance={{
          elements: {
            rootBox: { width: "100%", maxWidth: 420 },
            card: { background: "#0B1629", border: "1px solid rgba(0,174,239,0.15)", borderRadius: 14, boxShadow: "0 0 40px rgba(0,174,239,0.07)" },
            headerTitle: { display: "none" },
            headerSubtitle: { display: "none" },
            header: { display: "none" },
            socialButtonsBlockButton: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#FFFFFF" },
            dividerText: { color: "#475569" },
            dividerLine: { background: "rgba(255,255,255,0.07)" },
            formFieldInput: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#FFFFFF" },
            formFieldLabel: { color: "#9CA3AF" },
            formButtonPrimary: { background: "#00AEEF", color: "#FFFFFF" },
            footerActionText: { color: "#475569" },
            footerActionLink: { color: "#00AEEF" },
            identityPreviewText: { color: "#FFFFFF" },
            identityPreviewEditButton: { color: "#00AEEF" },
          },
        }}
      />

      <div style={{ marginTop: 24, textAlign: "center" }}>
        <a
          href="/"
          style={{ fontSize: 12, color: "#475569", textDecoration: "none" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#00AEEF")}
          onMouseLeave={e => (e.currentTarget.style.color = "#475569")}
        >
          ← Back to AI Edge Solutions website
        </a>
      </div>
    </div>
  );
}
