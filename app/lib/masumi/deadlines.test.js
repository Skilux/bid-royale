import test from "node:test";
import assert from "node:assert/strict";
import { installNextResolution } from "../board/test-alias.js";
installNextResolution();
const { paymentDeadlines, PAY_RESULT_GAP_MS, RESULT_MIN_MS, UNLOCK_GAP_MS, DISPUTE_GAP_MS } = await import("@/lib/masumi/deadlines");

for (const marginMs of [120000, 180000, 300000]) {
  test(`deadlines meet all floors with margin ${marginMs}`, () => {
    const now = Date.parse("2026-10-08T22:00:00Z");
    const deadlines = Object.fromEntries(Object.entries(paymentDeadlines({ now, marginMs })).map(([key, value]) => [key, Date.parse(value)]));
    assert.equal(deadlines.submitResultTime - now, RESULT_MIN_MS + marginMs);
    assert.equal(deadlines.submitResultTime - deadlines.payByTime, PAY_RESULT_GAP_MS + marginMs);
    assert.equal(deadlines.unlockTime - deadlines.submitResultTime, UNLOCK_GAP_MS + marginMs);
    assert.equal(deadlines.externalDisputeUnlockTime - deadlines.unlockTime, DISPUTE_GAP_MS + marginMs);
    assert.ok(deadlines.payByTime > now);
  });
}

test("invalid margins are rejected", () => {
  for (const marginMs of [-1, 0, 60000, NaN, Infinity]) assert.throws(() => paymentDeadlines({ marginMs }), /safety margin/);
});

test("default safety margin covers the purchase clock recheck by at least two minutes", () => {
  const now = Date.parse("2026-10-08T22:00:00Z");
  const deadlines = paymentDeadlines({ now });
  assert.ok(Date.parse(deadlines.submitResultTime) - now >= RESULT_MIN_MS + 120000);
  assert.ok(Date.parse(deadlines.unlockTime) - Date.parse(deadlines.submitResultTime) >= UNLOCK_GAP_MS + 120000);
  assert.ok(Date.parse(deadlines.externalDisputeUnlockTime) - Date.parse(deadlines.unlockTime) >= DISPUTE_GAP_MS + 120000);
});
