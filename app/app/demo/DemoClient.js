"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildChapters, beatsBefore, orderForDemo, PILLARS } from "@/lib/demo/chapters";
import { listRecordings } from "@/lib/replay/catalog";
import { buildReceiptView } from "@/lib/receipt-view";
import { BadgePolicyContext } from "../_components/Badge";
import { Dashboard } from "../_components/Dashboard";
import { flowFontClass } from "../_components/flowFonts";
import { RunBanner } from "../_components/RunBanner";
import { loadCanned } from "../_components/runSource";
import { useRunPlayer } from "../_components/useRunPlayer";
import { ReceiptHeadline } from "../receipt/ReceiptClient";

const RECORDINGS = listRecordings();
const POLICY = { hide: new Set(["REAL", "PRE-RECORDED", "SIMULATED"]) };
const CAMERA_MS = 1800;
const MAX_ZOOM = 1.45;

/** Camera target keys to the elements they frame. `supplier:<id>` frames one seller card. `all` frames the dashboard. */
const TARGETS = {
  consumer: "[data-testid=tender-card]",
  escrow: "[data-testid=escrow-panel], [data-escrow]",
  suppliers: "[data-supplier]",
  balance: "[data-testid=balance-widget]",
  receipt: "[data-testid=receipt-demo]",
};
const selectorOf = (key) => (key.startsWith("supplier:") ? `[data-supplier="${key.slice(9)}"]` : (TARGETS[key] ?? null));

const TONE = {
  cobalt: "bg-cobalt text-paper",
  ink: "bg-ink text-paper",
  pass: "bg-pass text-paper",
  short: "bg-short text-paper",
  muted: "bg-ink-3 text-paper",
};
const CARD_TONE = { short: "border-short", under: "border-under", default: "border-cobalt" };
const SPEEDS = [
  { id: "slow", label: "Slower", value: 0.7 },
  { id: "normal", label: "Normal", value: 1 },
  { id: "fast", label: "Faster", value: 1.5 },
];

const btn = "cursor-pointer rounded-full border border-line bg-card px-3.5 py-[6px] font-mono text-[11px] uppercase tracking-[0.08em] hover:border-ink disabled:cursor-default disabled:opacity-40";
const primary = "cursor-pointer rounded-[9px] bg-cobalt px-5 py-2.5 text-[14px] font-semibold text-paper hover:opacity-90";
const fmtDuration = (ms) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;

/** Moves and zooms `inner` inside `stage` so the elements for `keys` fill the stage. Other parts dim. */
function useCamera(stageRef, innerRef, keys, version) {
  const apply = useCallback(() => {
    const stage = stageRef.current;
    const inner = innerRef.current;
    if (!stage || !inner) return;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const ir = inner.getBoundingClientRect();
    const sc = ir.width / inner.offsetWidth || 1;
    const all = keys.includes("all");
    let box = null;
    for (const key of keys) {
      const selector = key === "all" ? null : selectorOf(key);
      if (!selector) continue;
      for (const el of inner.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect();
        const b = { l: (r.left - ir.left) / sc, t: (r.top - ir.top) / sc, r: (r.right - ir.left) / sc, b: (r.bottom - ir.top) / sc };
        box = box ? { l: Math.min(box.l, b.l), t: Math.min(box.t, b.t), r: Math.max(box.r, b.r), b: Math.max(box.b, b.b) } : b;
      }
    }
    if (all || !box) box = { l: 0, t: 0, r: inner.offsetWidth, b: inner.offsetHeight };
    const pad = 28;
    const w = box.r - box.l;
    const h = box.b - box.t;
    const scale = Math.min(MAX_ZOOM, (sw - pad * 2) / w, (sh - pad * 2) / h);
    inner.style.transform = `translate(${sw / 2 - (box.l + w / 2) * scale}px, ${sh / 2 - (box.t + h / 2) * scale}px) scale(${scale})`;

    const single = keys.filter((k) => k.startsWith("supplier:")).map((k) => k.slice(9));
    for (const [key, selector] of Object.entries(TARGETS)) {
      for (const el of inner.querySelectorAll(selector)) {
        const id = el.getAttribute("data-supplier");
        const focus = !all && (keys.includes(key) || (key === "suppliers" && id !== null && single.includes(id)));
        el.toggleAttribute("data-demo-focus", focus);
        el.toggleAttribute("data-demo-dim", !all && !focus);
      }
    }
  }, [stageRef, innerRef, keys]);

  useEffect(() => {
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [apply, version]);

  useEffect(() => {
    const ro = new ResizeObserver(() => apply());
    if (innerRef.current) ro.observe(innerRef.current);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [apply, innerRef, stageRef]);
}

export function DemoClient({ replayId }) {
  const [speed, setSpeed] = useState(1);
  const [ch, setCh] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [log, setLog] = useState([]);
  const [cam, setCam] = useState(["all"]);
  const [overlays, setOverlays] = useState([]);
  const p = useRunPlayer({ mode: "canned", replayId, speed: 1, autoplay: false, runKey: 0, enabled: true, transformEvents: orderForDemo });
  const { setCursor } = p;
  const chapters = useMemo(() => (p.events.length ? buildChapters(p.events) : []), [p.events]);

  const timers = useRef([]);
  const shown = useRef(new Set());
  const live = useRef({ chapters, speed, playing });
  live.current = { chapters, speed, playing };

  const stageRef = useRef(null);
  const innerRef = useRef(null);
  useCamera(stageRef, innerRef, cam, `${p.cursor}:${chapters.length}`);

  useEffect(() => {
    loadCanned(replayId).catch(() => {});
  }, [replayId]);

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const after = useCallback((ms, fn) => {
    timers.current.push(setTimeout(fn, ms / live.current.speed));
  }, []);

  const showBeat = useCallback((k, j) => {
    const beat = live.current.chapters[k]?.beats[j];
    const id = `${k}:${j}`;
    if (!beat || shown.current.has(id)) return;
    shown.current.add(id);
    setLog((l) => [...l, { ...beat, id, chapter: k }]);
  }, []);

  const enter = useCallback(
    (k) => {
      clear();
      const cs = live.current.chapters;
      const c = cs[k];
      if (!c) return;
      setStarted(true);
      setFinished(false);
      setCh(k);
      setCursor(c.from);
      const before = beatsBefore(cs, k);
      shown.current = new Set(before.map((b) => b.id));
      setLog(before);
      setOverlays([]);
      setCam(c.cams[0]?.keys ?? ["all"]);

      for (const m of c.cams.slice(1)) after(m.ms, () => setCam(m.keys));
      for (const [j, b] of c.beats.entries()) {
        if (b.ms !== undefined) after(b.ms, () => showBeat(k, j));
        else if (b.at <= c.from) after(500, () => showBeat(k, j));
      }
      for (const s of c.schedule) {
        after(s.ms, () => {
          setCursor(s.cursor);
          c.beats.forEach((b, j) => {
            if (b.at !== undefined && b.at <= s.cursor) showBeat(k, j);
          });
        });
      }
      for (const o of c.overlays) {
        after(o.ms, () => setOverlays((list) => [...list.filter((x) => x.id !== o.id && !(o.clear ?? []).includes(x.id)), o]));
        if (o.ttl) after(o.ms + o.ttl, () => setOverlays((list) => list.filter((x) => x.id !== o.id)));
      }
      after(c.durationMs, () => {
        if (!live.current.playing) return;
        if (k + 1 < cs.length) enter(k + 1);
        else {
          setPlaying(false);
          live.current.playing = false;
          setFinished(true);
        }
      });
    },
    [after, clear, setCursor, showBeat],
  );

  const toggle = () => {
    if (!chapters.length) return;
    if (finished) {
      setPlaying(true);
      live.current.playing = true;
      return enter(0);
    }
    if (playing) {
      clear();
      setPlaying(false);
      live.current.playing = false;
      return;
    }
    setPlaying(true);
    live.current.playing = true;
    enter(ch);
  };
  const go = (k) => {
    if (k >= 0 && k < chapters.length) enter(k);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "ArrowRight") go(ch + 1);
      else if (e.key === "ArrowLeft") go(ch - 1);
      else if (e.key === " ") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => clear, [clear]);

  const chapter = chapters[ch];
  const receiptView = useMemo(
    () => (p.view.receipt && p.snapshot?.receipt ? buildReceiptView({ ...p.snapshot, events: p.events }) : null),
    [p.view.receipt, p.snapshot, p.events],
  );
  const rationaleBy = useMemo(() => Object.fromEntries((p.snapshot?.bids ?? []).filter((b) => b.rationale).map((b) => [b.supplier, b.rationale])), [p.snapshot]);
  const picked = RECORDINGS.find((r) => r.id === replayId) ?? RECORDINGS[0];
  const runId = p.meta.runId ?? p.view.runId ?? null;
  const totalMs = chapters.reduce((t, c) => t + c.durationMs, 0);
  const litPillar = chapter ? Math.max(-1, ...chapters.slice(0, ch + 1).map((c) => c.pillar ?? -1)) : -1;

  return (
    <BadgePolicyContext.Provider value={POLICY}>
      <main className={`flow ${flowFontClass} min-h-screen`}>
        <div className="mx-auto max-w-[1500px] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h1 className="flex flex-wrap items-baseline gap-x-2 leading-none">
              <b className="font-display text-[24px] font-extrabold uppercase tracking-[0.04em]">Agentic Tender System</b>
              <em className="font-serif text-[24px] text-under">guided demo</em>
            </h1>
            <span className="text-[12px] text-ink-3">
              {picked.title}, {picked.runId}
              {totalMs ? ` · ${fmtDuration(totalMs / speed)}` : ""}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <select aria-label="Speed" className={btn} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                {SPEEDS.map((s) => (
                  <option key={s.id} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <a className={btn} href="/">
                Full run view
              </a>
            </div>
          </div>

          <section className="mb-3 rounded-[14px] border border-line bg-card/80 px-4 py-3" data-testid="caption">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cobalt">
                  <span>{chapter ? `Phase ${String(ch + 1).padStart(2, "0")} / ${String(chapters.length).padStart(2, "0")}` : "Loading"}</span>
                  <span className="ml-2 flex gap-1.5" data-testid="pillars">
                    {PILLARS.map((name, i) => (
                      <span key={name} className={`rounded-full border px-2 py-px tracking-[0.1em] transition-colors duration-700 ${i <= litPillar ? "border-cobalt text-cobalt" : "border-line text-ink-3"} ${i === chapter?.pillar ? "bg-cobalt text-paper" : ""}`}>
                        {name}
                      </span>
                    ))}
                  </span>
                </div>
                <h2 className="mt-0.5 font-display text-[26px] font-extrabold uppercase leading-tight tracking-[0.03em]" data-testid="caption-title">
                  {chapter?.title ?? "Loading the recording…"}
                </h2>
                <p className="mt-1 max-w-[980px] text-[13px] leading-[1.5] text-ink-2" data-testid="caption-desc">
                  {chapter?.narration ?? ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className={btn} onClick={() => go(ch - 1)} disabled={ch === 0} aria-label="Previous phase">
                  ←
                </button>
                <button type="button" className={primary} onClick={toggle} disabled={!chapters.length} data-testid="demo-play">
                  {finished ? "↻ Replay" : playing ? "Pause" : started ? "▶ Resume" : "▶ Start the demo"}
                </button>
                <button type="button" className={btn} onClick={() => go(ch + 1)} disabled={ch >= chapters.length - 1} aria-label="Next phase">
                  →
                </button>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[760px]:grid-cols-[minmax(0,1fr)_280px]">
            <div ref={stageRef} className="relative h-[calc(100vh-290px)] min-h-[380px] overflow-hidden rounded-[14px] border border-line bg-paper/60" data-testid="stage">
              <div ref={innerRef} className="absolute left-0 top-0 w-[1240px] origin-top-left will-change-transform" style={{ transition: `transform ${CAMERA_MS}ms cubic-bezier(0.65, 0, 0.35, 1)` }}>
                <Dashboard view={p.view} fresh={p.fresh} runId={runId} rationaleBy={rationaleBy} delivered={p.snapshot?.delivery ?? {}} />
                {receiptView ? (
                  <section className="mt-3" data-testid="receipt-demo">
                    <ReceiptHeadline view={receiptView} />
                  </section>
                ) : null}
              </div>
              <Overlays items={overlays} view={p.view} />
            </div>
            <ScriptPanel log={log} />
          </div>

          <Timeline chapters={chapters} ch={ch} onSelect={go} />
          <RunBanner kind="recording" recordedAt={picked.recordedAt} runId={null} />
          <p className="text-[11px] text-ink-3">Space plays and pauses. ← and → move between phases. Pause and Resume replay the current phase from its start.</p>
        </div>
      </main>
    </BadgePolicyContext.Provider>
  );
}

function Typed({ text }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((v) => (v >= text.length ? v : v + 1)), 55);
    return () => clearInterval(id);
  }, [text]);
  return (
    <span>
      {text.slice(0, n)}
      <i className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-cobalt" />
    </span>
  );
}

/** What the transcript puts on screen besides the dashboard: pillars, title, cards, labels, the refund tx and the tally. */
function Overlays({ items, view }) {
  const pillars = items.filter((i) => i.kind === "pillar").sort((a, b) => a.slot - b.slot);
  const hero = view.hero;
  const reals = view.rows.filter((r) => r.badge === "REAL").length;
  return (
    <div className="pointer-events-none absolute inset-0 z-30" data-testid="overlays">
      {pillars.length ? (
        <div className="absolute inset-0 grid place-items-center bg-paper/55">
          <div className="space-y-1 text-center">
            {pillars.map((i) => (
              <div key={i.id} className="demo-in font-display text-[clamp(34px,6vw,64px)] font-extrabold uppercase leading-none tracking-[0.04em]">
                {i.text}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {items
        .filter((i) => i.kind === "title")
        .map((i) => (
          <div key={i.id} className="absolute inset-0 grid place-items-center bg-paper/55">
            <div className="demo-in text-center font-display text-[clamp(34px,6vw,60px)] font-extrabold uppercase leading-none tracking-[0.04em] text-cobalt">{i.text}</div>
          </div>
        ))}
      {items
        .filter((i) => i.kind === "typed")
        .map((i) => (
          <div key={i.id} className="demo-in absolute left-3 right-3 top-3 rounded-lg border border-cobalt bg-card px-3 py-2 font-serif text-[20px] italic leading-tight">
            <Typed text={i.text} />
          </div>
        ))}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
        {items
          .filter((i) => i.kind === "label")
          .map((i) => (
            <span key={i.id} className={`demo-in rounded-full border border-ink-3 bg-card px-3 py-1 font-mono uppercase tracking-[0.1em] ${i.big ? "px-5 py-2 text-[20px] font-bold" : "text-[11px]"}`}>
              {i.text}
            </span>
          ))}
      </div>
      <div className="absolute bottom-3 left-3 flex max-w-[330px] flex-col gap-2">
        {items
          .filter((i) => i.kind === "card")
          .map((i) => (
            <div key={i.id} className={`demo-in rounded-lg border bg-card px-3 py-2 ${CARD_TONE[i.tone] ?? CARD_TONE.default}`}>
              <div className="font-display text-[15px] font-bold uppercase tracking-[0.05em]">{i.title}</div>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[11.5px] leading-[1.6] text-ink-2">{i.lines.join("\n")}</pre>
            </div>
          ))}
      </div>
      <div className="absolute bottom-3 right-3 flex max-w-[360px] flex-col items-end gap-2">
        {items.some((i) => i.kind === "tx") && hero?.explorerUrl ? (
          <a
            href={hero.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="demo-in pointer-events-auto rounded-lg border border-under bg-card px-3 py-2 no-underline hover:bg-under-bg"
            data-testid="demo-tx"
          >
            <div className="font-display text-[15px] font-bold uppercase tracking-[0.05em] text-under">The refund, on Cardano</div>
            <div className="mt-1 font-mono text-[12px] text-ink">
              {hero.txHash.slice(0, 10)}… on the explorer ↗
            </div>
          </a>
        ) : null}
        {items.some((i) => i.kind === "tally") && view.receipt ? (
          <div className="demo-in rounded-lg border border-cobalt bg-card px-3 py-2" data-testid="demo-tally">
            <div className="font-display text-[15px] font-bold uppercase tracking-[0.05em]">
              net {view.receipt.net < 0 ? "−" : ""}
              {Math.abs(view.receipt.net).toFixed(2)} {view.currency} · {Number(view.receipt.costPerSignup).toFixed(2)} per signup
            </div>
            <div className="mt-1 font-mono text-[11.5px] leading-[1.6] text-ink-2">
              {reals} of {view.rows.length} ledger rows REAL
              <br />
              Shop and signups simulated. All payments real.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The script: who says what, one message per beat, newest last. */
function ScriptPanel({ log }) {
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log.length]);
  return (
    <aside className="flex h-[calc(100vh-290px)] min-h-[380px] flex-col overflow-hidden rounded-[14px] border border-line bg-card/80" data-testid="script">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
        <span>Script · who does what</span>
        <span className="flex items-center gap-1.5 text-ink">
          <i className="size-1.5 animate-pulse rounded-full bg-under" /> live
        </span>
      </div>
      <ol className="flex-1 space-y-3 overflow-y-auto px-3 py-3 [scrollbar-width:none]">
        {log.length === 0 ? <li className="text-[12px] text-ink-3">Press Start. Each step of the run is explained here, by the agent that does it.</li> : null}
        {log.map((m, i) => (
          <li key={m.id} className={`grid grid-cols-[26px_minmax(0,1fr)] gap-2 ${i === log.length - 1 ? "demo-in" : "opacity-80"}`} data-beat={m.id}>
            <span className={`grid size-[26px] place-items-center rounded-full font-display text-[10px] font-bold ${TONE[m.tone] ?? TONE.muted}`}>{m.initials}</span>
            <div className="min-w-0">
              <div className="font-display text-[13px] font-bold uppercase tracking-[0.04em]">
                {m.actorName} <span className="font-mono text-[10px] font-normal normal-case tracking-normal text-ink-3">→ {m.to}</span>
              </div>
              <p className="mt-0.5 text-[12px] leading-[1.45] text-ink-2">{m.text}</p>
              {m.payload ? <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap border-l-2 border-cobalt bg-wash px-2 py-1 font-mono text-[10.5px] leading-[1.5] text-ink">{m.payload.join("\n")}</pre> : null}
              {m.tag ? <span className="mt-1.5 inline-block rounded-full border border-line px-2 py-px font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-2">{m.tag}</span> : null}
            </div>
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ol>
    </aside>
  );
}

function Timeline({ chapters, ch, onSelect }) {
  const total = chapters.reduce((t, c) => t + c.durationMs, 0) || 1;
  return (
    <ol className="mt-3 flex gap-1" aria-label="Phases" data-testid="timeline">
      {chapters.map((c, i) => (
        <li key={c.id} className="min-w-0" style={{ flex: c.durationMs / total }}>
          <button type="button" onClick={() => onSelect(i)} className={`block w-full cursor-pointer text-left font-mono text-[10px] uppercase tracking-[0.1em] ${i === ch ? "text-ink" : "text-ink-3"} hover:text-ink`}>
            <i className={`mb-1.5 block h-1 rounded-full ${i < ch ? "bg-cobalt" : i === ch ? "bg-cobalt/60" : "bg-wash"}`} />
            {i + 1} {c.label}
          </button>
        </li>
      ))}
    </ol>
  );
}
