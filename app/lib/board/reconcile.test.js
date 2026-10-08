import test from "node:test";
import assert from "node:assert/strict";
import { planSettlement } from "../settlement/plan.js";
import { EVENTS, STEPS } from "./index.js";
import { bidFeeResultHash, within } from "./reconcile.js";
import { createFixtureBoard } from "./worked-example.js";

const TX = "b".repeat(64);
const SUPPLIERS = ["techblog", "codepodcast", "devnewsletter"];

/**
 * A real-shaped adapter on a script: locks confirm after `lockAfter` advances, each settlement row turns REAL after
 * `rowAfter` advances. Receipt ids in `hang` never answer, ids in `stuck` never finish. Every call is recorded.
 * With `realFees`, bid fees lock PENDING with the commit as inputHash and the Board collects them (`collectBidFee`).
 */
function scriptedAdapter({ lockAfter = 2, rowAfter = 3, hang = new Set(), stuck = new Set(), realFees = false } = {}) {
  const calls = [];
  const rows = new Map();
  const advances = new Map();
  const receipt = (id, done, state) => {
    const r = rows.get(id);
    return {
      id, action: r.action, amount: r.amount, from: r.from, to: r.to, escrow: r.escrow, state,
      badge: done ? "REAL" : "PENDING",
      txHash: done ? TX : null,
      explorerUrl: done ? `https://preprod.cardanoscan.io/transaction/${TX}` : null,
    };
  };
  const lock = (action) => async ({ supplier, amount }) => {
    const id = `lock:${action}:${supplier}`;
    const [from, to] = action === "award" ? ["consumer", supplier] : [supplier, "board"];
    rows.set(id, { action, amount, from, to, escrow: `esc:${action}:${supplier}`, lock: true });
    return receipt(id, false, "FundsLockingRequested");
  };
  const realFee = async ({ supplier, amount, commit }) => {
    const id = `fee:${supplier}`;
    rows.set(id, { action: "bid_fee", amount, from: supplier, to: "board", escrow: `esc:fee:${supplier}`, lock: true });
    return { ...receipt(id, false, "FundsLockingRequested"), inputHash: commit };
  };
  return {
    calls,
    badge: "PENDING",
    lockBidFee: realFees ? realFee : async ({ supplier, amount }) => ({
      id: `fee:${supplier}`, badge: "SIMULATED", action: "bid_fee", amount, from: supplier, to: "board",
      txHash: `sim_${supplier}`, explorerUrl: null, state: "FundsLocked",
    }),
    ...(realFees ? {
      async collectBidFee({ supplier, bidFeeEscrowId, resultHash }) {
        calls.push({ op: "collect", supplier, bidFeeEscrowId, resultHash });
        const fee = rows.get(bidFeeEscrowId);
        const id = `row:bid_fee_collect:${supplier}`;
        rows.set(id, { action: "bid_fee_collect", amount: fee.amount, from: supplier, to: "board", escrow: fee.escrow });
        return receipt(id, false, "Pending");
      },
    } : {}),
    lockAward: lock("award"),
    lockBond: lock("bond"),
    async settle(verdict) {
      calls.push({ op: "settle", supplier: verdict.supplier, verdict });
      return planSettlement(verdict).map((m) => {
        const id = `row:${m.reason}:${verdict.supplier}`;
        const escrow = `esc:${m.reason.startsWith("award") ? "award" : "bond"}:${verdict.supplier}`;
        rows.set(id, { action: m.reason, amount: m.amount, from: m.from, to: m.to, escrow });
        return receipt(id, false, "Pending");
      });
    },
    async advance(id) {
      const r = rows.get(id);
      calls.push({ op: "advance", id, escrow: r.escrow });
      if (hang.has(id)) return new Promise(() => {});
      const n = (advances.get(id) ?? 0) + 1;
      advances.set(id, n);
      const done = !stuck.has(id) && n >= (r.lock ? lockAfter : rowAfter);
      return receipt(id, done, done ? (r.lock ? "FundsLocked" : "Withdrawn") : `Step${n}`);
    },
  };
}

/** A run with every step done up to settlement, and its settlement job started (first tick not yet run). */
async function atSettlement(adapter, overrides = {}) {
  const board = await createFixtureBoard({ adapter, sleep: async () => {}, ...overrides });
  const { id } = await board.createRun();
  for (const step of STEPS.slice(1, -1)) await board.runStep(id, step);
  const deferred = [];
  const { job } = await board.runStep(id, "settlement", { schedule: (fn) => deferred.push(fn) });
  return { board, id, job, firstTick: () => deferred[0]() };
}

const names = (events) => events.map((e) => e.name);

test("multi-poll: waits for locks, settles each supplier once with its escrow ids, completes when every row is REAL", async () => {
  const adapter = scriptedAdapter();
  const { board, id, job, firstTick } = await atSettlement(adapter);

  await firstTick();
  let state = await board.getSettlementJob(id, job);
  assert.equal(state.status, "running");
  assert.equal(state.phase, "waiting_for_lock");
  assert.equal(adapter.calls.filter((c) => c.op === "settle").length, 0);

  state = await board.pollSettlement(id, job);
  assert.equal(state.phase, "settling");
  const settles = adapter.calls.filter((c) => c.op === "settle");
  assert.deepEqual(settles.map((c) => c.supplier).sort(), [...SUPPLIERS].sort());
  for (const { supplier, verdict } of settles) {
    assert.equal(verdict.awardEscrowId, `lock:award:${supplier}`);
    assert.equal(verdict.bondEscrowId, `lock:bond:${supplier}`);
  }

  for (let i = 0; i < 20 && state.status === "running"; i++) state = await board.pollSettlement(id, job);
  assert.equal(state.status, "done");
  assert.equal(state.phase, "settled");
  assert.equal(state.pending, 0);
  assert.equal(adapter.calls.filter((c) => c.op === "settle").length, 3, "settle runs once per supplier");

  const run = await board.getRun(id);
  assert.equal(run.status, "completed");
  assert.ok(run.ledger.filter((l) => l.phase !== "bid_fee").every((l) => l.badge === "REAL" && l.explorerUrl));
  assert.equal(run.ledger.filter((l) => l.phase === "settlement").length, 7, "rows are updated in place, not appended");
  assert.deepEqual(run.receipt.badges.sort(), ["REAL", "SIMULATED"]);
  assert.equal(run.receipt.consumer.net, -108.75);
  assert.deepEqual(await board.store.listSettling(), []);

  const after = adapter.calls.length;
  await board.pollSettlement(id, job);
  assert.equal(adapter.calls.length, after, "a finished run is not advanced again");
});

test("idempotent polls: two polls at once run one tick", async () => {
  const adapter = scriptedAdapter();
  const { board, id, job, firstTick } = await atSettlement(adapter);
  await firstTick();
  const before = adapter.calls.length;
  await Promise.all([board.pollSettlement(id, job), board.pollSettlement(id, job)]);
  const advanced = adapter.calls.slice(before).filter((c) => c.op === "advance").map((c) => c.id);
  assert.equal(advanced.length, new Set(advanced).size, "no receipt advanced twice");
  assert.equal(advanced.length, 6, "one tick: the six locks");
});

test("one advance per escrow per tick: the two Short-of-promise transfers on one bond take turns", async () => {
  const adapter = scriptedAdapter({ lockAfter: 1, rowAfter: 4 });
  const { board, id, job, firstTick } = await atSettlement(adapter);
  await firstTick();
  let state = await board.getSettlementJob(id, job);
  for (let i = 0; i < 30 && state.status === "running"; i++) {
    const before = adapter.calls.length;
    state = await board.pollSettlement(id, job);
    const escrows = adapter.calls.slice(before).filter((c) => c.op === "advance").map((c) => c.escrow);
    assert.equal(escrows.length, new Set(escrows).size, `escrow stepped twice in one tick: ${escrows}`);
  }
  assert.equal(state.status, "done");
  const bondRows = adapter.calls.filter((c) => c.op === "advance" && c.escrow === "esc:bond:codepodcast" && c.id.startsWith("row:"));
  assert.deepEqual(new Set(bondRows.map((c) => c.id)), new Set(["row:bond_return:codepodcast", "row:bond_forfeit:codepodcast"]));
});

test("SSE: settlement.progress per change, settlement.transfer when a row turns REAL, then the run events", async () => {
  const adapter = scriptedAdapter();
  const { board, id, job, firstTick } = await atSettlement(adapter);
  await firstTick();
  let state = await board.getSettlementJob(id, job);
  for (let i = 0; i < 20 && state.status === "running"; i++) state = await board.pollSettlement(id, job);

  const events = await board.getEvents(id);
  const progress = events.filter((e) => e.name === EVENTS.settlementProgress);
  const lockConfirmed = progress.filter((e) => e.data.phase === "lock" && e.data.badge === "REAL");
  assert.equal(lockConfirmed.length, 6);
  assert.deepEqual(Object.keys(lockConfirmed[0].data).sort(),
    ["action", "badge", "explorerUrl", "phase", "receiptId", "state", "supplier", "txHash", "verdict"]);

  const transfers = events.filter((e) => e.name === EVENTS.settlementTransfer);
  assert.equal(transfers.filter((e) => e.data.receipt.badge === "PENDING").length, 7, "one per row on creation");
  const real = transfers.filter((e) => e.data.receipt.badge === "REAL");
  assert.equal(real.length, 7, "one per row when it turns REAL");
  assert.ok(real.every((e) => e.data.receipt.explorerUrl && !("supplier" in e.data.receipt)));

  const tail = names(events).slice(-5);
  assert.deepEqual(tail, [EVENTS.settlementCompleted, EVENTS.stepCompleted, EVENTS.receiptReady, EVENTS.roundTwoDecided, EVENTS.runCompleted]);
  const lastProgress = names(events).lastIndexOf(EVENTS.settlementProgress);
  assert.ok(lastProgress < names(events).indexOf(EVENTS.settlementCompleted));
});

test("timeout: the run completes with PENDING rows labelled, keeps being ticked, and finishes late with every row REAL", async () => {
  const stuck = new Set(["row:bond_forfeit:devnewsletter"]);
  const adapter = scriptedAdapter({ lockAfter: 1, rowAfter: 1, stuck });
  const { board, id, job, firstTick } = await atSettlement(adapter, { settlement: { timeoutMs: 2_000 } });
  await firstTick();
  let state = await board.getSettlementJob(id, job);
  for (let i = 0; i < 200 && state.status === "running"; i++) state = await board.pollSettlement(id, job);

  assert.equal(state.status, "done");
  assert.equal(state.phase, "timer_fallback");
  assert.equal(state.pending, 1);
  let run = await board.getRun(id);
  assert.equal(run.status, "completed");
  assert.ok(run.receipt.badges.includes("PENDING"));
  const done = (await board.getEvents(id)).find((e) => e.name === EVENTS.settlementCompleted);
  assert.deepEqual(done.data, { job, transfers: 7, fallback: "timer", pending: 1 });
  assert.deepEqual(await board.store.listSettling(), [id], "still reconciled after the timeout");

  stuck.clear();
  const [tick] = await board.reconcileActive();
  assert.deepEqual(tick, { runId: id, status: "done", phase: "settled", pending: 0 });
  run = await board.getRun(id);
  assert.ok(!run.receipt.badges.includes("PENDING"));
  assert.ok(run.settlement.settledAt);
  const late = (await board.getEvents(id)).filter((e) => e.name === EVENTS.settlementCompleted).at(-1);
  assert.equal(late.data.late, true);
  assert.deepEqual(await board.store.listSettling(), []);
});

test("late reconciliation stops at reconcileUntil", async () => {
  const adapter = scriptedAdapter({ lockAfter: 1, rowAfter: 1, stuck: new Set(["row:award_reclaim:devnewsletter"]) });
  const { board, id, job, firstTick } = await atSettlement(adapter, { settlement: { timeoutMs: 1_000, reconcileMs: 3_000 } });
  await firstTick();
  for (let i = 0; i < 300 && (await board.store.listSettling()).length; i++) await board.reconcileActive();
  assert.deepEqual(await board.store.listSettling(), []);
  const state = await board.getSettlementJob(id, job);
  assert.equal(state.phase, "timer_fallback");
  const calls = adapter.calls.length;
  await board.reconcile(id);
  assert.equal(adapter.calls.length, calls);
});

test("budget: a hung call does not block the tick; the other rows still progress", async () => {
  const adapter = scriptedAdapter({ lockAfter: 1, rowAfter: 1, hang: new Set(["row:award_release:techblog"]) });
  const { board, id, job, firstTick } = await atSettlement(adapter, { settlement: { budgetMs: 50 } });
  await firstTick();
  await board.pollSettlement(id, job);
  const state = await board.pollSettlement(id, job);
  assert.equal(state.status, "running");
  const rows = (await board.getRun(id)).settlement.transfers;
  const techAward = rows.find((r) => r.action === "award_release" && r.supplier === "techblog");
  assert.equal(techAward.badge, "PENDING");
  assert.ok(rows.filter((r) => r !== techAward).every((r) => r.badge === "REAL"));
});

test("reconcileActive ticks every running run and drops unknown ids", async () => {
  const adapter = scriptedAdapter({ lockAfter: 1, rowAfter: 1 });
  const { board, id, firstTick } = await atSettlement(adapter);
  await firstTick();
  await board.store.markSettling("run_gone");
  const out = await board.reconcileActive();
  assert.equal(out.find((r) => r.runId === id).phase, "settling");
  assert.match(out.find((r) => r.runId === "run_gone").error, /no run/);
  assert.deepEqual(await board.store.listSettling(), [id]);
});

test("runAll drives a real-shaped settlement to completed, polling between ticks", async () => {
  let sleeps = 0;
  const board = await createFixtureBoard({ adapter: scriptedAdapter(), sleep: async () => void sleeps++ });
  const { id } = await board.createRun();
  const run = await board.runAll(id);
  assert.equal(run.status, "completed");
  assert.equal(run.settlement.phase, "settled");
  assert.ok(sleeps > 2);
});

test("within: keeps what finished, drops what did not", async () => {
  const out = await within(30, [async () => 1, () => new Promise(() => {}), async () => { throw new Error("x"); }]);
  assert.deepEqual(out[0], { value: 1 });
  assert.equal(out[1], undefined);
  assert.equal(out[2].error.message, "x");
});

test("runAll with waitForSettlement false returns after the first tick, with settlement running", async () => {
  const board = await createFixtureBoard({ adapter: scriptedAdapter(), sleep: async () => assert.fail("must not wait") });
  const { id } = await board.createRun();
  const run = await board.runAll(id, { waitForSettlement: false });
  assert.equal(run.steps.settlement.status, "running");
  assert.equal(run.settlement.ticks, 1);
});

test("REAL bid fees: each lock is confirmed, then collected once for the Board with its result hash; the receipt math is unchanged", async () => {
  const adapter = scriptedAdapter({ realFees: true });
  const { board, id, job, firstTick } = await atSettlement(adapter);
  await firstTick();
  let state = await board.getSettlementJob(id, job);
  for (let i = 0; i < 20 && state.status === "running"; i++) state = await board.pollSettlement(id, job);
  assert.equal(state.status, "done");
  assert.equal(state.phase, "settled");

  const run = await board.getRun(id);
  const fees = run.ledger.filter((l) => l.phase === "bid_fee");
  assert.equal(fees.length, 4, "every bidder, the lost bid included");
  assert.ok(fees.every((l) => l.badge === "REAL" && l.explorerUrl && /^[0-9a-f]{64}$/.test(l.inputHash)));

  const collects = adapter.calls.filter((c) => c.op === "collect");
  assert.deepEqual(collects.map((c) => c.supplier).sort(), fees.map((l) => l.supplier).sort(), "collected once per bidder");
  for (const c of collects) {
    const fee = fees.find((l) => l.supplier === c.supplier);
    assert.equal(c.bidFeeEscrowId, fee.id);
    assert.equal(c.resultHash, bidFeeResultHash(run, fee));
  }
  const lost = run.bids.find((b) => !run.auction.accepted.some((a) => a.supplier === b.supplier)).supplier;
  assert.notEqual(collects.find((c) => c.supplier === lost).resultHash, collects.find((c) => c.supplier === "techblog").resultHash);

  const collected = run.ledger.filter((l) => l.phase === "bid_fee_collect");
  assert.equal(collected.length, 4);
  assert.ok(collected.every((l) => l.badge === "REAL" && l.to === "board"));
  assert.deepEqual(run.settlement.feeTransfers.map((t) => t.id).sort(), collected.map((l) => l.id).sort());
  assert.ok(run.settlement.transfers.every((t) => t.action !== "bid_fee_collect"), "supplier transfers stay verdict-only");
  assert.equal(run.receipt.consumer.net, -108.75);
  assert.equal(run.receipt.board.bidFees, 4 * run.tender.bidFee);
  assert.deepEqual(run.receipt.badges, ["REAL"]);
});

test("a stuck bid fee never holds back supplier settlement; the run times out with it PENDING, then collects it late", async () => {
  const stuck = new Set(["fee:devnewsletter"]);
  const adapter = scriptedAdapter({ realFees: true, stuck });
  const { board, id, job, firstTick } = await atSettlement(adapter, { settlement: { timeoutMs: 2_000 } });
  await firstTick();
  await board.pollSettlement(id, job);
  assert.equal(adapter.calls.filter((c) => c.op === "settle").length, 3, "all three verdicts settle while the fee lock is stuck");

  let state = await board.getSettlementJob(id, job);
  for (let i = 0; i < 200 && state.status === "running"; i++) state = await board.pollSettlement(id, job);
  assert.equal(state.phase, "timer_fallback");
  assert.equal(state.pending, 1, "the stuck fee is the only open row");
  let run = await board.getRun(id);
  assert.ok(run.ledger.filter((l) => l.phase === "settlement").every((l) => l.badge === "REAL"), "refund and releases finish");
  assert.equal(run.ledger.find((l) => l.id === "fee:devnewsletter").badge, "PENDING");
  assert.ok(!adapter.calls.some((c) => c.op === "collect" && c.supplier === "devnewsletter"), "an unconfirmed fee is never collected");

  stuck.clear();
  for (let i = 0; i < 20 && (await board.store.listSettling()).length; i++) await board.reconcileActive();
  run = await board.getRun(id);
  assert.equal(run.settlement.phase, "settled");
  assert.equal(adapter.calls.filter((c) => c.op === "collect" && c.supplier === "devnewsletter").length, 1);
  assert.ok(!run.receipt.badges.includes("PENDING"));
});
