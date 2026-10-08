import test from "node:test";
import assert from "node:assert/strict";
import { bondFor, classify, consumerNet, forfeitFor, planSettlement } from "./plan.js";

const GATE = 5;

export const workedExample = [
  { supplier: "techblog", promised: 7, delivered: 8, award: 7 },
  { supplier: "codepodcast", promised: 8, delivered: 6, award: 6 },
  { supplier: "devnewsletter", promised: 12, delivered: 0, award: 7 },
].map((s) => ({
  ...s,
  gate: GATE,
  bond: bondFor(s.award),
  kind: classify({ delivered: s.delivered, promised: s.promised, gate: GATE }),
}));

test("verdict kinds match the Money Flow example", () => {
  assert.deepEqual(
    workedExample.map((v) => v.kind),
    ["pass", "short_of_promise", "under_gate"],
  );
});

test("bonds are 25% of the award", () => {
  assert.deepEqual(
    workedExample.map((v) => v.bond),
    [1.75, 1.5, 1.75],
  );
});

test("forfeits: 0, 0.375, full bond", () => {
  assert.deepEqual(
    workedExample.map((v) => forfeitFor(v)),
    [0, 0.375, 1.75],
  );
});

test("Short of promise returns 1.125 to the supplier and forfeits 0.375", () => {
  const plan = planSettlement(workedExample[1]);
  assert.equal(plan.find((t) => t.reason === "bond_return").amount, 1.125);
  assert.equal(plan.find((t) => t.reason === "bond_forfeit").amount, 0.375);
});

test("Under gate pays the supplier nothing", () => {
  const plan = planSettlement(workedExample[2]);
  assert.ok(plan.every((t) => t.to === "consumer"));
});

test("Consumer net is -10.875 for 14 verified signups", () => {
  assert.deepEqual(consumerNet(workedExample), { net: -10.875, signups: 14 });
});

test("gate boundary: delivered equal to gate is Short of promise", () => {
  assert.equal(classify({ delivered: 5, promised: 8, gate: GATE }), "short_of_promise");
  assert.equal(classify({ delivered: 4.99, promised: 8, gate: GATE }), "under_gate");
});
