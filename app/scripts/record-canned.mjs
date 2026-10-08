#!/usr/bin/env node
// Records a finished run from a deployed (or local) Board as the canned replay.
// Run from app/:  BOARD_URL=https://<deployment> npm run record:canned -- <runId> [--out data/canned/run.json]
// Reads GET /api/run/:id and GET /api/events?run=:id&format=json. Nothing is written unless the recording validates.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_MS = 15_000;

const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const out = resolve(APP_DIR, outFlag >= 0 ? args[outFlag + 1] : "data/canned/run.json");
const runId = args.find((a, i) => !a.startsWith("--") && i !== outFlag + 1);
const base = (process.env.BOARD_URL ?? "http://localhost:3000").replace(/\/+$/, "");

if (!runId) {
  console.error("usage: BOARD_URL=<url> npm run record:canned -- <runId> [--out <path>]");
  process.exit(2);
}

async function getJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`${path} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const { run } = await getJson(`/api/run/${encodeURIComponent(runId)}`);
const { events } = await getJson(`/api/events?run=${encodeURIComponent(runId)}&format=json`);

if (run.mode === "canned") {
  console.error(`run ${runId} is itself a replay (mode canned). Record a live run.`);
  process.exit(1);
}

const doc = {
  _note: `Recorded from ${base} run ${runId} on ${new Date().toISOString()}. Replayed with DEMO_MODE=canned, badged PRE-RECORDED. REAL tx hashes and explorer links are kept.`,
  run,
  events: events.map(({ ts, name, data }) => ({ ts, name, data })),
};

const { validateRecording, prepareRecording } = await import("../lib/replay/recording.js");
validateRecording(doc);
const { info } = prepareRecording(doc, out);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`wrote ${out}`);
console.log(`events ${info.events}, REAL transfers ${info.realTransfers}, REAL downgraded to PRE-RECORDED ${info.downgradedToPreRecorded}`);
console.log("Review the file for secrets, then run: npm run check");
