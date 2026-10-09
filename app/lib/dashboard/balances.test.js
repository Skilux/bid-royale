import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reduceEvents } from "./reduce.js";
import { buildDashboardView } from "./view.js";
import { supplierBalances } from "./balances.js";

const load = (file) => JSON.parse(readFileSync(new URL(`../../data/canned/${file}`, import.meta.url), "utf8"));
const viewOf = (events) => buildDashboardView(reduceEvents(events, { replay: true }));
const byId = (list) => Object.fromEntries(list.map((b) => [b.id, b]));

test("run_c1f40522 final: who ended up with what", () => {
  const b = byId(supplierBalances(viewOf(load("c1f40522-final.json").events)));
  assert.equal(b.techblog.net, 63);
  assert.equal(b.codepodcast.net.toFixed(2), "51.04");
  assert.equal(b.devnewsletter.net, -17);
  assert.equal(b.gamingforum.net, -2);
  assert.equal(b.codepodcast.formula, "13.75 × (0.7 − 0.6) ÷ 0.7 = 1.96");
  for (const id of ["techblog", "devnewsletter", "gamingforum"]) assert.equal(b[id].formula, null);
  assert.deepEqual(b.techblog.bondBar, { total: 16.25, back: 16.25, forfeit: 0, pendingForfeit: 0 });
  assert.deepEqual(b.devnewsletter.bondBar, { total: 15, back: 0, forfeit: 15, pendingForfeit: 0 });
  assert.equal(b.devnewsletter.rows.awardToConsumer.amount, 60);
  assert.equal(b.gamingforum.bondBar, null);
  assert.equal(b.techblog.pendingParts, 0);
});

test("no rows before the first verdict", () => {
  const events = load("c1f40522-final.json").events;
  const first = events.findIndex((e) => e.name === "verdict.signed");
  assert.ok(first > 0);
  assert.deepEqual(supplierBalances(viewOf(events.slice(0, first))), []);
});

test("run_c1f40522 before the #62 fix: the PENDING forfeit is listed, never counted", () => {
  const b = byId(supplierBalances(viewOf(load("c1f40522-before-62.json").events)));
  const all = Object.values(b);
  assert.ok(all.some((x) => x.pendingParts > 0), "one part is PENDING");
  assert.equal(b.codepodcast.bondBar.pendingForfeit.toFixed(2), "1.96");
  for (const x of all) {
    const counted = x.parts.filter((p) => !p.pending).reduce((t, p) => t + p.sign * p.amount, 0);
    assert.equal(x.net.toFixed(4), counted.toFixed(4));
  }
});
