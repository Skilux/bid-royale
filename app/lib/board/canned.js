import { createReplay } from "../replay/index.js";

/**
 * DEMO_MODE=canned hook point, filled by app/lib/replay.
 *
 * A replay is `async ({ runId }) => ({ run, events })`: a recorded transcript in the shape of
 * `app/data/seeds/board-run.worked-example.json` (`run` is the GET /api/run/:id body, `events`
 * are `{ts, name, data}` in order). The Board stores it under `runId` and the SSE stream replays it.
 * It is also the degrade path when a live step fails.
 *
 * Pacing needs the store wrapped with `withReplayPacing` (see service.js).
 */
export function getCannedReplay() {
  return createReplay();
}
