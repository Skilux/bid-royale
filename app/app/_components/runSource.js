import { openRunSource } from "@/lib/run-source";
import { DEFAULT_RECORDING_ID, loadPrepared } from "@/lib/replay/catalog";

/**
 * The recorded run that Run (canned) replays, and the fallback when a live run fails. It comes from the registry
 * `app/data/canned/index.js`, the same files and the same labelling as the server replay (lib/replay):
 * `prepareRecording` makes non-REAL money PRE-RECORDED and keeps REAL tx links. Adding or swapping a recording (#45)
 * means editing that registry and nothing here. Each file is bundled and loads when picked, so Run works with the
 * network off. An unknown id plays the default.
 */
export const loadCanned = (id = DEFAULT_RECORDING_ID) => loadPrepared(id);

/**
 * The only way the UI reads a run. mode is "canned" | "live" | "attach", see lib/run-source.
 * `replayId` picks the recording of a canned run. A live or attach run that fails falls back to the default one.
 */
export function openJudgeRunSource({ replayId, ...opts }) {
  const id = opts.mode === "canned" || opts.mode === undefined ? replayId : DEFAULT_RECORDING_ID;
  return openRunSource({ loadCanned: () => loadCanned(id), ...opts });
}
