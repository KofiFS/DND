// ── Dice ──
// Expression parsing and rolling, kept free of React so it can be reasoned
// about (and tested) on its own.

// Uniform in 1..sides. Math.random() is biased once you take a modulo of it and
// is not required to be well distributed, so prefer the crypto RNG and reject
// the tail of the 32-bit range that would skew the result.
function randInt(sides) {
  const g = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto : null;
  if (!g) return Math.floor(Math.random() * sides) + 1;
  const limit = Math.floor(0x100000000 / sides) * sides;
  const buf = new Uint32Array(1);
  let v;
  do { g.getRandomValues(buf); v = buf[0]; } while (v >= limit);
  return (v % sides) + 1;
}

export const MAX_COUNT = 100;
export const MAX_SIDES = 1000;

// "2d6+3", "d20", "1d8+1d6+2", "-1d4+2" → { terms, flat } | null when unparseable.
export function parseExpr(input) {
  const str = String(input ?? "").toLowerCase().replace(/\s+/g, "");
  if (!str) return null;
  const parts = str.match(/[+-]?[^+-]+/g);
  if (!parts) return null;
  const terms = [];
  let flat = 0;
  for (const p of parts) {
    const sign = p.startsWith("-") ? -1 : 1;
    const body = p.replace(/^[+-]/, "");
    const m = /^(\d*)d(\d+)$/.exec(body);
    if (m) {
      const count = m[1] === "" ? 1 : parseInt(m[1], 10);
      const sides = parseInt(m[2], 10);
      if (!count || !sides || count > MAX_COUNT || sides > MAX_SIDES) return null;
      terms.push({ count, sides, sign });
    } else if (/^\d+$/.test(body)) {
      flat += sign * parseInt(body, 10);
    } else {
      return null;
    }
  }
  if (!terms.length && !/\d/.test(str)) return null;
  return { terms, flat };
}

export function formatExpr(terms, flat) {
  let out = terms
    .map((t, i) => `${t.sign < 0 ? "−" : i ? "+" : ""}${t.count}d${t.sides}`)
    .join("");
  if (flat) out += `${flat < 0 ? "−" : "+"}${Math.abs(flat)}`;
  return out || "0";
}

// mode: "normal" | "adv" | "dis". Advantage is a d20 rule, so it only engages
// when the expression has exactly one d20 to apply it to — rolling 8d6 with
// advantage is not a thing, and silently doubling them would be a lie.
export function rollExpr(input, mode = "normal", label = "") {
  const parsed = parseExpr(input);
  if (!parsed) return null;
  const { terms, flat } = parsed;

  const groups = terms.map((t) => ({
    ...t,
    rolls: Array.from({ length: t.count }, () => randInt(t.sides)),
  }));

  let adv = null;
  const d20Idx = groups.findIndex((g) => g.sides === 20 && g.count === 1 && g.sign > 0);
  if (mode !== "normal" && d20Idx >= 0) {
    const g = groups[d20Idx];
    const both = [g.rolls[0], randInt(20)];
    const keepIdx = mode === "adv"
      ? (both[0] >= both[1] ? 0 : 1)
      : (both[0] <= both[1] ? 0 : 1);
    adv = { mode, both, kept: both[keepIdx], dropped: both[1 - keepIdx] };
    g.rolls = [both[keepIdx]];
  }

  const total = groups.reduce((sum, g) => sum + g.sign * g.rolls.reduce((a, b) => a + b, 0), flat);

  // A natural 20/1 only means anything on a single d20 check.
  const nat = d20Idx >= 0 && groups[d20Idx].count === 1 ? groups[d20Idx].rolls[0] : null;

  return {
    id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    label,
    expr: formatExpr(terms, flat),
    mode: adv ? mode : "normal",
    groups, flat, total, adv,
    crit: nat === 20,
    fumble: nat === 1,
    at: Date.now(),
  };
}

// d20 + modifier, the shape every ability check, save and skill roll takes.
export function rollCheck(mod = 0, mode = "normal", label = "") {
  const m = Number(mod) || 0;
  const expr = m === 0 ? "1d20" : `1d20${m > 0 ? "+" : "-"}${Math.abs(m)}`;
  return rollExpr(expr, mode, label);
}

// Every die that was physically rolled, in order, for the "3, 17, 4" readout.
export function allDice(result) {
  return result.groups.flatMap((g) => g.rolls.map((v) => ({ v, sides: g.sides, sign: g.sign })));
}
