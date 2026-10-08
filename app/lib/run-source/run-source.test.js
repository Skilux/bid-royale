import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openRunSource } from "./index.js";

const fixture = JSON.parse(readFileSync(new URL("../../data/seeds/board-run.worked-example.json", import.meta.url), "utf8"));
const loadCanned = async () => fixture;

function collect(extra = {}) {
  const log = { sources: [], events: [], snapshots: [], ends: 0, degrades: [] };
  const opts = {
    loadCanned,
    onSource: (s) => {
      log.sources.push(s);
      log.events.length = 0;
    },
    onEvents: (e) => log.events.push(...e),
    onSnapshot: (r) => log.snapshots.push(r),
    onEnd: () => (log.ends += 1),
    onDegrade: (r) => log.degrades.push(r),
    ...extra,
  };
  return { log, opts };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

class FakeEventSource {
  static last = null;
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.handlers = {};
    FakeEventSource.last = this;
  }
  addEventListener(name, fn) {
    (this.handlers[name] ??= []).push(fn);
  }
  emit(frame) {
    for (const fn of this.handlers[frame.name] ?? []) fn({ data: JSON.stringify(frame) });
  }
  fail() {
    this.readyState = 2;
    this.onerror?.();
  }
  close() {
    this.readyState = 2;
  }
}

const json = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });

test("canned: one batch, replay flag, snapshot, then end, with no network", async () => {
  const { log, opts } = collect({ fetchImpl: () => assert.fail("canned must not fetch") });
  openRunSource({ ...opts, mode: "canned" });
  await tick();
  assert.deepEqual(log.sources, [{ kind: "canned", replay: true, runId: fixture.run.id }]);
  assert.equal(log.events.length, fixture.events.length);
  assert.equal(log.snapshots[0].id, fixture.run.id);
  assert.equal(log.ends, 1);
  assert.equal(log.degrades.length, 0);
});

test("live: POST /api/run, follow SSE, run the steps, end on run.completed", async () => {
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push(`${init.method} ${url}`);
    if (url === "/api/run") return json({ run: { id: "run_x" } }, 201);
    if (url === "/api/run/run_x/all") return json({ run: { id: "run_x" } });
    if (url === "/api/run/run_x") return json({ run: { id: "run_x", feed: { events: [] } } });
    return json({}, 404);
  };
  const { log, opts } = collect({ fetchImpl, EventSourceImpl: FakeEventSource });
  openRunSource({ ...opts, mode: "live" });
  await tick();
  assert.deepEqual(log.sources, [{ kind: "live", replay: false, runId: "run_x" }]);
  assert.equal(FakeEventSource.last.url, "/api/events?run=run_x");
  assert.ok(calls.includes("POST /api/run/run_x/all"));
  const es = FakeEventSource.last;
  es.emit({ seq: 1, ts: "t", name: "run.created", data: { runId: "run_x" } });
  es.emit({ seq: 1, ts: "t", name: "run.created", data: { runId: "run_x" } });
  es.emit({ seq: 2, ts: "t", name: "feed.generated", data: {} });
  es.emit({ seq: 3, ts: "t", name: "run.completed", data: {} });
  await tick();
  assert.deepEqual(log.events.map((e) => e.seq), [1, 2, 3]);
  assert.equal(log.ends, 1);
  assert.equal(log.snapshots.length, 1);
  assert.equal(log.degrades.length, 0);
});

test("live: POST /api/run fails, degrade to canned with mode.degraded first", async () => {
  const fetchImpl = () => json({ error: "signing_secret_missing" }, 500);
  const { log, opts } = collect({ fetchImpl, EventSourceImpl: FakeEventSource });
  openRunSource({ ...opts, mode: "live" });
  await tick();
  assert.match(log.degrades[0], /start_failed: signing_secret_missing/);
  assert.equal(log.sources.at(-1).kind, "canned");
  assert.equal(log.events[0].name, "mode.degraded");
  assert.equal(log.events.length, fixture.events.length + 1);
  assert.equal(log.ends, 1);
});

test("close() silences a source whose fetch never answers", async () => {
  const fetchImpl = (_url, init) => new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  const { log, opts } = collect({ fetchImpl, EventSourceImpl: FakeEventSource });
  const src = openRunSource({ ...opts, mode: "live" });
  src.close();
  await tick();
  assert.equal(log.ends, 0, "a closed source stays silent");
});

test("live: stream closes before any event, degrade", async () => {
  const fetchImpl = (url) => (url === "/api/run" ? json({ run: { id: "run_y" } }, 201) : json({ run: {} }));
  const { log, opts } = collect({ fetchImpl, EventSourceImpl: FakeEventSource });
  openRunSource({ ...opts, mode: "live" });
  await tick();
  FakeEventSource.last.fail();
  await tick();
  assert.equal(log.degrades[0], "stream_closed");
  assert.equal(log.sources.at(-1).kind, "canned");
});

test("attach: run not found degrades to canned", async () => {
  const fetchImpl = () => json({ error: "run_not_found" }, 404);
  const { log, opts } = collect({ fetchImpl, EventSourceImpl: FakeEventSource });
  openRunSource({ ...opts, mode: "attach", runId: "nope" });
  await tick();
  assert.match(log.degrades[0], /attach_failed: run_not_found/);
});

test("attach: follows an existing run from its first event with no POST", async () => {
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push(`${init.method} ${url}`);
    return json({ run: { id: "warm", feed: { events: [] } } });
  };
  const { log, opts } = collect({ fetchImpl, EventSourceImpl: FakeEventSource });
  openRunSource({ ...opts, mode: "attach", runId: "warm" });
  await tick();
  assert.deepEqual(calls.filter((c) => c.startsWith("POST")), []);
  assert.deepEqual(log.sources, [{ kind: "live", replay: false, runId: "warm" }]);
  assert.equal(log.snapshots[0].id, "warm");
});
