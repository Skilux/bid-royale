import { EVENTS } from "../board/events.js";

/**
 * Pause before each event when a recorded run is played back, in ms at Normal speed. A recording carries no
 * usable timing (the fixture spans 0.7 s), so pace comes from the event name. DESIGN.md section 3: the 30 s run
 * reaches the receipt in about 24 s. The Under-gate refund gets the longest hold, it is the hero beat.
 */
const GAP_MS = {
  [EVENTS.runCreated]: 0,
  [EVENTS.tenderPublished]: 500,
  [EVENTS.bidCommitted]: 360,
  [EVENTS.bidFeeLocked]: 200,
  [EVENTS.bidRevealed]: 360,
  [EVENTS.bidRejected]: 800,
  [EVENTS.auctionRanked]: 900,
  [EVENTS.allocationDecided]: 800,
  [EVENTS.escrowLocked]: 320,
  [EVENTS.feedServed]: 1000,
  [EVENTS.feedGenerated]: 500,
  [EVENTS.verificationCompleted]: 1200,
  [EVENTS.verdictSigned]: 1100,
  [EVENTS.settlementStarted]: 600,
  [EVENTS.settlementTransfer]: 560,
  [EVENTS.settlementProgress]: 160,
  [EVENTS.settlementCompleted]: 300,
  [EVENTS.receiptReady]: 700,
  [EVENTS.roundTwoDecided]: 600,
  [EVENTS.runCompleted]: 0,
  [EVENTS.modeDegraded]: 600,
};
const DEFAULT_GAP_MS = 120;
const HERO_GAP_MS = 1400;

/** Names that carry no visible change. They add no pause, so the step bar never stalls on them. */
const SILENT = new Set([EVENTS.stepStarted, EVENTS.stepCompleted]);

export const SPEEDS = { slow: 0.6, normal: 1, fast: 2.2 };

/** Pause in ms before showing `event`, at speed 1. */
export function gapFor(event) {
  if (SILENT.has(event?.name)) return 0;
  if (event?.name === EVENTS.settlementTransfer && event.data?.receipt?.action === "award_reclaim") return HERO_GAP_MS;
  return GAP_MS[event?.name] ?? DEFAULT_GAP_MS;
}

/** Total playback time of a transcript in ms at the given speed. */
export function totalMs(events, speed = 1) {
  return Math.round((events ?? []).reduce((t, e) => t + gapFor(e), 0) / speed);
}

/** The run is its own pace: events that arrive live are shown at once. */
export function nextDelayMs(event, speed = 1) {
  return Math.round(gapFor(event) / speed);
}
