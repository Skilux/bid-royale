import { EVENTS } from "../board/events.js";

/** fast: the judge run, whole stream inside the budget. normal: recorded timing, 1x. instant: no delay (tests, offline checks). */
export const SPEEDS = ["fast", "normal", "instant"];
export const DEFAULT_SPEED = "fast";

/** The Wrapper UI run must finish in under 30 s. The stream gets 25 s, the UI animations the rest. */
export const FAST_BUDGET_MS = 25_000;

const DEFAULT_GAP_MS = 250;

/** Delay before an event appears, in fast mode. step.started carries the 0.35 s pause between steps. */
const GAP_MS = {
  [EVENTS.runCreated]: 0,
  [EVENTS.tenderPublished]: 500,
  [EVENTS.stepStarted]: 350,
  [EVENTS.stepCompleted]: 150,
  [EVENTS.bidCommitted]: 300,
  [EVENTS.bidFeeLocked]: 250,
  [EVENTS.bidRevealed]: 350,
  [EVENTS.bidRejected]: 600,
  [EVENTS.auctionRanked]: 700,
  [EVENTS.allocationDecided]: 700,
  [EVENTS.escrowLocked]: 300,
  [EVENTS.feedServed]: 400,
  [EVENTS.feedGenerated]: 400,
  [EVENTS.verificationCompleted]: 800,
  [EVENTS.verdictSigned]: 800,
  [EVENTS.settlementStarted]: 400,
  [EVENTS.settlementTransfer]: 450,
  [EVENTS.settlementProgress]: 150,
  [EVENTS.settlementCompleted]: 600,
  [EVENTS.receiptReady]: 700,
  [EVENTS.roundTwoDecided]: 700,
  [EVENTS.runCompleted]: 500,
};

export function readSpeed(env = process.env) {
  const value = env.REPLAY_SPEED?.trim().toLowerCase();
  return SPEEDS.includes(value) ? value : DEFAULT_SPEED;
}

/**
 * Milliseconds after the replay starts at which each event is shown. Non-decreasing, same length as `events`.
 * fast scales every gap down together when the stream would overrun `budgetMs`, so any recording fits.
 */
export function paceEvents(events, { speed = DEFAULT_SPEED, budgetMs = FAST_BUDGET_MS } = {}) {
  if (speed === "instant" || events.length === 0) return events.map(() => 0);

  if (speed === "normal") {
    const first = Date.parse(events[0].ts);
    let at = 0;
    return events.map((e) => {
      const offset = Date.parse(e.ts) - first;
      at = Math.max(at, Number.isFinite(offset) ? offset : at);
      return at;
    });
  }

  const gaps = events.map((e, i) => (i === 0 ? 0 : (GAP_MS[e.name] ?? DEFAULT_GAP_MS)));
  const total = gaps.reduce((t, g) => t + g, 0);
  const scale = total > budgetMs ? budgetMs / total : 1;
  let at = 0;
  return gaps.map((g) => (at += Math.floor(g * scale)));
}
