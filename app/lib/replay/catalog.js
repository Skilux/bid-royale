import { DEFAULT_RECORDING_ID, RECORDINGS } from "../../data/canned/index.js";
import { prepareRecording } from "./prepare.js";

export { DEFAULT_RECORDING_ID };

/** Safe for the browser: no node:fs. The picker, the judge page and the server replay all read recordings here. */
const pathOf = (rec) => `data/canned/${rec.file}`;
const byId = (id) => RECORDINGS.find((r) => r.id === id) ?? null;

/** The picker's list: everything except the loader, in registry order. */
export const listRecordings = () => RECORDINGS.map(({ load, ...meta }) => meta);

export const isRecordingId = (id) => typeof id === "string" && byId(id) !== null;

/** The recording id to play for a query value or env value: a known id, else the default. */
export const pickRecordingId = (id) => (isRecordingId(id) ? id : DEFAULT_RECORDING_ID);

/** "net -103.04 tADA, 14 signups, 21 of 21 rows REAL". A recording with no REAL rows says so. */
export function summaryLine({ summary: s }) {
  const net = `${s.net < 0 ? "−" : ""}${Math.abs(s.net).toFixed(2)}`;
  const rows = s.realRows === 0 ? `0 of ${s.totalRows} rows REAL` : `${s.realRows} of ${s.totalRows} rows REAL`;
  return `net ${net} tADA, ${s.signups} signups, ${rows}`;
}

const cache = new Map();

/** Loads and relabels one recording (PRE-RECORDED, REAL links kept). An unknown id plays the default. Parsed once. */
export function loadPrepared(id) {
  const rec = byId(id) ?? byId(DEFAULT_RECORDING_ID);
  if (!cache.has(rec.id)) {
    const loading = rec
      .load()
      .then((m) => prepareRecording(m.default ?? m, pathOf(rec)))
      .catch((err) => {
        cache.delete(rec.id);
        throw err;
      });
    cache.set(rec.id, loading);
  }
  return cache.get(rec.id);
}

export const clearPreparedCache = () => cache.clear();
