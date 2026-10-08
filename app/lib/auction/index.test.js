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
  sealed("techblog", 1000, 70, 7),
  sealed("codepodcast", 1000, 60, 8),
  sealed("devnewsletter", 1500, 70, 12),
  sealed("gamingforum", 1000, 30, 4),
];

test("commit is a stable SHA-256 hex over the sealed fields", () => {
  const args = { price: 70, impressions: 1000, promisedPer1000: 7, salt: "s" };
  assert.match(commit(args), /^[0-9a-f]{64}$/);
  assert.equal(commit(args), commit({ ...args }));
  assert.notEqual(commit(args), commit({ ...args, salt: "t" }));
});

test("worked example: ranking 3.89, 7.50, 10.00, GamingForum below gate, total 200", () => {
  const { ranking, accepted, rejected } = evaluateBids({ tender, bids: workedBids() });
  assert.deepEqual(
    ranking.map((b) => [b.supplier, b.pricePerSignup.toFixed(2)]),
    [
      ["devnewsletter", "3.89"],
      ["codepodcast", "7.50"],
      ["techblog", "10.00"],
    ],
  );
  assert.deepEqual(rejected, [{ supplier: "gamingforum", reason: "below_gate" }]);
  assert.equal(accepted.reduce((sum, b) => sum + b.award, 0), 200);
  assert.deepEqual(
    accepted.map((b) => b.bond),
    [17.5, 15, 17.5],
  );
});

test("hash mismatch is rejected", () => {
  const bids = workedBids();
  bids[0] = { ...bids[0], price: 60 };
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
  const bids = [sealed("techblog", 1000, 70, 7, { committedAt: DEADLINE })];
  assert.deepEqual(evaluateBids({ tender, bids }).rejected, []);
});

test("invalid schema is rejected", () => {
  const bids = [
    sealed("techblog", 1000, 70, 7),
    { ...sealed("codepodcast", 1000, 60, 8), price: "60" },
    { ...sealed("devnewsletter", 1500, 70, 12), impressions: 0 },
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
  const { accepted } = evaluateBids({ tender, bids: [sealed("techblog", 1000, 70, 5)] });
  assert.equal(accepted.length, 1);
});

test("D11: a ranked bid that does not fit is skipped and the next one is accepted", () => {
  const bids = [
    sealed("a", 1000, 80, 10),
    sealed("b", 1000, 90, 10),
    sealed("c", 1000, 50, 5),
    sealed("d", 500, 30, 5),
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
  assert.equal(accepted.reduce((sum, b) => sum + b.award, 0), 200);
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
