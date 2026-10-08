/**
 * DEMO_MODE=canned hook point. [S12] plugs a replay in here.
 *
 * A replay is `async ({ runId }) => ({ run, events })`: a recorded transcript in the shape of
 * `app/data/seeds/board-run.worked-example.json` (`run` is the GET /api/run/:id body, `events`
 * are `{ts, name, data}` in order). The Board stores it under `runId` and the SSE stream replays it.
 * It is also the degrade path when a live step fails.
 *
 * Returns null until S12 lands. The Board then runs live against the simulated adapter.
 */
export function getCannedReplay() {
  return null;
}
