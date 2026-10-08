import { createHash } from "node:crypto";
import { EVENTS } from "./events.js";
import { buildReceipt } from "./receipt.js";

/** Settlement timing. A real run needs ~20 min of ticks; see docs/research/masumi-settlement-timing.md. */
export const SETTLEMENT = {
  budgetMs: 45_000, // work per tick, under Vercel's 60 s function limit
  timeoutMs: 40 * 60_000, // then the run completes with its PENDING rows labelled
  reconcileMs: 3 * 60 * 60_000, // late rows keep being advanced this long after the start
  claimSeconds: 55, // one tick per run at a time
  pollMs: 15_000, // runAll's wait between ticks
};

const TERMINAL = new Set(["REAL", "SIMULATED", "PRE-RECORDED"]);

/** PENDING: a real Masumi operation was submitted, no transaction yet. It never counts as money moved. */
const BADGES = [...TERMINAL, "PENDING"];

export function assertBadged(receipt) {
  if (!BADGES.includes(receipt?.badge)) {
    throw new Error(`money receipt without a badge: ${JSON.stringify(receipt)}`);
  }
}

/** A row is final once money moved (REAL) or never will on chain (SIMULATED, PRE-RECORDED). PENDING is not. */
export const isTerminal = (receipt) => TERMINAL.has(receipt?.badge);

const iso = (ms) => new Date(ms).toISOString();

/** Runs the tasks in parallel. Returns `{value}` or `{error}` per task that finished within `ms`, undefined for the rest. */
export async function within(ms, tasks) {
  const out = new Array(tasks.length);
  const all = Promise.all(
    tasks.map((task, i) =>
      Promise.resolve()
        .then(task)
        .then(
          (value) => (out[i] = { value }),
          (error) => (out[i] = { error }),
        ),
    ),
  );
  let timer;
  const expired = new Promise((resolve) => {
    timer = setTimeout(resolve, Math.max(0, ms));
    timer.unref?.();
  });
  await Promise.race([all, expired]);
  clearTimeout(timer);
  return out;
}

/** The lock receipt ids let the adapter find the escrows in a later serverless invocation. */
export function withEscrowIds(run, verdict) {
  const lockId = (action) =>
    run.ledger.find((l) => l.phase === "lock" && l.supplier === verdict.supplier && l.action === action)?.id;
  return { ...verdict, awardEscrowId: lockId("award"), bondEscrowId: lockId("bond") };
}

/** What the Board did with a proposal, hashed as the bid-fee escrow's result: the commit and the auction outcome. */
export function bidFeeResultHash(run, row) {
  const accepted = run.auction?.accepted?.some((a) => a.supplier === row.supplier);
  const outcome = accepted ? "accepted" : (run.auction?.rejected?.find((r) => r.supplier === row.supplier)?.reason ?? "not_allocated");
  const result = { action: "bid_fee", supplier: row.supplier, commit: row.inputHash ?? null, outcome };
  return createHash("sha256").update(JSON.stringify(result)).digest("hex");
}

/**
 * The validator service's reconciler: drives every settlement escrow to its final state, one bounded tick at a time.
 * A tick confirms locks (bid fees included), settles each supplier once its award and bond are locked, collects each
 * confirmed bid fee for the Board, then advances one PENDING row per escrow. Supplier settlement never waits on a bid
 * fee. The adapter's `advance` does at most one state-changing call, so repeated ticks are safe.
 * Without `adapter.advance` (simulated) the first tick settles and finishes, as before.
 */
export function createReconciler({ adapter, now, emit, clock = Date.now, options = {} }) {
  const { budgetMs, timeoutMs, reconcileMs } = { ...SETTLEMENT, ...options };
  const canAdvance = typeof adapter.advance === "function";
  const canCollect = canAdvance && typeof adapter.collectBidFee === "function";

  const pick = ({ badge, state, txHash, explorerUrl, error }) => ({ badge, state, txHash, explorerUrl, ...(error ? { error } : {}) });
  const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

  /** Copies the adapter's view onto a stored row. Identity, amount and parties stay as stored. */
  function merge(row, receipt) {
    const next = { ...row, badge: receipt.badge, state: receipt.state, txHash: receipt.txHash, explorerUrl: receipt.explorerUrl };
    delete next.error;
    if (receipt.error) next.error = receipt.error;
    const changed = ["badge", "state", "txHash", "error"].some((k) => row[k] !== next[k]);
    return { next, changed };
  }

  async function update(run, phase, row, receipt) {
    if (!receipt || receipt.id !== row.id) return;
    const { next, changed } = merge(row, receipt);
    if (!changed) return;
    const same = (r) => r.id === row.id && r.supplier === row.supplier;
    const apply = (r) => ({ ...omit(r, ["error"]), ...pick(next) });
    run.ledger = run.ledger.map((l) => (l.phase === phase && same(l) ? apply(l) : l));
    const verdict = run.verdicts.find((v) => v.supplier === row.supplier)?.kind ?? null;
    if (phase === "settlement") {
      run.settlement.transfers = run.settlement.transfers.map((t) => (same(t) ? apply(t) : t));
    }
    if (phase === "bid_fee_collect") {
      run.settlement.feeTransfers = run.settlement.feeTransfers.map((t) => (same(t) ? apply(t) : t));
    }
    await emit(run.id, EVENTS.settlementProgress, {
      supplier: row.supplier,
      verdict,
      phase,
      action: row.action,
      receiptId: row.id,
      state: next.state,
      badge: next.badge,
      txHash: next.txHash,
      explorerUrl: next.explorerUrl,
      ...(next.error ? { error: next.error } : {}),
    });
    if (phase === "settlement" && isTerminal(next) && !isTerminal(row)) {
      const receipt = omit(next, ["supplier", "verdict", "phase"]);
      await emit(run.id, EVENTS.settlementTransfer, { supplier: row.supplier, verdict, receipt });
    }
  }

  /** One tick. Mutates `run` and emits events; the caller saves it. Throws only if `settle` throws. */
  async function tick(run) {
    const s = run.settlement;
    const started = clock();
    const left = () => budgetMs - (clock() - started);
    // Locks and settle get a third of the budget each, so one slow call cannot starve the later phases.
    const share = () => Math.min(left(), budgetMs / 3);
    const settled = new Set(s.settled);
    s.feeTransfers ??= [];
    const collected = new Set(s.feesCollected ?? []);
    const locks = () => run.ledger.filter((l) => l.phase === "lock");
    const fees = () => run.ledger.filter((l) => l.phase === "bid_fee");

    // 1. Locks: settlement steps only start at FundsLocked. Bid-fee locks are confirmed the same way.
    if (canAdvance) {
      const open = [...locks(), ...fees()].filter((l) => !isTerminal(l));
      const out = await within(share(), open.map((l) => () => adapter.advance(l.id)));
      for (const [i, r] of out.entries()) await update(run, open[i].phase, open[i], r?.value);
    }

    // 2. Settle every supplier whose award and bond are locked. Once per supplier.
    const lockedFor = (supplier) => !canAdvance || locks().filter((l) => l.supplier === supplier).every(isTerminal);
    const ready = run.verdicts.filter((v) => !settled.has(v.supplier) && lockedFor(v.supplier));
    const fresh = new Set();
    if (ready.length && left() > 0) {
      const out = await within(share(), ready.map((v) => () => adapter.settle(withEscrowIds(run, v))));
      for (const [i, r] of out.entries()) {
        if (!r) continue;
        if (r.error) throw r.error;
        const v = ready[i];
        r.value.forEach(assertBadged);
        for (const receipt of r.value) {
          run.ledger.push({ ...receipt, phase: "settlement", supplier: v.supplier });
          s.transfers.push({ ...receipt, supplier: v.supplier, verdict: v.kind });
          fresh.add(receipt.id);
          await emit(run.id, EVENTS.settlementTransfer, { supplier: v.supplier, verdict: v.kind, receipt });
        }
        settled.add(v.supplier);
      }
    }

    // 2b. The Board keeps every bid fee, won or lost: collect each REAL fee once its lock is confirmed.
    const feesReady = canCollect ? fees().filter((l) => l.badge === "REAL" && !collected.has(l.supplier)) : [];
    if (feesReady.length && left() > 0) {
      const out = await within(share(), feesReady.map((l) => () =>
        adapter.collectBidFee({ supplier: l.supplier, bidFeeEscrowId: l.id, resultHash: bidFeeResultHash(run, l) })));
      for (const [i, r] of out.entries()) {
        // A failed call is retried next tick; a bid fee never stops settlement.
        if (!r?.value) continue;
        const { supplier } = feesReady[i];
        assertBadged(r.value);
        run.ledger.push({ ...r.value, phase: "bid_fee_collect", supplier });
        s.feeTransfers.push({ ...r.value, supplier });
        fresh.add(r.value.id);
        collected.add(supplier);
        await emit(run.id, EVENTS.settlementProgress, {
          supplier, verdict: null, phase: "bid_fee_collect", action: r.value.action, receiptId: r.value.id,
          state: r.value.state, badge: r.value.badge, txHash: r.value.txHash, explorerUrl: r.value.explorerUrl,
          ...(r.value.error ? { error: r.value.error } : {}),
        });
      }
    }

    // 3. Advance one PENDING row per escrow: two transfers on one bond must not both step it.
    if (canAdvance && left() > 0) {
      const groups = new Map();
      const rows = [
        ...s.transfers.map((t) => ({ t, phase: "settlement" })),
        ...s.feeTransfers.map((t) => ({ t, phase: "bid_fee_collect" })),
      ];
      for (const row of rows.filter(({ t }) => !isTerminal(t) && !fresh.has(t.id))) {
        const key = row.t.escrow ?? row.t.id;
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      // Rotate inside a group, so a stuck row cannot starve its neighbour.
      const picks = [...groups.values()].map((g) => g[s.ticks % g.length]);
      const out = await within(left(), picks.map(({ t }) => () => adapter.advance(t.id)));
      for (const [i, r] of out.entries()) await update(run, picks[i].phase, picks[i].t, r?.value);
    }

    s.settled = [...settled];
    s.feesCollected = [...collected];
    s.ticks += 1;
    s.lastTickAt = iso(now());
    const unsettled = run.verdicts.filter((v) => !settled.has(v.supplier)).length;
    // Without `advance` nothing PENDING can change any more, so only unsettled suppliers are left.
    const open = canAdvance ? [...locks(), ...fees(), ...s.transfers, ...s.feeTransfers].filter((r) => !isTerminal(r)).length : 0;
    s.pending = unsettled + open;

    if (s.pending === 0) {
      s.phase = "settled";
      if (s.status === "running") await finish(run);
      else await finishLate(run);
    } else if (s.status === "running" && now() >= Date.parse(s.deadline)) {
      s.phase = "timer_fallback";
      await finish(run);
    } else if (s.status === "running") {
      s.phase = unsettled > 0 ? "waiting_for_lock" : "settling";
    }
    return run;
  }

  function receiptFor(run) {
    return buildReceipt({
      suppliers: run.suppliers,
      bids: run.bids,
      accepted: run.auction.accepted,
      verdicts: run.verdicts,
      verified: run.verification.verified,
      ledger: run.ledger,
    });
  }

  /** Completes the run. On timeout the PENDING rows stay labelled and later ticks keep advancing them. */
  async function finish(run) {
    const s = run.settlement;
    const fallback = s.phase === "timer_fallback";
    run.receipt = receiptFor(run);
    run.roundTwo = run.receipt.roundTwo;
    run.settlement = { ...s, status: "done", finishedAt: iso(now()) };
    run.steps.settlement = { ...run.steps.settlement, status: "done", finishedAt: iso(now()) };
    run.status = "completed";
    run.nextStep = null;
    const job = s.job;
    await emit(run.id, EVENTS.settlementCompleted, {
      job,
      transfers: s.transfers.length,
      ...(fallback ? { fallback: "timer", pending: s.pending } : {}),
    });
    await emit(run.id, EVENTS.stepCompleted, { step: "settlement" });
    await emit(run.id, EVENTS.receiptReady, { receipt: run.receipt });
    await emit(run.id, EVENTS.roundTwoDecided, { allocations: run.roundTwo });
    await emit(run.id, EVENTS.runCompleted, {
      runId: run.id,
      net: run.receipt.consumer.net,
      signups: run.receipt.consumer.signups,
      badges: run.receipt.badges,
    });
  }

  /** The last PENDING row of a timed-out run turned final: rebuild the receipt with every row REAL. */
  async function finishLate(run) {
    run.receipt = receiptFor(run);
    run.roundTwo = run.receipt.roundTwo;
    run.settlement.settledAt = iso(now());
    await emit(run.id, EVENTS.settlementCompleted, { job: run.settlement.job, transfers: run.settlement.transfers.length, late: true });
    await emit(run.id, EVENTS.receiptReady, { receipt: run.receipt });
  }

  /** Initial settlement state for a new job. */
  function start(job) {
    const at = now();
    return {
      job,
      status: "running",
      phase: "waiting_for_lock",
      startedAt: iso(at),
      deadline: iso(at + timeoutMs),
      reconcileUntil: iso(at + reconcileMs),
      settled: [],
      transfers: [],
      feesCollected: [],
      feeTransfers: [],
      pending: null,
      ticks: 0,
    };
  }

  /** Still worth a tick: running, or completed on timeout with rows that can still turn REAL. */
  function isActive(run) {
    const s = run?.settlement;
    if (!s || run.mode === "canned") return false;
    if (s.status === "running") return true;
    return s.status === "done" && s.phase === "timer_fallback" && now() < Date.parse(s.reconcileUntil);
  }

  return { tick, start, isActive };
}
