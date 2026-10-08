// Browser-safe. Pure functions over parsed evidence items; no node: imports.

const AWARD_ACTIONS = ["award_release", "award_reclaim"];

/**
 * Where a supplier's on-chain result hash can be looked up. Reads the `ledger` item's rows.
 *
 * `hashItem` says which evidence item holds the hash the Board submits as the award's result:
 * the delivery result item once the supplier posted a report (#51), else the verdict item.
 * Money is only REAL with a transaction hash that is not a `sim_` placeholder. PENDING never counts as moved.
 *
 * @param {{rows?: object[]} | null} ledger  parsed `ledger` item
 * @param {string} supplier
 * @param {{hasReport?: boolean}} [opts]
 * @returns {{hashItem: string, fallback: boolean, badge: "REAL" | "PENDING" | "SIMULATED", txHash: string | null, explorerUrl: string | null}}
 */
export function chainLink(ledger, supplier, { hasReport = false } = {}) {
  const row = (ledger?.rows ?? []).find((r) => r.phase === "settlement" && r.supplier === supplier && AWARD_ACTIONS.includes(r.action));
  const real =
    row?.badge === "REAL" &&
    typeof row.txHash === "string" &&
    !row.txHash.startsWith("sim_") &&
    typeof row.explorerUrl === "string" &&
    /^https:\/\//.test(row.explorerUrl);
  let badge = "SIMULATED";
  if (real) badge = "REAL";
  else if (row?.badge === "PENDING") badge = "PENDING";
  return {
    hashItem: hasReport ? `result.${supplier}` : `verdict.${supplier}`,
    fallback: !hasReport,
    badge,
    txHash: real ? row.txHash : null,
    explorerUrl: real ? row.explorerUrl : null,
  };
}
