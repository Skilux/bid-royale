import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "./store.js";
import { BoardError } from "./events.js";
import { ACTIVE_MAX_AGE_MS, acquireLiveStart, findActiveRun, liveGuardApplies } from "./live-guard.js";

const NOW = Date.parse("2026-10-09T03:00:00.000Z");
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const clock = { now: () => NOW };

async function settling(store, id, { status = "in_progress", msAgo = 5 * 60_000 } = {}) {
  await store.setRun({ id, status, createdAt: iso(msAgo) });
  await store.markSettling(id);
}

test("the guard applies to real payments on a live Board only", () => {
  assert.equal(liveGuardApplies({ realPayments: true, demoMode: "live" }), true);
  assert.equal(liveGuardApplies({ realPayments: false, demoMode: "live" }), false, "simulated runs move nothing");
  assert.equal(liveGuardApplies({ realPayments: true, demoMode: "canned" }), false, "a replay is not a run");
});

test("findActiveRun: a settling run is active, finished, stale and missing ones are not", async () => {
  const store = createMemoryStore();
  assert.equal(await findActiveRun(store, clock), null);
  await settling(store, "run_done", { status: "completed" });
  await settling(store, "run_failed", { status: "failed" });
  await settling(store, "run_stale", { msAgo: ACTIVE_MAX_AGE_MS + 60_000 });
  await store.markSettling("run_gone");
  assert.equal(await findActiveRun(store, clock), null);

  await settling(store, "run_live", { msAgo: 7 * 60_000 });
  assert.deepEqual(await findActiveRun(store, clock), { id: "run_live", createdAt: iso(7 * 60_000), status: "in_progress", ageMinutes: 7 });
});

test("a second live start while a run is settling is a 409 that names the active run", async () => {
  const store = createMemoryStore();
  await settling(store, "run_live");
  await assert.rejects(acquireLiveStart(store, clock), (e) => e instanceof BoardError && e.status === 409 && e.code === "live_run_in_progress" && e.extra.activeRunId === "run_live");
});

test("starts are serialised: a second start inside the lock window is a 409, release lets a retry through", async () => {
  const store = createMemoryStore();
  const release = await acquireLiveStart(store, clock);
  await assert.rejects(acquireLiveStart(store, clock), (e) => e.status === 409 && e.extra.activeRunId === null);
  await release();
  await assert.doesNotReject(acquireLiveStart(store, clock));
});
