"use client";

import { useEffect, useState } from "react";
import { SPEEDS } from "@/lib/dashboard/pace";
import { DEFAULT_RECORDING_ID, listRecordings } from "@/lib/replay/catalog";
import { liveKind } from "@/lib/run-source/live-gate";
import { Badge } from "../_components/Badge";
import { ConfirmLiveDialog } from "../_components/ConfirmLiveDialog";
import { Dashboard } from "../_components/Dashboard";
import { flowFontClass } from "../_components/flowFonts";
import { RecordingPicker, setReplayInUrl } from "../_components/RecordingPicker";
import { useLiveGate } from "../_components/useLiveGate";
import { useRunPlayer } from "../_components/useRunPlayer";

const RECORDINGS = listRecordings();

const btn = "cursor-pointer rounded-full border border-line bg-card px-3.5 py-[6px] font-mono text-[11px] uppercase tracking-[0.08em] hover:border-ink disabled:cursor-default disabled:opacity-40";

export function DashboardClient({ initialMode, runId, replayId: linkedReplay = null, demoMode = "live", realPayments = false }) {
  const [mode, setMode] = useState(initialMode === "live" ? "canned" : initialMode);
  const [attach, setAttach] = useState(runId);
  const [replayId, setReplayId] = useState(linkedReplay ?? DEFAULT_RECORDING_ID);
  const [speed, setSpeed] = useState("normal");
  const [runKey, setRunKey] = useState(0);
  const p = useRunPlayer({ mode, runId: attach, replayId, speed: SPEEDS[speed], runKey });

  const run = (m, { id = null, replay = replayId } = {}) => {
    setAttach(id);
    setMode(m);
    setRunKey((k) => k + 1);
    if (m === "canned") {
      setReplayId(replay);
      setReplayInUrl(replay);
    }
  };
  const gate = useLiveGate({
    start: () => run("live"),
    watchRecording: () => run("canned", { replay: DEFAULT_RECORDING_ID }),
    attach: (id) => run("attach", { id }),
  });
  useEffect(() => {
    if (initialMode === "live") gate.request();
  }, [initialMode]);
  const picked = RECORDINGS.find((r) => r.id === replayId) ?? RECORDINGS[0];
  const source = !p.meta.kind
    ? "Loading…"
    : p.meta.kind === "canned"
      ? p.degraded
        ? `Live run failed (${p.degraded}). Showing the recording ${RECORDINGS[0].title}, ${RECORDINGS[0].runId}.`
        : `Recording: ${picked.title}, ${picked.runId}.`
      : p.busy
        ? `A live run was already in flight. Following ${p.meta.runId}.`
        : `Live run ${p.meta.runId}.`;

  return (
    <main className={`flow ${flowFontClass} min-h-screen`}>
      <div className="mx-auto max-w-[1280px] p-4">
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="flex items-baseline gap-2 leading-none">
          <b className="font-display text-[22px] font-extrabold uppercase tracking-[0.04em]">Bid Royale</b>
          <em className="font-serif text-[22px] text-under">money flow</em>
        </h1>
        <span data-testid="run-badge" className="text-[12px]">
          <Badge kind={p.view.runBadge} />
        </span>
        <span className="text-[12.5px] text-ink-2" data-testid="source">
          {source}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={() => run("canned")}>
            Run recorded
          </button>
          <RecordingPicker variant="select" value={replayId} onChange={(id) => run("canned", { replay: id })} />
          <button type="button" className={btn} onClick={gate.request} data-testid="run-live">
            Run live
          </button>
          <button type="button" className={btn} onClick={() => p.setPlaying(!p.playing)} disabled={p.finished}>
            {p.playing ? "Pause" : "Play"}
          </button>
          <button type="button" className={btn} onClick={p.back} disabled={p.cursor === 0}>
            Back
          </button>
          <button type="button" className={btn} onClick={p.next} disabled={p.cursor >= p.total}>
            Next
          </button>
          <select aria-label="Speed" className={btn} value={speed} onChange={(e) => setSpeed(e.target.value)}>
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
        </div>
      </header>
      <Dashboard view={p.view} fresh={p.fresh} onSelectStep={(key) => (p.setPlaying(false), p.goToStep(key))} />
      <footer className="mt-3 text-[12px] text-ink-3">
        Event {p.cursor} of {p.total}. {p.view.honesty}
      </footer>
      </div>
      <ConfirmLiveDialog gate={gate} kind={liveKind({ demoMode, realPayments })} />
    </main>
  );
}
