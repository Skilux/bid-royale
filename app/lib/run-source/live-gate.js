/**
 * Run live asks before it sends anything (#43). A real run locks 10 escrows on Cardano preprod and settles for
 * 15 to 20 minutes, so a click must not start one. `createLiveGate` is the whole rule: `request` (the Run live click)
 * only opens the question, and `confirm` is the one call that starts the run. Cancel and "watch the recording" never do.
 */

/** "real": SIMULATE_PAYMENTS=false on a live Board. "simulated": fast, labelled ledger. "replay": DEMO_MODE=canned, no run at all. */
export const liveKind = ({ demoMode, realPayments }) => (demoMode === "canned" ? "replay" : realPayments ? "real" : "simulated");

/** Measured on run_c1f40522 (#45), minutes after settlement start. */
export const REAL_TIMINGS = [
  { at: "about 2 min", what: "all 10 escrow locks are REAL" },
  { at: "about 6 min", what: "the Under-gate refund is REAL" },
  { at: "about 13 min", what: "the award releases are REAL" },
  { at: "about 17 min", what: "every row is REAL" },
];

/** Dialog text per kind. Facts only: the numbers come from #45. */
export function liveDialogCopy(kind) {
  if (kind === "real") {
    return {
      title: "Start a real run?",
      body: "This starts a REAL run on Cardano preprod. Agents lock 10 escrows in test ADA (no real value) and the Board settles every one on chain. Full settlement takes about 15–20 minutes. You can watch it live here, and the receipt fills in as transactions confirm. Want to start it?",
      timings: REAL_TIMINGS,
      confirm: "Start real run",
    };
  }
  if (kind === "replay") {
    return {
      title: "Run live on a replay server",
      body: "This server is in replay mode, so Run live plays a recorded run. Nothing is sent to Cardano and no ADA moves. It takes about 25 seconds.",
      timings: [],
      confirm: "Play it",
    };
  }
  return {
    title: "Start a simulated run?",
    body: "This starts a SIMULATED run. Payments are a labelled ledger: nothing goes to Cardano and no ADA moves. It finishes in under 30 seconds. Want to start it?",
    timings: [],
    confirm: "Start simulated run",
  };
}

export const WATCH_RECORDING = "Watch the recording instead";

/** A run in flight, as the Board's GET /api/run reports it: "run_x, started 7 min ago". */
export const activeRunLine = (active) => `${active.id}, started ${active.ageMinutes === 0 ? "just now" : `${active.ageMinutes} min ago`}`;

export function createLiveGate({ start, watchRecording, attach }) {
  let asking = false;
  return {
    get asking() {
      return asking;
    },
    /** The Run live click. Sends nothing. */
    request() {
      asking = true;
    },
    /** "Start real run". Starts only after a request, and only once. */
    confirm() {
      if (!asking) return false;
      asking = false;
      start();
      return true;
    },
    /** "Attach to run_x" in the dialog, when a live run is already in flight. */
    attachTo(runId) {
      if (!asking) return false;
      asking = false;
      attach(runId);
      return true;
    },
    /** "Watch the recording instead". */
    watchInstead() {
      if (!asking) return false;
      asking = false;
      watchRecording();
      return true;
    },
    /** Esc, backdrop, or closing the dialog. */
    cancel() {
      asking = false;
    },
  };
}
