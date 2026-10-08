import { TERMINAL_EVENTS } from "./events.js";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/** One SSE frame. `id` is the event seq, so a reconnect sends Last-Event-ID and resumes. */
export function formatSse({ seq, name, ts, data }, runId) {
  return `id: ${seq}\nevent: ${name}\ndata: ${JSON.stringify({ seq, runId, name, ts, data })}\n\n`;
}

const defaultSleep = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

/**
 * Yields SSE text frames for one run: the backlog after `after`, then new events as they land.
 * Ends after a terminal event, when the signal aborts, or after `maxMs` (stay under the 60 s
 * function limit; the browser reconnects with Last-Event-ID).
 */
export async function* streamEvents({
  store,
  runId,
  after = 0,
  signal,
  pollMs = 250,
  heartbeatMs = 15000,
  maxMs = 50000,
  sleep = defaultSleep,
  now = Date.now,
}) {
  const started = now();
  let cursor = after;
  let lastWrite = started;
  yield "retry: 1000\n\n";

  while (!signal?.aborted && now() - started < maxMs) {
    const batch = await store.getEvents(runId, cursor);
    for (const event of batch) {
      yield formatSse(event, runId);
      cursor = event.seq;
      lastWrite = now();
      if (TERMINAL_EVENTS.includes(event.name)) return;
    }
    if (!batch.length && now() - lastWrite >= heartbeatMs) {
      yield ": ping\n\n";
      lastWrite = now();
    }
    await sleep(pollMs, signal);
  }
}

/** True when the run is closed and the client has seen every event, so the stream should answer 204. */
export async function isStreamDone({ store, runId, after }) {
  const run = await store.getRun(runId);
  if (!run || !["completed", "failed"].includes(run.status)) return false;
  return (await store.getEvents(runId, after)).length === 0;
}
