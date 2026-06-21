import { useEffect } from "react";
import { useSearch } from "wouter";

export default function OAuthClosePage() {
  const search = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const connected = params.get("connected") ?? "";
    const oauthError = params.get("oauth_error") ?? "";
    const step = params.get("step") ?? "";
    const provider = params.get("provider") ?? connected;

    if (window.opener) {
      // Opened as a popup — notify parent and close.
      try {
        window.opener.postMessage(
          oauthError
            ? { type: "oauth_error", provider, reason: oauthError, step }
            : { type: "oauth_success", provider: connected || provider },
          "*"
        );
      } catch { /* cross-origin opener — message may not arrive, parent polls anyway */ }
      window.close();
    } else {
      // Opened via top-level navigation (not a popup) — redirect to connections.
      const dest = oauthError
        ? `/admin/connections?oauth_error=${encodeURIComponent(oauthError)}&step=${encodeURIComponent(step)}&provider=${provider}`
        : `/admin/connections?connected=${connected}`;
      window.location.replace(dest);
    }
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", background: "#030612", color: "#C0C0C0",
      fontFamily: "system-ui, sans-serif", flexDirection: "column", gap: 12,
    }}>
      <div style={{ fontSize: 32 }}>✅</div>
      <div style={{ fontSize: 16, color: "#fff" }}>Connected!</div>
      <div style={{ fontSize: 13 }}>Closing window…</div>
    </div>
  );
}
