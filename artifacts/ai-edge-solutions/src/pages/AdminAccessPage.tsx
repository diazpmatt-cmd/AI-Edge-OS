import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";

const logoSrc = `${import.meta.env.BASE_URL}logo-transparent.png`;

// Temporarily hardcoded for testing — replace with env var once confirmed working
const ADMIN_ACCESS_CODE = "1661";

export default function AdminAccessPage() {
  const [, navigate] = useLocation();
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    hiddenInputRef.current?.focus();
  }, []);

  const focusInput = () => {
    hiddenInputRef.current?.focus();
  };

  const checkCode = (code: string) => {
    const entered = code.trim();
    const expected = ADMIN_ACCESS_CODE.trim();
    const match = entered === expected;
    console.log("[AdminAccess] entered:", entered);
    console.log("[AdminAccess] expected:", expected);
    console.log("[AdminAccess] match:", match);

    if (match) {
      navigate("/admin/login");
    } else {
      setError(true);
      setShake(true);
      setDigits(["", "", "", ""]);
      setTimeout(() => {
        setShake(false);
        hiddenInputRef.current?.focus();
      }, 600);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const current = digits.join("");

    if (e.key === "Backspace") {
      e.preventDefault();
      const next = current.slice(0, -1).split("").concat(["", "", "", ""]).slice(0, 4);
      setDigits(next);
      setError(false);
      return;
    }

    if (e.key === "Enter") {
      if (current.length === 4) checkCode(current);
      return;
    }

    if (/^\d$/.test(e.key) && current.length < 4) {
      e.preventDefault();
      const next = [...digits];
      const idx = digits.findIndex(d => d === "");
      if (idx !== -1) {
        next[idx] = e.key;
        setDigits(next);
        setError(false);
        const newCode = next.join("");
        if (newCode.replace(/\s/g, "").length === 4) {
          checkCode(newCode);
        }
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pasted.length === 4) {
      setDigits(pasted.split(""));
      setError(false);
      checkCode(pasted);
    }
  };

  const filled = digits.filter(d => d !== "").length;

  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 0%, rgba(0,174,239,0.06) 0%, #030612 55%)",
        padding: 24, position: "relative", overflow: "hidden",
      }}
      onClick={focusInput}
    >

      {/* Subtle grid overlay */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.03,
        backgroundImage: "linear-gradient(rgba(0,174,239,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,174,239,1) 1px, transparent 1px)",
        backgroundSize: "60px 60px", pointerEvents: "none",
      }} />

      {/* Top glow */}
      <div style={{
        position: "absolute", top: -120, left: "50%", transform: "translateX(-50%)",
        width: 400, height: 300,
        background: "radial-gradient(ellipse, rgba(0,174,239,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Hidden real input — captures all keyboard input */}
      <input
        ref={hiddenInputRef}
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onChange={() => {}}
        value=""
        style={{
          position: "absolute",
          opacity: 0,
          width: 1,
          height: 1,
          pointerEvents: "none",
          top: "50%",
          left: "50%",
        }}
      />

      {/* Card */}
      <div style={{
        position: "relative", zIndex: 1,
        width: "100%", maxWidth: 380,
        background: "linear-gradient(160deg, rgba(11,22,41,0.95) 0%, rgba(3,6,18,0.98) 100%)",
        border: "1px solid rgba(0,174,239,0.18)",
        borderRadius: 20,
        padding: "44px 36px 36px",
        boxShadow: "0 0 60px rgba(0,174,239,0.07), 0 24px 80px rgba(0,0,0,0.5)",
        textAlign: "center",
      }}>

        {/* Logo */}
        <img
          src={logoSrc}
          alt="AI Edge Solutions"
          style={{ height: 54, width: "auto", objectFit: "contain", marginBottom: 10 }}
        />

        {/* Label */}
        <div style={{
          fontSize: 10, fontWeight: 800, color: "#00AEEF",
          letterSpacing: "2px", textTransform: "uppercase", marginBottom: 20, opacity: 0.9,
        }}>
          ⬡ Admin Access
        </div>

        <h1 style={{
          fontSize: 22, fontWeight: 800, color: "#FFFFFF",
          letterSpacing: "-0.5px", margin: "0 0 8px",
        }}>
          Command Center
        </h1>
        <p style={{ fontSize: 13.5, color: "#4B5563", margin: "0 0 32px", lineHeight: 1.5 }}>
          Secure access to AI Edge Command Center.<br />Enter your 4-digit passcode to continue.
        </p>

        {/* Visual digit boxes — click anywhere here to activate input */}
        <div
          onClick={focusInput}
          style={{
            display: "flex", gap: 12, justifyContent: "center", marginBottom: 24,
            cursor: "text",
            animation: shake ? "shake 0.5s ease" : "none",
          }}
        >
          {digits.map((d, i) => (
            <div
              key={i}
              onClick={focusInput}
              style={{
                width: 58, height: 68,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, fontWeight: 800,
                color: error ? "#EF4444" : "#FFFFFF",
                background: error
                  ? "rgba(239,68,68,0.08)"
                  : d
                    ? "rgba(0,174,239,0.1)"
                    : "rgba(255,255,255,0.04)",
                border: error
                  ? "2px solid rgba(239,68,68,0.5)"
                  : i === filled && !error
                    ? "2px solid rgba(0,174,239,0.7)"
                    : d
                      ? "2px solid rgba(0,174,239,0.5)"
                      : "2px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                transition: "all 0.15s",
                boxShadow: i === filled && !error ? "0 0 12px rgba(0,174,239,0.2)" : "none",
                userSelect: "none",
              }}
            >
              {d ? "●" : ""}
            </div>
          ))}
        </div>

        {/* Error message */}
        <div style={{
          height: 20, marginBottom: 20,
          fontSize: 13, fontWeight: 600, color: "#EF4444",
          opacity: error ? 1 : 0, transition: "opacity 0.2s",
        }}>
          Invalid code. Please try again.
        </div>

        {/* Submit button */}
        <button
          onClick={() => {
            const code = digits.join("");
            if (code.length === 4) checkCode(code);
          }}
          disabled={filled < 4}
          style={{
            width: "100%", padding: "13px",
            borderRadius: 12,
            background: filled === 4
              ? "linear-gradient(135deg, #00AEEF, #0077BB)"
              : "rgba(255,255,255,0.05)",
            border: filled === 4 ? "none" : "1px solid rgba(255,255,255,0.08)",
            color: filled === 4 ? "#FFFFFF" : "#374151",
            fontSize: 14, fontWeight: 700,
            cursor: filled === 4 ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            boxShadow: filled === 4 ? "0 0 24px rgba(0,174,239,0.3)" : "none",
            letterSpacing: "0.3px",
          }}
          onMouseEnter={e => {
            if (filled === 4) {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 36px rgba(0,174,239,0.5)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.boxShadow = filled === 4 ? "0 0 24px rgba(0,174,239,0.3)" : "none";
            (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
          }}
        >
          Access Command Center →
        </button>

        {/* Back link */}
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <a
            href="/"
            style={{ fontSize: 12, color: "#374151", textDecoration: "none", transition: "color 0.2s" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#6B7280"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#374151"}
          >
            ← Back to AI Edge Solutions
          </a>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
          90% { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}
