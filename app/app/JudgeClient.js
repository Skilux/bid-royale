"use client";

import { useEffect, useMemo, useState } from "react";
import { SPEEDS } from "@/lib/dashboard/pace";
import { DEFAULT_RECORDING_ID, listRecordings } from "@/lib/replay/catalog";
import { buildReceiptView } from "@/lib/receipt-view";
import { liveKind, REAL_TIMINGS } from "@/lib/run-source/live-gate";
import { ReceiptDetails, ReceiptHeadline } from "./receipt/ReceiptClient";
import { BadgePolicyContext } from "./_components/Badge";
import { Chip } from "./_components/Chip";
import { ConfirmLiveDialog } from "./_components/ConfirmLiveDialog";
import { BotPanel, Dashboard, EventsPanel } from "./_components/Dashboard";
import { flowFontClass } from "./_components/flowFonts";
import { RecordingPicker, setReplayInUrl } from "./_components/RecordingPicker";
import { loadCanned } from "./_components/runSource";
import { useLiveGate } from "./_components/useLiveGate";
import { useRunPlayer } from "./_components/useRunPlayer";

const RECORDINGS = listRecordings();

const btn = "cursor-pointer rounded-full border border-line bg-card px-3.5 py-[6px] font-mono text-[11px] uppercase tracking-[0.08em] hover:border-ink disabled:cursor-default disabled:opacity-40";
const primary = "cursor-pointer rounded-full bg-cobalt px-5 py-[7px] font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-paper hover:opacity-90";

/**
 * Badge kinds the page leaves undrawn (#66 D1, D2). A recording says PRE-RECORDED once in the banner, and its REAL
 * rows are link pills. A real live run hides only REAL (pills again). A simulated run keeps every badge.
 */
const POLICY = {
  canned: { hide: new Set(["REAL", "PRE-RECORDED", "SIMULATED"]) },
  real: { hide: new Set(["REAL"]) },
  simulated: { hide: new Set() },
};

const recordedOn = (iso) => {
  const d = new Date(iso ?? "");
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

export function JudgeClient({ demoMode, attachId, replayId: linkedReplay = null, realPayments = false }) {
  const [replayId, setReplayId] = useState(linkedReplay ?? DEFAULT_RECORDING_ID);
  const [mode, setMode] = useState(attachId ? "attach" : "canned");
  const [attach, setAttach] = useState(attachId);
  const [attachInput, setAttachInput] = useState(attachId ?? "");
  // `/` opens on the recording, paused (#66 D3). An attached run follows its events as they arrive.
  const [autoplay, setAutoplay] = useState(Boolean(attachId));
  const [speed, setSpeed] = useState("normal");
  const [runKey, setRunKey] = useState(0);
  const p = useRunPlayer({ mode, runId: attach, replayId, speed: SPEEDS[speed], autoplay, runKey });
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
    watchRecording: () => start("canned", { replay: DEFAULT_RECORDING_ID }),
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

  const receiptView = useMemo(
    () => (p.view.receipt && p.snapshot?.receipt ? buildReceiptView({ ...p.snapshot, events: p.events }) : null),
    [p.view.receipt, p.snapshot, p.events],
  );

  const kind = p.meta.kind === "canned" ? "canned" : realPayments || p.view.payMode === "real" ? "real" : "simulated";
  const policy = POLICY[kind];
  const picked = RECORDINGS.find((r) => r.id === replayId) ?? RECORDINGS[0];
  const shown = p.degraded ? RECORDINGS[0] : picked;
  const stepNote = useSettlementTimer({ kind, view: p.view, events: p.events, cursor: p.cursor });

  const play = () => {
    if (p.finished) start(mode, { id: attach });
    else setPlaying(!p.playing);
  };

  return (
    <BadgePolicyContext.Provider value={policy}>
      <main className={`flow ${flowFontClass} min-h-screen`}>
        <div className="mx-auto max-w-[1280px] p-4">
          <Header />

          <div className="mb-3 mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={primary} onClick={play} disabled={!p.meta.kind} data-testid="play">
              {p.finished ? "↻ Replay" : p.playing ? "❚❚ Pause" : mode === "canned" ? "▶ Play recording" : "▶ Play"}
            </button>
            <button type="button" className={btn} onClick={() => (p.setPlaying(false), back())} disabled={p.cursor === 0} data-testid="back" aria-label="Back one event">
              ←
            </button>
            <button type="button" className={btn} onClick={() => (p.setPlaying(false), next())} disabled={p.cursor >= p.total} data-testid="next" aria-label="Next event">
              →
            </button>
            <button type="button" className={btn} onClick={() => start(mode, { id: attach, auto: false })}>
              Restart
            </button>
            <details className="relative" data-testid="more">
              <summary className={`${btn} list-none`} aria-label="More options">
                ⋯
              </summary>
              <div className="absolute left-0 z-40 mt-2 w-[360px] max-[640px]:fixed max-[640px]:inset-x-4 max-[640px]:top-32 max-[640px]:w-auto space-y-3 rounded-xl border border-line bg-card p-3 text-[12px] shadow-xl">
                <label className="flex items-center justify-between gap-2">
                  <span className="text-ink-2">Speed</span>
                  <select aria-label="Speed" className={btn} value={speed} onChange={(e) => setSpeed(e.target.value)}>
                    <option value="slow">Slow</option>
                    <option value="normal">Normal</option>
                    <option value="fast">Fast</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-ink-2">Recording</span>
                  <RecordingPicker variant="select" value={replayId} onChange={(id) => (mode === "canned" ? pickRecording(id) : start("canned", { replay: id, auto: false }))} />
                </label>
                <form
                  className="space-y-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (/^[A-Za-z0-9_-]{1,64}$/.test(attachInput.trim())) start("attach", { id: attachInput.trim() });
                  }}
                >
                  <div className="text-ink-2">Attach to a run</div>
                  <div className="flex gap-2">
                    <input
                      aria-label="Run id"
                      value={attachInput}
                      onChange={(e) => setAttachInput(e.target.value)}
                      placeholder="run id of a started run"
                      className="min-w-0 flex-1 rounded-[7px] border border-line bg-paper px-3 py-[6px] font-mono text-[12px]"
                    />
                    <button type="submit" className={btn}>
                      Attach
                    </button>
                  </div>
                </form>
              </div>
            </details>
            <button type="button" className={`${btn} ml-auto`} onClick={gate.request} data-testid="run-live">
              Run live
            </button>
          </div>

          <RunBanner kind={kind} recording={shown} runId={p.meta.runId} busy={p.busy} loading={!p.meta.kind} />

          <Dashboard
            view={p.view}
            fresh={p.fresh}
            snapshot={p.snapshot}
            stepNote={stepNote}
            onSelectStep={(key) => {
              p.setPlaying(false);
              goToStep(key);
            }}
          />

          {receiptView ? (
            <section className="mt-4" data-testid="receipt-section">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[20px]">Receipt</h2>
                <a className="text-[13px] text-cobalt underline" href={p.meta.kind === "canned" ? "/receipt" : `/receipt?run=${encodeURIComponent(p.meta.runId)}`}>
                  Open the full receipt story
                </a>
              </div>
              <ReceiptHeadline view={receiptView} />
              <details className="mt-3 rounded-xl border border-line bg-card/60 p-3" data-testid="under-the-hood">
                <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">Under the hood</summary>
                <div className="mt-3 grid grid-cols-1 gap-3 min-[1100px]:grid-cols-2">
                  <BotPanel view={p.view} />
                  <EventsPanel view={p.view} />
                </div>
                <div className="min-w-0 overflow-x-auto">
                  <ReceiptDetails view={receiptView} />
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

function Header() {
  return (
    <header>
      <h1 className="flex flex-wrap items-baseline gap-x-2 leading-none">
        <b className="font-display text-[26px] font-extrabold uppercase tracking-[0.04em]">Bid Royale</b>
        <em className="font-serif text-[26px] text-under">money flow</em>
        <span className="ml-1 text-[13px] font-normal text-ink-2">AI agents bid for ad budget and get paid only for verified signups</span>
      </h1>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px] [&>span]:text-[10.5px]">
        <Chip tone="cobalt">Discovery: Masumi registry</Chip>
        <Chip tone="cobalt">Wallet</Chip>
        <Chip tone="cobalt">Escrow: Masumi, Cardano preprod</Chip>
        <Chip tone="under">Dispute path: refund</Chip>
      </div>
    </header>
  );
}

/** One disclaimer per run (#66 D1): the recording and a real live run get a banner, a simulated run keeps its pills. */
function RunBanner({ kind, recording, runId, busy, loading }) {
  const [copied, setCopied] = useState(false);
  if (loading || kind === "simulated") return null;
  const box = "mb-2.5 rounded-lg border px-3 py-2 text-[12.5px]";
  if (kind === "canned") {
    return (
      <div className={`${box} border-line bg-card/80 text-ink-2`} data-testid="run-banner" data-kind="recording">
        Recording of a real run on Cardano preprod, {recordedOn(recording.recordedAt)} ({recording.runId}). Amounts with ↗ are REAL transactions you can check. Everything
        else replays that run.
      </div>
    );
  }
  const copy = () => {
    try {
      navigator.clipboard.writeText(`${location.origin}/?run=${encodeURIComponent(runId)}`).then(() => setCopied(true), () => {});
    } catch {
      // Clipboard is not available here: the link is in the address bar too.
    }
  };
  return (
    <div className={`${box} flex flex-wrap items-center gap-x-2 border-cobalt/60 bg-card/80`} data-testid="run-banner" data-kind="live">
      <span>
        {busy ? `A live run was already in flight, following ${runId}. ` : ""}Live run on Cardano preprod. Settlement waits for the Masumi escrow and takes about 15–20 minutes.
        You can close this page and come back:
      </span>
      {runId ? (
        <button type="button" className={btn} onClick={copy}>
          {copied ? "copied" : "copy link"}
        </button>
      ) : null}
    </div>
  );
}

const MINUTES = REAL_TIMINGS.map((t) => ({ ...t, min: Number(String(t.at).match(/\d+/)?.[0] ?? NaN) }));

/** `settling · 6:12 · refund REAL at ~6 min` while a real run's settlement runs (#66 D1). Null otherwise. */
function useSettlementTimer({ kind, view, events, cursor }) {
  const [now, setNow] = useState(() => Date.now());
  const running = kind === "real" && view.steps.find((s) => s.key === "settlement")?.status === "running";
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!running) return null;
  const started = events.slice(0, cursor).find((e) => e.name === "settlement.started");
  const t0 = Date.parse(started?.ts ?? "");
  if (Number.isNaN(t0)) return null;
  const secs = Math.max(0, Math.floor((now - t0) / 1000));
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const nextUp = MINUTES.find((t) => t.min * 60 > secs);
  return `settling · ${clock}${nextUp ? ` · next: ${nextUp.what} at ~${nextUp.min} min` : " · finishing the last rows"}`;
}

function Honesty() {
  return (
    <footer className="mt-6 text-[12px] text-ink-3" data-testid="honesty">
      Suppliers and the Board are our own demo agents; traffic and signups are SIMULATED; only amounts with ↗ moved on Cardano preprod, in tADA with no value.{" "}
      <a className="text-cobalt underline" href="https://github.com/Skilux/bid-royale/blob/main/docs/honest-limitations.md" target="_blank" rel="noopener noreferrer">
        Read the honest limitations
      </a>
    </footer>
  );
}
