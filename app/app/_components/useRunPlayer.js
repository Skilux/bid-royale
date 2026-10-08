"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { gapsFor, isStepEvent } from "@/lib/dashboard/pace";
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
export function useRunPlayer({ mode = "canned", runId = null, speed = 1, autoplay = true, runKey = 0, enabled = true }) {
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
    if (!enabled) return undefined;
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
  }, [mode, runId, runKey, autoplay, enabled]);

  const gaps = useMemo(() => gapsFor(events), [events]);

  useEffect(() => {
    if (!playing || cursor >= events.length) return undefined;
    const delay = meta.kind === "live" ? LIVE_STEP_MS : Math.round(gaps[cursor] / speed);
    const timer = setTimeout(() => setCursor((c) => Math.min(c + 1, events.length)), delay);
    return () => clearTimeout(timer);
  }, [playing, cursor, events.length, gaps, meta.kind, speed]);

  const state = useMemo(() => reduceEvents(events.slice(0, cursor), { replay: meta.replay }), [events, cursor, meta.replay]);
  const signals = useMemo(() => (snapshot?.feed?.events ? summarizeSignals(snapshot.feed.events) : null), [snapshot]);
  const view = useMemo(() => buildDashboardView(state, { signals }), [state, signals]);

  const next = useCallback(
    () =>
      setCursor((c) => {
        let i = c;
        while (i < events.length && isStepEvent(events[i])) i += 1;
        return Math.min(i + 1, events.length);
      }),
    [events],
  );
  const back = useCallback(
    () =>
      setCursor((c) => {
        let i = Math.max(c - 1, 0);
        while (i > 0 && isStepEvent(events[i - 1])) i -= 1;
        return i;
      }),
    [events],
  );
  /** Show the run up to the start of a step. Null when that step has not started in the events held so far. */
  const goToStep = useCallback(
    (key) => {
      const i = events.findIndex((e) => e.name === "step.started" && e.data?.step === key);
      if (i < 0) return false;
      setCursor(i + 1);
      return true;
    },
    [events],
  );
  const finished = ended && cursor >= events.length && events.length > 0;

  return { view, meta, degraded, playing, setPlaying, cursor, setCursor, total: events.length, ended, finished, next, back, goToStep, events, snapshot };
}
