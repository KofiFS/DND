// ── Dice engine ──
// Parses formulas like "d20+5", "2d6+1d4+3", "4d6kh3" (keep highest 3),
// "2d20kl1" (keep lowest 1) and rolls them with crypto-grade randomness.

export const DICE = [4, 6, 8, 10, 12, 20, 100];

export function rollDie(sides) {
  if (sides < 1) return 1;
  const buf = new Uint32Array(1);
  const max = Math.floor(0x100000000 / sides) * sides; // reject bias
  let v;
  do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= max);
  return (v % sides) + 1;
}

// Returns { terms: [{ count, sides, keep, keepHigh, rolls, kept, subtotal } | { constant }], total, error }.
export function parseFormula(text) {
  const src = String(text || "").toLowerCase().replace(/\s+/g, "").replace(/−/g, "-");
  if (!src) return { terms: [], error: "Type a formula like 2d6+3" };
  const terms = [];
  const re = /([+-]?)(?:(\d*)d(\d+)(?:(kh|kl)(\d+))?|(\d+))/gy;
  let m, idx = 0;
  while (idx < src.length) {
    re.lastIndex = idx;
    m = re.exec(src);
    if (!m) return { terms: [], error: `Couldn't read "${src.slice(idx)}"` };
    const sign = m[1] === "-" ? -1 : 1;
    if (m[6] !== undefined) {
      terms.push({ constant: sign * Number(m[6]) });
    } else {
      const count = m[2] === "" ? 1 : Number(m[2]);
      const sides = Number(m[3]);
      if (count < 1 || count > 100) return { terms: [], error: "1 to 100 dice per term" };
      if (sides < 2 || sides > 1000) return { terms: [], error: "Dice need 2 to 1000 sides" };
      const keep = m[5] !== undefined ? Math.min(count, Math.max(1, Number(m[5]))) : null;
      terms.push({ sign, count, sides, keep, keepHigh: m[4] !== "kl" });
    }
    idx = re.lastIndex;
  }
  return { terms, error: null };
}

export function rollFormula(text) {
  const parsed = parseFormula(text);
  if (parsed.error) return parsed;
  let total = 0;
  const terms = parsed.terms.map((t) => {
    if (t.constant !== undefined) { total += t.constant; return t; }
    const rolls = Array.from({ length: t.count }, () => rollDie(t.sides));
    let kept = rolls.map((v, i) => i);
    if (t.keep !== null) {
      kept = rolls.map((v, i) => i).sort((a, b) => (t.keepHigh ? rolls[b] - rolls[a] : rolls[a] - rolls[b])).slice(0, t.keep).sort((a, b) => a - b);
    }
    const subtotal = kept.reduce((n, i) => n + rolls[i], 0) * t.sign;
    total += subtotal;
    return { ...t, rolls, kept, subtotal };
  });
  return { terms, total, error: null };
}

// d20 check with advantage/disadvantage. mode: "normal" | "adv" | "dis".
export function rollCheck(mod, mode = "normal") {
  const a = rollDie(20);
  const b = mode === "normal" ? null : rollDie(20);
  const die = b === null ? a : mode === "adv" ? Math.max(a, b) : Math.min(a, b);
  return { rolls: b === null ? [a] : [a, b], die, mod, total: die + mod, mode, crit: die === 20, fumble: die === 1 };
}

export const fmtSigned = (n) => (n >= 0 ? `+${n}` : `${n}`);

export function formulaText(terms) {
  return terms.map((t, i) => {
    if (t.constant !== undefined) return (t.constant < 0 ? "−" : i ? "+" : "") + Math.abs(t.constant);
    const core = `${t.count}d${t.sides}${t.keep !== null ? (t.keepHigh ? "kh" : "kl") + t.keep : ""}`;
    return (t.sign < 0 ? "−" : i ? "+" : "") + core;
  }).join(" ");
}
