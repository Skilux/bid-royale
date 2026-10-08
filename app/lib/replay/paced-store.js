import { EVENTS, STEPS } from "../board/events.js";

const isReplayEvent = (e) => e.dueAt != null;

/**
 * Shows a canned run the way the live Board would: step by step. Replay events carry `dueAt` (epoch ms),
 * the run carries `replay`. Until an event is due, `getEvents` hides it and `getRun` hides what it would show.
 * Live runs and live events pass through untouched. Same store contract, so the Board and routes need no change.
 */
export function projectRun(run, events, nowMs) {
  const replayEvents = events.filter(isReplayEvent);
  const shown = replayEvents.filter((e) => e.dueAt <= nowMs);
  if (shown.length === replayEvents.length) return run;

  const done = new Set(shown.filter((e) => e.name === EVENTS.stepCompleted).map((e) => e.data?.step));
  const started = new Set(shown.filter((e) => e.name === EVENTS.stepStarted).map((e) => e.data?.step));
  const seen = (name) => shown.some((e) => e.name === name);
  const settled = done.has("settlement");

  const steps = Object.fromEntries(
    STEPS.map((step) => [
      step,
      done.has(step)
        ? run.steps[step]
        : started.has(step)
          ? { status: "running", startedAt: run.steps[step]?.startedAt }
          : { status: "pending" },
    ]),
  );
  const ledgerShown = (row) => (row.phase === "bid_fee" ? done.has("bids") : row.phase === "lock" ? done.has("locks") : settled);

  return {
    ...run,
    status: "in_progress",
    steps,
    nextStep: STEPS.find((s) => !done.has(s)) ?? null,
    bids: done.has("bids") ? run.bids : [],
    auction: done.has("allocation") ? run.auction : null,
    feed: done.has("feed") ? run.feed : null,
    verification: done.has("verification") ? run.verification : null,
    verdicts: done.has("verdicts") ? run.verdicts : [],
    settlement: settled ? run.settlement : null,
    ledger: (run.ledger ?? []).filter(ledgerShown),
    receipt: seen(EVENTS.receiptReady) ? run.receipt : null,
    roundTwo: seen(EVENTS.roundTwoDecided) ? run.roundTwo : null,
  };
}

/** Wraps a BoardStore. `now` is injectable so tests drive the clock. */
export function withReplayPacing(store, { now = Date.now } = {}) {
  return {
    ...store,
    async getEvents(runId, after = 0) {
      const events = await store.getEvents(runId, after);
      const t = now();
      const hidden = events.findIndex((e) => isReplayEvent(e) && e.dueAt > t);
      return hidden === -1 ? events : events.slice(0, hidden);
    },
    async getRun(id) {
      const run = await store.getRun(id);
      if (!run?.replay || run.mode !== "canned") return run;
      return projectRun(run, await store.getEvents(id), now());
    },
  };
}
