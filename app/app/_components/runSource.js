import { openRunSource } from "@/lib/run-source";

/**
 * The recorded run that Run (canned) replays, and the fallback when a live run fails. Today it is the worked
 * example fixture. The canned replay (#13) swaps this one function for its recording: it must resolve to
 * `{ run, events }` in the shape of app/data/seeds/board-run.worked-example.json.
 */
export const loadCanned = () => import("@/data/seeds/board-run.worked-example.json").then((m) => m.default ?? m);

/** The only way the UI reads a run. mode is "canned" | "live" | "attach", see lib/run-source. */
export function openJudgeRunSource(opts) {
  return openRunSource({ loadCanned, ...opts });
}
