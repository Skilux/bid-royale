import { EVENTS } from "../board/events.js";
import { paceEvents } from "../replay/pacing.js";

/**
 * Playback pace of a recorded run in the UI. The base timing is the replay's (`lib/replay/pacing`, fast mode),
 * so the server replay and the UI play one run at one speed. The UI adds one hold: the Under-gate refund is the
 * hero beat. Normal speed reaches the receipt in about 25 s, inside the 30 s rule (DESIGN.md section 3).
 */
export const SPEEDS = { slow: 0.6, normal: 1, fast: 2 };

export const HERO_HOLD_MS = 900;
const BUDGET_MS = 24_000;

const isHero = (e) => e?.name === EVENTS.settlementTransfer && e.data?.receipt?.action === "award_reclaim";

/** Pause in ms before showing each event, at Normal speed. Same length as `events`. */
export function gapsFor(events) {
  const offsets = paceEvents(events ?? [], { speed: "fast", budgetMs: BUDGET_MS });
  return (events ?? []).map((e, i) => (i === 0 ? 0 : offsets[i] - offsets[i - 1]) + (isHero(e) ? HERO_HOLD_MS : 0));
}

/** Total playback time of a transcript in ms at the given speed multiplier. */
export function totalMs(events, speed = 1) {
  return Math.round(gapsFor(events).reduce((t, g) => t + g, 0) / speed);
}

/** step.started and step.completed only move the step bar. Next and Back skip over them. */
export const isStepEvent = (e) => e?.name === EVENTS.stepStarted || e?.name === EVENTS.stepCompleted;
