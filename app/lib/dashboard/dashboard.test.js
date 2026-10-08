import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reduceEvents } from "./reduce.js";
import { buildDashboardView, summarizeSignals } from "./view.js";
import { gapFor, totalMs } from "./pace.js";

const fixture = JSON.parse(readFileSync(new URL("../../data/seeds/board-run.worked-example.json", import.meta.url), "utf8"));
const REAL_TX = "b".repeat(64);
const EXPLORER = `https://preprod.cardanoscan.io/transaction/${REAL_TX}`;

const view = (events, opts = {}) => buildDashboardView(reduceEvents(events, opts));
const upTo = (name, nth = 1) => {
  let seen = 0;
  const i = fixture.events.findIndex((e) => e.name === name && ++seen === nth);
  return fixture.events.slice(0, i + 1);
};
const sup = (v, id) => v.suppliers.find((s) => s.id === id);
const cellOf = (v, id, kind) => sup(v, id).cells.find((c) => c.kind === kind);

test("worked example: tender, four bids, GamingForum rejected below the gate", () => {
  const v = view(fixture.events);
  assert.deepEqual(v.suppliers.map((s) => s.id), ["techblog", "codepodcast", "devnewsletter", "gamingforum"]);
  assert.equal(v.tender.budget, 200);
  assert.equal(v.gate, 5);
  const gf = sup(v, "gamingforum");
  assert.equal(gf.chip.kind, "lost_bid");
  assert.equal(gf.rejectedNote, "promises 4 per 1,000, gate is 5");
  assert.equal(gf.cells, null);
});

test("worked example: ranking by price per promised signup and the budget bar fills to 200", () => {
  const v = view(fixture.events);
  assert.deepEqual(v.budget.segments.map((s) => s.id), ["devnewsletter", "codepodcast", "techblog"]);
  assert.equal(v.budget.allocated, 200);
  assert.equal(sup(v, "devnewsletter").rank, 1);
  assert.equal(sup(v, "devnewsletter").pricePerSignup.toFixed(2), "3.89");
  assert.equal(sup(v, "techblog").pricePerSignup, 10);
});

test("worked example: three verdicts, DevNewsletter stays at 0, wallet nets -108.75", () => {
  const v = view(fixture.events);
  assert.equal(sup(v, "techblog").chip.label, "Pass");
  assert.equal(sup(v, "codepodcast").chip.label, "Short of promise");
  assert.equal(sup(v, "devnewsletter").chip.label, "Under gate");
  assert.equal(sup(v, "devnewsletter").count, 0);
  assert.equal(sup(v, "techblog").count, 8);
  assert.equal(sup(v, "codepodcast").count, 6);
  assert.equal(v.wallet.escrowed, 200);
  assert.equal(v.wallet.back, 91.25);
  assert.equal(v.wallet.net, -108.75);
  assert.equal(v.receipt.net, -108.75);
  assert.equal(v.receipt.signups, 14);
  assert.equal(v.hero.amount, 70);
  assert.equal(v.hero.name, "DevNewsletter");
  assert.equal(v.chips.dispute, true);
  assert.deepEqual(v.roundTwo.map((r) => [r.name, r.share]), [["CodePodcast", 0.5], ["TechBlog", 0.5], ["DevNewsletter", 0]]);
});

test("every money row has a badge, and a replay shows PRE-RECORDED, never SIMULATED", () => {
  const live = view(fixture.events);
  assert.equal(live.runBadge, "SIMULATED");
  const replay = view(fixture.events, { replay: true });
  assert.equal(replay.runBadge, "PRE-RECORDED");
  for (const s of replay.suppliers) {
    for (const cell of s.cells ?? []) {
      for (const m of [cell.lock, ...cell.outcomes].filter(Boolean)) assert.equal(m.badge, "PRE-RECORDED");
    }
  }
  assert.deepEqual(replay.wallet.badgesOut, ["PRE-RECORDED"]);
});

test("during the run: signups are received, unverified, until verification completes", () => {
  const mid = view(upTo("feed.served", 3));
  assert.equal(sup(mid, "techblog").verifiedKnown, false);
  assert.equal(sup(mid, "techblog").count, 11);
  const after = view(upTo("verification.completed"));
  assert.equal(sup(after, "techblog").verifiedKnown, true);
  assert.equal(sup(after, "techblog").count, 8);
  assert.equal(sup(after, "devnewsletter").count, 0);
});

test("a PENDING lock is not money moved: not in the wallet, badge PENDING, then REAL in place", () => {
  const pending = { id: "lock-1", badge: "PENDING", action: "award", amount: 70, from: "consumer", to: "techblog", txHash: null, explorerUrl: null, state: "TransferPending" };
  const base = [
    { seq: 1, name: "tender.published", data: { tender: fixture.run.tender, brief: fixture.run.brief, suppliers: fixture.run.suppliers } },
    { seq: 2, name: "escrow.locked", data: { supplier: "techblog", kind: "award", receipt: pending } },
  ];
  const v1 = view(base);
  const cell = cellOf(v1, "techblog", "award");
  assert.equal(cell.lock.badge, "PENDING");
  assert.equal(cell.lock.pending, true);
  assert.equal(cell.tone, "pending");
  assert.equal(v1.wallet.escrowed, 0);
  assert.equal(v1.wallet.pendingOut, 70);
  assert.equal(sup(v1, "techblog").chip, null);

  const real = { seq: 3, name: "settlement.progress", data: { supplier: "techblog", phase: "lock", action: "award", receiptId: "lock-1", state: "FundsLocked", badge: "REAL", txHash: REAL_TX, explorerUrl: EXPLORER } };
  const v2 = view([...base, real]);
  const lock = cellOf(v2, "techblog", "award").lock;
  assert.equal(lock.badge, "REAL");
  assert.equal(lock.explorerUrl, EXPLORER);
  assert.equal(v2.wallet.escrowed, 70);
  assert.equal(v2.wallet.pendingOut, 0);
  assert.equal(v2.runBadge, "REAL");
});

test("REAL without a tx hash is not REAL", () => {
  const ev = [
    { seq: 1, name: "tender.published", data: { tender: fixture.run.tender, brief: fixture.run.brief, suppliers: fixture.run.suppliers } },
    { seq: 2, name: "escrow.locked", data: { supplier: "techblog", kind: "award", receipt: { id: "x", badge: "REAL", action: "award", amount: 70, from: "consumer", to: "techblog", txHash: null } } },
  ];
  assert.equal(cellOf(view(ev), "techblog", "award").lock.badge, "SIMULATED");
});

test("settlement.transfer is upserted by receipt id: a row created PENDING then REAL is one row", () => {
  const row = { id: "t-1", action: "award_release", amount: 70, from: "consumer", to: "techblog" };
  const ev = [
    { seq: 1, name: "tender.published", data: { tender: fixture.run.tender, brief: fixture.run.brief, suppliers: fixture.run.suppliers } },
    { seq: 2, name: "settlement.transfer", data: { supplier: "techblog", verdict: "pass", receipt: { ...row, badge: "PENDING", txHash: null } } },
    { seq: 3, name: "settlement.transfer", data: { supplier: "techblog", verdict: "pass", receipt: { ...row, badge: "REAL", txHash: REAL_TX, explorerUrl: EXPLORER } } },
  ];
  const outcomes = cellOf(view(ev), "techblog", "award").outcomes;
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].badge, "REAL");
});

test("mode.degraded resets the view and switches to canned", () => {
  const ev = [...upTo("escrow.locked", 2), { seq: 99, name: "mode.degraded", data: { mode: "canned", step: "locks", error: "boom" } }];
  const v = view(ev);
  assert.equal(v.mode, "canned");
  assert.equal(v.degraded.step, "locks");
  assert.equal(v.wallet.escrowed, 0);
  assert.equal(v.suppliers.length, 0);
});

test("a timed-out settlement is labelled, not complete money", () => {
  const ev = [...fixture.events.filter((e) => e.name !== "settlement.completed"), { seq: 99, name: "settlement.completed", data: { job: "j", transfers: 7, fallback: "timer", pending: 2 } }];
  const v = view(ev);
  assert.equal(v.settlement.fallback, "timer");
  assert.equal(v.settlement.pending, 2);
});

test("summarizeSignals counts click bursts and ASNs per supplier, as context", () => {
  const s = summarizeSignals(fixture.run.feed.events);
  assert.equal(s.devnewsletter.events, 3);
  assert.equal(s.devnewsletter.clickBursts, 1);
  assert.deepEqual(s.devnewsletter.asns.map((a) => a.asn).sort(), ["AS16509", "AS3320"]);
  assert.equal(s.techblog.clickBursts, 0);
});

test("unknown events are ignored and do not throw", () => {
  const v = view([{ seq: 1, name: "something.new", data: {} }, null, { name: 5 }]);
  assert.equal(v.suppliers.length, 0);
});

test("canned pacing: the recorded run reaches the receipt in under 26 s at Normal, under 12 s at Fast", () => {
  const normal = totalMs(fixture.events, 1);
  assert.ok(normal > 15000 && normal < 26000, `normal ${normal} ms`);
  assert.ok(totalMs(fixture.events, 2.2) < 12000);
  const hero = fixture.events.find((e) => e.data?.receipt?.action === "award_reclaim");
  assert.ok(gapFor(hero) > gapFor({ name: "settlement.transfer", data: { receipt: { action: "award_release" } } }));
});

test("registry.discovered shows as a Discovery chip: live or seeded, with the agent count", () => {
  const agents = ["techblog", "codepodcast", "devnewsletter", "gamingforum"].map((id) => ({ supplier: id, name: id, apiBaseUrl: `https://x.test/${id}` }));
  const at = (data) => [{ seq: 1, ts: "2026-10-09T00:00:00.000Z", name: "registry.discovered", data }];

  assert.equal(view(at({ source: "live", label: "Masumi registry", agents })).discovery.chip, "Discovery: Masumi registry · 4 agents · live");
  assert.equal(
    view(at({ source: "seeded", label: "seeded registry", reason: "timeout", agents })).discovery.chip,
    "Discovery: seeded registry · 4 agents · seeded",
  );
  assert.equal(view([]).discovery, null);
});
