import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reduceEvents } from "./reduce.js";
import { buildDashboardView, honestyLine } from "./view.js";
import { buildReceiptView, derivePayMode, termBadges } from "../receipt-view/index.js";

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const worked = read("../../data/seeds/board-run.worked-example.json");
// First 111 events of the real preprod run run_c1f40522, read from production on 9 Oct 2026.
const realEvents = read("./fixtures/real-run-c1f40522.json").events;

const view = (events, opts = {}) => buildDashboardView(reduceEvents(events, opts));
const upTo = (events, name, nth = 1) => {
  let seen = 0;
  const i = events.findIndex((e) => e.name === name && ++seen === nth);
  return events.slice(0, i + 1);
};
/** Every badge a term, quote or fallback figure can show on the dashboard. */
const termKinds = (v) => [...v.termBadges.budget, ...v.termBadges.bidFee, v.fallbackBadge, ...v.suppliers.flatMap((s) => s.quoteBadges)];

test("real run_c1f40522: budget, bid fee, allocation and quotes never say SIMULATED", () => {
  const v = view(realEvents);
  assert.equal(v.payMode, "real");
  assert.equal(v.mode, "live");
  assert.equal(v.tender.budget, 200);
  assert.equal(v.tender.bidFee, 2);
  assert.equal(v.budget.allocated, 180);
  assert.ok(!termKinds(v).includes("SIMULATED"), `terms: ${termKinds(v)}`);
  assert.ok(v.rows.length > 0 &&v.rows.every((r) => r.badge !== "SIMULATED"), "money rows");
  assert.ok(!v.escrow.badges.includes("SIMULATED"));
  assert.ok(!v.bidFees.badges.includes("SIMULATED"));
  assert.notEqual(v.runBadge, "SIMULATED");
  for (const s of v.suppliers.filter((x) => x.bid)) assert.ok(s.quoteBadges.length > 0 && !s.quoteBadges.includes("SIMULATED"), s.id);
});

test("real run_c1f40522: terms follow their money rows", () => {
  const v = view(realEvents);
  const award = v.rows.filter((r) => r.phase === "lock" && r.action === "award");
  const fees = v.rows.filter((r) => r.phase === "bid_fee");
  assert.equal(award.length, 3);
  assert.equal(fees.length, 4);
  assert.deepEqual(v.termBadges.budget, [...new Set(award.map((r) => r.badge))].sort((a, b) => ["REAL", "PENDING"].indexOf(a) - ["REAL", "PENDING"].indexOf(b)));
  assert.deepEqual(v.bidFees.badges, v.termBadges.bidFee);
  for (const b of [...v.termBadges.budget, ...v.termBadges.bidFee]) assert.ok(["REAL", "PENDING"].includes(b), b);
  const tb = v.suppliers.find((s) => s.id === "techblog");
  const lock = tb.cells.find((c) => c.kind === "award").lock;
  assert.deepEqual(tb.quoteBadges, [lock.badge]);
  const gf = v.suppliers.find((s) => s.id === "gamingforum");
  assert.deepEqual(gf.quoteBadges, [...new Set(v.rows.filter((r) => r.phase === "bid_fee" && r.supplier === "gamingforum").map((r) => r.badge))]);
});

test("real run_c1f40522: traffic and signups stay SIMULATED in the footer", () => {
  const v = view(realEvents);
  assert.equal(v.honesty, "Traffic and signups are SIMULATED. Suppliers are our own agents.");
  assert.ok(!/bid fees/i.test(v.honesty));
  assert.ok(v.suppliers.some((s) => s.served));
});

test("real run before any money row: terms are PENDING, the header is PENDING", () => {
  const v = view(upTo(realEvents, "tender.published"));
  assert.equal(v.payMode, "real");
  assert.deepEqual(v.termBadges.budget, ["PENDING"]);
  assert.deepEqual(v.termBadges.bidFee, ["PENDING"]);
  assert.equal(v.fallbackBadge, "PENDING");
  assert.equal(v.runBadge, "PENDING");
});

test("real run with the first bid fee locked (PENDING, no tx yet): the bid fee is PENDING", () => {
  const v = view(upTo(realEvents, "bid.fee_locked"));
  assert.equal(v.payMode, "real");
  assert.deepEqual(v.termBadges.bidFee, ["PENDING"]);
  assert.deepEqual(v.termBadges.budget, ["PENDING"]);
});

test("real run with simulated bid fees (MASUMI_BID_FEES=simulated): the bid fee says SIMULATED, the budget does not", () => {
  const events = realEvents.map((e) =>
    e.name === "bid.fee_locked" ? { ...e, data: { ...e.data, receipt: { ...e.data.receipt, badge: "SIMULATED", txHash: "sim_1" } } } : e,
  );
  const v = view(upTo(events, "escrow.locked", 6));
  assert.equal(v.payMode, "real");
  assert.deepEqual(v.termBadges.bidFee, ["SIMULATED"]);
  assert.ok(!v.termBadges.budget.includes("SIMULATED"));
});

test("simulated run keeps SIMULATED on every term and the old footer", () => {
  const v = view(worked.events);
  assert.equal(v.payMode, "simulated");
  assert.equal(v.runBadge, "SIMULATED");
  assert.deepEqual(v.termBadges, { budget: ["SIMULATED"], bidFee: ["SIMULATED"] });
  assert.equal(v.fallbackBadge, "SIMULATED");
  for (const s of v.suppliers) assert.deepEqual(s.quoteBadges, ["SIMULATED"]);
  assert.equal(v.honesty, "Bid fees and traffic are SIMULATED. Suppliers are our own agents.");
});

test("canned replay keeps PRE-RECORDED on terms, and a REAL tx row inside it stays a REAL link", () => {
  const txHash = "c".repeat(64);
  const explorerUrl = `https://preprod.cardanoscan.io/transaction/${txHash}`;
  let patched = false;
  const events = worked.events.map((e) => {
    if (e.name !== "escrow.locked" || patched) return e;
    patched = true;
    return { ...e, data: { ...e.data, receipt: { ...e.data.receipt, badge: "REAL", txHash, explorerUrl } } };
  });
  const v = view(events, { replay: true });
  assert.equal(v.payMode, "canned");
  assert.equal(v.runBadge, "PRE-RECORDED");
  assert.deepEqual(v.termBadges, { budget: ["PRE-RECORDED"], bidFee: ["PRE-RECORDED"] });
  assert.equal(v.fallbackBadge, "PRE-RECORDED");
  for (const s of v.suppliers) assert.deepEqual(s.quoteBadges, ["PRE-RECORDED"]);
  const real = v.rows.filter((r) => r.badge === "REAL");
  assert.equal(real.length, 1);
  assert.equal(real[0].explorerUrl, explorerUrl);
  assert.match(v.honesty, /^Recorded run\./);
});

test("derivePayMode and termBadges", () => {
  assert.equal(derivePayMode({ mode: "canned", runBadge: "PENDING", badges: ["REAL"] }), "canned");
  assert.equal(derivePayMode({ mode: "live", runBadge: "PENDING" }), "real");
  assert.equal(derivePayMode({ mode: "live", runBadge: null, badges: ["PENDING"] }), "real");
  assert.equal(derivePayMode({ mode: "live", runBadge: "SIMULATED", badges: ["SIMULATED"] }), "simulated");
  assert.equal(derivePayMode({ mode: "live" }), "simulated");
  assert.deepEqual(termBadges("real", []), ["PENDING"]);
  assert.deepEqual(termBadges("real", [{ badge: "PENDING" }, { badge: "REAL" }]), ["REAL", "PENDING"]);
  assert.deepEqual(termBadges("simulated", [{ badge: "REAL" }]), ["SIMULATED"]);
  assert.deepEqual(termBadges("canned", []), ["PRE-RECORDED"]);
  assert.match(honestyLine("real"), /^Traffic and signups are SIMULATED/);
});

test("receipt tally: with no bid fee or lock rows a real run says PENDING, a simulated run SIMULATED", () => {
  const real = buildReceiptView({ id: "r", mode: "live", badge: "PENDING", ledger: [], suppliers: [], steps: {} });
  assert.equal(real.payMode, "real");
  assert.equal(real.tally.fallbackBadge, "PENDING");
  assert.deepEqual(real.tally.bidFeeBadges, []);
  const sim = buildReceiptView({ id: "s", mode: "live", badge: "SIMULATED", ledger: [], suppliers: [], steps: {} });
  assert.equal(sim.payMode, "simulated");
  assert.equal(sim.tally.fallbackBadge, "SIMULATED");
  const canned = buildReceiptView({ id: "c", mode: "canned", badge: "PRE-RECORDED", ledger: [], suppliers: [], steps: {} });
  assert.equal(canned.tally.fallbackBadge, "PRE-RECORDED");
});
