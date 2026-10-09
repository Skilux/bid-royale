import { formatConversion } from "../conversion/index.js";

const round = (n) => Math.round(n * 1e6) / 1e6;
const pct = (per1000) => formatConversion(per1000).replace("%", "");
const fmt = (n) => (Number.isFinite(n) ? n.toFixed(2) : "·");

/**
 * "Who ended up with what" (#66 D6): one row per supplier with a verdict, plus Lost bid rows once a verdict landed.
 * Each row is a signed sum ending in the net, from the supplier's side. Only moved rows count in `net`: a PENDING
 * part is listed with `pending: true` and left out, the same rule as the ledger. Reads a `buildDashboardView` result.
 */
export function supplierBalances(view) {
  if (!view.suppliers.some((s) => s.verdict)) return [];
  return view.suppliers.filter((s) => s.verdict || s.lost).map((s) => balanceOf(s, view.gate));
}

function balanceOf(s, gate) {
  const [awardCell, bondCell] = s.cells ?? [];
  const outcome = (cell, action) => cell?.outcomes.find((o) => o.action === action) ?? null;
  const bondLock = bondCell?.lock ?? null;
  const rows = {
    fee: s.fee,
    bond: bondLock,
    award: outcome(awardCell, "award_release"),
    awardToConsumer: outcome(awardCell, "award_reclaim"),
    bondBack: outcome(bondCell, "bond_return"),
    bondForfeit: outcome(bondCell, "bond_forfeit"),
  };
  // Signed parts in reading order. awardToConsumer never reaches the supplier, so it carries no sign and no count.
  const parts = [
    rows.fee && { key: "fee", label: "fee", sign: -1, row: rows.fee },
    rows.bond && { key: "bond", label: "bond", sign: -1, row: rows.bond },
    rows.award && { key: "award", label: "award", sign: 1, row: rows.award },
    rows.awardToConsumer && { key: "awardToConsumer", label: "award → NeoRack", sign: 0, row: rows.awardToConsumer },
    rows.bondBack && { key: "bondBack", label: "back", sign: 1, row: rows.bondBack },
  ]
    .filter(Boolean)
    .map((p) => ({ ...p, amount: p.row.amount, pending: Boolean(p.row.pending) }));
  const net = round(parts.reduce((t, p) => t + (p.pending ? 0 : p.sign * p.amount), 0));

  const bondTotal = bondLock?.amount ?? 0;
  const back = rows.bondBack && !rows.bondBack.pending ? rows.bondBack.amount : 0;
  const lost = rows.bondForfeit && !rows.bondForfeit.pending ? rows.bondForfeit.amount : 0;
  const kind = s.verdict?.kind ?? "lost_bid";
  const formula =
    kind === "short_of_promise" && bondTotal > 0 && s.promised > 0 && s.delivered !== null
      ? `${fmt(bondTotal)} × (${pct(s.promised)} − ${pct(s.delivered)}) ÷ ${pct(s.promised)} = ${fmt(rows.bondForfeit?.amount ?? (bondTotal * (s.promised - s.delivered)) / s.promised)}`
      : null;

  return {
    id: s.id,
    name: s.name,
    kind,
    label: s.chip?.label ?? kind,
    promised: s.promised,
    delivered: s.delivered,
    gate,
    rows,
    parts,
    net,
    /** Badges of the parts the net counts, for the net's own label. */
    badges: [...new Set(parts.filter((p) => !p.pending && p.sign !== 0).map((p) => p.row.badge))],
    pendingParts: parts.filter((p) => p.pending).length + (rows.bondForfeit?.pending ? 1 : 0),
    bondBar: bondTotal > 0 ? { total: bondTotal, back: round(back), forfeit: round(lost), pendingForfeit: rows.bondForfeit?.pending ? rows.bondForfeit.amount : 0 } : null,
    formula,
  };
}
