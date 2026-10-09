const round = (n) => Math.round(n * 1e6) / 1e6;
const moved = (m) => Boolean(m) && !m.pending;
const amountOf = (m) => (moved(m) ? m.amount : 0);
const pct = (per1000) => Number((per1000 / 10).toFixed(2));
const plain = (n) => String(Number(n.toFixed(2)));

/**
 * "Who ended up with what" (#66 D6): one signed sum per supplier, in the order of `view.suppliers`.
 * It reads the dashboard view only: bid fee, award lock and bond lock paid out, award and bond back in. A PENDING row has
 * not moved, so it is listed in `pendingParts` and never counted in `net`, the same rule as the ledger and the wallet.
 * `formula` is the pro-rata bond forfeit, set for Short of promise only: bond × (promised − delivered) ÷ promised.
 * `bondLost` is what the supplier lost of its bond, `bondBack` what it got back. `refs` holds the money rows behind each
 * part (for the tx links), `badges` the badges of the rows the net counts.
 */
export function supplierBalances(view) {
  return view.suppliers.map((s) => {
    const [awardCell, bondCell] = s.cells ?? [];
    const outcomes = [...(awardCell?.outcomes ?? []), ...(bondCell?.outcomes ?? [])];
    const of = (action) => outcomes.find((o) => o.action === action) ?? null;
    const release = of("award_release");
    const reclaim = of("award_reclaim");
    const back = of("bond_return");
    const forfeit = of("bond_forfeit");

    const fee = moved(s.fee) ? s.fee.amount : 0;
    const bond = amountOf(bondCell?.lock);
    const award = amountOf(awardCell?.lock);
    const awardPaid = amountOf(release);
    const awardToConsumer = amountOf(reclaim);
    const bondBack = amountOf(back);
    const bondLost = amountOf(forfeit);
    const net = round(-fee - bond + awardPaid + bondBack);

    const pendingParts = [
      ["bid fee", s.fee],
      ["bond", bondCell?.lock],
      ["award", awardCell?.lock],
      ["award paid", release],
      ["award back to NeoRack", reclaim],
      ["bond back", back],
      ["bond forfeited", forfeit],
    ]
      .filter(([, m]) => m?.pending)
      .map(([label, m]) => ({ label, amount: m.amount }));

    const kind = s.chip?.kind ?? null;
    let formula = null;
    if (kind === "short_of_promise" && forfeit && bondCell?.lock && s.promised > 0 && s.delivered !== null) {
      formula = `${plain(bondCell.lock.amount)} × (${pct(s.promised)} − ${pct(s.delivered)}) ÷ ${pct(s.promised)} = ${plain(forfeit.amount)}`;
    }

    const parts = [
      ["fee", s.fee],
      ["bond", bondCell?.lock],
      ["awardPaid", release],
      ["bondBack", back],
    ];
    const badges = [...new Set(parts.filter(([, m]) => moved(m)).map(([, m]) => m.badge))];

    return {
      id: s.id,
      name: s.name,
      kind,
      label: s.chip?.label ?? null,
      promised: s.promised,
      delivered: s.delivered,
      gate: view.gate,
      fee,
      bond,
      award,
      awardPaid,
      awardToConsumer,
      bondBack,
      bondLost,
      net,
      pendingParts,
      formula,
      badges,
      refs: { fee: s.fee, bond: bondCell?.lock ?? null, award: awardCell?.lock ?? null, awardPaid: release, awardToConsumer: reclaim, bondBack: back, bondLost: forfeit },
    };
  });
}
