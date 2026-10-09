import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareRecording } from "../replay/prepare.js";
import { supplierBalances } from "./balances.js";
import { reduceEvents } from "./reduce.js";
import { buildDashboardView } from "./view.js";

const load = (file) => {
  const doc = JSON.parse(readFileSync(new URL(`../../data/canned/${file}`, import.meta.url), "utf8"));
  const rec = prepareRecording(doc, file);
  return buildDashboardView(reduceEvents(rec.events, { replay: true }));
};
const byId = (rows, id) => rows.find((r) => r.id === id);

test("run_c1f40522 final: TechBlog +63, CodePodcast +51.04, DevNewsletter -17, GamingForum -2", () => {
  const rows = supplierBalances(load("c1f40522-final.json"));
  assert.equal(byId(rows, "techblog").net, 63);
  assert.equal(byId(rows, "codepodcast").net.toFixed(2), "51.04");
  assert.equal(byId(rows, "devnewsletter").net, -17);
  assert.equal(byId(rows, "gamingforum").net, -2);
});

test("run_c1f40522 final: the pro-rata formula is on the Short-of-promise row only", () => {
  const rows = supplierBalances(load("c1f40522-final.json"));
  assert.equal(byId(rows, "codepodcast").formula, "13.75 × (0.7 − 0.6) ÷ 0.7 = 1.96");
  for (const id of ["techblog", "devnewsletter", "gamingforum"]) assert.equal(byId(rows, id).formula, null);
});

test("run_c1f40522 final: signed parts per supplier", () => {
  const rows = supplierBalances(load("c1f40522-final.json"));
  const tb = byId(rows, "techblog");
  assert.deepEqual([tb.fee, tb.bond, tb.awardPaid, tb.bondBack, tb.bondLost], [2, 16.25, 65, 16.25, 0]);
  const dn = byId(rows, "devnewsletter");
  assert.deepEqual([dn.fee, dn.bond, dn.awardPaid, dn.awardToConsumer, dn.bondBack, dn.bondLost], [2, 15, 0, 60, 0, 15]);
  assert.equal(byId(rows, "codepodcast").bondBack.toFixed(2), "11.79");
  assert.equal(byId(rows, "codepodcast").bondLost.toFixed(2), "1.96");
});

test("before the treasury fix: the PENDING forfeit is listed and not counted", () => {
  const rows = supplierBalances(load("c1f40522-before-62.json"));
  const cp = byId(rows, "codepodcast");
  assert.equal(cp.bondLost, 0, "a forfeit that never moved is not a loss yet");
  assert.deepEqual(cp.pendingParts.map((p) => p.label), ["bond forfeited"]);
  assert.equal(cp.net.toFixed(2), "51.04", "the supplier net does not depend on the forfeit transfer");
  for (const id of ["techblog", "devnewsletter", "gamingforum"]) assert.equal(byId(rows, id).pendingParts.length, 0);
});
