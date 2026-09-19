import { useState, useEffect } from "react";

// ── Password gate ──
// The sheet is a static site, so this is a client-side lock: it keeps casual
// visitors out, it is not real security (anyone can read the built JS).
// Only a SHA-256 hash of the password lives here — never the password itself.
const PASS_HASH = "f5fa37965d3dc36ba38c6c08ba60350b22c94c281b34aa62265688744ab87357";
const UNLOCK_KEY = "dnd-sheet-unlocked";

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function Gate({ children }) {
  const [unlocked, setUnlocked] = useState(() => {
    try { return localStorage.getItem(UNLOCK_KEY) === PASS_HASH; } catch { return false; }
  });
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Expose a tiny escape hatch: run `dndLock()` in the console to re-lock.
    window.dndLock = () => { try { localStorage.removeItem(UNLOCK_KEY); } catch {} setUnlocked(false); };
  }, []);

  if (unlocked) return children;

  const submit = async (e) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true); setErr("");
    try {
      const h = await sha256(pw.trim());
      if (h === PASS_HASH) {
        try { localStorage.setItem(UNLOCK_KEY, h); } catch {}
        setUnlocked(true);
      } else {
        setErr("That’s not it.");
        setPw("");
      }
    } catch {
      setErr("Your browser blocked the check (needs https or localhost).");
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      background: "#0f0804", backgroundImage: "radial-gradient(ellipse at top,#1a0a02 0%,#0a0402 100%)", fontFamily: "'Crimson Text',Georgia,serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@400;700&family=Crimson+Text:wght@400;600&display=swap" rel="stylesheet" />
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 340, background: "#f5ead6", backgroundImage: "linear-gradient(160deg,#f8eedc 0%,#eedfc0 100%)",
        border: "2px solid #c9882a", borderRadius: 14, padding: "22px 20px", boxShadow: "0 10px 40px rgba(0,0,0,0.5)", textAlign: "center" }}>
        <div style={{ fontSize: "2rem", lineHeight: 1 }}>🔒</div>
        <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.15rem", color: "#7a1c1c", margin: "8px 0 2px" }}>Sealed Grimoire</div>
        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.6rem", letterSpacing: 2, color: "#5c4422", textTransform: "uppercase", marginBottom: 16 }}>Speak the password</div>
        <input autoFocus type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" autoComplete="current-password"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(201,136,42,0.12)", border: "1px solid #c9882a", borderRadius: 8,
            color: "#2a1a0c", fontFamily: "inherit", fontSize: "1rem", padding: "9px 12px", textAlign: "center" }} />
        <button type="submit" disabled={busy} style={{ marginTop: 12, width: "100%", fontFamily: "Cinzel,serif", fontSize: "0.65rem", letterSpacing: 1.5, textTransform: "uppercase",
          background: "linear-gradient(135deg,#3d1a05,#5c2b0a)", border: "1px solid #c9882a", borderRadius: 8, color: "#e8b84b", padding: "10px 14px", cursor: "pointer" }}>
          {busy ? "…" : "Unlock"}
        </button>
        <div style={{ minHeight: 18, marginTop: 8, fontSize: "0.78rem", color: "#7a1c1c" }}>{err}</div>
      </form>
    </div>
  );
}
