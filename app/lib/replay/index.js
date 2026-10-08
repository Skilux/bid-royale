import { EVENTS } from "../board/events.js";
import { paceEvents, readSpeed } from "./pacing.js";
import { loadRecording } from "./recording.js";

export { withReplayPacing, projectRun } from "./paced-store.js";
export { FAST_BUDGET_MS, SPEEDS, paceEvents, readSpeed } from "./pacing.js";
export { BUNDLED_PATH, clearRecordingCache, loadRecording, prepareRecording, validateRecording } from "./recording.js";

/**
 * The Board's `canned` dependency: `async ({ runId }) => ({ run, events })`.
 * Events keep their recorded `ts`, and get a `dueAt` that the paced store (withReplayPacing) honours.
 * Reads no network. Recording and speed come from REPLAY_RECORDING and REPLAY_SPEED, see docs/demo-runbook.md.
 */
export function createReplay({ env = process.env, now = Date.now, load = loadRecording } = {}) {
  return async ({ runId }) => {
    const recording = load({ env });
    const speed = readSpeed(env);
    const startedAt = now();
    const offsets = paceEvents(recording.events, { speed });

    const events = structuredClone(recording.events).map((e, i) => {
      if (e.name === EVENTS.runCreated || e.name === EVENTS.runCompleted) e.data.runId = runId;
      return { ...e, dueAt: startedAt + offsets[i] };
    });
    const run = {
      ...structuredClone(recording.run),
      id: runId,
      replay: { ...recording.info, speed, startedAt: new Date(startedAt).toISOString(), durationMs: offsets.at(-1) },
    };
    return { run, events };
  };
}

/** What `/api/health` shows: which recording is bundled, or why it cannot load. */
export function describeReplay({ env = process.env, load = loadRecording } = {}) {
  try {
    return { ok: true, speed: readSpeed(env), ...load({ env }).info };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
