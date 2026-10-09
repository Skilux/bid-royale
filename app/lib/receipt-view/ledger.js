const round = (n) => Math.round(n * 1e6) / 1e6;

/** Honest label for a row the treasury refused below the Cardano minimum (#62). The row stays PENDING, never moved. */
export const BELOW_MINIMUM_NOTE = "not transferred: below the Cardano minimum (#62)";

/** Plain-words note for a money row, or null: a refused sub-minimum row, or a row the Board topped up to the minimum (#62). */
export function rowNote(entry) {
  if (entry?.state === "BelowMinimum") return BELOW_MINIMUM_NOTE;
  return entry?.topUp > 0 ? `Board topped up ${round(entry.topUp)} to the 2 tADA minimum` : null;
}

const ACTION_STEP = { bid_fee: "Bid fee", award: "Escrow lock", bond: "Escrow lock", award_release: "Settlement", award_reclaim: "Settlement", bond_return: "Settlement", bond_forfeit: "Settlement" };

/**
 * One ledger per agent, from the run's money rows (`run.ledger`, badges already derived). Amounts are signed from the
 * agent's side. Money in escrow leaves the payer at the lock and reaches the receiver at the release, so a lock is
 * never counted twice. The Board holds each bond from its lock until the Board returns or forwards it.
 * A PENDING row is listed and flagged, but never enters a balance: it is not money moved.
 * Every row lands in exactly two ledgers or one escrow side, so the nets of all agents add up to 0.
 *
 * @param {{ ledger: object[], suppliers: {id: string, name: string}[], nameOf: (id: string) => string }} input
 */
export function buildLedgers({ ledger, suppliers, nameOf }) {
  const parties = [
    { id: "consumer", name: "NeoRack (Consumer)" },
    { id: "board", name: "Tender Board" },
    ...suppliers.map((s) => ({ id: s.id, name: s.name })),
  ];
  const rows = Object.fromEntries(parties.map((p) => [p.id, []]));
  const label = (id) => (id === "consumer" ? "NeoRack" : id === "board" ? "Board" : nameOf(id));

  const add = (party, l, sign, what, counterparty) => {
    if (!rows[party]) return;
    rows[party].push({
      id: `${l.id}:${party}`,
      step: ACTION_STEP[l.action] ?? l.phase,
      what,
      counterparty,
      amount: round(sign * l.amount),
      badge: l.badge,
      pending: l.badge === "PENDING",
      note: rowNote(l),
      txHash: l.txHash ?? null,
      explorerUrl: l.explorerUrl ?? null,
    });
  };

  for (const l of ledger) {
    const s = l.supplier;
    const name = label(s);
    switch (l.action) {
      case "bid_fee":
        add(s, l, -1, "Bid fee", "Board");
        add("board", l, +1, `Bid fee from ${name}`, name);
        break;
      case "award":
        add("consumer", l, -1, `Award locked in escrow for ${name}`, "escrow");
        break;
      case "bond":
        add(s, l, -1, "Bond locked in escrow", "Board");
        add("board", l, +1, `Bond held for ${name}`, name);
        break;
      case "award_release":
        add(s, l, +1, "Award released", "NeoRack");
        break;
      case "award_reclaim":
        add("consumer", l, +1, `Award refunded, ${name} Under gate`, name);
        break;
      case "bond_return":
        add("board", l, -1, `Bond returned to ${name}`, name);
        add(s, l, +1, "Bond returned", "Board");
        break;
      case "bond_forfeit":
        add("board", l, -1, `Bond of ${name} forfeited to NeoRack`, "NeoRack");
        add("consumer", l, +1, `Penalty from the bond of ${name}`, name);
        break;
      default:
        break;
    }
  }

  return parties.map((p) => {
    let balance = 0;
    const list = rows[p.id].map((r) => {
      if (!r.pending) balance = round(balance + r.amount);
      return { ...r, balance: r.pending ? null : balance };
    });
    return {
      id: p.id,
      name: p.name,
      rows: list,
      net: balance,
      pendingCount: list.filter((r) => r.pending).length,
    };
  });
}
