import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EVENTS } from "../board/events.js";
import { createMemoryStore } from "../board/store.js";
import { isStreamDone, streamEvents } from "../board/sse.js";
import { installNextResolution } from "../board/test-alias.js";
import { FAST_BUDGET_MS, clearRecordingCache, createReplay, describeReplay, loadRecording, paceEvents, prepareRecording, readSpeed, validateRecording, withReplayPacing } from "./index.js";

installNextResolution();
const { createFixtureBoard, FIXTURE_RUN_ID } = await import("../board/worked-example.js");
const bundled = (await import("../../data/canned/run.json", { with: { type: "json" } })).default;
const fixtureDoc = () => structuredClone(bundled);
const names = (events) => events.map((e) => e.name);

const REAL_HASH = "a".repeat(64);
const explorer = `https://preprod.cardanoscan.io/transaction/${REAL_HASH}`;

/** A recording shaped like the real #45 run: some REAL rows with hashes, some PENDING, some SIMULATED. */
function realisticDoc() {
  const doc = fixtureDoc();
  const lock = doc.run.ledger.find((l) => l.phase === "lock" && l.action === "award");
  Object.assign(lock, { badge: "REAL", txHash: REAL_HASH, explorerUrl: explorer });
  const bond = doc.run.ledger.find((l) => l.phase === "lock" && l.action === "bond");
  Object.assign(bond, { badge: "REAL", txHash: "sim_not_a_real_hash", explorerUrl: null });
  const pending = doc.run.settlement.transfers[0];
  Object.assign(pending, { badge: "PENDING", state: "WithdrawRequested", txHash: null, explorerUrl: null });
  for (const e of doc.events) {
    if (e.name === EVENTS.escrowLocked && e.data.receipt.id === lock.id) e.data.receipt = { ...lock };
  }
  doc.run.badge = "REAL";
  doc.events[0].data.badge = "REAL";
  doc.events[0].data.mode = "live";
  return { doc, lock, bond, pending };
}

test("bundled recording loads, validates and reports its source", () => {
  clearRecordingCache();
  const rec = loadRecording({ env: {} });
  assert.equal(rec.source, "data/canned/run.json");
  assert.equal(rec.events.length, bundled.events.length);
  assert.equal(rec.run.mode, "canned");
  assert.equal(rec.run.badge, "PRE-RECORDED");
  assert.equal(describeReplay({ env: {} }).ok, true);
});

test("replay relabels money: SIMULATED to PRE-RECORDED, REAL keeps hash and link, PENDING stays", () => {
  const { doc, lock, pending } = realisticDoc();
  const rec = prepareRecording(doc, "test");

  const rows = rec.run.ledger;
  assert.equal(rows.find((l) => l.id === lock.id).badge, "REAL");
  assert.equal(rows.find((l) => l.id === lock.id).txHash, REAL_HASH);
  assert.equal(rows.find((l) => l.id === lock.id).explorerUrl, explorer);
  assert.equal(rows.filter((l) => l.badge === "SIMULATED").length, 0);
  assert.equal(rec.run.settlement.transfers.find((t) => t.id === pending.id).badge, "PENDING");

  const bondRow = rows.find((l) => l.phase === "lock" && l.action === "bond");
  assert.equal(bondRow.badge, "PRE-RECORDED", "a REAL badge without a real tx hash must not survive");
  assert.equal(rec.info.downgradedToPreRecorded >= 1, true);
  assert.equal(rec.info.realTransfers, 1);

  const created = rec.events[0].data;
  assert.equal(created.badge, "PRE-RECORDED");
  assert.equal(created.mode, "canned");
  const completed = rec.events.at(-1).data;
  assert.equal(completed.badges.includes("SIMULATED"), false);
  assert.equal(rec.run.receipt.badges.includes("SIMULATED"), false);
  const lockEvent = rec.events.find((e) => e.name === EVENTS.escrowLocked && e.data.receipt.id === lock.id);
  assert.equal(lockEvent.data.receipt.badge, "REAL");
});

test("replay keeps the recorded timestamps and does not touch the source document", () => {
  const { doc } = realisticDoc();
  const before = JSON.stringify(doc);
  const rec = prepareRecording(doc, "test");
  assert.equal(JSON.stringify(doc), before);
  assert.deepEqual(rec.events.map((e) => e.ts), doc.events.map((e) => e.ts));
});

test("validateRecording rejects broken recordings", () => {
  const bad = (mutate, pattern) => {
    const doc = fixtureDoc();
    mutate(doc);
    assert.throws(() => validateRecording(doc), pattern);
  };
  bad((d) => (d.events = []), /missing events/);
  bad((d) => (d.events[3].name = "nope"), /unknown name/);
  bad((d) => (d.events[3].ts = "yesterday"), /valid ts/);
  bad((d) => d.events.pop(), /last event/);
  bad((d) => (d.run.status = "failed"), /status/);
  bad((d) => delete d.run.tender, /tender/);
  assert.throws(() => validateRecording(null), /not an object/);
});

test("REPLAY_RECORDING swaps the recording with no code change", () => {
  clearRecordingCache();
  const { doc } = realisticDoc();
  doc.run.id = "run_recorded-on-preprod";
  const dir = mkdtempSync(join(tmpdir(), "replay-"));
  const file = join(dir, "run.json");
  writeFileSync(file, JSON.stringify(doc));

  const rec = loadRecording({ env: { REPLAY_RECORDING: file } });
  assert.equal(rec.info.recordedRunId, "run_recorded-on-preprod");
  assert.equal(rec.info.realTransfers, 1);
  assert.equal(loadRecording({ env: {} }).info.recordedRunId, bundled.run.id, "the bundled recording is untouched");

  assert.throws(() => loadRecording({ env: { REPLAY_RECORDING: join(dir, "missing.json") } }), /ENOENT/);
  assert.equal(describeReplay({ env: { REPLAY_RECORDING: join(dir, "missing.json") } }).ok, false);
  clearRecordingCache();
});

test("fast pacing fits the budget, never goes backwards, and keeps the 0.35 s step pause", () => {
  const offsets = paceEvents(bundled.events);
  assert.equal(offsets.length, bundled.events.length);
  assert.equal(offsets[0], 0);
  assert.ok(offsets.at(-1) <= FAST_BUDGET_MS);
  assert.ok(offsets.at(-1) >= 15_000, `a 58-event run should not rush: ${offsets.at(-1)} ms`);
  offsets.forEach((o, i) => i && assert.ok(o >= offsets[i - 1]));
  bundled.events.forEach((e, i) => {
    if (e.name === EVENTS.stepStarted && i > 0) assert.ok(offsets[i] - offsets[i - 1] >= 350, `pause before ${e.data.step}`);
  });
});

test("fast pacing compresses a long recording into the same budget", () => {
  const many = Array.from({ length: 600 }, (_, i) => ({ ts: "2026-10-09T00:00:00.000Z", name: i % 2 ? EVENTS.settlementProgress : EVENTS.settlementTransfer }));
  const offsets = paceEvents(many);
  assert.ok(offsets.at(-1) <= FAST_BUDGET_MS);
  assert.ok(offsets.at(-1) > 0);
});

test("normal pacing follows recorded timestamps, instant has no delay", () => {
  const events = [
    { ts: "2026-10-09T00:00:00.000Z", name: EVENTS.runCreated },
    { ts: "2026-10-09T00:00:02.500Z", name: EVENTS.stepStarted },
    { ts: "2026-10-09T00:13:00.000Z", name: EVENTS.runCompleted },
  ];
  assert.deepEqual(paceEvents(events, { speed: "normal" }), [0, 2500, 780_000]);
  assert.deepEqual(paceEvents(events, { speed: "instant" }), [0, 0, 0]);
  assert.equal(readSpeed({ REPLAY_SPEED: "NORMAL" }), "normal");
  assert.equal(readSpeed({ REPLAY_SPEED: "warp" }), "fast");
  assert.equal(readSpeed({}), "fast");
});

/** Canned Board on a controllable clock, memory store only (no network). */
async function cannedBoard({ env = {}, overrides = {} } = {}) {
  const clock = { t: Date.parse("2026-10-09T05:00:00.000Z") };
  const now = () => clock.t;
  const store = withReplayPacing(createMemoryStore(), { now });
  const board = await createFixtureBoard({
    store,
    canned: createReplay({ env, now }),
    flags: { simulatePayments: true, demoMode: "canned" },
    ...overrides,
  });
  return { board, store, clock };
}

test("canned run emits the fixture's event stream, in order, paced across the budget", async () => {
  const { board, clock } = await cannedBoard();
  const run = await board.createRun();
  assert.equal(run.mode, "canned");
  assert.equal(run.id, FIXTURE_RUN_ID);

  assert.deepEqual(names(await board.getEvents(run.id)), [EVENTS.runCreated], "only the first event is due at t=0");

  const shown = [];
  let seq = 0;
  for (let t = 0; t <= FAST_BUDGET_MS + 1000; t += 250) {
    clock.t = Date.parse("2026-10-09T05:00:00.000Z") + t;
    const batch = await board.getEvents(run.id, seq);
    shown.push(...batch);
    seq = shown.at(-1).seq;
  }
  assert.deepEqual(names(shown), names(bundled.events));
  assert.deepEqual(shown.map((e) => e.seq), shown.map((_, i) => i + 1));
  assert.deepEqual(shown.map((e) => e.ts), bundled.events.map((e) => e.ts), "recorded timestamps are kept");
  assert.equal(shown[0].data.runId, run.id);
});

test("canned run state fills in step by step and completes with the receipt", async () => {
  const { board, clock } = await cannedBoard();
  const start = clock.t;
  const run = await board.createRun();
  assert.equal(run.status, "in_progress");
  assert.equal(run.receipt, null);
  assert.equal(run.steps.bids.status, "pending");
  assert.deepEqual(run.ledger, []);

  const offsets = paceEvents(bundled.events);
  const at = (name, step) => {
    const i = bundled.events.findIndex((e) => e.name === name && (!step || e.data.step === step));
    return start + offsets[i];
  };

  clock.t = at(EVENTS.stepCompleted, "bids");
  let mid = await board.getRun(run.id);
  assert.equal(mid.bids.length, 4);
  assert.equal(mid.ledger.length, 4, "bid fees only");
  assert.equal(mid.auction, null);
  assert.equal(mid.status, "in_progress");
  assert.equal(mid.nextStep, "allocation");

  clock.t = at(EVENTS.stepCompleted, "locks");
  mid = await board.getRun(run.id);
  assert.ok(mid.auction);
  assert.equal(mid.ledger.length, 4 + 6);
  assert.equal(mid.settlement, null);

  clock.t = start + offsets.at(-1);
  const done = await board.getRun(run.id);
  assert.equal(done.status, "completed");
  assert.equal(done.mode, "canned");
  assert.equal(done.badge, "PRE-RECORDED");
  assert.equal(done.receipt.consumer.net, bundled.run.receipt.consumer.net);
  assert.equal(done.settlement.transfers.length, bundled.run.settlement.transfers.length);
  assert.ok(done.ledger.every((l) => ["PRE-RECORDED", "REAL"].includes(l.badge)));
  assert.equal(done.replay.speed, "fast");
});

test("the SSE stream finishes a canned run in under 30 s with the network off", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("network is off"));
  try {
    const { board, store, clock } = await cannedBoard();
    const start = clock.t;
    const run = await board.createRun();
    const sleep = async (ms) => {
      clock.t += ms;
    };

    const frames = [];
    for await (const frame of streamEvents({ store, runId: run.id, sleep, now: () => clock.t, maxMs: 60_000, heartbeatMs: 1e9 })) {
      frames.push(frame);
    }
    const eventNames = frames.filter((f) => f.startsWith("id:")).map((f) => f.match(/event: (.+)/)[1]);
    assert.deepEqual(eventNames, names(bundled.events));
    assert.equal(eventNames.at(-1), EVENTS.runCompleted);
    assert.ok(clock.t - start < 30_000, `took ${clock.t - start} ms`);
    assert.equal(await isStreamDone({ store, runId: run.id, after: eventNames.length }), true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a closed canned run is never done before its last event is due", async () => {
  const { board, store, clock } = await cannedBoard();
  const run = await board.createRun();
  assert.equal(await isStreamDone({ store, runId: run.id, after: 0 }), false);
  clock.t += FAST_BUDGET_MS + 1;
  assert.equal(await isStreamDone({ store, runId: run.id, after: bundled.events.length }), true);
});

test("steps and runAll leave a canned run alone", async () => {
  const { board, clock } = await cannedBoard();
  const run = await board.createRun();
  assert.equal((await board.runAll(run.id)).mode, "canned");
  await assert.rejects(() => board.runStep(run.id, "bids"), { code: "run_closed" });
  clock.t += FAST_BUDGET_MS + 1;
  assert.equal((await board.getRun(run.id)).status, "completed");
});

test("instant speed shows the whole run at once", async () => {
  const { board } = await cannedBoard({ env: { REPLAY_SPEED: "instant" } });
  const run = await board.createRun();
  assert.equal(run.status, "completed");
  assert.equal((await board.getEvents(run.id)).length, bundled.events.length);
});

test("a live step failure degrades to the paced replay and says so", async () => {
  const clock = { t: Date.parse("2026-10-09T05:00:00.000Z") };
  const now = () => clock.t;
  const store = withReplayPacing(createMemoryStore(), { now });
  const board = await createFixtureBoard({
    store,
    canned: createReplay({ env: {}, now }),
    flags: { simulatePayments: true, demoMode: "live" },
    bidSource: async () => {
      throw new Error("openrouter timeout");
    },
  });
  await board.createRun();
  const out = await board.runAll(FIXTURE_RUN_ID);
  assert.equal(out.mode, "canned");
  assert.equal(out.degradedFrom.step, "bids");

  const first = names(await board.getEvents(FIXTURE_RUN_ID));
  assert.deepEqual(first.slice(0, 8), [
    EVENTS.runCreated,
    EVENTS.tenderPublished,
    EVENTS.stepCompleted,
    EVENTS.stepStarted,
    EVENTS.registryDiscovered,
    EVENTS.stepFailed,
    EVENTS.modeDegraded,
    EVENTS.runCreated,
  ]);
  assert.ok(first.length < bundled.events.length + 7, "replay events are not all due yet");

  clock.t += FAST_BUDGET_MS + 1;
  const all = names(await board.getEvents(FIXTURE_RUN_ID));
  assert.equal(all.length, 7 + bundled.events.length);
  assert.equal(all.at(-1), EVENTS.runCompleted);
  assert.equal((await board.getRun(FIXTURE_RUN_ID)).status, "completed");
});

test("live runs pass through the pacing wrapper untouched", async () => {
  const store = withReplayPacing(createMemoryStore(), { now: () => 0 });
  await store.setRun({ id: "r1", mode: "live", status: "in_progress" });
  await store.appendEvent("r1", { ts: "t", name: EVENTS.runCreated, data: {} });
  assert.equal((await store.getRun("r1")).status, "in_progress");
  assert.equal((await store.getEvents("r1")).length, 1);
});
