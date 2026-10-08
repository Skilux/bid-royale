import { canonicalHash } from "../signing/canonical.js";
import { sha256Hex } from "../signing/index.js";

export { DeliveryReport, MAX_SESSION_IDS, parseReport } from "./schema.js";

/** How the result hash is built. Stored in the result item so a reader can redo it. */
export const RESULT_HASH_RECIPE =
  "sha256(UTF-8(canonical delivery report + verdict hash)), plain string concatenation, no separator, lowercase hex";

/** Canonical bytes and hash of a report. `hash` is the hash of evidence item `delivery.<supplier>`. */
export const sealReport = (report) => canonicalHash(report);

/**
 * The hash anchored on Masumi as the award's result: sha256 of the canonical report bytes followed by the
 * Board verdict hash. Binds the supplier's claim to the validator's verdict.
 */
export function resultHash(reportText, verdictHash) {
  if (typeof reportText !== "string" || !/^[0-9a-f]{64}$/.test(verdictHash ?? "")) {
    throw new TypeError("resultHash needs the canonical report text and a 64-char lowercase hex verdict hash");
  }
  return sha256Hex(Buffer.from(reportText + verdictHash, "utf8"));
}

/**
 * The report the Board records for a supplier that posted none: its claim in the simulated feed.
 * Impressions are the ones served in the feed, sessions are the ones the feed attributed to the supplier.
 * It is labelled `scripted_demo` wherever it is shown, and the verdict never reads it.
 */
export function scriptedReport(run, supplier) {
  const sessions = run.feed.events.filter((e) => e.supplier === supplier).map((e) => e.sessionId);
  return {
    supplier,
    runId: run.id,
    window: { from: run.feed.window.start, to: run.feed.window.end },
    impressionsServed: run.feed.impressions[supplier] ?? 0,
    sessionIds: [...new Set(sessions)].sort(),
    servedAt: run.feed.window.end,
  };
}
