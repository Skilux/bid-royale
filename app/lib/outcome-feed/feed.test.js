import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WINDOW, generateFeed, INVALID_KINDS } from "./index.js";

const SECRET = "test-shop-secret";
const feed = (opts = {}) => generateFeed({ seed: 7, signingSecret: SECRET, ...opts });

test("same seed gives an identical feed", () => {
  assert.deepEqual(feed(), feed());
});

test("a different seed changes timestamps", () => {
  assert.notDeepEqual(feed().events.map((e) => e.ts), feed({ seed: 8 }).events.map((e) => e.ts));
});

test("impressions match the worked example and GamingForum is not served", () => {
  assert.deepEqual(feed().impressions, { techblog: 1000, codepodcast: 1000, devnewsletter: 1500 });
});

test("valid signups per supplier are scripted 8 / 6 / 0", () => {
  const { events, invalid } = feed();
  const bad = new Set(invalid.map((i) => i.eventId));
  const count = (s) => events.filter((e) => e.supplier === s && !bad.has(e.eventId)).length;
  assert.deepEqual([count("techblog"), count("codepodcast"), count("devnewsletter")], [8, 6, 0]);
});

test("every served supplier gets one invalid event of each kind", () => {
  const { invalid } = feed();
  assert.equal(invalid.length, 9);
  for (const kind of INVALID_KINDS) assert.equal(invalid.filter((i) => i.kind === kind).length, 3);
});

test("includeInvalid false emits only valid events", () => {
  const { events, invalid } = feed({ includeInvalid: false });
  assert.equal(events.length, 14);
  assert.equal(invalid.length, 0);
});

test("timestamps of valid events fall inside the window", () => {
  const { events, invalid } = feed();
  const bad = new Set(invalid.map((i) => i.eventId));
  for (const e of events.filter((e) => !bad.has(e.eventId))) {
    assert.ok(e.ts >= DEFAULT_WINDOW.start && e.ts < DEFAULT_WINDOW.end);
  }
});

test("missing signing secret throws a clear error", () => {
  const prev = process.env.SHOP_SIGNING_KEY;
  delete process.env.SHOP_SIGNING_KEY;
  try {
    assert.throws(() => generateFeed({ seed: 1 }), /signing secret is missing/);
  } finally {
    if (prev !== undefined) process.env.SHOP_SIGNING_KEY = prev;
  }
});
