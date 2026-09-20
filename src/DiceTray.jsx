import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import { rollExpr, rollCheck, parseExpr, allDice } from "./dice.js";
import { PALETTE } from "./theme.js";

// ── Dice tray ──
// Lives outside the tab content so it is reachable from every tab. App drives it
// through a ref (rollCheck / rollFor) so tapping a skill, a save or an ability
// rolls it with the right modifier and the right advantage state.

const LOG_KEY = "dnd-dice-log";
const LOG_MAX = 30;
const QUICK = [4, 6, 8, 10, 12, 20, 100];
const MODES = [
  { id: "normal", label: "Normal" },
  { id: "adv", label: "Advantage" },
  { id: "dis", label: "Disadv." },
];

// Keep the tray inside the 480px sheet column on a wide screen.
const COLUMN_RIGHT = "max(14px, calc(50% - 240px + 14px))";

const loadLog = () => {
  try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch { return []; }
};

const DiceTray = forwardRef(function DiceTray({ styles }, ref) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("normal");
  const [count, setCount] = useState(1);
  const [mod, setMod] = useState(0);
  const [custom, setCustom] = useState("");
  const [log, setLog] = useState(loadLog);

  useEffect(() => {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, LOG_MAX))); } catch {}
  }, [log]);

  const push = useCallback((result) => {
    if (!result) return null;
    setLog((l) => [result, ...l].slice(0, LOG_MAX));
    setOpen(true);
    return result;
  }, []);

  // What App calls from the sheet rows.
  useImperativeHandle(ref, () => ({
    rollCheck: (m, label) => push(rollCheck(m, mode, label)),
    rollFor: (expr, label) => push(rollExpr(expr, mode, label)),
    open: () => setOpen(true),
  }), [mode, push]);

  const last = log[0] || null;
  const customValid = custom.trim() === "" || !!parseExpr(custom);

  const rollQuick = (sides) => {
    const m = Number(mod) || 0;
    const expr = `${count}d${sides}${m ? (m > 0 ? `+${m}` : `${m}`) : ""}`;
    push(rollExpr(expr, mode, ""));
  };

  const rollCustom = () => {
    const r = rollExpr(custom, mode, "");
    if (r) push(r);
  };

  const step = (v, set, lo, hi) => () => set((n) => Math.min(hi, Math.max(lo, n + v)));

  // flex-basis 0 + minWidth 0 so the three of them share the row instead of
  // pushing "Disadv." past the panel's gutter on a narrow phone.
  const chip = (active, color = PALETTE.gold) => ({
    fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 1, textTransform: "uppercase",
    borderRadius: 7, cursor: "pointer", padding: "6px 4px", border: `1px solid ${color}`,
    background: active ? `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})` : "rgba(61,26,5,0.08)",
    color: active ? PALETTE.goldLt : PALETTE.darkB,
    flex: "1 1 0", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  });

  const stepBtn = {
    width: 27, height: 27, borderRadius: 6, border: `1px solid ${PALETTE.gold}`,
    background: "rgba(61,26,5,0.08)", color: PALETTE.darkB, cursor: "pointer",
    fontSize: "0.95rem", lineHeight: 1, padding: 0, flexShrink: 0,
  };

  const resultColor = last?.crit ? PALETTE.green : last?.fumble ? PALETTE.rust : "#3d2b0a";

  return (
    <>
      {/* Floating handle */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Dice"
        style={{
          position: "fixed", bottom: 18, right: COLUMN_RIGHT, zIndex: 210,
          width: 54, height: 54, borderRadius: "50%", cursor: "pointer",
          border: `2px solid ${PALETTE.gold}`,
          background: `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})`,
          color: PALETTE.goldLt, fontFamily: "Cinzel,serif", fontSize: "0.72rem",
          letterSpacing: 0.5, boxShadow: "0 3px 14px rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {open ? "✕" : "d20"}
      </button>

      {open ? (
        <>
          <div onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200 }} />
          <div style={{
            position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
            width: "min(100%, 480px)", boxSizing: "border-box", maxHeight: "82vh", overflowY: "auto", zIndex: 205,
            background: PALETTE.parchment, backgroundImage: "linear-gradient(160deg,#f8eedc 0%,#eedfc0 100%)",
            borderTop: `2px solid ${PALETTE.gold}`, borderRadius: "14px 14px 0 0",
            padding: "12px 14px 86px", boxShadow: "0 -6px 24px rgba(0,0,0,0.4)",
          }}>
            <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.58rem", letterSpacing: 3, textTransform: "uppercase", color: PALETTE.rust, borderBottom: "1px solid rgba(201,136,42,0.4)", paddingBottom: 5, marginBottom: 10 }}>
              ❖ Dice
            </div>

            {/* Last result */}
            <div style={{
              ...styles.card, textAlign: "center", padding: "12px 10px",
              border: `1.5px solid ${last?.crit ? PALETTE.green : last?.fumble ? PALETTE.rust : PALETTE.gold}`,
            }}>
              {last ? (
                <>
                  <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.52rem", letterSpacing: 2, color: PALETTE.inkSoft, textTransform: "uppercase" }}>
                    {last.label ? `${last.label} · ` : ""}{last.expr}
                    {last.mode === "adv" ? " · ADV" : last.mode === "dis" ? " · DIS" : ""}
                  </div>
                  <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "2.6rem", lineHeight: 1.1, color: resultColor }}>
                    {last.total}
                  </div>
                  {last.crit || last.fumble ? (
                    <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, color: last.crit ? PALETTE.green : PALETTE.rust }}>
                      {last.crit ? "NATURAL 20" : "NATURAL 1"}
                    </div>
                  ) : null}
                  <div style={{ fontSize: "0.76rem", color: PALETTE.inkSoft, marginTop: 5 }}>
                    {allDice(last).map((d, i) => (
                      <span key={i} style={{ marginRight: 5 }}>
                        <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", color: "#8b5e1a" }}>d{d.sides}</span>{" "}
                        <b style={{ color: "#3d2b0a" }}>{d.v}</b>
                      </span>
                    ))}
                    {last.flat ? <span>{last.flat > 0 ? "+" : "−"}{Math.abs(last.flat)}</span> : null}
                  </div>
                  {last.adv ? (
                    <div style={{ fontSize: "0.72rem", color: PALETTE.inkSoft, marginTop: 3 }}>
                      rolled {last.adv.both.join(" and ")} · kept <b style={{ color: "#3d2b0a" }}>{last.adv.kept}</b>
                    </div>
                  ) : null}
                </>
              ) : (
                <div style={{ color: PALETTE.inkSoft, fontSize: "0.85rem", padding: "10px 0" }}>
                  Tap a die below — or tap any modifier on your sheet to roll it.
                </div>
              )}
            </div>

            {/* Advantage */}
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {MODES.map((m) => (
                <button key={m.id} onClick={() => setMode(m.id)} style={chip(mode === m.id)}>{m.label}</button>
              ))}
            </div>

            {/* Count + modifier */}
            <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
                <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1.5, color: PALETTE.inkSoft, textTransform: "uppercase" }}>How many</span>
                <button style={stepBtn} onClick={step(-1, setCount, 1, 20)}>−</button>
                <b style={{ minWidth: 18, textAlign: "center", color: "#3d2b0a" }}>{count}</b>
                <button style={stepBtn} onClick={step(1, setCount, 1, 20)}>+</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
                <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1.5, color: PALETTE.inkSoft, textTransform: "uppercase" }}>Bonus</span>
                <button style={stepBtn} onClick={step(-1, setMod, -20, 20)}>−</button>
                <b style={{ minWidth: 22, textAlign: "center", color: "#3d2b0a" }}>{mod > 0 ? `+${mod}` : mod}</b>
                <button style={stepBtn} onClick={step(1, setMod, -20, 20)}>+</button>
              </div>
            </div>

            {/* Quick dice */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginTop: 10 }}>
              {QUICK.map((sides) => (
                <button key={sides} onClick={() => rollQuick(sides)}
                  style={{ ...styles.btn, padding: "10px 0", fontSize: "0.7rem" }}>d{sides}</button>
              ))}
              <button onClick={() => { setCount(1); setMod(0); setMode("normal"); }}
                style={{ ...styles.btnGhost, padding: "10px 0", fontSize: "0.58rem" }}>Reset</button>
            </div>

            {/* Custom expression */}
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <input
                value={custom}
                placeholder="2d6+3"
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") rollCustom(); }}
                style={{ ...styles.input, fontSize: "0.9rem", borderColor: customValid ? PALETTE.gold : PALETTE.rust }}
              />
              <button style={styles.btn} onClick={rollCustom} disabled={!custom.trim() || !customValid}>Roll</button>
            </div>
            {!customValid ? (
              <div style={{ color: PALETTE.rust, fontSize: "0.72rem", marginTop: 5 }}>
                Try something like 2d6+3, d20, or 1d8+1d6.
              </div>
            ) : null}

            {/* History */}
            {log.length ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, marginBottom: 6 }}>
                  <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.52rem", letterSpacing: 2, textTransform: "uppercase", color: PALETTE.rust }}>Recent rolls</span>
                  <button style={{ ...styles.smallBtn, padding: "3px 8px" }} onClick={() => setLog([])}>Clear</button>
                </div>
                {log.map((r) => (
                  <div key={r.id} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "5px 2px",
                    borderBottom: "1px solid rgba(139,94,26,0.14)", fontSize: "0.8rem",
                  }}>
                    <b style={{
                      minWidth: 30, textAlign: "right", fontFamily: "'Cinzel Decorative',serif",
                      fontSize: "1rem", color: r.crit ? PALETTE.green : r.fumble ? PALETTE.rust : "#3d2b0a",
                    }}>{r.total}</b>
                    <span style={{ flex: 1, color: PALETTE.ink }}>
                      {r.label ? <span>{r.label} </span> : null}
                      <span style={{ color: PALETTE.inkSoft, fontSize: "0.74rem" }}>
                        {r.expr}{r.mode === "adv" ? " adv" : r.mode === "dis" ? " dis" : ""}
                      </span>
                    </span>
                    <span style={{ color: PALETTE.inkSoft, fontSize: "0.72rem" }}>
                      {allDice(r).map((d) => d.v).join(", ")}
                    </span>
                  </div>
                ))}
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
});

export default DiceTray;
