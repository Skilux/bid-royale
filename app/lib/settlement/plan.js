/**
 * @typedef {"pass" | "short_of_promise" | "under_gate"} VerdictKind
 *
 * @typedef {Object} Verdict
 * @property {string} supplier        supplier id, e.g. "techblog"
 * @property {VerdictKind} kind
 * @property {number} delivered       verified conversion, signups per 1,000 impressions (8 = 0.8%)
 * @property {number} promised        promised conversion, signups per 1,000 impressions
 * @property {number} gate            5 for the demo, a 0.5% conversion
 * @property {number} award           winning bid price, tADA
 * @property {number} bond            25% of award, tADA
 * @property {string} [hash]          hash of the signed verdict (decision log)
 * @property {string} [signature]     Board signature over the verdict
 *
 * @typedef {"award" | "bond"} EscrowKind
 *
 * @typedef {Object} Transfer
 * @property {"award_release" | "award_reclaim" | "bond_return" | "bond_forfeit"} reason
 * @property {"consumer" | "board" | string} from
 * @property {"consumer" | "board" | string} to
 * @property {number} amount
 * @property {"escrow" | "plain_transfer"} via
 */

const round = (n) => Math.round(n * 1e6) / 1e6;

export function classify({ delivered, promised, gate }) {
  if (delivered >= promised) return "pass";
  if (delivered >= gate) return "short_of_promise";
  return "under_gate";
}

export function bondFor(award, rate = 0.25) {
  return round(award * rate);
}

export function forfeitFor({ kind, bond, promised, delivered }) {
  if (kind === "pass") return 0;
  if (kind === "under_gate") return bond;
  return round((bond * (promised - delivered)) / promised);
}

/** @param {Verdict} verdict @returns {Transfer[]} */
export function planSettlement(verdict) {
  const { supplier, kind, award, bond, promised, delivered } = verdict;
  const forfeit = forfeitFor({ kind, bond, promised, delivered });
  const returned = round(bond - forfeit);

  if (kind === "under_gate") {
    return [
      { reason: "award_reclaim", from: supplier, to: "consumer", amount: award, via: "escrow" },
      { reason: "bond_forfeit", from: "board", to: "consumer", amount: forfeit, via: "plain_transfer" },
    ];
  }

  const transfers = [
    { reason: "award_release", from: "consumer", to: supplier, amount: award, via: "escrow" },
    {
      reason: "bond_return",
      from: "board",
      to: supplier,
      amount: returned,
      via: kind === "pass" ? "escrow" : "plain_transfer",
    },
  ];
  if (forfeit > 0) {
    transfers.push({ reason: "bond_forfeit", from: "board", to: "consumer", amount: forfeit, via: "plain_transfer" });
  }
  return transfers;
}

/** @param {Verdict[]} verdicts */
export function consumerNet(verdicts) {
  let net = 0;
  let signups = 0;
  for (const v of verdicts) {
    net -= v.award;
    for (const t of planSettlement(v)) {
      if (t.to === "consumer") net += t.amount;
    }
    if (v.kind !== "under_gate") signups += v.delivered;
  }
  return { net: round(net), signups };
}
