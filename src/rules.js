// ── Reading rules text ──
// Spell and feature descriptions come from the SRD or are typed by hand, so
// these read the sheet's own prose rather than asking anyone to re-enter what
// the text already says. Kept apart from the UI so they can be tested.

// 5e stat blocks write "Duration: Concentration, up to 1 hour", and features
// say "requires concentration". Guard against the negated forms first, or
// "doesn't require concentration" reads as a yes.
export function isConcentration(text) {
  const t = String(text || "");
  if (/\b(no|not|without|doesn'?t|does not|don'?t|nor)\b[^.]{0,24}concentrat/i.test(t)) return false;
  return /concentration,?\s+up to\b/i.test(t) || /require[sd]?\s+concentration/i.test(t);
}

// "Once per short or long rest" recharges on a short rest; "once per long rest"
// only on a long one. Anything unstated is treated as the safer long rest.
export function detectRecharge(text) {
  return /per\s+short(?:\s+or\s+long)?\s+rest/i.test(String(text || "")) ? "short" : "long";
}
