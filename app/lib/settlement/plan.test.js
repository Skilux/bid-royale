import test from "node:test";
import assert from "node:assert/strict";
import { bondFor, classify, consumerNet, forfeitFor, planSettlement } from "./plan.js";

const GATE = 5;

export const workedExample = [
  { supplier: "techblog", promised: 7, delivered: 8, award: 70 },
  { supplier: "codepodcast", promised: 8, delivered: 6, award: 60 },
  { supplier: "devnewsletter", promised: 12, delivered: 0, award: 70 },
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
    [17.5, 15, 17.5],
  );
});

test("forfeits: 0, 3.75, full bond", () => {
  assert.deepEqual(
    workedExample.map((v) => forfeitFor(v)),
    [0, 3.75, 17.5],
  );
});

test("Short of promise returns 11.25 to the supplier and forfeits 3.75", () => {
  const plan = planSettlement(workedExample[1]);
  assert.equal(plan.find((t) => t.reason === "bond_return").amount, 11.25);
  assert.equal(plan.find((t) => t.reason === "bond_forfeit").amount, 3.75);
});

test("Under gate pays the supplier nothing", () => {
  const plan = planSettlement(workedExample[2]);
  assert.ok(plan.every((t) => t.to === "consumer"));
});

test("Consumer net is -108.75 for 14 verified signups", () => {
  assert.deepEqual(consumerNet(workedExample), { net: -108.75, signups: 14 });
});

test("gate boundary: delivered equal to gate is Short of promise", () => {
  assert.equal(classify({ delivered: 5, promised: 8, gate: GATE }), "short_of_promise");
  assert.equal(classify({ delivered: 4.99, promised: 8, gate: GATE }), "under_gate");
});
