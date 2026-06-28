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
    const returnTo = params.get("returnTo") ?? "";

    if (window.opener) {
      // Opened as a popup — notify parent and close.
      try {
        window.opener.postMessage(
          oauthError
            ? { type: "oauth_error", provider, reason: oauthError, step }
            : { type: "oauth_success", provider: connected || provider, returnTo },
          "*"
        );
      } catch { /* cross-origin opener — message may not arrive, parent polls anyway */ }
      window.close();
    } else {
      // Opened via top-level navigation (not a popup) — redirect appropriately.
      let dest: string;
      if (oauthError) {
        dest = `/admin/connections?oauth_error=${encodeURIComponent(oauthError)}&step=${encodeURIComponent(step)}&provider=${provider}`;
      } else if (returnTo === "publishing") {
        dest = `/admin/social-publishing?connected=${connected}&status=success`;
      } else {
        dest = `/admin/connections?connected=${connected}`;
      }
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
