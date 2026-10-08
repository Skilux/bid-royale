import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildReceiptView, buildTimeline, deriveBadge, explorerFor } from "./index.js";

const fixture = JSON.parse(
  readFileSync(new URL("../../data/seeds/board-run.worked-example.json", import.meta.url), "utf8"),
);
const clone = () => structuredClone(fixture.run);

const REAL_TX = "a".repeat(64);
const EXPLORER = `https://preprod.cardanoscan.io/transaction/${REAL_TX}`;

test("deriveBadge: REAL needs a real tx hash", () => {
  assert.equal(deriveBadge({ badge: "REAL", txHash: REAL_TX }), "REAL");
  assert.equal(deriveBadge({ badge: "REAL", txHash: null }), "SIMULATED");
  assert.equal(deriveBadge({ badge: "REAL", txHash: "sim_abc" }), "SIMULATED");
  assert.equal(deriveBadge({ badge: "REAL" }), "SIMULATED");
  assert.equal(deriveBadge({ badge: "SIMULATED", txHash: "sim_abc" }), "SIMULATED");
});

test("deriveBadge: canned replays are PRE-RECORDED unless the tx is real", () => {
  assert.equal(deriveBadge({ badge: "SIMULATED", txHash: "sim_abc" }, { mode: "canned" }), "PRE-RECORDED");
  assert.equal(deriveBadge({ badge: "REAL", txHash: REAL_TX }, { mode: "canned" }), "REAL");
  assert.equal(deriveBadge({ badge: "PRE-RECORDED", txHash: "x" }), "PRE-RECORDED");
});

test("explorerFor: only for REAL with an https url", () => {
  assert.equal(explorerFor({ explorerUrl: EXPLORER }, "REAL"), EXPLORER);
  assert.equal(explorerFor({ explorerUrl: EXPLORER }, "SIMULATED"), null);
  assert.equal(explorerFor({ explorerUrl: "javascript:alert(1)" }, "REAL"), null);
  assert.equal(explorerFor({ explorerUrl: null }, "REAL"), null);
});

test("worked example: net -10.875 for 14 verified signups, every badge SIMULATED", () => {
  const view = buildReceiptView({ ...fixture.run, events: fixture.events });
  assert.equal(view.settlementDone, true);
  assert.equal(view.final.net, -10.875);
  assert.equal(view.final.paid, 10.875);
  assert.equal(view.final.signups, 14);
  assert.deepEqual(view.final.badges, ["SIMULATED"]);
  assert.deepEqual(view.lock.badges, ["SIMULATED"]);
  assert.equal(view.lock.amount, 20);
  assert.equal(view.lock.count, 3);
  assert.deepEqual(view.tally, {
    locksTotal: 6,
    locksReal: 0,
    lockBadges: ["SIMULATED"],
    bidFeeBadges: ["SIMULATED"],
  });
  for (const s of view.settled) for (const t of s.transfers) assert.equal(t.badge, "SIMULATED");
});

test("worked example: story order, amounts and round 2", () => {
  const view = buildReceiptView(clone());
  assert.deepEqual(
    view.settled.map((s) => [s.supplier, s.kind]),
    [
      ["techblog", "pass"],
      ["codepodcast", "short_of_promise"],
      ["devnewsletter", "under_gate"],
    ],
  );
  const [tech, pod, dev] = view.settled;
  assert.deepEqual([tech.paid, tech.bondReturned, tech.bondForfeited], [7, 1.75, 0]);
  assert.deepEqual([pod.paid, pod.bondReturned, pod.bondForfeited], [6, 1.125, 0.375]);
  assert.deepEqual([dev.reclaimed, dev.bondForfeited, dev.refundTotal], [7, 1.75, 8.75]);
  assert.equal(dev.explorerUrl, null);
  assert.deepEqual(
    view.roundTwo.map((r) => [r.supplier, r.share]),
    [
      ["techblog", 0.5],
      ["codepodcast", 0.5],
      ["devnewsletter", 0],
    ],
  );
  assert.deepEqual(
    view.leaderboard.map((r) => [r.rank, r.supplier, r.costPerSignup]),
    [
      [1, "techblog", 0.875],
      [2, "codepodcast", 0.9375],
      [3, "devnewsletter", null],
      [4, "gamingforum", null],
    ],
  );
  assert.equal(view.leaderboard[2].refunded, 8.75);
  assert.equal(view.leaderboard[3].bidFee, 0.2);
});

test("a REAL refund tx shows REAL and the explorer link, the rest stay SIMULATED", () => {
  const run = clone();
  const refund = run.settlement.transfers.find((t) => t.action === "award_reclaim");
  Object.assign(refund, { badge: "REAL", txHash: REAL_TX, explorerUrl: EXPLORER });
  const view = buildReceiptView(run);
  const dev = view.settled.find((s) => s.supplier === "devnewsletter");
  assert.equal(dev.refundBadge, "REAL");
  assert.equal(dev.explorerUrl, EXPLORER);
  assert.deepEqual(view.final.badges, ["REAL", "SIMULATED"]);
});

test("a REAL badge without a tx hash is downgraded and has no link", () => {
  const run = clone();
  const refund = run.settlement.transfers.find((t) => t.action === "award_reclaim");
  Object.assign(refund, { badge: "REAL", txHash: null, explorerUrl: EXPLORER });
  const dev = buildReceiptView(run).settled.find((s) => s.supplier === "devnewsletter");
  assert.equal(dev.refundBadge, "SIMULATED");
  assert.equal(dev.explorerUrl, null);
});

test("REAL locks are counted for the tally", () => {
  const run = clone();
  for (const l of run.ledger.filter((x) => x.phase === "lock")) {
    Object.assign(l, { badge: "REAL", txHash: REAL_TX, explorerUrl: EXPLORER });
  }
  const view = buildReceiptView(run);
  assert.equal(view.tally.locksReal, 6);
  assert.deepEqual(view.lock.badges, ["REAL"]);
});

test("a canned run shows PRE-RECORDED", () => {
  const view = buildReceiptView({ ...clone(), mode: "canned" });
  assert.deepEqual(view.final.badges, ["PRE-RECORDED"]);
  assert.deepEqual(view.lock.badges, ["PRE-RECORDED"]);
  assert.equal(view.settled[0].transfers[0].badge, "PRE-RECORDED");
});

test("a run before settlement is not done and has no settled rows", () => {
  const run = clone();
  run.verdicts = [];
  run.settlement = null;
  run.receipt = null;
  const view = buildReceiptView(run);
  assert.equal(view.settlementDone, false);
  assert.deepEqual(view.settled, []);
});

test("without a receipt, totals fall back to consumerNet", () => {
  const run = clone();
  run.receipt = null;
  const view = buildReceiptView(run);
  assert.equal(view.final.net, -10.875);
  assert.equal(view.final.signups, 14);
});

test("timeline: lock, cut, three verdicts with the under-gate slip, then the final receipt", () => {
  const ids = buildTimeline(buildReceiptView(clone())).map((b) => b.id);
  assert.deepEqual(ids, [
    "lock",
    "cut",
    "v:techblog",
    "v:codepodcast",
    "v:devnewsletter",
    "slip:devnewsletter:0",
    "slip:devnewsletter:1",
    "slip:devnewsletter:2",
    "button:devnewsletter",
    "final",
  ]);
});
