/**
 * Run live asks before it sends anything (#43). A real run locks 10 escrows on Cardano preprod and settles for
 * 15 to 20 minutes, so a click must not start one. `createLiveGate` is the whole rule: `request` (the Run live click)
 * only opens the question, and `confirm` is the one call that starts the run. Cancel and "watch the recording" never do.
 */

/** "real": SIMULATE_PAYMENTS=false on a live Board. "simulated": fast, labelled ledger. "replay": DEMO_MODE=canned, no run at all. */
export const liveKind = ({ demoMode, realPayments }) => (demoMode === "canned" ? "replay" : realPayments ? "real" : "simulated");

/** Measured on run_c1f40522 (#45), minutes after settlement start. */
export const REAL_TIMINGS = [
  { at: "about 2 min", min: 2, what: "all 10 escrow locks are REAL", short: "locks" },
  { at: "about 6 min", min: 6, what: "the Under-gate refund is REAL", short: "refund REAL" },
  { at: "about 13 min", min: 13, what: "the award releases are REAL", short: "releases" },
  { at: "about 17 min", min: 17, what: "every row is REAL", short: "all rows REAL" },
];

/** m:ss for an elapsed time in ms: 372000 gives "6:12". */
export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The settlement line of the step rail in a real run (#66 D1): `settling · 6:12 · refund REAL at ~6 min, releases at ~13 min`.
 * It names the next two milestones of `REAL_TIMINGS` that the elapsed time has not reached. After the last one it says so.
 */
export function settlingLine(elapsedMs) {
  const minutes = elapsedMs / 60000;
  const ahead = REAL_TIMINGS.filter((t) => t.min > minutes).slice(0, 2);
  const clock = `settling · ${formatElapsed(elapsedMs)}`;
  if (ahead.length === 0) return `${clock} · past the measured 17 min, rows can still confirm`;
  return `${clock} · ${ahead.map((t) => `${t.short} at ~${t.min} min`).join(", ")}`;
}

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
