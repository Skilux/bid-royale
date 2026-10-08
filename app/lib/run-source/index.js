import { EVENT_NAMES, EVENTS, TERMINAL_EVENTS } from "../board/events.js";

/**
 * The one data source of the Run flow. The judge page and /dashboard read events only through `openRunSource`,
 * so canned vs live is a switch of `mode`, and the canned transcript is one injected function (`loadCanned`).
 *
 *   mode "canned": the recorded run (`loadCanned`) as one batch. Playback pace belongs to the player.
 *   mode "live":   POST /api/run, follow GET /api/events (SSE), run the steps with POST /api/run/:id/all.
 *   mode "attach": follow an existing run by id (`runId`), from its first event.
 *
 * Every fetch has an AbortController timeout. A live or attach failure degrades to the canned run and says so
 * through `onDegrade`, it never throws. Callbacks:
 *   onSource({ kind, replay, runId })  a new stream starts: drop any events held from before
 *   onEvents(events)                   `{ seq, ts, name, data }` in order
 *   onSnapshot(run)                    GET /api/run/:id body, for context the SSE events do not carry (feed signals)
 *   onEnd()                            no more events
 *   onDegrade(reason)                  the live run failed, canned follows
 */

export const FETCH_TIMEOUT_MS = 8000;
export const STEPS_TIMEOUT_MS = 65000;
export const FIRST_EVENT_MS = 12000;

async function fetchJson(fetchImpl, url, { method = "GET", timeoutMs = FETCH_TIMEOUT_MS, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchImpl(url, { method, signal: ctrl.signal, cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? `http_${res.status}`);
    return body;
  } catch (err) {
    throw new Error(err?.name === "AbortError" ? "timeout" : (err?.message ?? "fetch_failed"));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function openRunSource({
  mode = "canned",
  runId = null,
  loadCanned,
  onSource = () => {},
  onEvents = () => {},
  onSnapshot = () => {},
  onEnd = () => {},
  onDegrade = () => {},
  fetchImpl = typeof fetch === "function" ? fetch : undefined,
  EventSourceImpl = typeof EventSource === "function" ? EventSource : undefined,
  firstEventMs = FIRST_EVENT_MS,
} = {}) {
  let closed = false;
  let es = null;
  let watchdog = null;
  const stop = new AbortController();
  const live = () => !closed;

  async function playCanned(reason = null) {
    let transcript;
    try {
      transcript = await loadCanned();
    } catch (err) {
      if (live()) onEnd(`canned_unavailable: ${err?.message}`);
      return;
    }
    if (!live()) return;
    const recorded = transcript?.events ?? [];
    onSource({ kind: "canned", replay: true, runId: transcript?.run?.id ?? null });
    if (transcript?.run) onSnapshot(transcript.run);
    const head = reason ? [{ seq: 0, ts: null, name: EVENTS.modeDegraded, data: { mode: "canned", step: null, error: reason } }] : [];
    onEvents([...head, ...recorded]);
    onEnd();
  }

  async function degrade(reason) {
    if (closed) return;
    teardown();
    onDegrade(reason);
    await playCanned(reason);
  }

  function teardown() {
    clearTimeout(watchdog);
    es?.close();
    es = null;
    stop.abort();
  }

  function follow(id, { runSteps }) {
    if (!EventSourceImpl) return degrade("no_event_source");
    let got = 0;
    let lastSeq = 0;
    let snapshotTaken = false;
    const takeSnapshot = () => {
      if (snapshotTaken) return;
      snapshotTaken = true;
      fetchJson(fetchImpl, `/api/run/${encodeURIComponent(id)}`, { signal: stop.signal })
        .then((body) => live() && body?.run && onSnapshot(body.run))
        .catch(() => {});
    };
    const finish = () => {
      if (closed) return;
      snapshotTaken = false;
      takeSnapshot();
      clearTimeout(watchdog);
      es?.close();
      es = null;
      onEnd();
    };

    es = new EventSourceImpl(`/api/events?run=${encodeURIComponent(id)}`);
    watchdog = setTimeout(() => {
      if (got === 0) degrade("no_events");
    }, firstEventMs);
    watchdog?.unref?.();

    const handle = (msg) => {
      if (closed) return;
      let frame;
      try {
        frame = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (frame.seq <= lastSeq) return;
      lastSeq = frame.seq;
      got += 1;
      onEvents([{ seq: frame.seq, ts: frame.ts, name: frame.name, data: frame.data }]);
      if (frame.name === EVENTS.feedGenerated) takeSnapshot();
      if (TERMINAL_EVENTS.includes(frame.name)) finish();
    };
    for (const name of EVENT_NAMES) es.addEventListener(name, handle);
    es.onerror = () => {
      if (closed || es?.readyState !== 2) return;
      if (got === 0) degrade("stream_closed");
      else finish();
    };

    if (runSteps) {
      fetchJson(fetchImpl, `/api/run/${encodeURIComponent(id)}/all`, { method: "POST", timeoutMs: STEPS_TIMEOUT_MS, signal: stop.signal }).catch((err) => {
        if (got === 0) degrade(`steps_failed: ${err.message}`);
      });
    }
    return undefined;
  }

  async function startLive() {
    try {
      const body = await fetchJson(fetchImpl, "/api/run", { method: "POST", signal: stop.signal });
      const id = body?.run?.id;
      if (!id) throw new Error("bad_response");
      if (!live()) return;
      onSource({ kind: "live", replay: false, runId: id });
      follow(id, { runSteps: true });
    } catch (err) {
      await degrade(`start_failed: ${err.message}`);
    }
  }

  async function startAttach() {
    try {
      const body = await fetchJson(fetchImpl, `/api/run/${encodeURIComponent(runId)}`, { signal: stop.signal });
      if (!body?.run) throw new Error("bad_response");
      if (!live()) return;
      onSource({ kind: "live", replay: false, runId });
      onSnapshot(body.run);
      follow(runId, { runSteps: false });
    } catch (err) {
      await degrade(`attach_failed: ${err.message}`);
    }
  }

  if (mode === "live") startLive();
  else if (mode === "attach" && runId) startAttach();
  else playCanned();

  return {
    close() {
      closed = true;
      teardown();
    },
  };
}
