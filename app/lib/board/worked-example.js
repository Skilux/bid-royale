import { createBoard, createMemoryStore } from "./index.js";
import { installNextResolution } from "./test-alias.js";

/** Throwaway keys for the committed fixture and the tests. They sign nothing real. */
export const FIXTURE_SECRETS = { shop: "fixture-shop-secret", board: "fixture-board-secret" };
export const FIXTURE_RUN_ID = "run_worked-example";
export const FIXTURE_START = Date.parse("2026-10-08T22:00:00.000Z");

/** Board wired for a reproducible run: fixed clock, fixed ids, memory store, the simulated adapter. */
export async function createFixtureBoard(overrides = {}) {
  installNextResolution();
  const { getAdapter } = await import("../masumi/index.js");
  let tick = 0;
  const board = createBoard({
    store: createMemoryStore(),
    adapter: getAdapter(),
    flags: { simulatePayments: true, demoMode: "live" },
    secrets: () => FIXTURE_SECRETS,
    now: () => FIXTURE_START + 10 * tick++,
    newId: () => FIXTURE_RUN_ID,
    newJobId: () => "job_worked-example",
    ...overrides,
  });
  return board;
}

/** One full simulated run of the worked example. Returns the GET /api/run/:id body, the SSE events in order and the evidence bundle. */
export async function recordWorkedExample() {
  const board = await createFixtureBoard();
  const created = await board.createRun();
  const run = await board.runAll(created.id);
  return { run, events: await board.getEvents(run.id), evidence: await board.exportEvidence(run.id) };
}
