import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import bundled from "../../data/canned/run.json" with { type: "json" };
import { prepareRecording } from "./prepare.js";

export { prepareRecording, validateRecording } from "./prepare.js";

export const BUNDLED_PATH = "data/canned/run.json";

const cache = new Map();

/**
 * The recording the replay serves. `REPLAY_RECORDING` (path, absolute or relative to the working directory, i.e. app/)
 * points at another recording file. Without it the bundled `app/data/canned/run.json` is used. Parsed once per path.
 */
export function loadRecording({ env = process.env, readText = (path) => readFileSync(path, "utf8") } = {}) {
  const custom = env.REPLAY_RECORDING?.trim();
  const key = custom || BUNDLED_PATH;
  if (cache.has(key)) return cache.get(key);

  const doc = custom ? JSON.parse(readText(isAbsolute(custom) ? custom : resolve(process.cwd(), custom))) : bundled;
  const prepared = prepareRecording(doc, key);
  cache.set(key, prepared);
  return prepared;
}

export function clearRecordingCache() {
  cache.clear();
}
