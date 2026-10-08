import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../board/store.js";
import { FIXTURE_SECRETS, createFixtureBoard } from "../board/worked-example.js";
import { verifyVerdict } from "../verifier/index.js";
import { MAX_ITEM_BYTES, bundleHash, createEvidence, manifestEntry, sealItem } from "./index.js";
import { sha256Hex } from "../signing/index.js";
import { verdictPreimage, verifyItem } from "./verify.js";

const EXPECTED = [
  "tender", "brief", "keys",
  "bid.techblog", "bid.codepodcast", "bid.devnewsletter", "bid.gamingforum",
  "allocation",
  "signups.techblog", "signups.codepodcast", "signups.devnewsletter",
  "verification.techblog", "verification.codepodcast", "verification.devnewsletter",
  "delivery.techblog", "delivery.codepodcast", "delivery.devnewsletter",
  "verdict.techblog", "verdict.codepodcast", "verdict.devnewsletter",
  "result.techblog", "result.codepodcast", "result.devnewsletter",
  "ledger", "settlement", "receipt",
].sort();

async function workedRun() {
  const board = await createFixtureBoard();
  const created = await board.createRun();
  const run = await board.runAll(created.id);
  return { board, run };
}

test("a completed run has a bundle with every item and a manifest of hashes", async () => {
  const { board, run } = await workedRun();
  const manifest = await board.evidenceManifest(run.id);

  assert.deepEqual(manifest.items.map((i) => i.name), EXPECTED);
  assert.equal(manifest.count, EXPECTED.length);
  assert.equal(manifest.source, "live");
  assert.match(manifest.bundleHash, /^[0-9a-f]{64}$/);
  for (const entry of manifest.items) {
    assert.match(entry.hash, /^[0-9a-f]{64}$/, entry.name);
    assert.ok(entry.size > 0, entry.name);
    assert.equal(entry.bytes, undefined, "the manifest never carries bytes");
  }
  assert.deepEqual(manifest.items.filter((i) => i.mutable).map((i) => i.name), ["ledger", "receipt", "settlement"]);
});

test("the stored bytes hash to the listed hash, and verify matches for every item", async () => {
  const { board, run } = await workedRun();
  const manifest = await board.evidenceManifest(run.id);
  for (const entry of manifest.items) {
    const item = await board.evidenceItem(run.id, entry.name);
    assert.equal(sha256Hex(Buffer.from(item.bytes, "utf8")), item.hash, entry.name);
    assert.equal(Buffer.byteLength(item.bytes, "utf8"), item.size, entry.name);
    const result = await verifyItem(item);
    assert.equal(result.ok, true, `${entry.name}: ${JSON.stringify(result.checks)}`);
  }
});

test("tampering with one byte fails verify", async () => {
  const { board, run } = await workedRun();
  const item = await board.evidenceItem(run.id, "verification.techblog");
  const tampered = { ...item, bytes: item.bytes.replace('"verified":8', '"verified":9') };
  assert.notEqual(tampered.bytes, item.bytes);
  const result = await verifyItem(tampered);
  assert.equal(result.ok, false);
  assert.equal(result.checks[0].ok, false);
  assert.notEqual(result.actual, item.hash);

  const wrongHash = await verifyItem({ ...item, hash: "0".repeat(64) });
  assert.equal(wrongHash.ok, false);
  const missing = await verifyItem({ name: "x", hash: item.hash });
  assert.equal(missing.ok, false);
});

test("a tampered verdict inside valid bytes fails the verdict-hash check", async () => {
  const { board, run } = await workedRun();
  const item = await board.evidenceItem(run.id, "verdict.devnewsletter");
  const parsed = JSON.parse(item.bytes);
  parsed.verdict.kind = "pass";
  const text = JSON.stringify(parsed);
  const forged = { ...item, bytes: text, hash: sha256Hex(text), size: Buffer.byteLength(text) };
  const result = await verifyItem(forged);
  assert.equal(result.checks[0].ok, true, "the forged file hashes to its own hash");
  assert.equal(result.ok, false, "but the verdict no longer matches its signed hash");
});

test("the browser verdict recipe equals the verifier's", async () => {
  const { run } = await workedRun();
  for (const v of run.verdicts) {
    assert.equal(sha256Hex(verdictPreimage(v)), v.hash);
    assert.ok(verifyVerdict(v, run.keys.board));
  }
});

test("the same input gives the same hashes across runs", async () => {
  const one = await workedRun();
  const two = await workedRun();
  assert.deepEqual(await one.board.evidenceManifest(one.run.id), await two.board.evidenceManifest(two.run.id));
});

test("a verdict item links to the hash of that supplier's verification report", async () => {
  const { board, run } = await workedRun();
  for (const supplier of ["techblog", "codepodcast", "devnewsletter"]) {
    const verdict = JSON.parse((await board.evidenceItem(run.id, `verdict.${supplier}`)).bytes);
    assert.equal(verdict.verificationReportHash, await board.evidenceHash(run.id, `verification.${supplier}`));
    assert.equal(verdict.verdict.hash, run.verdicts.find((v) => v.supplier === supplier).hash);
  }
});

test("the bid items hold commit, reveal and receive time, and the allocation holds every decision", async () => {
  const { board, run } = await workedRun();
  const bid = JSON.parse((await board.evidenceItem(run.id, "bid.techblog")).bytes);
  assert.equal(bid.commit, run.bids[0].commit);
  assert.deepEqual(bid.reveal, { price: 70, impressions: 1000, promisedPer1000: 7, salt: "salt-techblog" });
  assert.equal(typeof bid.receivedAt, "number");
  assert.equal(bid.commitMatchesReveal, true);

  const allocation = JSON.parse((await board.evidenceItem(run.id, "allocation")).bytes);
  const byDecision = Object.fromEntries(allocation.decisions.map((d) => [d.supplier, d]));
  assert.equal(byDecision.techblog.decision, "accepted");
  assert.deepEqual(byDecision.gamingforum, { supplier: "gamingforum", decision: "rejected", reason: "below_gate" });
});

test("verification reports count rejected events by kind and keep bot signals as context", async () => {
  const { board, run } = await workedRun();
  const report = JSON.parse((await board.evidenceItem(run.id, "verification.techblog")).bytes);
  assert.equal(report.verified, 8);
  assert.deepEqual(report.rejectedByKind, { bad_signature: 1, outside_window: 1, wrong_attribution: 1 });
  assert.equal(report.rejectedEvents.length, 3);
  assert.match(report.botSignals.note, /never read by the verifier/);

  const signups = JSON.parse((await board.evidenceItem(run.id, "signups.techblog")).bytes);
  assert.equal(signups.events.length, report.received);
});

test("no secret reaches the bundle", async () => {
  const { board, run } = await workedRun();
  const all = JSON.stringify(await board.exportEvidence(run.id));
  for (const secret of Object.values(FIXTURE_SECRETS)) assert.ok(!all.includes(secret));
  assert.ok(!/api[_-]?key|token|private/i.test(all));
});

test("immutable items refuse different bytes under the same name, mutable ones get a revision", async () => {
  const store = createMemoryStore();
  const evidence = createEvidence({ store });
  const run = { id: "r1", tender: { budget: 1, currency: "tADA" }, suppliers: [], brief: { a: 1 }, keys: { shop: "s", board: "b" } };

  assert.deepEqual((await evidence.recordStep(run, "tender")).written, ["tender", "brief", "keys"]);
  assert.deepEqual((await evidence.recordStep(run, "tender")).unchanged, ["tender", "brief", "keys"]);
  const changed = await evidence.recordStep({ ...run, brief: { a: 2 } }, "tender");
  assert.deepEqual(changed.failed.map((f) => f.name), ["brief"]);
  assert.equal(JSON.parse((await evidence.getItem("r1", "brief")).bytes).a, 1, "the first bytes survive");

  const withLedger = { ...run, ledger: [{ badge: "PENDING" }], settlement: null, receipt: null };
  await evidence.recordStep(withLedger, "locks");
  assert.equal((await evidence.getItem("r1", "ledger")).revision, 1);
  assert.deepEqual((await evidence.recordStep(withLedger, "locks")).unchanged, ["ledger"]);
  await evidence.recordStep({ ...withLedger, ledger: [{ badge: "REAL" }] }, "locks");
  const ledger = await evidence.getItem("r1", "ledger");
  assert.equal(ledger.revision, 2);
  assert.match(ledger.bytes, /REAL/);
});

test("an item over the size cap or with a bad name is refused", () => {
  assert.throws(() => sealItem({ name: "big", value: { x: "a".repeat(MAX_ITEM_BYTES) } }), /limit is/);
  assert.throws(() => sealItem({ name: "../etc", value: {} }), /not allowed/);
  assert.throws(() => sealItem({ name: "Bid.TechBlog", value: {} }), /not allowed/);
});

test("a canned recording carries the bundle and Verify works on the restored copy", async () => {
  const { board, run } = await workedRun();
  const recorded = await board.exportEvidence(run.id);
  const store = createMemoryStore();
  const evidence = createEvidence({ store });
  await evidence.importBundle("run_replay", recorded);

  const manifest = await evidence.manifest("run_replay", { source: "PRE-RECORDED" });
  assert.equal(manifest.source, "PRE-RECORDED");
  assert.equal(manifest.bundleHash, bundleHash(recorded));
  for (const entry of manifest.items) assert.equal((await verifyItem(await evidence.getItem("run_replay", entry.name))).ok, true);
});

test("manifest entries never include bytes", () => {
  const entry = manifestEntry({ name: "a", hash: "h", size: 1, bytes: "{}", extra: 1 });
  assert.deepEqual(entry, { name: "a", hash: "h", size: 1 });
});

test("the committed worked-example fixture carries a bundle that verifies offline", async () => {
  const { readFileSync } = await import("node:fs");
  const fixture = JSON.parse(readFileSync(new URL("../../data/seeds/board-run.worked-example.json", import.meta.url), "utf8"));
  assert.deepEqual(fixture.evidence.map((i) => i.name).sort(), EXPECTED);
  for (const item of fixture.evidence) assert.equal((await verifyItem(item)).ok, true, item.name);
  const tampered = { ...fixture.evidence[0], bytes: `${fixture.evidence[0].bytes} ` };
  assert.equal((await verifyItem(tampered)).ok, false);
});

test("a canned replay restores the recorded bundle, labelled PRE-RECORDED, and Verify matches", async () => {
  const { readFileSync } = await import("node:fs");
  const { createReplay, prepareRecording } = await import("../replay/index.js");
  const doc = JSON.parse(readFileSync(new URL("../../data/seeds/board-run.worked-example.json", import.meta.url), "utf8"));
  const replay = createReplay({ env: {}, load: () => prepareRecording(doc, "test") });
  const board = await createFixtureBoard({ flags: { simulatePayments: true, demoMode: "canned" }, canned: replay });

  const run = await board.createRun();
  assert.equal(run.mode, "canned");
  const manifest = await board.evidenceManifest(run.id);
  assert.equal(manifest.source, "PRE-RECORDED");
  assert.deepEqual(manifest.items.map((i) => i.name), EXPECTED);
  for (const entry of manifest.items) assert.equal((await verifyItem(await board.evidenceItem(run.id, entry.name))).ok, true, entry.name);
});

test("a recording without a bundle replays with an empty bundle instead of failing", async () => {
  const { readFileSync } = await import("node:fs");
  const { createReplay, prepareRecording } = await import("../replay/index.js");
  const doc = JSON.parse(readFileSync(new URL("../../data/seeds/board-run.worked-example.json", import.meta.url), "utf8"));
  delete doc.evidence;
  const replay = createReplay({ env: {}, load: () => prepareRecording(doc, "test") });
  const board = await createFixtureBoard({ flags: { simulatePayments: true, demoMode: "canned" }, canned: replay });
  const run = await board.createRun();
  assert.equal((await board.evidenceManifest(run.id)).count, 0);
});
