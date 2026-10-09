"use client";

import { useState } from "react";
import { SPEEDS } from "@/lib/dashboard/pace";
import { Badge } from "../_components/Badge";
import { Dashboard } from "../_components/Dashboard";
import { flowFontClass } from "../_components/flowFonts";
import { useRunPlayer } from "../_components/useRunPlayer";

const btn = "cursor-pointer rounded-full border border-line bg-card px-3.5 py-[6px] font-mono text-[11px] uppercase tracking-[0.08em] hover:border-ink disabled:cursor-default disabled:opacity-40";

export function DashboardClient({ initialMode, runId }) {
  const [mode, setMode] = useState(initialMode);
  const [attach, setAttach] = useState(runId);
  const [speed, setSpeed] = useState("normal");
  const [runKey, setRunKey] = useState(0);
  const p = useRunPlayer({ mode, runId: attach, speed: SPEEDS[speed], runKey });

  const run = (m) => {
    setAttach(null);
    setMode(m);
    setRunKey((k) => k + 1);
  };
  const source = !p.meta.kind
    ? "Loading…"
    : p.meta.kind === "canned"
      ? `Recorded run${p.degraded ? ` (live run failed: ${p.degraded})` : ""}.`
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
          <button type="button" className={btn} onClick={() => run("live")}>
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
    </main>
  );
}
