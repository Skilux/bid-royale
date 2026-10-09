import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reduceEvents } from "./reduce.js";
import { buildDashboardView } from "./view.js";

// The recorded run run_c1f40522, as the replay serves it: the bid fee lifecycle arrives in settlement.progress.
const { events } = JSON.parse(readFileSync(new URL("../../data/canned/c1f40522-before-62.json", import.meta.url), "utf8"));
const view = (list, opts = { replay: true }) => buildDashboardView(reduceEvents(list, opts));

test("run_c1f40522: the four bid fees are REAL, locked and collected (#43)", () => {
  const v = view(events);
  const fees = v.rows.filter((r) => r.phase === "bid_fee");
  assert.equal(fees.length, 4);
  for (const f of fees) {
    assert.equal(f.badge, "REAL", f.supplier);
    assert.equal(f.state, "FundsLocked");
    assert.match(f.txHash, /^[0-9a-f]{64}$/);
  }
  assert.equal(v.bidFees.total, 8);
  assert.deepEqual(v.bidFees.badges, ["REAL"]);
  const collected = v.rows.filter((r) => r.phase === "bid_fee_collect");
  assert.equal(collected.length, 4);
  assert.ok(collected.every((r) => r.badge === "REAL" && r.state === "Withdrawn"));
});

test("bid fee progress updates the bid fee row, it does not add a settlement row (#43)", () => {
  const v = view(events);
  assert.deepEqual(v.rows.filter((r) => r.phase === "settlement" && /bid_fee/.test(r.action)), []);
  assert.equal(new Set(v.rows.filter((r) => r.phase === "bid_fee").map((r) => r.id)).size, 4);
});

test("a live reduction of the same events (no replay) also ends with REAL bid fees (#43)", () => {
  const v = view(events, { replay: false });
  assert.deepEqual(v.bidFees.badges, ["REAL"]);
  assert.deepEqual(v.termBadges.bidFee, ["REAL"]);
});

test("bid fee stays PENDING until its progress event carries the tx (#43)", () => {
  const at = events.findIndex((e) => e.name === "settlement.progress" && e.data.phase === "bid_fee" && e.data.state === "FundsLockingInitiated");
  assert.ok(at > 0);
  const v = view(events.slice(0, at + 1), { replay: false });
  assert.deepEqual(v.bidFees.badges, ["PENDING"]);
});
