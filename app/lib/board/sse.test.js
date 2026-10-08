import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "./store.js";
import { formatSse, isStreamDone, streamEvents } from "./sse.js";

const collect = async (gen) => {
  const out = [];
  for await (const frame of gen) out.push(frame);
  return out;
};
const noSleep = async () => {};

async function seeded(names) {
  const store = createMemoryStore();
  for (const name of names) await store.appendEvent("r1", { ts: "2026-10-08T22:00:00.000Z", name, data: { name } });
  return store;
}

test("formatSse writes id, event and a JSON data line", () => {
  const frame = formatSse({ seq: 3, name: "bid.committed", ts: "t", data: { supplier: "techblog" } }, "r1");
  assert.match(frame, /^id: 3\nevent: bid\.committed\ndata: /);
  assert.ok(frame.endsWith("\n\n"));
  assert.deepEqual(JSON.parse(frame.split("data: ")[1]), { seq: 3, runId: "r1", name: "bid.committed", ts: "t", data: { supplier: "techblog" } });
});

test("stream replays the backlog and stops after the terminal event", async () => {
  const store = await seeded(["run.created", "step.started", "run.completed", "late.event"]);
  const frames = await collect(streamEvents({ store, runId: "r1", sleep: noSleep }));
  assert.equal(frames[0], "retry: 1000\n\n");
  assert.deepEqual(frames.slice(1).map((f) => f.match(/event: (.+)/)[1]), ["run.created", "step.started", "run.completed"]);
});

test("stream resumes after the Last-Event-ID cursor", async () => {
  const store = await seeded(["run.created", "step.started", "run.completed"]);
  const frames = await collect(streamEvents({ store, runId: "r1", after: 2, sleep: noSleep }));
  assert.deepEqual(frames.slice(1).map((f) => f.match(/id: (\d+)/)[1]), ["3"]);
});

test("stream delivers events that land while it waits", async () => {
  const store = await seeded(["run.created"]);
  let polls = 0;
  const sleep = async () => {
    if (++polls === 2) await store.appendEvent("r1", { ts: "t", name: "run.completed", data: {} });
  };
  const frames = await collect(streamEvents({ store, runId: "r1", sleep }));
  assert.deepEqual(frames.slice(1).map((f) => f.match(/event: (.+)/)[1]), ["run.created", "run.completed"]);
});

test("stream sends a heartbeat when idle and ends at maxMs", async () => {
  const store = await seeded([]);
  let clock = 0;
  const frames = await collect(
    streamEvents({ store, runId: "r1", now: () => clock, sleep: async () => void (clock += 5000), heartbeatMs: 10000, maxMs: 25000 }),
  );
  assert.ok(frames.includes(": ping\n\n"));
  assert.ok(clock >= 25000);
});

test("stream stops when the client aborts", async () => {
  const store = await seeded(["run.created"]);
  const controller = new AbortController();
  const sleep = async () => controller.abort();
  const frames = await collect(streamEvents({ store, runId: "r1", signal: controller.signal, sleep }));
  assert.equal(frames.length, 2);
});

test("isStreamDone is true only for a closed run whose events the client has all seen", async () => {
  const store = await seeded(["run.created", "run.completed"]);
  assert.equal(await isStreamDone({ store, runId: "r1", after: 2 }), false);
  await store.setRun({ id: "r1", status: "in_progress" });
  assert.equal(await isStreamDone({ store, runId: "r1", after: 2 }), false);
  await store.setRun({ id: "r1", status: "completed" });
  assert.equal(await isStreamDone({ store, runId: "r1", after: 0 }), false);
  assert.equal(await isStreamDone({ store, runId: "r1", after: 1 }), false);
  assert.equal(await isStreamDone({ store, runId: "r1", after: 2 }), true);
  assert.equal(await isStreamDone({ store, runId: "r1", after: 99 }), true);
  assert.equal(await isStreamDone({ store, runId: "missing", after: 0 }), false);
});
