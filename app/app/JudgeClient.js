"use client";

import { useEffect, useMemo, useState } from "react";
import { SPEEDS } from "@/lib/dashboard/pace";
import { buildReceiptView, FALLBACK_BADGE } from "@/lib/receipt-view";
import { FinalReceipt } from "./receipt/ReceiptClient";
import { Badge } from "./_components/Badge";
import { Brief } from "./_components/Brief";
import { Chip } from "./_components/Chip";
import { Dashboard } from "./_components/Dashboard";
import { flowFontClass } from "./_components/flowFonts";
import { loadCanned } from "./_components/runSource";
import { useRunPlayer } from "./_components/useRunPlayer";

const btn = "cursor-pointer rounded-full border border-line bg-card px-3.5 py-[6px] font-mono text-[11px] uppercase tracking-[0.08em] hover:border-ink disabled:cursor-default disabled:opacity-40";
const primary = "cursor-pointer rounded-[9px] bg-cobalt px-6 py-3 text-[16px] font-semibold text-paper hover:opacity-90";

export function JudgeClient({ demoMode, attachId, realPayments = false }) {
  const [phase, setPhase] = useState(attachId ? "run" : "brief");
  const [mode, setMode] = useState(attachId ? "attach" : "canned");
  const [attach, setAttach] = useState(attachId);
  const [attachInput, setAttachInput] = useState(attachId ?? "");
  const [autoplay, setAutoplay] = useState(true);
  const [speed, setSpeed] = useState("normal");
  const [runKey, setRunKey] = useState(0);
  const p = useRunPlayer({ mode, runId: attach, speed: SPEEDS[speed], autoplay, runKey, enabled: phase === "run" });
  const { next, back, goToStep, setPlaying } = p;

  const start = (m, { auto = true, id = null } = {}) => {
    setMode(m);
    setAttach(id);
    setAutoplay(auto);
    setRunKey((k) => k + 1);
    setPhase("run");
  };

  useEffect(() => {
    loadCanned().catch(() => {});
  }, []);

  useEffect(() => {
    if (phase !== "run") return undefined;
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
  }, [phase, next, back, setPlaying]);

  const quoteBadge = mode === "live" ? FALLBACK_BADGE[realPayments ? "real" : "simulated"] : FALLBACK_BADGE.canned;
  const receiptView = useMemo(
    () => (p.view.receipt && p.snapshot?.receipt ? buildReceiptView({ ...p.snapshot, events: p.events }) : null),
    [p.view.receipt, p.snapshot, p.events],
  );

  if (phase === "brief") {
    return (
      <main className={`flow ${flowFontClass} min-h-screen`}>
        <div className="mx-auto max-w-[1100px] p-6">
        <Header />
        <div className="mt-5">
          <Brief quoteBadge={quoteBadge} />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className={primary} onClick={() => start("canned")} data-testid="run">
            Run
          </button>
          <button type="button" className={btn} onClick={() => start("live")} data-testid="run-live">
            Run live
          </button>
          <button type="button" className={btn} onClick={() => start("canned", { auto: false })} data-testid="walk">
            Walk through
          </button>
          <span className="text-[12.5px] text-ink-2">
            Run plays the recorded run in about 25 s, badged <Badge kind="PRE-RECORDED" />. Run live starts a fresh run on the Board
            {demoMode === "canned" ? " (this server has DEMO_MODE=canned, so it replays the recording)" : ""}.
          </span>
        </div>
        <details className="mt-4 text-[13px] text-ink-2">
          <summary className="cursor-pointer">Attach to a run</summary>
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (/^[A-Za-z0-9_-]{1,64}$/.test(attachInput.trim())) start("attach", { id: attachInput.trim() });
            }}
          >
            <input
              aria-label="Run id"
              value={attachInput}
              onChange={(e) => setAttachInput(e.target.value)}
              placeholder="run id of a started run"
              className="w-[280px] rounded-[7px] border border-line bg-card px-3 py-[7px] font-mono text-[12px]"
            />
            <button type="submit" className={btn}>
              Attach
            </button>
            <span className="text-[12px]">Follows that run from its first event, including its settlement.</span>
          </form>
        </details>
        <Honesty />
        </div>
      </main>
    );
  }

  const source = !p.meta.kind
    ? "Loading…"
    : p.meta.kind === "canned"
      ? `Recorded run${p.degraded ? `, the live run failed (${p.degraded})` : ""}.`
      : `Run ${p.meta.runId}.`;

  return (
    <main className={`flow ${flowFontClass} min-h-screen`}>
      <div className="mx-auto max-w-[1280px] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Header compact />
        <span data-testid="run-badge">
          <Badge kind={p.view.runBadge} />
        </span>
        <span className="text-[12.5px] text-ink-2" data-testid="source">
          {source}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={() => p.setPlaying(!p.playing)} disabled={p.finished} data-testid="autoplay">
            {p.playing ? "Pause" : "Autoplay"}
          </button>
          <button type="button" className={btn} onClick={() => (p.setPlaying(false), back())} disabled={p.cursor === 0} data-testid="back">
            ← Back
          </button>
          <button type="button" className={btn} onClick={() => (p.setPlaying(false), next())} disabled={p.cursor >= p.total} data-testid="next">
            Next →
          </button>
          <select aria-label="Speed" className={btn} value={speed} onChange={(e) => setSpeed(e.target.value)}>
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
          <button type="button" className={btn} onClick={() => start(mode, { id: attach })}>
            Restart
          </button>
          <button type="button" className={btn} onClick={() => setPhase("brief")}>
            Brief
          </button>
        </div>
      </div>

      <DiscoveryBar view={p.view} />
      <Dashboard
        view={p.view}
        fresh={p.fresh}
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
          <FinalReceipt view={receiptView} />
        </section>
      ) : p.view.receipt ? (
        <p className="mt-4 text-[13px] text-ink-3">Loading the receipt…</p>
      ) : null}

      <p className="mt-3 text-[12px] text-ink-3">
        Event {p.cursor} of {p.total}. Use ← and → to step.
      </p>
      <Honesty />
      </div>
    </main>
  );
}

function Header({ compact = false }) {
  return (
    <h1 className="flex flex-wrap items-baseline gap-x-2 leading-none">
      <b className={`font-display font-extrabold uppercase tracking-[0.04em] ${compact ? "text-[22px]" : "text-[34px]"}`}>Bid Royale</b>
      <em className={`font-serif text-under ${compact ? "text-[22px]" : "text-[34px]"}`}>money flow</em>
      {compact ? null : <span className="ml-2 text-[13px] font-normal text-ink-2">AI agents bid for ad budget and get paid only for verified signups</span>}
    </h1>
  );
}

function DiscoveryBar({ view }) {
  if (view.suppliers.length === 0) return null;
  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card/80 px-3 py-1.5 text-[11px]" data-testid="discovery">
      <Chip tone={view.discovery?.source === "seeded" ? "neutral" : "cobalt"}>{view.discovery?.chip ?? "Discovery: Masumi registry"}</Chip>
      <span className="text-ink-2">{view.suppliers.length} supplier agents</span>
      {view.suppliers.map((s) => (
        <span key={s.id} className="rounded-full border border-line px-2.5 py-px text-[12px]">
          <b>{s.name}</b>
        </span>
      ))}
    </div>
  );
}

function Honesty() {
  return (
    <footer className="mt-6 rounded-lg border border-dashed border-line px-3 py-2 text-[12.5px] text-ink-2" data-testid="honesty">
      <b>Honest limits.</b> Suppliers and the Board are our own demo agents on one Masumi node. The Board runs the auction and the check, so it is a trust
      assumption. Traffic and signups are <Badge kind="SIMULATED" />. In a simulated run, bid fees are <Badge kind="SIMULATED" /> too. A recorded run is <Badge kind="PRE-RECORDED" />. Only rows with a tx link are <Badge kind="REAL" />, on
      Cardano preprod with tADA that has no value.{" "}
      <a className="text-cobalt underline" href="https://github.com/Skilux/bid-royale/blob/main/docs/honest-limitations.md" target="_blank" rel="noopener noreferrer">
        Read the honest limitations
      </a>
    </footer>
  );
}
