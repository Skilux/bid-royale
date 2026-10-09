import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareRecording } from "../replay/prepare.js";
import { beatsBefore, buildChapters, orderForDemo, walk } from "./chapters.js";

const load = (file) => orderForDemo(prepareRecording(JSON.parse(readFileSync(new URL(`../../data/canned/${file}`, import.meta.url), "utf8")), file).events);
const events = load("c1f40522-final.json");
const chapters = buildChapters(events);
const byId = (id) => chapters.find((c) => c.id === id);

test("six sections that add up to the 90 s transcript", () => {
  assert.deepEqual(chapters.map((c) => c.id), ["intro", "customer", "competitive", "guaranteed", "traceable", "close"]);
  assert.deepEqual(chapters.map((c) => c.durationMs / 1000), [12, 8, 23, 16, 22, 9]);
  assert.equal(chapters.reduce((t, c) => t + c.durationMs, 0), 90_000);
  assert.deepEqual(chapters.map((c) => c.pillar), [null, null, 0, 1, 2, null]);
});

test("sections chain: each starts where the one before ended, and the last shows the whole run", () => {
  for (let i = 1; i < chapters.length; i += 1) assert.equal(chapters[i].from, chapters[i - 1].to);
  assert.equal(chapters.at(-1).to, events.length);
});

test("schedules stay inside their section and only move forward", () => {
  for (const c of chapters) {
    let last = c.from;
    for (const s of c.schedule) {
      assert.ok(s.ms >= 0 && s.ms <= c.durationMs, `${c.id}: ms ${s.ms}`);
      assert.ok(s.cursor >= last, `${c.id}: cursor order`);
      last = s.cursor;
    }
    for (const o of c.overlays) assert.ok(o.ms + (o.ttl ?? 0) <= c.durationMs, `${c.id}: overlay ${o.id} ends in time`);
    for (const m of c.cams) assert.ok(m.ms < c.durationMs);
  }
});

test("the verdicts are told as Pass, Short of promise, Under gate", () => {
  assert.deepEqual(events.filter((e) => e.name === "verdict.signed").map((e) => e.data.kind), ["pass", "short_of_promise", "under_gate"]);
  const kinds = byId("traceable").beats.filter((b) => /Pass:|Short of promise:|NeoRack gets its money back/.test(b.text)).map((b) => b.tag ?? b.text.match(/Pass|Short/)?.[0]);
  assert.equal(kinds.length, 3);
  const at = byId("traceable").beats.filter((b) => b.at !== undefined).map((b) => b.at);
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
});

test("the refund is shown after it is REAL, with its tx hash", () => {
  const t = byId("traceable");
  const last = events[t.to - 1];
  const id = events.find((e) => e.name === "settlement.transfer" && e.data.receipt.action === "award_reclaim").data.receipt.id;
  assert.equal(last.data.receiptId ?? last.data.receipt.id, id);
  assert.ok((last.data.txHash ?? last.data.receipt.txHash).startsWith("b4854bc3d6"));
});

test("lines carry the numbers of the recording", () => {
  const text = (id) => [...byId(id).beats.map((b) => b.text), ...byId(id).overlays.flatMap((o) => [o.text, o.title, ...(o.lines ?? [])])].filter(Boolean).join("\n");
  assert.match(text("intro"), /budget {2}200 tADA/);
  assert.match(text("intro"), /gate {4}0\.5% conversion/);
  assert.match(text("competitive"), /TechBlog {2}0\.5% for 65/);
  assert.match(text("competitive"), /GamingForum {2}0\.4% for 20/);
  assert.match(text("competitive"), /DevNewsletter +6\.00/);
  assert.match(text("competitive"), /budget {2}180 of 200/);
  assert.match(text("guaranteed"), /DevNewsletter promises 1%/);
  assert.match(text("traceable"), /1\.96 of 13\.75 bond forfeited/);
  assert.match(text("traceable"), /60 back in my wallet/);
  assert.match(text("close"), /103\.04 tADA for 14 verified signups, about 7\.36 each/);
});

test("overlays show the pillars one per clause and the section texts follow the transcript", () => {
  const pillars = byId("intro").overlays.filter((o) => o.kind === "pillar");
  assert.deepEqual(pillars.map((o) => o.text), ["Competitive", "Guaranteed", "Traceable"]);
  assert.ok(pillars.every((o, i) => i === 0 || o.ms > pillars[i - 1].ms));
  assert.match(byId("intro").narration, /competitive, guaranteed and traceable/);
  assert.match(byId("traceable").narration, /Here is that refund\.$/);
});

test("walk spreads events over the window and gives step events no time of their own", () => {
  const w = walk(events, 0, 6, 1000, 2000);
  assert.equal(w.at(-1).ms, 2000);
  assert.equal(w.at(-1).cursor, 6);
  assert.deepEqual(walk(events, 5, 5, 0, 1), []);
  assert.deepEqual(walk(events, null, 5, 0, 1), []);
});

test("every beat has an actor, a text and one trigger", () => {
  for (const c of chapters) {
    for (const b of c.beats) {
      assert.ok(b.actorName && b.initials && b.tone, `${c.id}: actor`);
      assert.ok(b.text.length > 10, `${c.id}: text`);
      assert.ok(b.ms !== undefined || b.at !== undefined, `${c.id}: trigger`);
    }
  }
  assert.equal(beatsBefore(chapters, 1).length, chapters[0].beats.length);
});

test("the before-62 recording builds too", () => {
  const c = buildChapters(load("c1f40522-before-62.json"));
  assert.equal(c.length, chapters.length);
});

test("a transcript with only a tender still builds", () => {
  const few = buildChapters(events.slice(0, 3));
  assert.equal(few[0].id, "intro");
});

test("a lock or bid fee is confirmed next to its creation, and no PENDING update comes after", () => {
  const created = events.filter((e) => e.name === "bid.fee_locked" || e.name === "escrow.locked");
  assert.equal(created.length, 10);
  for (const e of created) {
    const i = events.indexOf(e);
    const next = events[i + 1];
    assert.equal(next.name, "settlement.progress");
    assert.equal(next.data.receiptId, e.data.receipt.id);
    assert.equal(next.data.badge, "REAL");
    assert.ok(next.data.txHash);
  }
  const late = events.filter((e) => e.name === "settlement.progress" && ["lock", "bid_fee"].includes(e.data.phase));
  assert.equal(late.length, 10, "only the confirmations are left");
});

test("orderForDemo drops only the interim PENDING updates of locks and bid fees", () => {
  const raw = prepareRecording(JSON.parse(readFileSync(new URL("../../data/canned/c1f40522-final.json", import.meta.url), "utf8")), "x").events;
  const interim = raw.filter((e) => e.name === "settlement.progress" && ["lock", "bid_fee"].includes(e.data.phase) && e.data.badge !== "REAL").length;
  assert.equal(interim, 20);
  assert.equal(events.length, raw.length - interim);
});
