import { roundTwo } from "../auction/index.js";

const round = (n) => Math.round(n * 1e6) / 1e6;
const sum = (list, pick = (x) => x.amount) => round(list.reduce((t, x) => t + pick(x), 0));

/**
 * Receipt and ROI leaderboard, computed from the ledger so every number traces to a badged transfer.
 *
 * Ledger entries are adapter receipts plus `phase` ("bid_fee" | "lock" | "settlement") and `supplier`.
 * Consumer net = settlement transfers to the Consumer minus award locks from the Consumer.
 * Only money that moved counts: a PENDING row (real operation without a transaction, or refused by the treasury) is
 * left out of every sum and reported as `notMoved` (#62).
 *
 * @param {{ suppliers: {id: string, name: string}[], bids: object[], accepted: object[], verdicts: object[],
 *           verified: Record<string, number>, ledger: object[] }} input
 */
export function buildReceipt({ suppliers, bids, accepted, verdicts, verified, ledger }) {
  const nameOf = (id) => suppliers.find((s) => s.id === id)?.name ?? id;
  const winners = new Set(accepted.map((a) => a.supplier));
  const moved = (l) => l.badge !== "PENDING";
  const settlement = ledger.filter((l) => l.phase === "settlement" && moved(l));
  const owedNotMoved = ledger.filter((l) => l.phase === "settlement" && !moved(l));

  const rows = [
    ...verdicts.map((v) => {
      const mine = settlement.filter((l) => l.supplier === v.supplier);
      const paid = sum(mine.filter((l) => l.action === "award_release"));
      const reclaimed = sum(mine.filter((l) => l.action === "award_reclaim"));
      const bondReturned = sum(mine.filter((l) => l.action === "bond_return"));
      const bondForfeited = sum(mine.filter((l) => l.action === "bond_forfeit"));
      const signups = v.kind === "under_gate" ? 0 : (verified[v.supplier] ?? 0);
      const consumerSpend = round(v.award - reclaimed - bondForfeited);
      const bidFee = sum(ledger.filter((l) => l.phase === "bid_fee" && l.supplier === v.supplier));
      return {
        supplier: v.supplier,
        name: nameOf(v.supplier),
        kind: v.kind,
        promised: v.promised,
        delivered: v.delivered,
        verifiedSignups: verified[v.supplier] ?? 0,
        countedSignups: signups,
        award: v.award,
        paidToSupplier: paid,
        awardReclaimed: reclaimed,
        bond: v.bond,
        bondReturned,
        bondForfeited,
        consumerSpend,
        costPerSignup: signups > 0 ? round(consumerSpend / signups) : null,
        supplierNet: round(paid + bondReturned - v.bond - bidFee),
        verdictHash: v.hash,
      };
    }),
    ...bids
      .filter((b) => !winners.has(b.supplier))
      .map((b) => ({
        supplier: b.supplier,
        name: nameOf(b.supplier),
        kind: "lost_bid",
        promised: b.promisedPer1000,
        delivered: null,
        verifiedSignups: 0,
        countedSignups: 0,
        award: 0,
        paidToSupplier: 0,
        awardReclaimed: 0,
        bond: 0,
        bondReturned: 0,
        bondForfeited: 0,
        consumerSpend: 0,
        costPerSignup: null,
        supplierNet: round(-sum(ledger.filter((l) => l.phase === "bid_fee" && l.supplier === b.supplier))),
        verdictHash: null,
      })),
  ];

  const ranked = rows
    .filter((r) => r.kind !== "lost_bid")
    .sort((a, b) => (a.costPerSignup ?? Infinity) - (b.costPerSignup ?? Infinity) || a.supplier.localeCompare(b.supplier));
  const leaderboard = [...ranked, ...rows.filter((r) => r.kind === "lost_bid")].map((r, i) => ({ rank: i + 1, ...r }));

  const spent = sum(ledger.filter((l) => l.phase === "lock" && l.action === "award" && moved(l)));
  const returned = sum(settlement.filter((l) => l.to === "consumer"));
  const signups = sum(rows, (r) => r.countedSignups);
  const net = round(returned - spent);

  return {
    consumer: {
      awardsLocked: spent,
      returned,
      notMoved: sum(owedNotMoved.filter((l) => l.to === "consumer")),
      net,
      signups,
      costPerSignup: signups > 0 ? round(-net / signups) : null,
    },
    board: {
      bidFees: sum(ledger.filter((l) => l.phase === "bid_fee" && moved(l))),
      // What the Board added to round sub-minimum transfers up to the Cardano minimum (#62).
      topUps: sum(settlement, (l) => l.topUp ?? 0),
    },
    leaderboard,
    badges: [...new Set(ledger.map((l) => l.badge))],
    roundTwo: roundTwo(verdicts.map((v) => ({ supplier: v.supplier, kind: v.kind }))),
  };
}
