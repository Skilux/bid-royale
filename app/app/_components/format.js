/** Amount with up to 4 decimals and no trailing zeros: 7, 1.75, 0.375, 10.875. */
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
