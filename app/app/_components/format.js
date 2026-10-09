/** Amount with up to 4 decimals and no trailing zeros: 70, 17.5, 3.75, 108.75. */
export function formatAmount(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "·";
  return String(Number(n.toFixed(4)));
}

/** Fixed two decimals, for counters that animate to a total. */
export function formatFixed(n) {
  return n.toFixed(2);
}

/** HH:MM:SS in UTC from an ISO timestamp, or an empty string. Same on server and client. */
export function formatClock(iso) {
  const d = new Date(iso ?? "");
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(11, 19);
}

/** An amount capped at `dp` decimals. `fixed` keeps the zeros: 63 becomes "63.00", 11.785714 becomes "11.79". */
export function formatMoney(n, { dp = 4, fixed = false } = {}) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "·";
  const v = n.toFixed(dp);
  return fixed ? v : String(Number(v));
}
