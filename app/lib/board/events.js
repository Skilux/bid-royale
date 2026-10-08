/** Run steps in execution order. A step can only start when the one before it is done. */
export const STEPS = ["tender", "bids", "allocation", "locks", "feed", "verification", "verdicts", "settlement"];

/** Every SSE event name the Board emits. The UI subscribes with addEventListener(name, ...). */
export const EVENTS = {
  runCreated: "run.created",
  runCompleted: "run.completed",
  runFailed: "run.failed",
  modeDegraded: "mode.degraded",
  stepStarted: "step.started",
  stepCompleted: "step.completed",
  stepFailed: "step.failed",
  tenderPublished: "tender.published",
  bidCommitted: "bid.committed",
  bidFeeLocked: "bid.fee_locked",
  bidRevealed: "bid.revealed",
  bidRejected: "bid.rejected",
  auctionRanked: "auction.ranked",
  allocationDecided: "allocation.decided",
  escrowLocked: "escrow.locked",
  feedServed: "feed.served",
  feedGenerated: "feed.generated",
  verificationCompleted: "verification.completed",
  verdictSigned: "verdict.signed",
  settlementStarted: "settlement.started",
  settlementTransfer: "settlement.transfer",
  settlementProgress: "settlement.progress",
  settlementCompleted: "settlement.completed",
  receiptReady: "receipt.ready",
  roundTwoDecided: "round2.decided",
};

export const EVENT_NAMES = Object.values(EVENTS);

/** Events after which the SSE stream has nothing more to say. */
export const TERMINAL_EVENTS = [EVENTS.runCompleted, EVENTS.runFailed];

export class BoardError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message ?? code);
    this.name = "BoardError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
