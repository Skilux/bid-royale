import { commit } from "../auction/index.js";
import { planSettlement } from "../settlement/plan.js";

/**
 * Pure builders: run state in, evidence items out. An item is `{name, label, group, supplier?, value, mutable?}`.
 * `value` is hashed as canonical JSON by the recorder. Nothing here reads a secret: only run fields that
 * GET /api/run/:id already shows, plus public keys.
 *
 * Names are `<kind>` or `<kind>.<supplier>`. Mutable items are the ones that legitimately change while
 * settlement runs (a transfer goes PENDING, then REAL).
 */

export const GROUPS = {
  setup: "Setup",
  auction: "Auction",
  traffic: "Signups and checks",
  delivery: "Delivery claim",
  verdict: "Verdicts",
  money: "Money",
};

const nameOf = (run, id) => run.suppliers?.find((s) => s.id === id)?.name ?? id;
const countBy = (list, key) => {
  const out = {};
  for (const item of list) out[item[key]] = (out[item[key]] ?? 0) + 1;
  return out;
};

export function tenderItems(run) {
  // The deadline is stamped in the bids step, so the spec hash is the terms as published.
  const terms = { ...run.tender };
  delete terms.deadline;
  return [
    { name: "tender", label: "Tender terms", group: "setup", value: { terms, suppliers: run.suppliers } },
    { name: "brief", label: "Brief", group: "setup", value: run.brief },
    { name: "keys", label: "Public keys that sign", group: "setup", value: { shop: run.keys.shop, board: run.keys.board } },
  ];
}

export function bidItems(run) {
  return run.bids.map((b) => ({
    name: `bid.${b.supplier}`,
    label: `Sealed bid, ${nameOf(run, b.supplier)}`,
    group: "auction",
    supplier: b.supplier,
    value: {
      supplier: b.supplier,
      commit: b.commit,
      receivedAt: b.committedAt,
      deadline: run.tender.deadline ?? null,
      reveal: { price: b.price, impressions: b.impressions, promisedPer1000: b.promisedPer1000, salt: b.salt },
      commitMatchesReveal: commit(b) === String(b.commit).toLowerCase(),
    },
  }));
}

export function allocationItems(run) {
  const { ranking, accepted, rejected, totalAward } = run.auction;
  const decisions = [
    ...accepted.map((a) => ({ supplier: a.supplier, decision: "accepted", award: a.award })),
    ...ranking
      .filter((r) => !r.accepted)
      .map((r) => ({ supplier: r.supplier, decision: "not_funded", reason: "did_not_fit_budget" })),
    ...rejected.map((r) => ({ supplier: r.supplier, decision: "rejected", reason: r.reason })),
  ];
  return [
    {
      name: "allocation",
      label: "Ranking and budget fill",
      group: "auction",
      value: { budget: run.tender.budget, ranking, accepted, rejected, decisions, totalAward },
    },
  ];
}

export function signupItems(run) {
  const { window, impressions, events } = run.feed;
  return Object.keys(impressions).map((supplier) => ({
    name: `signups.${supplier}`,
    label: `Signed signups, ${nameOf(run, supplier)}`,
    group: "traffic",
    supplier,
    value: {
      supplier,
      window,
      impressions: impressions[supplier],
      shopPublicKey: run.keys.shop,
      events: events.filter((e) => e.supplier === supplier),
    },
  }));
}

export function verificationItems(run) {
  const { window, events } = run.feed;
  const { perSupplier, rejections } = run.verification;
  return perSupplier.map((p) => {
    const mine = events.filter((e) => e.supplier === p.supplier);
    return {
      name: `verification.${p.supplier}`,
      label: `Verification report, ${nameOf(run, p.supplier)}`,
      group: "traffic",
      supplier: p.supplier,
      value: {
        supplier: p.supplier,
        window,
        shopPublicKey: run.keys.shop,
        checks: ["signature", "attribution", "time_window", "no_duplicate"],
        received: p.received,
        verified: p.verified,
        rejectedByKind: p.rejected,
        rejectedEvents: rejections.filter((r) => r.supplier === p.supplier),
        botSignals: {
          note: "dashboard context only, never read by the verifier",
          flaggedClickBursts: mine.filter((e) => e.signals?.clickBurst).length,
        },
      },
    };
  });
}

/** One signed verdict per supplier, linked to the hash of that supplier's verification report. */
export function verdictItems(run, reportHashOf) {
  return run.verdicts.map((v) => ({
    name: `verdict.${v.supplier}`,
    label: `Signed verdict, ${nameOf(run, v.supplier)}`,
    group: "verdict",
    supplier: v.supplier,
    value: {
      verdict: v,
      boardPublicKey: run.keys.board,
      verificationReportHash: reportHashOf?.(v.supplier) ?? null,
    },
  }));
}

/** Every bid fee, lock and settlement receipt, as the ledger holds them. Mutable: a receipt turns REAL once it has a tx. */
export function ledgerItems(run) {
  return [{ name: "ledger", label: "Money ledger", group: "money", mutable: true, value: { currency: run.tender.currency, rows: run.ledger } }];
}

export function settlementItems(run) {
  const s = run.settlement;
  if (!s) return [];
  return [
    {
      name: "settlement",
      label: "Settlement decisions and transfers",
      group: "money",
      mutable: true,
      value: {
        job: s.job,
        status: s.status,
        startedAt: s.startedAt,
        decisions: run.verdicts.map((v) => ({
          supplier: v.supplier,
          verdict: v.kind,
          verdictHash: v.hash,
          planned: planSettlement(v),
        })),
        transfers: s.transfers,
        transfersByBadge: countBy(s.transfers, "badge"),
      },
    },
  ];
}

export function receiptItems(run) {
  if (!run.receipt) return [];
  return [{ name: "receipt", label: "Receipt", group: "money", mutable: true, value: run.receipt }];
}

/** Items to write after a step finished. Settlement refreshes the mutable ones. */
export const STEP_ITEMS = {
  tender: (run) => tenderItems(run),
  bids: (run) => [...bidItems(run), ...ledgerItems(run)],
  allocation: (run) => allocationItems(run),
  locks: (run) => ledgerItems(run),
  feed: (run) => signupItems(run),
  verification: (run) => verificationItems(run),
  settlement: (run) => [...ledgerItems(run), ...settlementItems(run), ...receiptItems(run)],
};
