import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reduceEvents } from "../dashboard/reduce.js";
import { buildDashboardView } from "../dashboard/view.js";
import { buildReceiptView } from "./index.js";

// The recorded run run_c1f40522 as served: CodePodcast's 1.964286 forfeit is PENDING (BelowMinimum), every other row REAL. #62
const { run, events } = JSON.parse(readFileSync(new URL("../../data/canned/c1f40522-before-62.json", import.meta.url), "utf8"));
const dash = (list = events) => buildDashboardView(reduceEvents(list, { replay: true }));
const BELOW = 1.964286;

test("dashboard net and mini receipt: the badge follows the counted rows, so REAL only (#43)", () => {
  const v = dash();
  assert.equal(v.receipt.net, -105);
  assert.equal(v.receipt.signups, 14);
  assert.equal(v.receipt.costPerSignup, 7.5);
  assert.deepEqual(v.receipt.badges, ["REAL"]);
  assert.deepEqual(v.wallet.badgesOut, ["REAL"]);
  assert.deepEqual(v.wallet.badgesBack, ["REAL"]);
});

test("dashboard: the PENDING row is reported once, with its amount, and is not in the net (#43)", () => {
  const v = dash();
  assert.equal(v.receipt.pending, true);
  assert.equal(v.receipt.pendingRows, 1);
  assert.equal(v.receipt.pendingAmount, BELOW);
  assert.equal(v.wallet.back, 75);
  assert.equal(v.wallet.pendingBack, BELOW);
  assert.equal(v.wallet.net, -105);
});

test("receipt page: 'I paid 105' carries REAL only, the PENDING row is a note, not a badge (#43)", () => {
  const view = buildReceiptView(structuredClone(run));
  assert.equal(view.final.paid, 105);
  assert.deepEqual(view.final.badges, ["REAL"]);
  assert.equal(view.pendingRows, 1);
  assert.equal(view.pending.rows[0].amount, BELOW);
  assert.equal(view.pending.toConsumer, BELOW);
});

test("when nothing counted has moved yet, the total badge is PENDING, never empty (#43)", () => {
  const r = structuredClone(run);
  const open = (l) => (l.to === "consumer" || l.action === "award" ?{ ...l, badge: "PENDING", txHash: null, explorerUrl: null } : l);
  r.ledger = r.ledger.map(open);
  r.settlement.transfers = r.settlement.transfers.map(open);
  assert.deepEqual(buildReceiptView(r).final.badges, ["PENDING"]);
});
