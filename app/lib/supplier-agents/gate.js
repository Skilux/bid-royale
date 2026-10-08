const round = (n) => Math.round(n * 1e6) / 1e6;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * D12 decision rule (docs/agents/personas.md). Computed in code, never by the LLM.
 * `reference` is R, the reference price per promised signup.
 */
export function estimateWinChance({ price, impressions, promisedPer1000 }, { persona, tender, reference }) {
  const pricePerSignup = price / ((impressions / 1000) * promisedPer1000);
  const winChance = clamp(2 - pricePerSignup / reference, 0, 1);
  const margin = price - (persona.costPer1000 * impressions) / 1000;
  const ev = winChance * margin - tender.bidFee;
  return {
    pricePerSignup: round(pricePerSignup),
    winChance: round(winChance),
    margin: round(margin),
    ev: round(ev),
    passed: ev > 0 && margin >= persona.minMargin,
  };
}
