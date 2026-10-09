import test from "node:test";
import assert from "node:assert/strict";
import { buildReceipt } from "./receipt.js";

const suppliers = [{ id: "codepodcast", name: "CodePodcast" }];
const verdicts = [{ supplier: "codepodcast", kind: "short_of_promise", promised: 7, delivered: 6, award: 55, bond: 13.75 }];
const row = (phase, action, amount, from, to, badge, extra = {}) => ({ phase, supplier: "codepodcast", action, amount, from, to, badge, ...extra });
const base = [
  row("lock", "award", 55, "consumer", "codepodcast", "REAL"),
  row("settlement", "award_release", 55, "consumer", "codepodcast", "REAL"),
  row("settlement", "bond_return", 11.785714, "board", "codepodcast", "REAL"),
];
const receipt = (ledger) => buildReceipt({ suppliers, bids: [], accepted: [{ supplier: "codepodcast" }], verdicts, verified: { codepodcast: 6 }, ledger });

test("a PENDING forfeit is not money moved: left out of the Consumer net and reported as notMoved (#62)", () => {
  const r = receipt([...base, row("settlement", "bond_forfeit", 1.964286, "board", "consumer", "PENDING", { state: "BelowMinimum" })]);
  assert.equal(r.consumer.returned, 0);
  assert.equal(r.consumer.notMoved, 1.964286);
  assert.equal(r.consumer.net, -55);
  assert.equal(r.leaderboard[0].bondForfeited, 0);
});

test("a forfeit rounded up by the treasury counts what was owed; the Board's top-up is reported separately (#62)", () => {
  const r = receipt([...base, row("settlement", "bond_forfeit", 1.964286, "board", "consumer", "REAL", { topUp: 0.035714 })]);
  assert.equal(r.consumer.returned, 1.964286);
  assert.equal(r.consumer.notMoved, 0);
  assert.equal(r.consumer.net, -53.035714);
  assert.equal(r.board.topUps, 0.035714);
});

test("an unconfirmed (PENDING) award lock is not counted as spent", () => {
  const r = receipt([row("lock", "award", 55, "consumer", "codepodcast", "PENDING")]);
  assert.equal(r.consumer.awardsLocked, 0);
});
