import { openRunSource } from "@/lib/run-source";
import { prepareRecording } from "@/lib/replay/prepare";

const BUNDLED = "data/canned/run.json";

/**
 * The recorded run that Run (canned) replays, and the fallback when a live run fails. It is the same file and
 * the same labelling as the server replay (lib/replay): `app/data/canned/run.json`, relabelled by
 * `prepareRecording` so non-REAL money is PRE-RECORDED. Swapping the recording (#45) means replacing that file
 * and nothing here. It is bundled, so Run works with the network off.
 */
export const loadCanned = () =>
  import("@/data/canned/run.json").then((m) => prepareRecording(m.default ?? m, BUNDLED));

/** The only way the UI reads a run. mode is "canned" | "live" | "attach", see lib/run-source. */
export function openJudgeRunSource(opts) {
  return openRunSource({ loadCanned, ...opts });
}
