"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { nextDelayMs } from "@/lib/dashboard/pace";
import { reduceEvents } from "@/lib/dashboard/reduce";
import { buildDashboardView, summarizeSignals } from "@/lib/dashboard/view";
import { openJudgeRunSource } from "./runSource";

const LIVE_STEP_MS = 30;

/**
 * Plays one run into a dashboard view. `events` is everything the source delivered, `cursor` how many are shown,
 * and the view is `buildDashboardView(reduceEvents(events[0..cursor]))`. Autoplay walks the cursor with the
 * recorded pace (`lib/dashboard/pace`), a live run shows events as they arrive, Back and Next move it by hand.
 * `runKey` restarts the source with the same mode.
 */
export function useRunPlayer({ mode = "canned", runId = null, speed = 1, autoplay = true, runKey = 0 }) {
  const [meta, setMeta] = useState({ kind: null, replay: false, runId: null });
  const [events, setEvents] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [ended, setEnded] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [degraded, setDegraded] = useState(null);
  const [playing, setPlaying] = useState(autoplay);

  useEffect(() => {
    setMeta({ kind: null, replay: false, runId: null });
    setEvents([]);
    setCursor(0);
    setEnded(false);
    setSnapshot(null);
    setDegraded(null);
    setPlaying(autoplay);
    const src = openJudgeRunSource({
      mode,
      runId,
      onSource: (s) => {
        setMeta(s);
        setEvents([]);
        setCursor(0);
        setEnded(false);
        setSnapshot(null);
      },
      onEvents: (batch) => setEvents((prev) => [...prev, ...batch]),
      onSnapshot: setSnapshot,
      onEnd: () => setEnded(true),
      onDegrade: (reason) => setDegraded(reason),
    });
    return () => src.close();
  }, [mode, runId, runKey, autoplay]);

  useEffect(() => {
    if (!playing || cursor >= events.length) return undefined;
    const delay = meta.kind === "live" ? LIVE_STEP_MS : nextDelayMs(events[cursor], speed);
    const timer = setTimeout(() => setCursor((c) => Math.min(c + 1, events.length)), delay);
    return () => clearTimeout(timer);
  }, [playing, cursor, events, meta.kind, speed]);

  const state = useMemo(() => reduceEvents(events.slice(0, cursor), { replay: meta.replay }), [events, cursor, meta.replay]);
  const signals = useMemo(() => (snapshot?.feed?.events ? summarizeSignals(snapshot.feed.events) : null), [snapshot]);
  const view = useMemo(() => buildDashboardView(state, { signals }), [state, signals]);

  const next = useCallback(() => setCursor((c) => Math.min(c + 1, events.length)), [events.length]);
  const back = useCallback(() => setCursor((c) => Math.max(c - 1, 0)), []);
  const finished = ended && cursor >= events.length && events.length > 0;

  return { view, meta, degraded, playing, setPlaying, cursor, setCursor, total: events.length, ended, finished, next, back, snapshot };
}
