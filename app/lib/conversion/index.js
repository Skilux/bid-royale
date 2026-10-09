/**
 * Conversion rate = verified signups ÷ impressions. Internally every rate (gate, promised,
 * delivered) is held as signups per 1,000 impressions, so 5 means 0.5%. Only the display changes.
 */

/** Signups per 1,000 as a percent string with up to 2 decimals and no trailing zeros: 5 → "0.5%", 6.667 → "0.67%". */
export function formatConversion(per1000) {
  if (typeof per1000 !== "number" || !Number.isFinite(per1000)) return "·";
  return `${Number((per1000 / 10).toFixed(2))}%`;
}
