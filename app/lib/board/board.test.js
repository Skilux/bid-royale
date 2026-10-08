import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { consumerNet } from "../settlement/plan.js";
import { commit } from "../auction/index.js";
import { BoardError, EVENTS, STEPS } from "./index.js";
import { fixtureDocument } from "./record-fixture.js";
import { FIXTURE_RUN_ID, createFixtureBoard, recordWorkedExample } from "./worked-example.js";

const eventNames = (events) => events.map((e) => e.name);

test("a scripted run ends with the worked-example ledger: Consumer net -10.875, 14 signups", async () => {
  const { run, events } = await recordWorkedExample();

  assert.equal(run.status, "completed");
  assert.equal(run.nextStep, null);
  assert.equal(run.receipt.consumer.net, -10.875);
  assert.equal(run.receipt.consumer.signups, 14);
  assert.equal(run.receipt.consumer.awardsLocked, 20);

  const kinds = Object.fromEntries(run.verdicts.map((v) => [v.supplier, v.kind]));
  assert.deepEqual(kinds, { techblog: "pass", codepodcast: "short_of_promise", devnewsletter: "under_gate" });
  assert.deepEqual(run.auction.rejected, [{ supplier: "gamingforum", reason: "below_gate" }]);
  assert.equal(run.auction.totalAward, 20);

  const byName = Object.fromEntries(run.receipt.leaderboard.map((r) => [r.supplier, r]));
  assert.equal(byName.codepodcast.bondForfeited, 0.375);
  assert.equal(byName.codepodcast.bondReturned, 1.125);
  assert.equal(byName.devnewsletter.awardReclaimed, 7);
  assert.equal(byName.devnewsletter.bondForfeited, 1.75);
  assert.equal(byName.gamingforum.kind, "lost_bid");
  assert.equal(run.receipt.leaderboard[0].supplier, "techblog");

  assert.deepEqual(run.roundTwo.find((r) => r.supplier === "devnewsletter"), { supplier: "devnewsletter", share: 0 });
  assert.equal(events.at(-1).name, EVENTS.runCompleted);
});

test("the ledger agrees with the settlement plan, and every money element is badged SIMULATED", async () => {
  const { run } = await recordWorkedExample();
  assert.equal(run.receipt.consumer.net, consumerNet(run.verdicts).net);
  assert.equal(run.receipt.consumer.signups, consumerNet(run.verdicts).signups);

  const phases = run.ledger.reduce((acc, l) => ({ ...acc, [l.phase]: (acc[l.phase] ?? 0) + 1 }), {});
  assert.deepEqual(phases, { bid_fee: 4, lock: 6, settlement: 7 });
  assert.ok(run.ledger.every((l) => l.badge === "SIMULATED" && l.explorerUrl === null));
  assert.deepEqual(run.receipt.badges, ["SIMULATED"]);
  assert.equal(run.badge, "SIMULATED");
});

test("event stream: contiguous seq, expected order, terminal event last, verdicts signed", async () => {
  const { run, events } = await recordWorkedExample();
  assert.deepEqual(events.map((e) => e.seq), events.map((_, i) => i + 1));

  const names = eventNames(events);
  const order = [
    EVENTS.runCreated,
    EVENTS.tenderPublished,
    EVENTS.bidCommitted,
    EVENTS.bidRevealed,
    EVENTS.allocationDecided,
    EVENTS.escrowLocked,
    EVENTS.feedGenerated,
    EVENTS.verificationCompleted,
    EVENTS.verdictSigned,
    EVENTS.settlementStarted,
    EVENTS.settlementCompleted,
    EVENTS.receiptReady,
    EVENTS.roundTwoDecided,
    EVENTS.runCompleted,
  ];
  const positions = order.map((n) => names.indexOf(n));
  assert.ok(positions.every((p) => p >= 0), `missing event in ${names}`);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.equal(names.filter((n) => n === EVENTS.bidCommitted).length, 4);
  assert.equal(names.filter((n) => n === EVENTS.verdictSigned).length, 3);
  assert.ok(run.verdicts.every((v) => v.hash && v.signature));
});

test("verification rejects the tampered events and counts only valid signups", async () => {
  const { run } = await recordWorkedExample();
  assert.deepEqual(run.verification.verified, { techblog: 8, codepodcast: 6 });
  assert.equal(run.verification.rejections.length, 9);
  const dev = run.verification.perSupplier.find((s) => s.supplier === "devnewsletter");
  assert.equal(dev.verified, 0);
  assert.deepEqual(dev.rejected, { bad_signature: 1, wrong_attribution: 1, outside_window: 1 });
});

test("steps run in order, repeats are idempotent, skipping ahead is a 409", async () => {
  const board = await createFixtureBoard();
  const { id } = await board.createRun();

  await assert.rejects(board.runStep(id, "locks"), (e) => e instanceof BoardError && e.status === 409 && e.code === "out_of_order");
  await assert.rejects(board.runStep(id, "nope"), (e) => e.status === 404 && e.code === "unknown_step");

  const first = await board.runStep(id, "bids");
  assert.equal(first.repeated, false);
  const ledgerSize = first.run.ledger.length;
  const again = await board.runStep(id, "bids");
  assert.equal(again.repeated, true);
  assert.equal(again.run.ledger.length, ledgerSize);
  assert.equal((await board.getRun(id)).nextStep, "allocation");
});

test("two concurrent calls to one step lock the escrows once", async () => {
  const board = await createFixtureBoard();
  const { id } = await board.createRun();
  const [a, b] = await Promise.allSettled([board.runStep(id, "bids"), board.runStep(id, "bids")]);
  const winners = [a, b].filter((r) => r.status === "fulfilled" && !r.value.repeated);
  const losers = [a, b].filter((r) => r.status === "rejected" || r.value.repeated);
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.equal((await board.getRun(id)).ledger.filter((l) => l.phase === "bid_fee").length, 4);
});

test("settlement is a job: token on start, running until the work finishes, then poll returns the receipt", async () => {
  const board = await createFixtureBoard();
  const { id } = await board.createRun();
  for (const step of STEPS.slice(1, -1)) await board.runStep(id, step);

  const deferred = [];
  const started = await board.runStep(id, "settlement", { schedule: (fn) => deferred.push(fn) });
  assert.equal(started.job, "job_worked-example");
  assert.equal((await board.getSettlementJob(id, started.job)).status, "running");
  assert.equal((await board.getRun(id)).status, "in_progress");

  const twice = await board.runStep(id, "settlement", { schedule: (fn) => deferred.push(fn) });
  assert.equal(twice.repeated, true);
  assert.equal(deferred.length, 1);

  await deferred[0]();
  const done = await board.getSettlementJob(id, started.job);
  assert.equal(done.status, "done");
  assert.equal(done.receipt.consumer.net, -10.875);
  await assert.rejects(board.getSettlementJob(id, "job_wrong"), (e) => e.status === 404);
});

test("a bid whose reveal does not match its commit is rejected as hash_mismatch", async () => {
  const bidSource = async () => {
    const honest = { supplier: "techblog", price: 7, impressions: 1000, promisedPer1000: 7, salt: "s1" };
    const cheat = { supplier: "codepodcast", price: 6, impressions: 1000, promisedPer1000: 8, salt: "s2" };
    return [honest, { ...cheat, commit: commit({ ...cheat, price: 9 }) }];
  };
  const board = await createFixtureBoard({ bidSource });
  const { id } = await board.createRun();
  await board.runStep(id, "bids");
  const { run } = await board.runStep(id, "allocation");
  assert.deepEqual(run.auction.rejected, [{ supplier: "codepodcast", reason: "hash_mismatch" }]);
  assert.deepEqual(run.auction.accepted.map((a) => a.supplier), ["techblog"]);
});

test("a late bid is rejected", async () => {
  const bidSource = async ({ tender }) => [
    { supplier: "techblog", price: 7, impressions: 1000, promisedPer1000: 7, salt: "s1", committedAt: tender.deadline + 1 },
  ];
  const board = await createFixtureBoard({ bidSource });
  const { id } = await board.createRun();
  await board.runStep(id, "bids");
  const { run } = await board.runStep(id, "allocation");
  assert.deepEqual(run.auction.rejected, [{ supplier: "techblog", reason: "late" }]);
});

test("missing signing secrets fail fast with a clear code", async () => {
  const board = await createFixtureBoard({ secrets: () => ({}) });
  await assert.rejects(board.createRun(), (e) => e.status === 500 && e.code === "signing_secret_missing");
});

test("a failing step closes the run and emits step.failed and run.failed when no canned replay exists", async () => {
  const adapter = { badge: "SIMULATED", lockBidFee: async () => { throw new Error("payment service timeout"); } };
  const broken = await createFixtureBoard({ adapter });
  const { id } = await broken.createRun();
  await assert.rejects(broken.runStep(id, "bids"), /payment service timeout/);

  const run = await broken.getRun(id);
  assert.equal(run.status, "failed");
  assert.equal(run.steps.bids.status, "failed");
  const names = eventNames(await broken.getEvents(id));
  assert.deepEqual(names.slice(-2), [EVENTS.stepFailed, EVENTS.runFailed]);
  await assert.rejects(broken.runStep(id, "allocation"), (e) => e.code === "run_closed");
});

test("a receipt without a badge is refused", async () => {
  const adapter = {
    badge: "SIMULATED",
    lockBidFee: async ({ supplier, amount }) => ({ id: "x", action: "bid_fee", amount, from: supplier, to: "board" }),
  };
  const board = await createFixtureBoard({ adapter });
  const { id } = await board.createRun();
  await assert.rejects(board.runStep(id, "bids"), /without a badge/);
});

test("canned hook: a failing live step degrades to the replay and keeps the run id", async () => {
  const transcript = await recordWorkedExample();
  const canned = async () => structuredClone(transcript);
  const adapter = { badge: "SIMULATED", lockBidFee: async () => { throw new Error("preprod unreachable"); } };
  const board = await createFixtureBoard({ adapter, canned, newId: () => "run_degrade" });
  const { id } = await board.createRun();

  const out = await board.runStep(id, "bids");
  assert.equal(out.degraded, true);
  assert.equal(out.run.mode, "canned");
  assert.equal(out.run.id, "run_degrade");
  assert.equal(out.run.receipt.consumer.net, -10.875);
  assert.equal(out.run.degradedFrom.step, "bids");

  const names = eventNames(await board.getEvents(id));
  assert.ok(names.includes(EVENTS.stepFailed) && names.includes(EVENTS.modeDegraded));
  assert.equal(names.at(-1), EVENTS.runCompleted);
  const after = await board.runStep(id, "allocation");
  assert.equal(after.repeated, true);
  assert.equal(after.run.mode, "canned");
});

test("canned hook: DEMO_MODE=canned with a replay loads it without running live", async () => {
  const transcript = await recordWorkedExample();
  let calls = 0;
  const canned = async () => (calls++, structuredClone(transcript));
  const board = await createFixtureBoard({ canned, flags: { demoMode: "canned" }, newId: () => "run_canned" });
  const run = await board.createRun();
  assert.equal(calls, 1);
  assert.equal(run.mode, "canned");
  assert.equal(run.id, "run_canned");
  assert.equal((await board.getEvents("run_canned")).length, transcript.events.length);
});

test("canned flag without a replay installed runs live", async () => {
  const board = await createFixtureBoard({ flags: { demoMode: "canned" } });
  const run = await board.createRun();
  assert.equal(run.mode, "live");
});

test("the committed fixture matches a fresh run (regenerate with node lib/board/record-fixture.js)", async () => {
  const path = new URL("../../data/seeds/board-run.worked-example.json", import.meta.url);
  const committed = JSON.parse(readFileSync(path, "utf8"));
  const fresh = JSON.parse(JSON.stringify(fixtureDocument(await recordWorkedExample())));
  assert.deepEqual(committed, fresh);
  assert.equal(committed.run.id, FIXTURE_RUN_ID);
});
