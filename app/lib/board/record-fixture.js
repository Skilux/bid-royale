// Regenerates app/data/seeds/board-run.worked-example.json. Run from app/: node lib/board/record-fixture.js
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { recordWorkedExample } from "./worked-example.js";

export const FIXTURE_PATH = fileURLToPath(new URL("../../data/seeds/board-run.worked-example.json", import.meta.url));

export const fixtureDocument = ({ run, events, evidence }) => ({
  _note:
    "One full simulated run of the worked example. `run` is the GET /api/run/:id body, `events` the SSE frames in order, " +
    "`evidence` the evidence bundle (items with their exact bytes, replayed PRE-RECORDED). " +
    "Every money element is SIMULATED. Signed with throwaway fixture keys. Regenerate: node lib/board/record-fixture.js",
  run,
  events,
  evidence,
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixtureDocument(await recordWorkedExample()), null, 2)}\n`);
  console.log(`wrote ${FIXTURE_PATH}`);
}
