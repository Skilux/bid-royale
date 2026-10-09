import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildReceipt } from "../board/receipt.js";
import { reduceEvents } from "../dashboard/reduce.js";
import { buildDashboardView } from "../dashboard/view.js";
import { BELOW_MINIMUM_NOTE, buildReceiptView } from "./index.js";

// Trimmed copy of the real run run_c1f40522 (9 Oct 2026): CodePodcast's 1.964286 forfeit is BelowMinimum, PENDING, no tx. #62
const { run: real } = JSON.parse(readFileSync(new URL("./fixtures/run_c1f40522.json", import.meta.url), "utf8"));
const clone = () => structuredClone(real);

const BELOW = 1.964286;
const forfeitRow = (r) => r.action === "bond_forfeit" && r.supplier === "codepodcast";

function receiptOf(run, ledger = run.ledger) {
  return buildReceipt({
    suppliers: run.suppliers,
    bids: run.bids,
    accepted: run.verdicts.map((v) => ({ supplier: v.supplier })),
    verdicts: run.verdicts,
    verified: run.verification.verified,
    ledger,
  });
}

test("fixture: the BelowMinimum row is PENDING with no tx", () => {
  const row = real.ledger.find(forfeitRow);
  assert.equal(row.state, "BelowMinimum");
  assert.equal(row.badge, "PENDING");
  assert.equal(row.txHash, null);
  assert.equal(row.amount, BELOW);
});

test("buildReceipt: Consumer returned and net count only rows that moved", () => {
  const r = receiptOf(real);
  assert.equal(r.consumer.returned, 75);
  assert.equal(r.consumer.net, -105);
  assert.equal(r.consumer.notMoved, BELOW);
  assert.equal(r.consumer.awardsLocked, 180);
  assert.equal(r.consumer.signups, 14);
  assert.equal(r.consumer.costPerSignup, Math.round((105 / 14) * 1e6) / 1e6);
  const cp = r.leaderboard.find((x) => x.supplier === "codepodcast");
  assert.equal(cp.bondForfeited, 0);
  assert.equal(cp.consumerSpend, 55);
});

test("buildReceipt: the same row counts once it is REAL, and a simulated run is unchanged", () => {
  const done = real.ledger.map((l) => (forfeitRow(l) ? { ...l, badge: "REAL", txHash: "c".repeat(64), state: "Withdrawn" } : l));
  const r = receiptOf(real, done);
  assert.equal(r.consumer.returned, 76.964286);
  assert.equal(r.consumer.net, -103.035714);
  assert.equal(r.consumer.notMoved, 0);
  const sim = real.ledger.map((l) => ({ ...l, badge: "SIMULATED" }));
  assert.equal(receiptOf(real, sim).consumer.returned, 76.964286);
});

test("receipt view without a stored receipt: net leaves out the pending row", () => {
  const view = buildReceiptView(clone());
  assert.equal(view.final.net, -105);
  assert.equal(view.final.paid, 105);
  assert.equal(view.final.pending, BELOW);
  assert.equal(view.final.costPerSignup, Math.round((105 / 14) * 1e6) / 1e6);
});

test("receipt view with a receipt stored before #62: rebuilt from moved rows only", () => {
  const run = clone();
  const counted = run.ledger.map((l) => (forfeitRow(l) ? { ...l, badge: "SIMULATED" } : l));
  const old = receiptOf(run, counted);
  delete old.consumer.notMoved;
  assert.equal(old.consumer.returned, 76.964286);
  run.receipt = old;
  const view = buildReceiptView(run);
  assert.equal(view.final.net, -105);
  assert.equal(view.final.signups, 14);
  const cp = view.leaderboard.find((r) => r.supplier === "codepodcast");
  assert.equal(cp.costPerSignup, Math.round((55 / 6) * 1e6) / 1e6);
  assert.equal(view.settled.find((s) => s.supplier === "codepodcast").bondForfeited, 0);
});

test("receipt view with a current receipt is not rebuilt", () => {
  const run = clone();
  run.receipt = receiptOf(run);
  const view = buildReceiptView(run);
  assert.equal(view.final.net, -105);
  assert.equal(view.pending.toConsumer, BELOW);
});

test("receipt view: the BelowMinimum row has an honest label, PENDING badge and is not moved", () => {
  const view = buildReceiptView(clone());
  const cp = view.settled.find((s) => s.supplier === "codepodcast");
  const t = cp.transfers.find((x) => x.reason === "bond_forfeit");
  assert.equal(t.badge, "PENDING");
  assert.equal(t.moved, false);
  assert.equal(t.note, BELOW_MINIMUM_NOTE);
  assert.match(t.note, /not transferred: below the Cardano minimum \(#62\)/);
  assert.equal(t.explorerUrl, null);
  assert.deepEqual(cp.transfers.filter((x) => x.moved).map((x) => x.reason), ["award_release", "bond_return"]);
  assert.equal(cp.bondForfeitOwed, BELOW);
  const row = view.pending.rows.find((r) => r.supplier === "codepodcast");
  assert.equal(row.amount, BELOW);
  assert.equal(row.note, BELOW_MINIMUM_NOTE);
  assert.equal(view.pendingRows, 1);
});

test("receipt view: a row the Board topped up shows the top-up honestly and still counts as moved", () => {
  const run = clone();
  run.ledger = run.ledger.map((l) =>
    forfeitRow(l) ? { ...l, badge: "REAL", txHash: "c".repeat(64), state: "Withdrawn", topUp: 0.035714 } : l,
  );
  run.settlement.transfers = run.ledger.filter((l) => l.phase === "settlement");
  run.receipt = receiptOf(run);
  const view = buildReceiptView(run);
  assert.equal(view.final.net, -103.035714);
  assert.equal(view.final.pending, 0);
  assert.equal(view.final.topUps, 0.035714);
  assert.deepEqual(view.final.topUpBadges, ["REAL"]);
  const t = view.settled.find((s) => s.supplier === "codepodcast").transfers.find((x) => x.reason === "bond_forfeit");
  assert.equal(t.moved, true);
  assert.equal(t.note, "Board topped up 0.035714 to the 2 tADA minimum");
  const dash = dashboardState({ withReceipt: false, run });
  const row = dash.rows.find((m) => m.action === "bond_forfeit" && m.supplier === "codepodcast");
  assert.equal(row.note, t.note);
  assert.equal(dash.wallet.back, 76.964286);
});

test("receipt view: per-agent ledgers leave the pending row out of every net and still sum to 0", () => {
  const view = buildReceiptView(clone());
  const by = Object.fromEntries(view.ledgers.map((l) => [l.id, l]));
  assert.equal(by.consumer.net, -105);
  assert.equal(by.consumer.pendingCount, 1);
  assert.equal(by.codepodcast.net, 51.035714);
  assert.equal(by.board.net, 9.964286);
  const note = by.consumer.rows.find((r) => r.pending);
  assert.equal(note.note, BELOW_MINIMUM_NOTE);
  assert.equal(note.amount, BELOW);
  assert.equal(by.board.rows.find((r) => r.pending).amount, -BELOW);
  assert.equal(Math.round(view.ledgers.reduce((t, l) => t + l.net, 0) * 1e6) / 1e6, 0);
});

test("simulated worked example and canned replay are unchanged", () => {
  const fixture = JSON.parse(readFileSync(new URL("../../data/seeds/board-run.worked-example.json", import.meta.url), "utf8"));
  const view = buildReceiptView({ ...fixture.run, events: fixture.events });
  assert.equal(view.final.net, -108.75);
  assert.equal(view.pending.toConsumer, 0);
  assert.equal(view.pending.rows.length, 0);
  const canned = buildReceiptView({ ...fixture.run, mode: "canned" });
  assert.equal(canned.final.net, -108.75);
  assert.ok(canned.settled.every((s) => s.transfers.every((t) => t.moved && t.note === null)));
});

function dashboardState({ withReceipt, run = clone() }) {
  let seq = 0;
  const ev = (name, data) => ({ seq: ++seq, ts: "2026-10-09T00:00:00.000Z", name, data });
  const events = [
    ev("run.created", { runId: run.id, badge: "PENDING", mode: "live" }),
    ev("tender.published", { tender: { ...run.tender, audience: "technical users" }, suppliers: run.suppliers }),
    ...run.ledger.filter((l) => l.phase === "lock").map((l) => ev("escrow.locked", { supplier: l.supplier, kind: l.action, receipt: l })),
    ...run.ledger.filter((l) => l.phase === "settlement").map((l) => ev("settlement.transfer", { supplier: l.supplier, receipt: l })),
  ];
  if (withReceipt) {
    const old = receiptOf(run, run.ledger.map((l) => (forfeitRow(l) ? { ...l, badge: "SIMULATED" } : l)));
    delete old.consumer.notMoved;
    events.push(ev("receipt.ready", { receipt: old }));
  }
  return buildDashboardView(reduceEvents(events));
}

test("dashboard wallet: back counts moved rows only, pending is shown apart", () => {
  const v = dashboardState({ withReceipt: false });
  assert.equal(v.wallet.back, 75);
  assert.equal(v.wallet.pendingBack, BELOW);
  assert.equal(v.wallet.net, -105);
  const row = v.rows.find((m) => m.action === "bond_forfeit" && m.supplier === "codepodcast");
  assert.equal(row.badge, "PENDING");
  assert.equal(row.pending, true);
  assert.equal(row.txHash, null);
  assert.equal(row.note, BELOW_MINIMUM_NOTE);
});

test("dashboard mini receipt: a receipt stored before #62 is corrected to moved money", () => {
  const v = dashboardState({ withReceipt: true });
  assert.equal(v.receipt.net, -105);
  assert.equal(v.receipt.costPerSignup, Math.round((105 / 14) * 1e6) / 1e6);
  assert.equal(v.receipt.pending, true);
});
