import { randomUUID } from "node:crypto";
import { commit, evaluateBids } from "../auction/index.js";
import { TENDER, getFlags } from "../config.js";
import { generateFeed } from "../outcome-feed/index.js";
import { publicKeyFromSecret, publicKeyHex } from "../signing/index.js";
import { buildVerdict, verify, verifyVerdict } from "../verifier/index.js";
import { BoardError, EVENTS, STEPS } from "./events.js";
import { SETTLEMENT, assertBadged, createReconciler } from "./reconcile.js";
import { BRIEF, SUPPLIERS, pinnedBids, scriptedDelivery } from "./scenario.js";

export { BoardError, EVENTS, EVENT_NAMES, STEPS, TERMINAL_EVENTS } from "./events.js";
export { createMemoryStore, createStoreFromEnv, createUpstashStore } from "./store.js";
export { SSE_HEADERS, formatSse, isStreamDone, streamEvents } from "./sse.js";
export { buildReceipt } from "./receipt.js";
export { SETTLEMENT, isTerminal } from "./reconcile.js";
export { SUPPLIERS, pinnedBids } from "./scenario.js";

const BID_WINDOW_MS = 55_000;
const FEED_WINDOW_MS = 60 * 60_000;
const STEP_LOCK_SECONDS = 120;

const iso = (ms) => new Date(ms).toISOString();
const round = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Tender Board orchestration. Pure: all I/O goes through the injected store and adapter.
 *
 * @param {Object} deps
 * @param {import("./store.js").BoardStore} deps.store
 * @param {object} deps.adapter        the getAdapter() contract from app/lib/masumi
 * @param {object | (() => object)} [deps.flags]   { simulatePayments, demoMode }
 * @param {() => {shop?: string, board?: string}} [deps.secrets]   defaults to the env vars
 * @param {() => number} [deps.now]
 * @param {() => string} [deps.newId]
 * @param {() => string} [deps.newJobId]
 * @param {(args: {tender: object, suppliers: object[], run: object}) => Promise<object[]>} [deps.bidSource]
 * @param {((args: {runId: string}) => Promise<{run: object, events: object[]}> | null) | null} [deps.canned]
 * @param {Partial<typeof import("./reconcile.js").SETTLEMENT>} [deps.settlement]   timing overrides (tests)
 * @param {() => number} [deps.clock]   wall clock for the per-tick budget; `now` may be a fixture clock
 * @param {(ms: number) => Promise<void>} [deps.sleep]   runAll's wait between settlement ticks
 */
export function createBoard({
  store,
  adapter,
  flags = getFlags,
  secrets = () => ({ shop: process.env.SHOP_SIGNING_KEY, board: process.env.BOARD_SIGNING_KEY }),
  now = Date.now,
  newId = () => `run_${randomUUID().slice(0, 8)}`,
  newJobId = () => `job_${randomUUID().slice(0, 12)}`,
  bidSource = pinnedBids,
  canned = null,
  settlement = {},
  clock = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const readFlags = () => (typeof flags === "function" ? flags() : flags);

  const emit = (runId, name, data = {}) => store.appendEvent(runId, { ts: iso(now()), name, data });
  const timing = { ...SETTLEMENT, ...settlement };
  const reconciler = createReconciler({ adapter, now, emit, clock, options: timing });

  async function need(runId) {
    const run = await store.getRun(runId);
    if (!run) throw new BoardError(404, "run_not_found", `no run ${runId}`);
    return run;
  }

  function addToLedger(run, receipts, phase, supplier) {
    for (const receipt of receipts) {
      assertBadged(receipt);
      run.ledger.push({ ...receipt, phase, supplier });
    }
  }

  function pendingStep(run) {
    return STEPS.find((s) => run.steps[s].status !== "done") ?? null;
  }

  async function loadCanned(runId, cause) {
    const transcript = await canned({ runId });
    const run = { ...transcript.run, id: runId, mode: "canned" };
    if (cause) run.degradedFrom = cause;
    await store.setRun(run);
    if (cause) await emit(runId, EVENTS.modeDegraded, { mode: "canned", ...cause });
    for (const event of transcript.events) await store.appendEvent(runId, event);
    // Read back through the store: a paced replay shows only what is due, like a live run.
    return (await store.getRun(runId)) ?? run;
  }

  /** Creates a run and publishes the tender. In DEMO_MODE=canned with a replay installed, loads the replay instead. */
  async function createRun({ brief = BRIEF, seed = 1 } = {}) {
    const runId = newId();

    if (readFlags().demoMode === "canned" && canned) {
      try {
        return await loadCanned(runId);
      } catch (err) {
        // A broken replay must not stop the live path: fall through and run live.
        console.error("canned replay failed, running live", err);
      }
    }

    const keys = secrets();
    let shopPublic;
    let boardPublic;
    try {
      shopPublic = publicKeyHex(publicKeyFromSecret(keys.shop));
      boardPublic = publicKeyHex(publicKeyFromSecret(keys.board));
    } catch (err) {
      throw new BoardError(500, "signing_secret_missing", "set SHOP_SIGNING_KEY and BOARD_SIGNING_KEY", {
        cause: err.message,
      });
    }

    const createdAt = now();
    const run = {
      id: runId,
      createdAt: iso(createdAt),
      mode: "live",
      badge: adapter.badge,
      seed,
      status: "in_progress",
      nextStep: "bids",
      steps: Object.fromEntries(STEPS.map((s) => [s, { status: "pending" }])),
      brief,
      tender: { ...TENDER, audience: brief.audience },
      suppliers: SUPPLIERS,
      keys: { shop: shopPublic, board: boardPublic },
      bids: [],
      auction: null,
      feed: null,
      verification: null,
      verdicts: [],
      settlement: null,
      ledger: [],
      receipt: null,
      roundTwo: null,
    };
    run.steps.tender = { status: "done", startedAt: iso(createdAt), finishedAt: iso(createdAt) };

    await store.setRun(run);
    await emit(runId, EVENTS.runCreated, { runId, mode: run.mode, badge: run.badge, keys: run.keys });
    await emit(runId, EVENTS.tenderPublished, { tender: run.tender, brief, suppliers: SUPPLIERS });
    await emit(runId, EVENTS.stepCompleted, { step: "tender" });
    return run;
  }

  const handlers = {
    async bids(run) {
      run.tender.deadline = now() + BID_WINDOW_MS;
      const quotes = await bidSource({ tender: run.tender, suppliers: run.suppliers, run });

      // Commit phase: the Board stamps the receive time and posts only the hash.
      const bids = quotes.map((q) => ({
        ...q,
        commit: q.commit ?? commit(q),
        committedAt: q.committedAt ?? now(),
      }));
      for (const b of bids) {
        await emit(run.id, EVENTS.bidCommitted, { supplier: b.supplier, commit: b.commit, committedAt: b.committedAt });
      }

      // Bid fees: every bidder pays, the Board keeps it. Locked in parallel, not returned.
      const fees = await Promise.all(bids.map((b) => adapter.lockBidFee({ supplier: b.supplier, amount: run.tender.bidFee })));
      for (const [i, receipt] of fees.entries()) {
        addToLedger(run, [receipt], "bid_fee", bids[i].supplier);
        await emit(run.id, EVENTS.bidFeeLocked, { supplier: bids[i].supplier, receipt });
      }

      // Reveal phase: bid + salt after close. The allocation step recomputes the commit.
      run.bids = bids;
      for (const b of bids) {
        await emit(run.id, EVENTS.bidRevealed, {
          supplier: b.supplier,
          price: b.price,
          impressions: b.impressions,
          promisedPer1000: b.promisedPer1000,
          salt: b.salt,
        });
      }
    },

    async allocation(run) {
      const result = evaluateBids({ tender: run.tender, bids: run.bids });
      run.auction = { ...result, totalAward: round(result.accepted.reduce((t, b) => t + b.award, 0)) };
      for (const r of result.rejected) await emit(run.id, EVENTS.bidRejected, r);
      await emit(run.id, EVENTS.auctionRanked, { ranking: result.ranking });
      await emit(run.id, EVENTS.allocationDecided, {
        accepted: result.accepted,
        rejected: result.rejected,
        totalAward: run.auction.totalAward,
        budget: run.tender.budget,
      });
    },

    async locks(run) {
      // Awards and bonds lock in parallel: payment polling is the slow part on the real adapter.
      const pairs = await Promise.all(
        run.auction.accepted.map(async (a) => {
          const [award, bond] = await Promise.all([
            adapter.lockAward({ supplier: a.supplier, amount: a.award }),
            adapter.lockBond({ supplier: a.supplier, amount: a.bond }),
          ]);
          return { supplier: a.supplier, award, bond };
        }),
      );
      for (const p of pairs) {
        addToLedger(run, [p.award, p.bond], "lock", p.supplier);
        await emit(run.id, EVENTS.escrowLocked, { supplier: p.supplier, kind: "award", receipt: p.award });
        await emit(run.id, EVENTS.escrowLocked, { supplier: p.supplier, kind: "bond", receipt: p.bond });
      }
    },

    async feed(run) {
      const end = now();
      const window = { start: iso(end - FEED_WINDOW_MS), end: iso(end) };
      const { events, impressions } = generateFeed({
        seed: run.seed,
        window,
        signingSecret: secrets().shop,
        suppliers: run.auction.accepted.map((a) => ({
          id: a.supplier,
          impressions: a.impressions,
          signupsPer1000: scriptedDelivery({ supplier: a.supplier, promisedPer1000: a.promisedPer1000 }),
        })),
      });
      run.feed = { window, impressions, events };
      for (const supplier of Object.keys(impressions)) {
        const mine = events.filter((e) => e.supplier === supplier);
        await emit(run.id, EVENTS.feedServed, {
          supplier,
          impressions: impressions[supplier],
          signupsReceived: mine.length,
          flaggedBySignals: mine.filter((e) => e.signals?.clickBurst).length,
        });
      }
      await emit(run.id, EVENTS.feedGenerated, { window, impressions, signupsReceived: events.length });
    },

    async verification(run) {
      const { verified, rejections } = verify(run.feed.events, { window: run.feed.window, shopPublicKey: run.keys.shop });
      const perSupplier = Object.keys(run.feed.impressions).map((supplier) => {
        const rejected = {};
        for (const r of rejections.filter((x) => x.supplier === supplier)) rejected[r.reason] = (rejected[r.reason] ?? 0) + 1;
        return {
          supplier,
          received: run.feed.events.filter((e) => e.supplier === supplier).length,
          verified: verified[supplier] ?? 0,
          rejected,
        };
      });
      run.verification = { verified, rejections, perSupplier };
      await emit(run.id, EVENTS.verificationCompleted, run.verification);
    },

    async verdicts(run) {
      run.verdicts = run.auction.accepted.map((a) =>
        buildVerdict({
          supplier: a.supplier,
          verified: run.verification.verified[a.supplier] ?? 0,
          impressions: run.feed.impressions[a.supplier],
          promised: a.promisedPer1000,
          award: a.award,
          gate: run.tender.gate,
          bondRate: run.tender.bondRate,
          signingSecret: secrets().board,
        }),
      );
      for (const v of run.verdicts) {
        if (!verifyVerdict(v, run.keys.board)) throw new Error(`verdict for ${v.supplier} failed its own signature check`);
        await emit(run.id, EVENTS.verdictSigned, v);
      }
    },
  };

  /** Runs one step end to end. Idempotent for finished steps. Never used for settlement, see startSettlement. */
  async function execute(runId, step, handler, { running = false } = {}) {
    const run = await need(runId);
    if (run.steps[step].status === "done") return { run, repeated: true };
    if (run.status === "failed" || run.mode === "canned") {
      throw new BoardError(409, "run_closed", `run is ${run.mode === "canned" ? "canned" : "failed"}`, { runStatus: run.status });
    }
    const expected = pendingStep(run);
    if (expected !== step) {
      throw new BoardError(409, "out_of_order", `next step is ${expected}, not ${step}`, { expected });
    }
    if (!(await store.claim(`${runId}:${step}`, STEP_LOCK_SECONDS))) {
      throw new BoardError(409, "in_progress", `${step} is already running`);
    }

    run.steps[step] = { status: "running", startedAt: iso(now()) };
    await store.setRun(run);
    await emit(runId, EVENTS.stepStarted, { step });
    try {
      await handler(run);
      run.steps[step] = { ...run.steps[step], status: "done", finishedAt: iso(now()) };
      run.nextStep = pendingStep(run);
      await store.setRun(run);
      await emit(runId, EVENTS.stepCompleted, { step });
      await store.release(`${runId}:${step}`);
      return { run, repeated: false };
    } catch (err) {
      await store.release(`${runId}:${step}`);
      return failStep(run, step, err);
    }
  }

  /** On failure: degrade to the canned replay if one is installed, else close the run as failed. */
  async function failStep(run, step, err) {
    run.steps[step] = { ...run.steps[step], status: "failed", error: err.message, finishedAt: iso(now()) };
    await emit(run.id, EVENTS.stepFailed, { step, error: err.message });
    if (canned) {
      try {
        return { run: await loadCanned(run.id, { step, error: err.message }), repeated: false, degraded: true };
      } catch (cannedErr) {
        console.error("canned degrade failed", cannedErr);
      }
    }
    run.status = "failed";
    await store.setRun(run);
    await emit(run.id, EVENTS.runFailed, { step, error: err.message });
    throw err;
  }

  /**
   * Starts the settlement job and returns its token. The first reconcile tick runs through `schedule`
   * (Next `after()` in the route) so the HTTP call returns inside the function limit. Later ticks come from
   * settlement polls and the Railway trigger (`reconcileActive`) until every escrow is final.
   */
  async function startSettlement(runId, { schedule = (fn) => void fn() } = {}) {
    const run = await need(runId);
    if (run.steps.settlement.status === "done" || run.steps.settlement.status === "running") {
      return { run, job: run.settlement?.job, repeated: true };
    }
    if (run.status === "failed" || run.mode === "canned") {
      throw new BoardError(409, "run_closed", `run is ${run.mode === "canned" ? "canned" : "failed"}`);
    }
    const expected = pendingStep(run);
    if (expected !== "settlement") {
      throw new BoardError(409, "out_of_order", `next step is ${expected}, not settlement`, { expected });
    }
    if (!(await store.claim(`${runId}:settlement`, STEP_LOCK_SECONDS))) {
      throw new BoardError(409, "in_progress", "settlement is already running");
    }

    const job = newJobId();
    run.steps.settlement = { status: "running", startedAt: iso(now()) };
    run.settlement = reconciler.start(job);
    await store.setRun(run);
    await store.markSettling(runId);
    await emit(runId, EVENTS.stepStarted, { step: "settlement" });
    await emit(runId, EVENTS.settlementStarted, { job });
    schedule(async () => {
      try {
        await reconcile(runId);
      } finally {
        await store.release(`${runId}:settlement`);
      }
    });
    return { run, job, repeated: false };
  }

  /**
   * One reconcile tick for a run: bounded, idempotent, safe to call from any poll. A tick already in progress
   * makes this a no-op. Returns the run as stored afterwards.
   */
  async function reconcile(runId) {
    const run = await need(runId);
    if (!reconciler.isActive(run)) {
      await store.unmarkSettling(runId);
      return run;
    }
    const key = `${runId}:reconcile`;
    if (!(await store.claim(key, timing.claimSeconds))) return run;
    try {
      await reconciler.tick(run);
      await store.setRun(run);
      if (!reconciler.isActive(run)) await store.unmarkSettling(runId);
      return run;
    } catch (err) {
      // Only `settle` throwing lands here: a bug or broken config, not a slow chain. Close it like any step.
      run.settlement = { ...run.settlement, status: "failed", error: err.message };
      await store.unmarkSettling(runId);
      await failStep(run, "settlement", err).catch(() => {});
      return need(runId);
    } finally {
      await store.release(key);
    }
  }

  /** Ticks every run with settlement work left, at most `limit`. For the Railway trigger. */
  async function reconcileActive({ limit = 3 } = {}) {
    const ids = (await store.listSettling()).slice(0, limit);
    return Promise.all(
      ids.map(async (runId) => {
        try {
          const run = await reconcile(runId);
          const s = run.settlement ?? {};
          return { runId, status: s.status, phase: s.phase, pending: s.pending };
        } catch (err) {
          if (err instanceof BoardError && err.code === "run_not_found") await store.unmarkSettling(runId);
          return { runId, error: err.message };
        }
      }),
    );
  }

  async function getSettlementJob(runId, job) {
    const run = await need(runId);
    if (!run.settlement || run.settlement.job !== job) throw new BoardError(404, "job_not_found", `no settlement job ${job}`);
    return { ...run.settlement, receipt: run.receipt };
  }

  /** The settlement poll: checks the job token, runs one tick, returns the job. */
  async function pollSettlement(runId, job) {
    await getSettlementJob(runId, job);
    await reconcile(runId);
    return getSettlementJob(runId, job);
  }

  /** Runs one named step. `settlement` returns a job token and finishes in the background. */
  async function runStep(runId, step, { schedule } = {}) {
    if (!STEPS.includes(step) || step === "tender") {
      throw new BoardError(404, "unknown_step", `unknown step ${step}`, { steps: STEPS.slice(1) });
    }
    if (step === "settlement") return startSettlement(runId, { schedule });
    return execute(runId, step, handlers[step]);
  }

  async function nextStep(runId, opts) {
    const run = await need(runId);
    const step = pendingStep(run);
    if (!step) return { run, repeated: true };
    return runStep(runId, step, opts);
  }

  /**
   * Runs every remaining step, settlement included, and returns the finished run. For scripts, tests and the canned
   * recorder. `waitForSettlement: false` returns after the first settlement tick (HTTP routes: polls finish the rest).
   */
  async function runAll(runId, { waitForSettlement = true } = {}) {
    let jobs = [];
    for (;;) {
      const run = await need(runId);
      const step = pendingStep(run);
      if (!step || run.status === "completed" || run.mode === "canned") return run;
      if (run.status === "failed") throw new BoardError(409, "run_closed", "run failed");
      if (step === "settlement" && run.steps.settlement.status === "running") {
        if (!waitForSettlement) return run;
        await sleep(timing.pollMs);
        await reconcile(runId);
        continue;
      }
      const out = await runStep(runId, step, { schedule: (fn) => jobs.push(fn()) });
      if (out.degraded) return out.run;
      await Promise.all(jobs);
      jobs = [];
    }
  }

  return {
    store,
    createRun,
    getRun: need,
    getEvents: (runId, after = 0) => store.getEvents(runId, after),
    runStep,
    nextStep,
    runAll,
    startSettlement,
    getSettlementJob,
    pollSettlement,
    reconcile,
    reconcileActive,
  };
}
