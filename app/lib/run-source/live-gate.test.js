import test from "node:test";
import assert from "node:assert/strict";
import { openRunSource } from "./index.js";
import { activeRunLine, createLiveGate, formatElapsed, liveDialogCopy, liveKind, REAL_TIMINGS, settlingLine } from "./live-gate.js";

function harness() {
  const calls = { start: 0, watch: 0, attach: [] };
  const gate = createLiveGate({ start: () => (calls.start += 1), watchRecording: () => (calls.watch += 1), attach: (id) => calls.attach.push(id) });
  return { gate, calls };
}

test("Run live click only opens the question: nothing starts until confirm", () => {
  const { gate, calls } = harness();
  gate.request();
  assert.equal(gate.asking, true);
  assert.deepEqual(calls, { start: 0, watch: 0, attach: [] });
});

test("confirm without a request starts nothing, and a confirm starts exactly once", () => {
  const { gate, calls } = harness();
  assert.equal(gate.confirm(), false);
  assert.equal(calls.start, 0);
  gate.request();
  assert.equal(gate.confirm(), true);
  assert.equal(gate.confirm(), false, "a double click does not start a second run");
  assert.equal(calls.start, 1);
  assert.equal(gate.asking, false);
});

test("Esc, the backdrop and Watch the recording never start a live run", () => {
  const { gate, calls } = harness();
  gate.request();
  gate.cancel();
  assert.equal(gate.confirm(), false);
  gate.request();
  assert.equal(gate.watchInstead(), true);
  assert.equal(gate.confirm(), false);
  assert.deepEqual(calls, { start: 0, watch: 1, attach: [] });
});

test("a live run already in flight: the dialog attaches to it and never starts another", () => {
  const { gate, calls } = harness();
  assert.equal(gate.attachTo("run_live"), false, "no attach before a request");
  gate.request();
  assert.equal(gate.attachTo("run_live"), true);
  assert.deepEqual(calls, { start: 0, watch: 0, attach: ["run_live"] });
});

test("no POST without a confirm: the live source is only opened by confirm", async () => {
  const posts = [];
  const fetchImpl = (url, init = {}) => {
    if (init.method === "POST") posts.push(url);
    return Promise.resolve({ ok: true, status: 201, json: async () => ({ run: { id: "run_new" } }) });
  };
  const noop = { loadCanned: async () => ({ events: [] }), fetchImpl, EventSourceImpl: undefined };
  let source = null;
  const gate = createLiveGate({
    start: () => (source = openRunSource({ ...noop, mode: "live" })),
    watchRecording: () => {},
    attach: () => {},
  });

  gate.request();
  gate.cancel();
  gate.request();
  gate.watchInstead();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(posts, [], "Esc and Watch the recording sent nothing");

  gate.request();
  gate.confirm();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(posts, ["/api/run"], "the confirmed start is the only POST");
  source?.close();
});

test("a 409 from the Board attaches to the run in flight instead of starting or replaying", async () => {
  const requests = [];
  const fetchImpl = (url, init = {}) => {
    requests.push(`${init.method ?? "GET"} ${url}`);
    if (init.method === "POST") return Promise.resolve({ ok: false, status: 409, json: async () => ({ error: "live_run_in_progress", activeRunId: "run_live" }) });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ run: { id: "run_live" } }) });
  };
  const seen = { busy: [], degrade: [], sources: [] };
  const src = openRunSource({
    mode: "live",
    loadCanned: async () => ({ events: [] }),
    fetchImpl,
    EventSourceImpl: class {
      addEventListener() {}
      close() {}
    },
    onBusy: (id) => seen.busy.push(id),
    onDegrade: (r) => seen.degrade.push(r),
    onSource: (s) => seen.sources.push(s),
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(seen.busy, ["run_live"]);
  assert.deepEqual(seen.degrade, []);
  assert.deepEqual(seen.sources, [{ kind: "live", replay: false, runId: "run_live" }]);
  assert.deepEqual(requests, ["POST /api/run", "GET /api/run/run_live"]);
  src.close();
});

test("dialog copy by mode: real names the 15-20 min, REAL escrows and test ADA; simulated says simulated and fast", () => {
  assert.equal(liveKind({ demoMode: "live", realPayments: true }), "real");
  assert.equal(liveKind({ demoMode: "live", realPayments: false }), "simulated");
  assert.equal(liveKind({ demoMode: "canned", realPayments: true }), "replay");

  const real = liveDialogCopy("real");
  assert.match(real.body, /REAL run on Cardano preprod/);
  assert.match(real.body, /10 escrows in test ADA \(no real value\)/);
  assert.match(real.body, /15–20 minutes/);
  assert.equal(real.confirm, "Start real run");
  assert.deepEqual(REAL_TIMINGS.map((t) => t.at), ["about 2 min", "about 6 min", "about 13 min", "about 17 min"]);

  const sim = liveDialogCopy("simulated");
  assert.match(sim.body, /SIMULATED/);
  assert.match(sim.body, /under 30 seconds/);
  assert.doesNotMatch(sim.body, /15–20/);
  assert.match(liveDialogCopy("replay").body, /replay mode/);
});

test("activeRunLine", () => {
  assert.equal(activeRunLine({ id: "run_x", ageMinutes: 7 }), "run_x, started 7 min ago");
  assert.equal(activeRunLine({ id: "run_x", ageMinutes: 0 }), "run_x, started just now");
});

test("settlingLine names the next two measured milestones", () => {
  assert.equal(formatElapsed(372_000), "6:12");
  assert.equal(settlingLine(30_000), "settling · 0:30 · locks at ~2 min, refund REAL at ~6 min");
  assert.equal(settlingLine(372_000), "settling · 6:12 · releases at ~13 min, all rows REAL at ~17 min");
  assert.equal(settlingLine(14 * 60_000), "settling · 14:00 · all rows REAL at ~17 min");
  assert.match(settlingLine(18 * 60_000), /past the measured 17 min/);
});
