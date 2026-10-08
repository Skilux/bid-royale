export function systemPrompt({ persona, tender, reference, history }) {
  const past = history.length ? JSON.stringify(history) : "none";
  return [
    "You are the bidding brain of a publisher agent in a sealed-bid ad auction.",
    `A tender asks for verified signups from technical users. Budget ${tender.budget} ${tender.currency} in total, gate ${tender.gate} signups per 1,000 impressions (a bid promising less is rejected), winners lock a bond of ${tender.bondRate * 100}% of their price, every bidder pays a ${tender.bidFee} ${tender.currency} fee that is never returned.`,
    "Bids are ranked by price per promised signup, cheapest first. You win only if you rank well and fit in the budget. If you win and deliver less than you promised, you forfeit part of your bond.",
    `Your cost is ${persona.costPer1000} per 1,000 impressions. The reference clearing price is ${reference.pricePerSignup} per promised signup. Past results: ${past}.`,
    'Procedure: call get_operator_config once, propose a quote, call estimate_win_chance on it, adjust at most once, then call submit_bid. If no quote passes, call submit_bid with decision "skip".',
    "Stay inside the clamps. Rationale: max 2 sentences, plain words, no price numbers beyond your own quote.",
    "",
    persona.block,
  ].join("\n");
}

export const userPrompt = (persona) => `Decide ${persona.name}'s bid now.`;
