import { AppShell } from "@/components/app-shell";

export default function LeadRecoveryPage() {
  return (
    <AppShell>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)",
            borderRadius: 20, padding: "4px 14px", marginBottom: 14,
          }}>
            <span style={{ fontSize: 12, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              📞 Lead Recovery
            </span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.5px", margin: "0 0 8px" }}>
            Lead Recovery AI
          </h1>
          <p style={{ fontSize: 15, color: "#6B7280", margin: 0 }}>
            Manage missed call follow-ups, SMS automations, and lead capture sequences.
          </p>
        </div>

        <div style={{
          background: "rgba(0,174,239,0.05)", border: "1px solid rgba(0,174,239,0.15)",
          borderRadius: 14, padding: 40, textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📞</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#FFFFFF", margin: "0 0 10px" }}>
            Coming Soon
          </h2>
          <p style={{ fontSize: 14, color: "#6B7280", maxWidth: 420, margin: "0 auto", lineHeight: 1.7 }}>
            Lead Recovery AI integration is being configured. This will show your missed call queue,
            SMS follow-up status, and conversion tracking from your AI receptionist.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
