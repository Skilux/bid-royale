/**
 * The recorded runs the replay serves. This file is the one place to add, swap or reorder a recording:
 *   1. record it: BOARD_URL=<deployment> npm run record:canned -- <runId> --out data/canned/<file>.json
 *   2. add an entry below (the `load` line is what bundles the file, and it loads only when picked)
 *   3. npm run check: lib/replay/catalog.test.js validates every entry against its file
 * The first entry is the default. `summary` is what the picker shows before the file loads, and the test
 * recomputes it from the file, so a stale number fails the check. `badgeNote` says what the money was.
 * The replay itself is always badged PRE-RECORDED. REAL rows keep their explorer link.
 */
export const RECORDINGS = [
  {
    id: "final",
    file: "c1f40522-final.json",
    title: "Final run, all rows REAL",
    runId: "run_c1f40522",
    recordedAt: "2026-10-08T23:45:43.178Z",
    summary: { net: -103.035714, signups: 14, realRows: 21, totalRows: 21 },
    badgeNote: "Cardano preprod, test ADA. All 21 escrow rows carry a tx link. The late CodePodcast forfeit is the last one.",
    load: () => import("./c1f40522-final.json", { with: { type: "json" } }),
  },
  {
    id: "before-62-fix",
    file: "c1f40522-before-62.json",
    title: "Same run, before the treasury fix",
    runId: "run_c1f40522",
    recordedAt: "2026-10-08T23:45:43.178Z",
    summary: { net: -105, signups: 14, realRows: 20, totalRows: 21 },
    badgeNote: "Cardano preprod, test ADA. Snapshot at the settlement timeout: one forfeit row is PENDING, never counted as moved.",
    load: () => import("./c1f40522-before-62.json", { with: { type: "json" } }),
  },
];

export const DEFAULT_RECORDING_ID = RECORDINGS[0].id;
