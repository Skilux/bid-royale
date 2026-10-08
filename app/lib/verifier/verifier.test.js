import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WINDOW, generateFeed } from "../outcome-feed/index.js";
import { publicKeyFromSecret, publicKeyHex } from "../signing/index.js";
import { buildVerdict, verify, verifyVerdict } from "./index.js";

const SHOP = "test-shop-secret";
const BOARD = "test-board-secret";
const shopPublicKey = publicKeyHex(publicKeyFromSecret(SHOP));
const boardPublicKey = publicKeyHex(publicKeyFromSecret(BOARD));
const feed = () => generateFeed({ seed: 7, signingSecret: SHOP });
const run = (events) => verify(events, { window: DEFAULT_WINDOW, shopPublicKey });

const bids = [
  { supplier: "techblog", promised: 7, award: 7 },
  { supplier: "codepodcast", promised: 8, award: 6 },
  { supplier: "devnewsletter", promised: 12, award: 7 },
];

test("worked example verifies 8 / 6 / 0", () => {
  const { verified } = run(feed().events);
  assert.equal(verified.techblog, 8);
  assert.equal(verified.codepodcast, 6);
  assert.equal(verified.devnewsletter ?? 0, 0);
});

test("verdicts are pass / short_of_promise / under_gate with delivered 8 / 6 / 0", () => {
  const { events, impressions } = feed();
  const { verified } = run(events);
  const verdicts = bids.map((b) =>
    buildVerdict({ ...b, verified: verified[b.supplier] ?? 0, impressions: impressions[b.supplier], signingSecret: BOARD }),
  );
  assert.deepEqual(verdicts.map((v) => v.kind), ["pass", "short_of_promise", "under_gate"]);
  assert.deepEqual(verdicts.map((v) => v.delivered), [8, 6, 0]);
  assert.deepEqual(verdicts.map((v) => v.bond), [1.75, 1.5, 1.75]);
});

test("every invalid event is rejected with its expected reason", () => {
  const { events, invalid } = feed();
  const { rejections } = run(events);
  const byId = Object.fromEntries(rejections.map((r) => [r.eventId, r.reason]));
  assert.equal(rejections.length, invalid.length);
  for (const i of invalid) assert.equal(byId[i.eventId], i.kind);
});

test("tampering a signed field is rejected as bad_signature", () => {
  const { events } = feed();
  const target = events.find((e) => e.supplier === "techblog");
  const tampered = events.map((e) => (e === target ? { ...e, ts: DEFAULT_WINDOW.start } : e));
  const { verified, rejections } = run(tampered);
  assert.equal(verified.techblog, 7);
  assert.equal(rejections.find((r) => r.eventId === target.eventId).reason, "bad_signature");
});

test("moving a supplier field is rejected", () => {
  const { events } = feed();
  const target = events.find((e) => e.supplier === "techblog");
  const moved = events.map((e) => (e === target ? { ...e, supplier: "codepodcast" } : e));
  assert.equal(run(moved).rejections.find((r) => r.eventId === target.eventId).reason, "bad_signature");
});

test("a signature from another key is rejected", () => {
  const other = generateFeed({ seed: 7, signingSecret: "someone-else", includeInvalid: false });
  const { verified, rejections } = run(other.events);
  assert.deepEqual(verified, {});
  assert.equal(rejections.length, 14);
});

test("a replayed event counts once", () => {
  const { events } = feed();
  const target = events.find((e) => e.supplier === "techblog" && e.sessionId === "techblog.0001");
  const { verified, rejections } = run([...events, target]);
  assert.equal(verified.techblog, 8);
  assert.equal(rejections.at(-1).reason, "duplicate");
});

test("malformed events are rejected without throwing", () => {
  const { rejections } = run([null, { eventId: "x" }, { eventId: 1, sessionId: "a", supplier: "b", ts: "c" }]);
  assert.deepEqual(rejections.map((r) => r.reason), ["malformed", "malformed", "malformed"]);
});

test("window start is inclusive and end is exclusive", () => {
  const { events } = generateFeed({ seed: 1, signingSecret: SHOP, includeInvalid: false });
  const narrow = { start: events[0].ts, end: events[0].ts };
  assert.equal(Object.keys(verify(events, { window: narrow, shopPublicKey }).verified).length, 0);
});

test("bot signals never change the result", () => {
  const { events } = feed();
  const stripped = events.map(({ signals, ...rest }) => rest);
  const flagged = events.map((e) => ({ ...e, signals: { asn: "AS16509", clickBurst: true } }));
  assert.deepEqual(run(stripped), run(events));
  assert.deepEqual(run(flagged), run(events));
});

test("the verdict hash and Board signature check out and detect tampering", () => {
  const v = buildVerdict({ supplier: "techblog", verified: 8, impressions: 1000, promised: 7, award: 7, signingSecret: BOARD });
  assert.ok(verifyVerdict(v, boardPublicKey));
  assert.equal(verifyVerdict({ ...v, kind: "under_gate" }, boardPublicKey), false);
  assert.equal(verifyVerdict(v, shopPublicKey), false);
});

test("zero impressions gives delivered 0 and under_gate", () => {
  const v = buildVerdict({ supplier: "gamingforum", verified: 0, impressions: 0, promised: 4, award: 0, signingSecret: BOARD });
  assert.equal(v.delivered, 0);
  assert.equal(v.kind, "under_gate");
});

test("verdicts are deterministic", () => {
  const args = { supplier: "codepodcast", verified: 6, impressions: 1000, promised: 8, award: 6, signingSecret: BOARD };
  assert.deepEqual(buildVerdict(args), buildVerdict(args));
});
