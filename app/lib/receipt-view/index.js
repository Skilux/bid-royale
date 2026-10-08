import { consumerNet, planSettlement } from "../settlement/plan.js";
import { buildLedgers } from "./ledger.js";

const round = (n) => Math.round(n * 1e6) / 1e6;
const sum = (list, pick = (x) => x.amount) => round(list.reduce((t, x) => t + pick(x), 0));

const KIND_ORDER = { pass: 0, short_of_promise: 1, under_gate: 2 };
const BADGE_ORDER = ["REAL", "PENDING", "PRE-RECORDED", "SIMULATED"];

export const KIND_LABEL = {
  pass: "Pass",
  short_of_promise: "Short of promise",
  under_gate: "Under gate",
  lost_bid: "Lost bid",
};

/**
 * Badge for one money entry, derived from the transfer and the run mode.
 * REAL needs a badge of REAL and a 64-hex tx hash (the simulated adapter prefixes `sim_`).
 * A canned replay shows PRE-RECORDED for everything that is not a real tx. Anything else is SIMULATED.
 * PENDING (a real operation submitted, no tx yet, #49) stays PENDING: it is never money moved.
 */
export function deriveBadge(entry, { mode = "live" } = {}) {
  const hash = entry?.txHash;
  const hasHash = typeof hash === "string" && /^[0-9a-f]{64}$/i.test(hash);
  if (entry?.badge === "REAL" && hasHash) return "REAL";
  if (entry?.badge === "PENDING") return "PENDING";
  if (entry?.badge === "PRE-RECORDED" || mode === "canned") return "PRE-RECORDED";
  return "SIMULATED";
}

/** Explorer link only for a REAL entry that carries an https URL. */
export function explorerFor(entry, badge) {
  const url = entry?.explorerUrl;
  return badge === "REAL" && typeof url === "string" && /^https:\/\//.test(url) ? url : null;
}

export function uniqueBadges(badges) {
  return BADGE_ORDER.filter((b) => badges.includes(b));
}

/** Minutes between two ISO timestamps, or null. */
function gapMinutes(from, to) {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

const REASON_LABEL = {
  award_release: "Paid",
  award_reclaim: "Returned to me",
  bond_return: "Deposit back",
  bond_forfeit: "Penalty to me",
};

/**
 * Plain, serialisable view of one run for the receipt page. Every number is read from the run state
 * (`receipt`, `settlement`, `ledger`, `verdicts`). When `receipt` is missing but verdicts exist, the totals
 * come from `consumerNet` and `planSettlement`.
 */
export function buildReceiptView(run) {
  const mode = run?.mode === "canned" ? "canned" : "live";
  const currency = run?.tender?.currency ?? "tADA";
  const nameOf = (id) => run?.suppliers?.find((s) => s.id === id)?.name ?? id;
  const ledger = (run?.ledger ?? []).map((l) => ({ ...l, badge: deriveBadge(l, { mode }) }));
  const settlementDone = run?.settlement?.status === "done" && (run?.verdicts?.length ?? 0) > 0;
  const verdicts = run?.verdicts ?? [];

  const awardLocks = ledger.filter((l) => l.phase === "lock" && l.action === "award");
  const locks = ledger.filter((l) => l.phase === "lock");
  const bidFees = ledger.filter((l) => l.phase === "bid_fee");

  const transfersFor = (supplier) =>
    (run?.settlement?.transfers ?? [])
      .filter((t) => t.supplier === supplier)
      .map((t) => {
        const badge = deriveBadge(t, { mode });
        return {
          id: t.id,
          reason: t.action,
          label: REASON_LABEL[t.action] ?? t.action,
          amount: t.amount,
          to: t.to,
          badge,
          txHash: t.txHash ?? null,
          explorerUrl: explorerFor(t, badge),
        };
      });

  const lbBySupplier = new Map((run?.receipt?.leaderboard ?? []).map((r) => [r.supplier, r]));

  const settled = [...verdicts]
    .sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9))
    .map((v) => {
      const lb = lbBySupplier.get(v.supplier);
      const planned = planSettlement(v);
      const sumPlanned = (reason) => sum(planned.filter((t) => t.reason === reason));
      return {
        supplier: v.supplier,
        name: nameOf(v.supplier),
        kind: v.kind,
        kindLabel: KIND_LABEL[v.kind] ?? v.kind,
        promised: v.promised,
        delivered: v.delivered,
        gate: v.gate,
        award: v.award,
        bond: v.bond,
        paid: lb?.paidToSupplier ?? sumPlanned("award_release"),
        reclaimed: lb?.awardReclaimed ?? sumPlanned("award_reclaim"),
        bondReturned: lb?.bondReturned ?? sumPlanned("bond_return"),
        bondForfeited: lb?.bondForfeited ?? sumPlanned("bond_forfeit"),
        transfers: transfersFor(v.supplier),
        verdictHash: v.hash ?? lb?.verdictHash ?? null,
        at: transferTime(run, v.supplier),
      };
    });

  const underGate = settled.filter((s) => s.kind === "under_gate").map((s) => {
    const refund = s.transfers.find((t) => t.reason === "award_reclaim") ?? null;
    const total = round(s.reclaimed + s.bondForfeited);
    return { ...s, refund, refundTotal: total, explorerUrl: refund?.explorerUrl ?? null, refundBadge: refund?.badge ?? null };
  });
  const underGateBySupplier = new Map(underGate.map((u) => [u.supplier, u]));
  const settledOut = settled.map((s) => underGateBySupplier.get(s.supplier) ?? s);

  const fallback = verdicts.length ? consumerNet(verdicts) : { net: 0, signups: 0 };
  const consumer = run?.receipt?.consumer ?? {
    awardsLocked: sum(verdicts, (v) => v.award),
    returned: null,
    net: fallback.net,
    signups: fallback.signups,
    costPerSignup: fallback.signups > 0 ? round(-fallback.net / fallback.signups) : null,
  };

  const netBadges = uniqueBadges([
    ...awardLocks.map((l) => l.badge),
    ...(run?.settlement?.transfers ?? []).filter((t) => t.to === "consumer").map((t) => deriveBadge(t, { mode })),
  ]);

  const leaderboard = (run?.receipt?.leaderboard ?? []).map((r) => {
    const returned = round(r.awardReclaimed + r.bondForfeited);
    const sup = settledOut.find((s) => s.supplier === r.supplier);
    const lostFees = r.kind === "lost_bid" ? bidFees.filter((l) => l.supplier === r.supplier) : [];
    const supplierTransfers = (run?.settlement?.transfers ?? []).filter((t) => t.supplier === r.supplier);
    const refundBadges = uniqueBadges(
      (run?.settlement?.transfers ?? [])
        .filter((t) => t.supplier === r.supplier && t.to === "consumer")
        .map((t) => deriveBadge(t, { mode })),
    );
    return {
      rank: r.rank,
      supplier: r.supplier,
      name: r.name,
      kind: r.kind,
      kindLabel: KIND_LABEL[r.kind] ?? r.kind,
      costPerSignup: r.costPerSignup,
      signupsPerTada: r.consumerSpend > 0 && r.countedSignups > 0 ? round(r.countedSignups / r.consumerSpend) : null,
      verdictHash: r.verdictHash ?? null,
      signups: r.countedSignups,
      refunded: r.kind === "under_gate" ? returned : null,
      refundBadges,
      badges: r.kind === "lost_bid" ? uniqueBadges(lostFees.map((l) => l.badge)) : uniqueBadges(supplierTransfers.map((t) => deriveBadge(t, { mode }))),
      bidFee: r.kind === "lost_bid" ? sum(lostFees) : null,
      bidFeeBadges: uniqueBadges(lostFees.map((l) => l.badge)),
      promised: r.promised,
      delivered: sup?.delivered ?? r.delivered,
    };
  });

  const rankOf = (id) => {
    const i = (run?.receipt?.leaderboard ?? []).findIndex((r) => r.supplier === id);
    return i < 0 ? 99 : i;
  };
  const roundTwo = (run?.receipt?.roundTwo ?? run?.roundTwo ?? [])
    .map((r) => ({ supplier: r.supplier, name: nameOf(r.supplier), share: r.share }))
    .sort((a, b) => b.share - a.share || rankOf(a.supplier) - rankOf(b.supplier));

  const realLocks = locks.filter((l) => l.badge === "REAL").length;
  const pendingRows = ledger.filter((l) => l.badge === "PENDING").length;
  const lockMinutes = gapMinutes(run?.steps?.locks?.finishedAt, run?.steps?.settlement?.startedAt);

  return {
    runId: run?.id ?? null,
    mode,
    currency,
    settlementDone,
    stepStatus: run?.steps ?? {},
    lock: {
      amount: sum(awardLocks),
      count: awardLocks.length,
      badges: uniqueBadges(awardLocks.map((l) => l.badge)),
      at: run?.steps?.locks?.finishedAt ?? null,
    },
    cut: { minutes: lockMinutes, from: run?.steps?.locks?.finishedAt ?? null, to: run?.steps?.settlement?.startedAt ?? null },
    settled: settledOut,
    final: {
      net: consumer.net,
      paid: round(-consumer.net),
      signups: consumer.signups,
      costPerSignup: consumer.costPerSignup,
      badges: netBadges,
      at: run?.steps?.settlement?.finishedAt ?? run?.settlement?.finishedAt ?? null,
    },
    leaderboard,
    roundTwo,
    tally: {
      locksTotal: locks.length,
      locksReal: realLocks,
      locksPending: locks.filter((l) => l.badge === "PENDING").length,
      lockBadges: uniqueBadges(locks.map((l) => l.badge)),
      bidFeeBadges: uniqueBadges(bidFees.map((l) => l.badge)),
    },
    pendingRows,
    ledgers: buildLedgers({ ledger, suppliers: run?.suppliers ?? [], nameOf }),
  };
}

function transferTime(run, supplier) {
  const events = run?.events;
  if (Array.isArray(events)) {
    const hit = events.find((e) => e.name === "settlement.transfer" && e.data?.supplier === supplier);
    if (hit?.ts) return hit.ts;
  }
  return run?.settlement?.finishedAt ?? null;
}

/**
 * Reveal order and delays in ms for the settlement story. Ids: "lock", "cut", "v:<supplier>",
 * "slip:<supplier>:<n>" (refund slip rows), "count:<supplier>", "button:<supplier>", "final".
 */
export function buildTimeline(view) {
  const beats = [];
  let t = 300;
  const add = (id, gap) => {
    t += gap;
    beats.push({ id, at: t });
  };
  add("lock", 0);
  add("cut", 1200);
  for (const s of view.settled) {
    if (s.kind === "under_gate") {
      add(`v:${s.supplier}`, 1000);
      add(`slip:${s.supplier}:0`, 1500);
      add(`slip:${s.supplier}:1`, 1500);
      add(`slip:${s.supplier}:2`, 1500);
      add(`button:${s.supplier}`, 2000);
    } else {
      add(`v:${s.supplier}`, 1000);
    }
  }
  add("final", 2000);
  return beats;
}
