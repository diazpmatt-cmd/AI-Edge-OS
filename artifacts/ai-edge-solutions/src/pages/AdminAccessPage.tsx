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
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    inputRefs[0].current?.focus();
  }, []);

  const handleDigit = (index: number, value: string) => {
    const v = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = v;
    setDigits(next);
    setError(false);

    if (v && index < 3) {
      inputRefs[index + 1].current?.focus();
    }

    if (v && index === 3) {
      checkCode(next.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
    if (e.key === "Enter") {
      const code = digits.join("");
      if (code.length === 4) checkCode(code);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pasted.length === 4) {
      setDigits(pasted.split(""));
      checkCode(pasted);
    }
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
        inputRefs[0].current?.focus();
      }, 600);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "radial-gradient(ellipse at 50% 0%, rgba(0,174,239,0.06) 0%, #030612 55%)",
      padding: 24, position: "relative", overflow: "hidden",
    }}>

      {/* Subtle grid overlay */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.03,
        backgroundImage: "linear-gradient(rgba(0,174,239,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,174,239,1) 1px, transparent 1px)",
        backgroundSize: "60px 60px", pointerEvents: "none",
      }} />

      {/* Corner glow */}
      <div style={{
        position: "absolute", top: -120, left: "50%", transform: "translateX(-50%)",
        width: 400, height: 300,
        background: "radial-gradient(ellipse, rgba(0,174,239,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

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
        <p style={{ fontSize: 13.5, color: "#4B5563", margin: "0 0 36px", lineHeight: 1.5 }}>
          Secure access to AI Edge Command Center.<br />Enter your 4-digit passcode to continue.
        </p>

        {/* Digit inputs */}
        <div
          style={{
            display: "flex", gap: 12, justifyContent: "center", marginBottom: 24,
            animation: shake ? "shake 0.5s ease" : "none",
          }}
          onPaste={handlePaste}
        >
          {digits.map((d, i) => (
            <input
              key={i}
              ref={inputRefs[i]}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              style={{
                width: 58, height: 68,
                textAlign: "center",
                fontSize: 26, fontWeight: 800,
                color: error ? "#EF4444" : "#FFFFFF",
                background: error
                  ? "rgba(239,68,68,0.08)"
                  : d
                    ? "rgba(0,174,239,0.1)"
                    : "rgba(255,255,255,0.04)",
                border: error
                  ? "2px solid rgba(239,68,68,0.5)"
                  : d
                    ? "2px solid rgba(0,174,239,0.5)"
                    : "2px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                outline: "none",
                caretColor: "transparent",
                transition: "all 0.15s",
                WebkitTextSecurity: d ? "disc" as any : "none",
              } as React.CSSProperties}
            />
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
          disabled={digits.join("").length < 4}
          style={{
            width: "100%", padding: "13px",
            borderRadius: 12,
            background: digits.join("").length === 4
              ? "linear-gradient(135deg, #00AEEF, #0077BB)"
              : "rgba(255,255,255,0.05)",
            border: digits.join("").length === 4
              ? "none"
              : "1px solid rgba(255,255,255,0.08)",
            color: digits.join("").length === 4 ? "#FFFFFF" : "#374151",
            fontSize: 14, fontWeight: 700,
            cursor: digits.join("").length === 4 ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            boxShadow: digits.join("").length === 4 ? "0 0 24px rgba(0,174,239,0.3)" : "none",
            letterSpacing: "0.3px",
          }}
          onMouseEnter={e => {
            if (digits.join("").length === 4) {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 36px rgba(0,174,239,0.5)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.boxShadow = digits.join("").length === 4 ? "0 0 24px rgba(0,174,239,0.3)" : "none";
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
