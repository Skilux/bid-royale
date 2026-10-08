import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { EVENT_NAMES, EVENTS } from "../board/events.js";
import bundled from "../../data/canned/run.json" with { type: "json" };

export const BUNDLED_PATH = "data/canned/run.json";

const cache = new Map();

const isRealHash = (hash) => typeof hash === "string" && hash.length > 0 && !hash.startsWith("sim_");

/**
 * Replay labelling. The recording is a past run, so nothing in it is live money.
 * SIMULATED rows become PRE-RECORDED. REAL rows keep REAL only while they carry a real tx hash,
 * so the explorer link stays honest. PENDING never turns into money moved.
 */
function relabelBadge(badge, entry, stats) {
  if (badge === "SIMULATED") return "PRE-RECORDED";
  if (badge === "REAL" && entry && !isRealHash(entry.txHash)) {
    stats.downgraded += 1;
    return "PRE-RECORDED";
  }
  return badge;
}

function relabel(node, stats) {
  if (Array.isArray(node)) return node.map((item) => relabel(item, stats));
  if (!node || typeof node !== "object") return node;
  const out = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, relabel(v, stats)]));
  if (typeof out.badge === "string") out.badge = relabelBadge(out.badge, out, stats);
  if (Array.isArray(out.badges)) out.badges = [...new Set(out.badges.map((b) => relabelBadge(b, null, stats)))];
  return out;
}

const fail = (message) => {
  throw new Error(`replay recording invalid: ${message}`);
};

/** Checks the shape the Board and the SSE stream rely on. Throws with the first problem. */
export function validateRecording(doc) {
  if (!doc || typeof doc !== "object") fail("not an object");
  const { run, events } = doc;
  if (!run || typeof run !== "object") fail("missing run");
  if (typeof run.tender !== "object" || typeof run.steps !== "object") fail("run has no tender or steps");
  if (!Array.isArray(events) || events.length === 0) fail("missing events");
  events.forEach((e, i) => {
    if (!EVENT_NAMES.includes(e?.name)) fail(`event ${i} has unknown name ${JSON.stringify(e?.name)}`);
    if (typeof e.ts !== "string" || Number.isNaN(Date.parse(e.ts))) fail(`event ${i} (${e.name}) has no valid ts`);
    if (e.data === undefined) fail(`event ${i} (${e.name}) has no data`);
  });
  if (events[0].name !== EVENTS.runCreated) fail(`first event is ${events[0].name}, expected ${EVENTS.runCreated}`);
  if (events.at(-1).name !== EVENTS.runCompleted) fail(`last event is ${events.at(-1).name}, expected ${EVENTS.runCompleted}`);
  if (run.status !== "completed") fail(`run status is ${run.status}, expected completed`);
}

function collectProof(run) {
  const rows = [...(run.ledger ?? []), ...(run.settlement?.transfers ?? [])];
  const real = rows.filter((r) => r.badge === "REAL" && isRealHash(r.txHash));
  return [...new Set(real.map((r) => r.txHash))];
}

/** Turns a parsed recording into the transcript the replay serves. Pure. */
export function prepareRecording(doc, source) {
  validateRecording(doc);
  const stats = { downgraded: 0 };
  const run = relabel(structuredClone(doc.run), stats);
  const events = relabel(
    doc.events.map(({ ts, name, data }) => structuredClone({ ts, name, data })),
    stats,
  );

  run.mode = "canned";
  run.badge = "PRE-RECORDED";
  for (const e of events) {
    if (e.name === EVENTS.runCreated) {
      e.data.mode = "canned";
      e.data.badge = "PRE-RECORDED";
    }
  }

  const proof = collectProof(run);
  return {
    source,
    run,
    events,
    // Evidence bytes are hashed, so they are kept exactly as recorded and never relabelled.
    evidence: Array.isArray(doc.evidence) ? structuredClone(doc.evidence) : [],
    info: {
      source,
      recordedRunId: doc.run.id,
      recordedAt: events[0].ts,
      finishedAt: events.at(-1).ts,
      events: events.length,
      realTransfers: proof.length,
      downgradedToPreRecorded: stats.downgraded,
      evidenceItems: Array.isArray(doc.evidence) ? doc.evidence.length : 0,
    },
  };
}

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
