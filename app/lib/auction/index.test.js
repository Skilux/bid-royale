import test from "node:test";
import assert from "node:assert/strict";
import { TENDER } from "../config.js";
import { commit, evaluateBids, roundTwo } from "./index.js";

const DEADLINE = 1_000;

function sealed(supplier, impressions, price, promisedPer1000, overrides = {}) {
  const salt = `salt-${supplier}`;
  return {
    supplier,
    price,
    impressions,
    promisedPer1000,
    salt,
    commit: commit({ price, impressions, promisedPer1000, salt }),
    committedAt: 500,
    ...overrides,
  };
}

const tender = { ...TENDER, deadline: DEADLINE };

const workedBids = () => [
  sealed("techblog", 1000, 7, 7),
  sealed("codepodcast", 1000, 6, 8),
  sealed("devnewsletter", 1500, 7, 12),
  sealed("gamingforum", 1000, 3, 4),
];

test("commit is a stable SHA-256 hex over the sealed fields", () => {
  const args = { price: 7, impressions: 1000, promisedPer1000: 7, salt: "s" };
  assert.match(commit(args), /^[0-9a-f]{64}$/);
  assert.equal(commit(args), commit({ ...args }));
  assert.notEqual(commit(args), commit({ ...args, salt: "t" }));
});

test("worked example: ranking 0.39, 0.75, 1.00, GamingForum below gate, total 20", () => {
  const { ranking, accepted, rejected } = evaluateBids({ tender, bids: workedBids() });
  assert.deepEqual(
    ranking.map((b) => [b.supplier, b.pricePerSignup.toFixed(2)]),
    [
      ["devnewsletter", "0.39"],
      ["codepodcast", "0.75"],
      ["techblog", "1.00"],
    ],
  );
  assert.deepEqual(rejected, [{ supplier: "gamingforum", reason: "below_gate" }]);
  assert.equal(accepted.reduce((sum, b) => sum + b.award, 0), 20);
  assert.deepEqual(
    accepted.map((b) => b.bond),
    [1.75, 1.5, 1.75],
  );
});

test("hash mismatch is rejected", () => {
  const bids = workedBids();
  bids[0] = { ...bids[0], price: 6 };
  const { rejected, accepted } = evaluateBids({ tender, bids });
  assert.deepEqual(rejected.find((r) => r.supplier === "techblog"), { supplier: "techblog", reason: "hash_mismatch" });
  assert.ok(!accepted.some((b) => b.supplier === "techblog"));
});

test("late commit is rejected", () => {
  const bids = workedBids();
  bids[1] = { ...bids[1], committedAt: DEADLINE + 1 };
  const { rejected } = evaluateBids({ tender, bids });
  assert.deepEqual(rejected.find((r) => r.supplier === "codepodcast"), { supplier: "codepodcast", reason: "late" });
});

test("commit exactly at the deadline is on time", () => {
  const bids = [sealed("techblog", 1000, 7, 7, { committedAt: DEADLINE })];
  assert.deepEqual(evaluateBids({ tender, bids }).rejected, []);
});

test("invalid schema is rejected", () => {
  const bids = [
    sealed("techblog", 1000, 7, 7),
    { ...sealed("codepodcast", 1000, 6, 8), price: "6" },
    { ...sealed("devnewsletter", 1500, 7, 12), impressions: 0 },
    null,
  ];
  const { rejected, accepted } = evaluateBids({ tender, bids });
  assert.deepEqual(
    rejected.map((r) => r.reason),
    ["invalid_schema", "invalid_schema", "invalid_schema"],
  );
  assert.deepEqual(
    accepted.map((b) => b.supplier),
    ["techblog"],
  );
});

test("promised exactly at the gate is eligible", () => {
  const { accepted } = evaluateBids({ tender, bids: [sealed("techblog", 1000, 7, 5)] });
  assert.equal(accepted.length, 1);
});

test("D11: a ranked bid that does not fit is skipped and the next one is accepted", () => {
  const bids = [
    sealed("a", 1000, 8, 10),
    sealed("b", 1000, 9, 10),
    sealed("c", 1000, 5, 5),
    sealed("d", 500, 3, 5),
  ];
  const { ranking, accepted } = evaluateBids({ tender, bids });
  assert.deepEqual(
    ranking.map((b) => [b.supplier, b.accepted]),
    [
      ["a", true],
      ["b", true],
      ["c", false],
      ["d", true],
    ],
  );
  assert.equal(accepted.reduce((sum, b) => sum + b.award, 0), 20);
});

test("round two on the worked example: 50 / 50 / 0", () => {
  const allocation = roundTwo([
    { supplier: "techblog", kind: "pass" },
    { supplier: "codepodcast", kind: "short_of_promise" },
    { supplier: "devnewsletter", kind: "under_gate" },
  ]);
  assert.deepEqual(allocation, [
    { supplier: "techblog", share: 0.5 },
    { supplier: "codepodcast", share: 0.5 },
    { supplier: "devnewsletter", share: 0 },
  ]);
});

test("round two with every winner under gate allocates nothing", () => {
  assert.deepEqual(roundTwo([{ supplier: "devnewsletter", kind: "under_gate" }]), [{ supplier: "devnewsletter", share: 0 }]);
});
