// V1 floors, retained as named constants until the measured V2 findings land (#20).
export const PAY_RESULT_GAP_MS = 5 * 60 * 1000;
export const RESULT_MIN_MS = 15 * 60 * 1000;
export const UNLOCK_GAP_MS = 15 * 60 * 1000;
export const DISPUTE_GAP_MS = 15 * 60 * 1000;
export const MIN_MARGIN_MS = 2 * 60 * 1000;
export const DEFAULT_MARGIN_MS = MIN_MARGIN_MS;

export function paymentDeadlines({ now = Date.now(), marginMs = DEFAULT_MARGIN_MS } = {}) {
  if (!Number.isFinite(now) || !Number.isFinite(marginMs) || marginMs < MIN_MARGIN_MS) {
    throw new Error("Masumi deadline clock and safety margin must be finite and at least two minutes");
  }
  const submitResultTime = now + RESULT_MIN_MS + marginMs;
  const unlockTime = submitResultTime + UNLOCK_GAP_MS + marginMs;
  return Object.fromEntries(Object.entries({
    payByTime: submitResultTime - PAY_RESULT_GAP_MS - marginMs,
    submitResultTime,
    unlockTime,
    externalDisputeUnlockTime: unlockTime + DISPUTE_GAP_MS + marginMs,
  }).map(([key, time]) => [key, new Date(time).toISOString()]));
}
