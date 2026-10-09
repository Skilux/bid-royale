import { BoardError } from "./events.js";

/** Real payments lock real test ADA and settle for 15 to 20 minutes, so only one live run may be in flight (#43). */
export const ACTIVE_MAX_AGE_MS = 60 * 60 * 1000;
export const START_LOCK_KEY = "live-run:start";
export const START_LOCK_SECONDS = 90;

const FINAL = new Set(["completed", "failed"]);

/** The guard covers real payments on a live Board. A simulated run is fast and moves nothing, a replay is no run. */
export const liveGuardApplies = ({ realPayments, demoMode }) => Boolean(realPayments) && demoMode === "live";

/**
 * The run still settling, or null. Reads the store's settling set (the Railway trigger's list), so it needs no
 * change in settlement code. A marker older than the settlement timer fallback plus margin is stale and ignored.
 */
export async function findActiveRun(store, { now = Date.now } = {}) {
  for (const id of await store.listSettling()) {
    const run = await store.getRun(id);
    if (!run || FINAL.has(run.status)) continue;
    const age = now() - Date.parse(run.createdAt);
    if (!(age <= ACTIVE_MAX_AGE_MS)) continue;
    return { id: run.id, createdAt: run.createdAt, status: run.status, ageMinutes: Math.max(0, Math.round(age / 60_000)) };
  }
  return null;
}

/**
 * Call before creating a live run. Throws 409 `live_run_in_progress` with `activeRunId` when a run is settling,
 * or when another start was claimed in the last 90 s (steps run before settlement is marked). Returns `release`,
 * to call when creating the run failed so a retry is not blocked.
 */
export async function acquireLiveStart(store, { now = Date.now } = {}) {
  const active = await findActiveRun(store, { now });
  if (active) {
    throw new BoardError(409, "live_run_in_progress", `live run ${active.id} is still settling, attach to it instead`, {
      activeRunId: active.id,
      activeCreatedAt: active.createdAt,
    });
  }
  if (!(await store.claim(START_LOCK_KEY, START_LOCK_SECONDS))) {
    throw new BoardError(409, "live_run_in_progress", "another live run was just started, wait a minute or attach to it", { activeRunId: null });
  }
  return () => store.release(START_LOCK_KEY);
}
