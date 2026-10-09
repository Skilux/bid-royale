import { deriveBadge, derivePayMode, explorerFor, rowNote, termBadges, uniqueBadges, FALLBACK_BADGE, KIND_LABEL } from "../receipt-view/index.js";
import { formatConversion } from "../conversion/index.js";
import { SEED_TENDER } from "./reduce.js";

const round = (n) => Math.round(n * 1e6) / 1e6;
const sum = (list, pick = (x) => x.amount) => round(list.reduce((t, x) => t + (Number.isFinite(pick(x)) ? pick(x) : 0), 0));

export const STEP_LABEL = {
  tender: "Tender",
  bids: "Bids",
  allocation: "Allocation",
  locks: "Escrow",
  feed: "Traffic",
  verification: "Verify",
  verdicts: "Verdicts",
  settlement: "Settlement",
};
const STEP_ORDER = Object.keys(STEP_LABEL);

const OUTCOME_LABEL = {
  award_release: "paid to supplier",
  award_reclaim: "refunded to NeoRack",
  bond_return: "bond back to supplier",
  bond_forfeit: "bond forfeited to NeoRack",
};

/** Consumer net and cost per signup from a stored receipt. A receipt stored before #62 counted PENDING rows as moved: take them out. */
function receiptFigures(receipt, pendingRows) {
  const c = receipt.consumer ?? {};
  if (c.net == null || typeof c.notMoved === "number" || pendingRows.length === 0) return { net: c.net ?? null, costPerSignup: c.costPerSignup ?? null };
  const net = round(c.net - sum(pendingRows));
  return { net, costPerSignup: c.signups > 0 ? round(-net / c.signups) : null };
}

/** Footer honesty line. The shop and its traffic are simulated in every mode, money rows carry their own badges. */
export function honestyLine(payMode) {
  if (payMode === "real") return "Traffic and signups are SIMULATED. Suppliers are our own agents.";
  if (payMode === "canned") return "Recorded run. Rows with a tx link are REAL, the rest PRE-RECORDED. Traffic and signups were SIMULATED. Suppliers are our own agents.";
  return "Bid fees and traffic are SIMULATED. Suppliers are our own agents.";
}

/** One money row for the UI: its badge is derived here, so no component decides what counts as REAL. */
function moneyRow(m, mode) {
  const badge = deriveBadge({ badge: m.rawBadge, txHash: m.txHash }, { mode });
  return {
    id: m.id,
    action: m.action,
    label: OUTCOME_LABEL[m.action] ?? String(m.action ?? "").replaceAll("_", " "),
    amount: m.amount,
    from: m.from,
    to: m.to,
    badge,
    pending: badge === "PENDING",
    txHash: badge === "REAL" ? m.txHash : null,
    explorerUrl: explorerFor({ explorerUrl: m.explorerUrl }, badge),
    state: m.state,
    error: m.error,
    note: rowNote(m),
  };
}

function cellFor(kind, lock, outcomes) {
  const refund = outcomes.some((o) => o.action === "award_reclaim");
  const forfeitOnly = kind === "bond" && outcomes.some((o) => o.action === "bond_forfeit") && !outcomes.some((o) => o.action === "bond_return");
  let tone = "wait";
  if (lock) tone = lock.pending ? "pending" : "locked";
  if (outcomes.length) tone = outcomes.every((o) => o.pending) ? "pending" : refund || forfeitOnly ? "refund" : "paid";
  return { kind, lock, outcomes, tone };
}

function verdictChip(s, locks) {
  if (s.verdict) return { kind: s.verdict.kind, label: KIND_LABEL[s.verdict.kind] ?? s.verdict.kind };
  if (s.rejected) return { kind: "lost_bid", label: KIND_LABEL.lost_bid };
  if (s.accepted && locks.award && locks.bond && !locks.award.pending && !locks.bond.pending) return { kind: "escrowed", label: "Escrowed" };
  return null;
}

/** Per-supplier signal context from a run snapshot (`GET /api/run/:id` `feed.events`). Context only, never a verdict. */
export function summarizeSignals(feedEvents) {
  const out = {};
  for (const e of feedEvents ?? []) {
    const s = (out[e.supplier] ??= { events: 0, clickBursts: 0, asns: {} });
    s.events += 1;
    if (e.signals?.clickBurst) s.clickBursts += 1;
    if (e.signals?.asn) s.asns[e.signals.asn] = (s.asns[e.signals.asn] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(out).map(([id, s]) => [id, { events: s.events, clickBursts: s.clickBursts, asns: Object.entries(s.asns).map(([asn, count]) => ({ asn, count })) }]),
  );
}

/**
 * Everything the dashboard draws, from the reduced state. `signals` is an optional `summarizeSignals` result.
 * No component re-derives a badge, a total or a verdict: it renders what is here.
 */
export function buildDashboardView(state, { signals = null } = {}) {
  const mode = state.mode === "canned" ? "canned" : "live";
  const tender = state.tender ?? SEED_TENDER;
  const money = state.money.map((m) => ({ ...moneyRow(m, mode), phase: m.phase, supplier: m.supplier }));
  const gate = tender.gate;
  const payMode = derivePayMode({ mode, runBadge: state.runBadge, badges: money.map((m) => m.badge) });
  const rowsOf = (phase, action = null) => money.filter((m) => m.phase === phase && (action === null || m.action === action));

  const maxPromised = Math.max(14, ...state.order.map((id) => state.suppliers[id].bid?.promisedPer1000 ?? 0));
  const scaleMax = Math.ceil(maxPromised * 1.15);

  const suppliers = state.order.map((id) => {
    const s = state.suppliers[id];
    const mine = money.filter((m) => m.supplier === id);
    const lockOf = (action) => mine.find((m) => m.phase === "lock" && m.action === action) ?? null;
    const outcomes = mine.filter((m) => m.phase === "settlement");
    const locks = { award: lockOf("award"), bond: lockOf("bond") };
    const fee = mine.find((m) => m.phase === "bid_fee") ?? null;
    const quoteRows = locks.award ? [locks.award] : mine.filter((m) => m.phase === "bid_fee");
    const lost = Boolean(s.rejected);
    const verifiedKnown = s.verified !== null;
    const count = verifiedKnown ? s.verified : (s.received ?? 0);
    const per1000 = s.impressions ? (count / s.impressions) * 1000 : 0;
    return {
      id,
      name: s.name,
      persona: s.persona,
      lost,
      chip: verdictChip(s, locks),
      commit: s.commit,
      bid: s.bid,
      quoteBadges: termBadges(payMode, quoteRows),
      rank: s.rank,
      pricePerSignup: s.pricePerSignup,
      rejectedNote:
        lost && s.bid
          ? s.rejected === "below_gate"
            ? `promises ${formatConversion(s.bid.promisedPer1000)} conversion, gate is ${formatConversion(gate)}`
            : `rejected: ${String(s.rejected).replaceAll("_", " ")}`
          : lost
            ? `rejected: ${String(s.rejected).replaceAll("_", " ")}`
            : null,
      fee,
      impressionsTarget: s.impressions,
      count,
      verifiedKnown,
      served: s.impressions !== null,
      flagged: s.flagged,
      per1000,
      promised: s.bid && !lost ? s.bid.promisedPer1000 : null,
      delivered: s.verdict?.delivered ?? (verifiedKnown ? s.verified : null),
      verdict: s.verdict,
      rejections: s.rejections,
      cells: lost ? null : ["award", "bond"].map((kind) => cellFor(kind, locks[kind], outcomes.filter((o) => o.action.startsWith(kind)))),
    };
  });

  const awardLocks = rowsOf("lock", "award");
  const bondLocks = money.filter((m) => m.phase === "lock" && m.action === "bond");
  const locks = [...awardLocks, ...bondLocks];
  const toConsumer = money.filter((m) => m.phase === "settlement" && m.to === "consumer");
  const moved = (rows) => rows.filter((m) => !m.pending);
  const pend = (rows) => rows.filter((m) => m.pending);
  /** Badges of the rows a figure counts. A PENDING row is not in the sum, so it is not in the badge either, unless no row moved. */
  const countedBadges = (rows) => uniqueBadges((moved(rows).length ? moved(rows) : rows).map((m) => m.badge));
  const out = sum(moved(awardLocks));
  const back = sum(moved(toConsumer));
  const accepted = state.order.map((id) => state.suppliers[id]).filter((s) => s.accepted).sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9));

  const refund = money.find((m) => m.action === "award_reclaim" && !m.pending);
  const hero = refund ? { ...refund, name: state.suppliers[refund.supplier]?.name ?? refund.supplier } : null;

  return {
    runId: state.runId,
    mode,
    replay: state.replay,
    payMode,
    /** Badge for a figure with no money rows of its own. PENDING in a real run, never SIMULATED. */
    fallbackBadge: FALLBACK_BADGE[payMode],
    runBadge: payMode === "canned" ? "PRE-RECORDED" : money.some((m) => m.badge === "REAL") ? "REAL" : FALLBACK_BADGE[payMode],
    /** Terms are not moved money: budget and allocation follow the award locks, the bid fee the bid fee rows. */
    termBadges: { budget: termBadges(payMode, awardLocks), bidFee: termBadges(payMode, rowsOf("bid_fee")) },
    honesty: honestyLine(payMode),
    degraded: state.degraded,
    failed: state.failed,
    done: state.done,
    started: state.events > 0,
    tender,
    brief: state.brief ?? { advertiser: "NeoRack", audience: tender.audience, goal: "pay per verified signup" },
    currency: tender.currency,
    discovery: state.discovery
      ? { ...state.discovery, chip: `Discovery: ${state.discovery.label} · ${state.discovery.found} agents · ${state.discovery.source}` }
      : null,
    steps: STEP_ORDER.map((key) => ({ key, label: STEP_LABEL[key], status: state.steps[key] ?? "pending" })),
    suppliers,
    budget: {
      total: tender.budget,
      allocated: state.totalAward,
      segments: accepted.map((s) => ({ id: s.id, name: s.name, award: s.award })),
    },
    scaleMax,
    gate,
    wallet: {
      escrowed: out,
      back,
      net: round(back - out),
      pendingOut: sum(pend(awardLocks)),
      pendingBack: sum(pend(toConsumer)),
      badgesOut: countedBadges(awardLocks),
      badgesBack: countedBadges(toConsumer),
    },
    escrow: {
      locked: sum(moved(locks)),
      pending: sum(pend(locks)),
      total: round(sum(accepted, (s) => s.award) + sum(accepted, (s) => s.bond)),
      badges: uniqueBadges(locks.map((m) => m.badge)),
    },
    bidFees: { total: sum(money.filter((m) => m.phase === "bid_fee")), badges: uniqueBadges(money.filter((m) => m.phase === "bid_fee").map((m) => m.badge)) },
    hero,
    rows: money,
    settlement: state.settlement,
    chips: {
      discovery: state.order.length > 0,
      wallet: locks.length > 0,
      masumi: locks.length > 0,
      dispute: state.order.some((id) => state.suppliers[id].verdict?.kind === "under_gate"),
    },
    bots: suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      served: s.served,
      received: state.suppliers[s.id].received,
      flaggedBySignals: s.flagged,
      detail: signals?.[s.id] ?? null,
    })),
    receipt: state.receipt
      ? {
          net: receiptFigures(state.receipt, pend(toConsumer)).net,
          signups: state.receipt.consumer?.signups ?? null,
          costPerSignup: receiptFigures(state.receipt, pend(toConsumer)).costPerSignup,
          badges: countedBadges([...awardLocks, ...toConsumer]),
          pendingRows: pend(money).length,
          pendingAmount: sum(pend(money)),
          pending: money.some((m) => m.pending),
        }
      : null,
    roundTwo: state.roundTwo
      ? state.roundTwo
          .map((r) => ({ supplier: r.supplier, name: state.suppliers[r.supplier]?.name ?? r.supplier, share: r.share }))
          .sort((a, b) => b.share - a.share)
      : null,
    log: state.log.slice(-8).reverse(),
  };
}
