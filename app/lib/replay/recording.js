import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { clearPreparedCache, isRecordingId, loadPrepared } from "./catalog.js";
import { prepareRecording } from "./prepare.js";

export { closeRecording, prepareRecording, validateRecording } from "./prepare.js";

const cache = new Map();

/**
 * The recording the server replay serves (DEMO_MODE=canned). `REPLAY_RECORDING` is a recording id from
 * `app/data/canned/index.js`, or a file path (absolute, or relative to the working directory, i.e. app/).
 * Without it the default recording of the registry plays. Parsed once per value.
 */
export async function loadRecording({ env = process.env, readText = (path) => readFileSync(path, "utf8") } = {}) {
  const chosen = env.REPLAY_RECORDING?.trim();
  if (!chosen || isRecordingId(chosen)) return loadPrepared(chosen);
  if (cache.has(chosen)) return cache.get(chosen);

  const prepared = prepareRecording(JSON.parse(readText(isAbsolute(chosen) ? chosen : resolve(process.cwd(), chosen))), chosen);
  cache.set(chosen, prepared);
  return prepared;
}

export function clearRecordingCache() {
  cache.clear();
  clearPreparedCache();
}
