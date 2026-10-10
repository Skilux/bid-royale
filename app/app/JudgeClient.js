"use client";

import { useEffect, useMemo, useState } from "react";
import { SPEEDS } from "@/lib/dashboard/pace";
import { DEFAULT_RECORDING_ID, listRecordings } from "@/lib/replay/catalog";
import { buildReceiptView } from "@/lib/receipt-view";
import { liveKind, settlingLine } from "@/lib/run-source/live-gate";
import { ReceiptDetails, ReceiptHeadline } from "./receipt/ReceiptClient";
import { BadgePolicyContext } from "./_components/Badge";
import { Chip } from "./_components/Chip";
import { ConfirmLiveDialog } from "./_components/ConfirmLiveDialog";
import { BotPanel, Dashboard, EventsPanel } from "./_components/Dashboard";
import { flowFontClass } from "./_components/flowFonts";
import { RecordingPicker, setReplayInUrl } from "./_components/RecordingPicker";
import { RunBanner } from "./_components/RunBanner";
import { loadCanned } from "./_components/runSource";
import { useLiveGate } from "./_components/useLiveGate";
import { useRunPlayer } from "./_components/useRunPlayer";

const RECORDINGS = listRecordings();

const btn = "cursor-pointer rounded-full border border-line bg-card px-3.5 py-[6px] font-mono text-[11px] uppercase tracking-[0.08em] hover:border-ink disabled:cursor-default disabled:opacity-40";
const primary = "cursor-pointer rounded-[9px] bg-cobalt px-5 py-2.5 text-[14px] font-semibold text-paper hover:opacity-90 disabled:cursor-default disabled:opacity-40";

const HIDE = {
  recording: new Set(["REAL", "PRE-RECORDED", "SIMULATED"]),
  live: new Set(["REAL"]),
  simulated: new Set(),
};

export function JudgeClient({ demoMode, attachId, replayId: linkedReplay = null, realPayments = false, readOnly = false }) {
  const [replayId, setReplayId] = useState(linkedReplay ?? DEFAULT_RECORDING_ID);
  const [mode, setMode] = useState(attachId ? "attach" : "canned");
  const [attach, setAttach] = useState(attachId);
  const [attachInput, setAttachInput] = useState(attachId ?? "");
  const [autoplay, setAutoplay] = useState(false);
  const [speed, setSpeed] = useState("normal");
  const [runKey, setRunKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const p = useRunPlayer({ mode, runId: attach, replayId, speed: SPEEDS[speed], autoplay, runKey, enabled: true });
  const { next, back, goToStep, setPlaying } = p;

  const start = (m, { auto = true, id = null, replay = replayId } = {}) => {
    setMode(m);
    setAttach(id);
    setAutoplay(auto);
    setRunKey((k) => k + 1);
    if (m === "canned") {
      setReplayId(replay);
      setReplayInUrl(replay);
    }
  };
  const pickRecording = (id) => {
    setReplayId(id);
    if (mode === "canned") start("canned", { replay: id, auto: false });
  };
  const gate = useLiveGate({
    start: () => start("live"),
    watchRecording: () => start("canned", { replay: DEFAULT_RECORDING_ID, auto: false }),
    attach: (id) => start("attach", { id }),
  });

  useEffect(() => {
    loadCanned(replayId).catch(() => {});
  }, [replayId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "ArrowRight") {
        setPlaying(false);
        next();
      } else if (e.key === "ArrowLeft") {
        setPlaying(false);
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, setPlaying]);

  const picked = RECORDINGS.find((r) => r.id === replayId) ?? RECORDINGS[0];
  const liveRun = p.meta.kind === "live" || p.meta.kind === "attach" || mode === "live" || mode === "attach";
  const recording = !liveRun || p.meta.kind === "canned" || p.view.payMode === "canned";
  const realRun = !recording && (p.view.payMode === "real" || (realPayments && p.meta.kind === "live"));
  const bannerKind = recording ? "recording" : realRun ? "live" : "simulated";
  const policy = useMemo(() => ({ hide: HIDE[bannerKind] }), [bannerKind]);

  const settlementStart = useMemo(() => p.events.find((e) => e.name === "settlement.started")?.ts ?? null, [p.events]);
  const settling = realRun && p.view.steps.find((s) => s.key === "settlement")?.status === "running" && settlementStart;
  useEffect(() => {
    if (!settling) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [settling]);
  const settlementClock = settling ? settlingLine(now - Date.parse(settlementStart)) : null;

  const receiptView = useMemo(
    () => (p.view.receipt && p.snapshot?.receipt ? buildReceiptView({ ...p.snapshot, events: p.events }) : null),
    [p.view.receipt, p.snapshot, p.events],
  );
  const rationaleBy = useMemo(() => Object.fromEntries((p.snapshot?.bids ?? []).filter((b) => b.rationale).map((b) => [b.supplier, b.rationale])), [p.snapshot]);
  const runId = p.meta.runId ?? p.view.runId ?? null;

  const source = !p.meta.kind
    ? "Loading…"
    : p.meta.kind === "canned"
      ? p.degraded
        ? `The live run failed (${p.degraded}). Showing the recording ${RECORDINGS[0].title}, ${RECORDINGS[0].runId}.`
        : `${picked.title}, ${picked.runId}.`
      : p.busy
        ? `A live run was already in flight. Following ${p.meta.runId}.`
        : `Run ${p.meta.runId}.`;

  const playLabel = p.finished ? "↻ Replay" : p.playing ? "Pause" : liveRun ? "Play" : p.cursor > 0 ? "▶ Resume" : "▶ Play recording";
  const onPlay = () => {
    if (p.finished) return start(mode, { id: attach });
    p.setPlaying(!p.playing);
  };

  return (
    <BadgePolicyContext.Provider value={policy}>
      <main className={`flow ${flowFontClass} min-h-screen`}>
        <div className="mx-auto max-w-[1280px] p-4">
          <Header readOnly={readOnly} />
          <div className="mb-3 mt-3 flex flex-wrap items-center gap-2" data-testid="controls">
            <button type="button" className={primary} onClick={onPlay} disabled={!p.meta.kind || (liveRun && p.finished)} data-testid="play">
              {playLabel}
            </button>
            {readOnly ? null : (
              <button type="button" className={btn} onClick={gate.request} data-testid="run-live">
                Run live
              </button>
            )}
            <a className={btn} href="/demo" data-testid="guided-demo">
              Guided demo
            </a>
            <button type="button" className={btn} onClick={() => (p.setPlaying(false), back())} disabled={p.cursor === 0} data-testid="back" aria-label="Back one step">
              ←
            </button>
            <button type="button" className={btn} onClick={() => (p.setPlaying(false), next())} disabled={p.cursor >= p.total} data-testid="next" aria-label="Forward one step">
              →
            </button>
            <button type="button" className={btn} onClick={() => start(mode, { id: attach, auto: false })} data-testid="restart">
              Restart
            </button>
            <details className="relative" data-testid="more">
              <summary className={`${btn} list-none`} aria-label="More options">
                ⋯
              </summary>
              <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-[320px] space-y-3 rounded-xl border border-line bg-card p-3 shadow-xl">
                <label className="flex items-center justify-between gap-3 text-[12px] text-ink-2">
                  Speed
                  <select aria-label="Speed" className={btn} value={speed} onChange={(e) => setSpeed(e.target.value)}>
                    <option value="slow">Slow</option>
                    <option value="normal">Normal</option>
                    <option value="fast">Fast</option>
                  </select>
                </label>
                {mode === "canned" ? (
                  <div>
                    <div className="mb-1 text-[12px] text-ink-2">Recording</div>
                    <RecordingPicker variant="select" value={replayId} onChange={pickRecording} />
                  </div>
                ) : null}
                {readOnly ? null : (
                <form
                  className="space-y-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (/^[A-Za-z0-9_-]{1,64}$/.test(attachInput.trim())) start("attach", { id: attachInput.trim() });
                  }}
                >
                  <div className="text-[12px] text-ink-2">Attach to a run</div>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Run id"
                      value={attachInput}
                      onChange={(e) => setAttachInput(e.target.value)}
                      placeholder="run id of a started run"
                      className="min-w-0 flex-1 rounded-[7px] border border-line bg-paper px-2.5 py-[6px] font-mono text-[12px]"
                    />
                    <button type="submit" className={btn}>
                      Attach
                    </button>
                  </div>
                </form>
                )}
              </div>
            </details>
            <span className="ml-1 text-[12px] text-ink-3" data-testid="source">
              {source}
            </span>
          </div>

          <RunBanner kind={bannerKind} recordedAt={picked.recordedAt} runId={p.meta.runId} />
          <Dashboard
            view={p.view}
            fresh={p.fresh}
            runId={runId}
            rationaleBy={rationaleBy}
            delivered={p.snapshot?.delivery ?? {}}
            settlementClock={settlementClock}
            onSelectStep={(key) => {
              p.setPlaying(false);
              goToStep(key);
            }}
          />

          {receiptView ? (
            <section className="mt-3 space-y-3" data-testid="receipt-section">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[20px] font-extrabold uppercase tracking-[0.04em]">Receipt</h2>
                <a className="text-[13px] text-cobalt underline" href={p.meta.kind === "canned" ? "/receipt" : `/receipt?run=${encodeURIComponent(p.meta.runId)}`}>
                  Open the full receipt story
                </a>
              </div>
              <ReceiptHeadline view={receiptView} />
              <details className="rounded-xl border border-line bg-card/80 p-3" data-testid="under-the-hood">
                <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">Under the hood</summary>
                <div className="mt-3 space-y-3">
                  <ReceiptDetails view={receiptView} />
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[1100px]:grid-cols-2">
                    <BotPanel view={p.view} />
                    <EventsPanel view={p.view} />
                  </div>
                </div>
              </details>
            </section>
          ) : p.view.receipt ? (
            <p className="mt-4 text-[13px] text-ink-3">Loading the receipt…</p>
          ) : null}

          <Honesty />
        </div>
        <ConfirmLiveDialog gate={gate} kind={liveKind({ demoMode, realPayments })} />
      </main>
    </BadgePolicyContext.Provider>
  );
}

function Header({ readOnly = false }) {
  return (
    <header>
      <h1 className="flex flex-wrap items-baseline gap-x-2 leading-none">
        <b className="font-display text-[26px] font-extrabold uppercase tracking-[0.04em]">Bid Royale</b>
        <em className="font-serif text-[26px] text-under">money flow</em>
        {readOnly ? <Chip>Demo replay · read-only</Chip> : null}
        <span className="ml-2 text-[13px] font-normal text-ink-2">AI agents bid for ad budget and get paid only for verified signups</span>
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]" data-testid="track-chips">
        <Chip tone="cobalt">Discovery: Masumi registry</Chip>
        <Chip tone="cobalt">Wallet</Chip>
        <Chip tone="cobalt">Escrow: Masumi, Cardano preprod</Chip>
        <Chip tone="under">Dispute path: refund</Chip>
      </div>
    </header>
  );
}

function Honesty() {
  return (
    <footer className="mt-6 rounded-lg border border-dashed border-line px-3 py-2 text-[12.5px] text-ink-2" data-testid="honesty">
      <b>Honest limits.</b> Suppliers and the Board are our own demo agents on one Masumi node, and shop traffic is a simulated feed.{" "}
      <a className="text-cobalt underline" href="https://github.com/Skilux/bid-royale/blob/main/docs/honest-limitations.md" target="_blank" rel="noopener noreferrer">
        Read the honest limitations
      </a>
    </footer>
  );
}
