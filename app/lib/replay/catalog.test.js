import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { EVENTS } from "../board/events.js";
import { RECORDINGS } from "../../data/canned/index.js";
import { DEFAULT_RECORDING_ID, isRecordingId, listRecordings, loadPrepared, pickRecordingId, summaryLine } from "./catalog.js";
import { closeRecording, validateRecording } from "./prepare.js";

const raw = async (rec) => (await rec.load()).default;
const isRealHash = (h) => typeof h === "string" && h.length > 0 && !h.startsWith("sim_");

test("every recording validates: run.created first, run.completed last, status completed", async () => {
  for (const rec of RECORDINGS) {
    const doc = await raw(rec);
    assert.doesNotThrow(() => validateRecording(doc), rec.id);
    assert.equal(doc.events[0].name, EVENTS.runCreated, rec.id);
    assert.equal(doc.events.at(-1).name, EVENTS.runCompleted, rec.id);
    assert.equal(doc.run.status, "completed", rec.id);
    assert.equal(doc.run.id, rec.runId, `${rec.id}: runId`);
    assert.equal(doc.events[0].ts, rec.recordedAt, `${rec.id}: recordedAt`);
  }
});

test("the registry summary matches the recording, so a stale number fails the check", async () => {
  for (const rec of RECORDINGS) {
    const { run } = await raw(rec);
    const rows = run.ledger;
    assert.deepEqual(
      rec.summary,
      {
        net: run.receipt.consumer.net,
        signups: run.receipt.consumer.signups,
        realRows: rows.filter((r) => r.badge === "REAL" && isRealHash(r.txHash)).length,
        totalRows: rows.length,
      },
      rec.id,
    );
  }
});

test("registry: unique ids, one file each, no orphan file in data/canned, default is the first", () => {
  assert.equal(new Set(RECORDINGS.map((r) => r.id)).size, RECORDINGS.length);
  assert.equal(DEFAULT_RECORDING_ID, RECORDINGS[0].id);
  const files = readdirSync(new URL("../../data/canned/", import.meta.url)).filter((f) => f.endsWith(".json"));
  assert.deepEqual(files.sort(), RECORDINGS.map((r) => r.file).sort());
  for (const rec of RECORDINGS) assert.ok(rec.title && rec.badgeNote && typeof rec.load === "function", rec.id);
  assert.ok(listRecordings().every((r) => !("load" in r)), "the picker list carries no loader");
});

test("picker default and deep link: a known ?replay id plays, anything else falls back to the default", () => {
  assert.equal(pickRecordingId(undefined), "final");
  assert.equal(pickRecordingId(null), "final");
  assert.equal(pickRecordingId(""), "final");
  assert.equal(pickRecordingId("nope"), "final");
  assert.equal(pickRecordingId(["before-62-fix", "final"]), "final");
  assert.equal(pickRecordingId("before-62-fix"), "before-62-fix");
  assert.equal(isRecordingId("before-62-fix"), true);
  assert.equal(isRecordingId("simulated"), false);
  assert.equal(isRecordingId("constructor"), false);
  assert.equal(isRecordingId("__proto__"), false);
});

test("the before-62 recording keeps its PENDING row: 20 of 21 REAL, the forfeit never counted as moved", async () => {
  const rec = await loadPrepared("before-62-fix");
  assert.equal(rec.run.ledger.filter((r) => r.badge === "REAL").length, 20);
  assert.equal(rec.run.ledger.filter((r) => r.badge === "PENDING").length, 1);
  assert.equal(rec.run.receipt.consumer.net, -105);
});

test("the default recording is the final run: 21 of 21 REAL rows with tx links, net -103.04, replayed as PRE-RECORDED", async () => {
  const rec = await loadPrepared(DEFAULT_RECORDING_ID);
  assert.equal(rec.source, "data/canned/c1f40522-final.json");
  assert.equal(rec.run.mode, "canned");
  assert.equal(rec.run.badge, "PRE-RECORDED");
  const rows = rec.run.ledger;
  assert.equal(rows.length, 21);
  assert.ok(rows.every((r) => r.badge === "REAL" && isRealHash(r.txHash) && r.explorerUrl?.includes("/transaction/")));
  assert.equal(rec.run.receipt.consumer.net, -103.035714);
  assert.equal(rec.run.receipt.consumer.signups, 14);
  assert.deepEqual(rec.run.receipt.badges, ["REAL"]);
  assert.deepEqual(rec.events.at(-1).data.badges, ["REAL"]);
  assert.equal(rec.info.downgradedToPreRecorded, 0);
});

test("an unknown id loads the default, and a recording is parsed once", async () => {
  assert.equal(await loadPrepared("nope"), await loadPrepared(DEFAULT_RECORDING_ID));
  assert.equal(await loadPrepared("before-62-fix"), await loadPrepared("before-62-fix"));
});

test("summaryLine: sign, two decimals, REAL rows", () => {
  assert.equal(summaryLine({ summary: { net: -103.035714, signups: 14, realRows: 21, totalRows: 21 } }), "net −103.04 tADA, 14 signups, 21 of 21 rows REAL");
  assert.equal(summaryLine({ summary: { net: -105, signups: 14, realRows: 20, totalRows: 21 } }), "net −105.00 tADA, 14 signups, 20 of 21 rows REAL");
});

test("closeRecording moves a mid-stream run.completed to the end, with the final receipt numbers", () => {
  const ev = (name, ts, data = {}) => ({ ts, name, data });
  const doc = {
    run: { receipt: { consumer: { net: -103.04, signups: 14 }, badges: ["REAL"] } },
    events: [
      ev("run.created", "t0"),
      ev("run.completed", "t1", { runId: "r", net: -105, signups: 14, badges: ["REAL", "PENDING"] }),
      ev("settlement.progress", "t2"),
      ev("receipt.ready", "t3"),
    ],
  };
  const closed = closeRecording(doc);
  assert.deepEqual(closed.events.map((e) => e.name), ["run.created", "settlement.progress", "receipt.ready", "run.completed"]);
  assert.deepEqual(closed.events.at(-1), ev("run.completed", "t3", { runId: "r", net: -103.04, signups: 14, badges: ["REAL"] }));
  assert.equal(doc.events[1].data.net, -105, "the input is not changed");
  const tidy = { ...doc, events: [ev("run.created", "t0"), ev("run.completed", "t1")] };
  assert.equal(closeRecording(tidy), tidy, "a recording that already ends with run.completed comes back as it was");
});
