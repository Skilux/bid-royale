"use client";

import { animate, motion as Motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildReceiptView, buildTimeline } from "@/lib/receipt-view";
import { Badge, Badges } from "../_components/Badge";
import { Chip } from "../_components/Chip";
import { formatClock, formatAmount, formatFixed } from "../_components/format";
import { Money } from "../_components/Money";
import { EvidencePanel, EvidenceProvider } from "./EvidencePanel";

const FETCH_TIMEOUT_MS = 8000;
const POLL_MS = 2000;
const POLL_MAX = 150;

async function fetchRun(runId) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`/api/run/${encodeURIComponent(runId)}`, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `http_${res.status}`);
    }
    const body = await res.json();
    if (!body?.run) throw new Error("bad_response");
    return body.run;
  } finally {
    clearTimeout(timer);
  }
}

export function ReceiptClient({ runId, fixtureView, fixtureEvidence }) {
  const [view, setView] = useState(runId ? null : fixtureView);
  const [notice, setNotice] = useState(null);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    if (!runId) return undefined;
    let stop = false;
    let timer;
    let tries = 0;
    const load = async () => {
      try {
        const run = await fetchRun(runId);
        if (stop) return;
        const next = buildReceiptView(run);
        setView(next);
        setNotice(null);
        const waiting = run.status === "in_progress" && !next.settlementDone;
        if (waiting && ++tries < POLL_MAX) timer = setTimeout(load, POLL_MS);
      } catch (err) {
        if (stop) return;
        setNotice(`Could not load run ${runId} (${err?.name === "AbortError" ? "timeout" : err.message}). Showing the recorded worked example.`);
        setView(fixtureView);
      }
    };
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [runId, fixtureView]);

  const isFixture = view === fixtureView;
  const source = !view
    ? "Loading run…"
    : notice
      ? notice
      : isFixture
        ? "Recorded worked example, no run selected. Open /receipt?run=<id> to show a live run."
        : view.mode === "canned"
          ? `Replay of a recorded run (${view.runId}).`
          : `Run ${view.runId}.`;

  return (
    <main className="min-h-screen p-4">
      <div className="mx-auto max-w-[760px] overflow-hidden rounded-xl border border-line bg-card p-3.5 text-[15px] sm:p-[22px] leading-normal">
        <div className="mb-4 flex items-center justify-between gap-2.5">
          <div>
            <h1 className="font-display text-base">Settlement, told by NeoRack&apos;s buying agent</h1>
            <p className="text-[12.5px] opacity-75" data-testid="source">{source}</p>
          </div>
          {view?.settlementDone ? (
            <button
              type="button"
              onClick={() => setReplay((n) => n + 1)}
              className="cursor-pointer rounded-[7px] bg-cobalt px-3 py-[7px] text-white"
            >
              Replay
            </button>
          ) : null}
        </div>
        <EvidenceProvider runId={isFixture ? null : runId} fixtureEvidence={fixtureEvidence} version={view}>
          {view ? <Story view={view} replay={replay} /> : null}
          {view?.settlementDone ? <EvidencePanel /> : null}
        </EvidenceProvider>
      </div>
    </main>
  );
}

function Story({ view, replay }) {
  const reduced = useReducedMotion();
  const timeline = useMemo(() => buildTimeline(view), [view]);
  const [shown, setShown] = useState(() => new Set());
  const lastRef = useRef(null);

  useEffect(() => {
    if (!view.settlementDone) {
      setShown(new Set(view.lock.count > 0 ? ["lock"] : []));
      return undefined;
    }
    if (reduced) {
      setShown(new Set(timeline.map((b) => b.id)));
      return undefined;
    }
    setShown(new Set());
    const timers = timeline.map((b) => setTimeout(() => setShown((s) => new Set(s).add(b.id)), b.at));
    return () => timers.forEach(clearTimeout);
  }, [view, timeline, replay, reduced]);

  useEffect(() => {
    if (!reduced && replay >= 0 && shown.size > 1) lastRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [shown, reduced, replay]);

  const has = (id) => shown.has(id);
  const steps = [];
  if (has("lock")) steps.push({ id: "lock", time: view.lock.at, node: <LockBubble view={view} /> });
  if (view.settlementDone) {
    if (has("cut")) steps.push({ id: "cut", dot: "cut", node: <CutLabel cut={view.cut} /> });
    for (const s of view.settled) {
      if (!has(`v:${s.supplier}`)) continue;
      if (s.kind === "under_gate") {
        steps.push({
          id: s.supplier,
          time: s.at,
          dot: "no",
          timeClass: "font-bold text-under",
          node: <UnderGate s={s} shown={shown} reduced={reduced} currency={view.currency} />,
        });
      } else {
        steps.push({ id: s.supplier, time: s.at, dot: s.kind === "pass" ? "ok" : "mid", node: <VerdictBubble s={s} /> });
      }
    }
    if (has("final")) steps.push({ id: "final", time: view.final.at, node: <FinalReceipt view={view} />, tall: true });
  } else if (view.lock.count > 0) {
    steps.push({ id: "wait", dot: "cut", node: <Waiting view={view} /> });
  }

  if (steps.length === 0) {
    return <p className="text-[13px] opacity-75">{view.runId ? "Waiting for the run to lock funds…" : "No run data."}</p>;
  }

  return (
    <div>
      {steps.map((st, i) => (
        <Motion.div
          key={st.id}
          ref={i === steps.length - 1 ? lastRef : null}
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-[48px_18px_minmax(0,1fr)] gap-x-1.5 sm:grid-cols-[72px_22px_minmax(0,1fr)]"
        >
          <div className={`pt-[11px] text-right font-mono text-[10px] tabular-nums sm:text-xs opacity-75 ${st.timeClass ?? ""}`}>
            {st.time ? formatClock(st.time) : ""}
          </div>
          <div className="relative">
            <span
              className={`absolute left-[10px] w-0.5 bg-line ${i === 0 ? "top-[18px]" : "top-0"} ${i === steps.length - 1 ? "bottom-[calc(100%-18px)]" : "bottom-0"}`}
            />
            <span className={`absolute left-[4px] top-[13px] box-content size-3.5 -m-[3px] rounded-full border-[3px] border-card ${DOT[st.dot ?? "ok"]}`} />
          </div>
          <div className="pb-[18px]">{st.node}</div>
        </Motion.div>
      ))}
      <p className="mt-1.5 text-[12.5px] opacity-75">Clock times are UTC, taken from the run&apos;s timestamps.</p>
    </div>
  );
}

const DOT = {
  ok: "bg-pass",
  mid: "bg-short",
  no: "bg-under",
  cut: "bg-card !border-line",
};

const TAG = {
  pass: "bg-pass text-white",
  short_of_promise: "bg-short text-white",
  under_gate: "bg-under text-white",
};

function Tag({ kind, children }) {
  return <span className={`mr-1.5 inline-block rounded-full px-[9px] py-px text-xs font-bold ${TAG[kind]}`}>{children}</span>;
}

function LockBubble({ view }) {
  return (
    <div className="rounded-[4px_14px_14px_14px] bg-wash px-4 py-3 text-base">
      The publishers have had their hour. I locked {formatAmount(view.lock.amount)} {view.currency}
      <Badges kinds={view.lock.badges} /> in {view.lock.count} escrows and asked the Board to check every signup.
    </div>
  );
}

function Waiting({ view }) {
  return <span className="inline-block rounded-full border border-dashed border-line px-3.5 py-[3px] text-[12.5px] opacity-85">Waiting for the Board to settle {view.lock.count} escrows…</span>;
}

function CutLabel({ cut }) {
  const text =
    cut.minutes !== null && cut.minutes >= 1
      ? `${cut.minutes} min later · time cut, measured between the locks and the settlement start`
      : "Time cut · the wait for the Masumi unlock is skipped in this run";
  return <span className="mt-[5px] inline-block rounded-full border border-dashed border-line px-3.5 py-[3px] text-[12.5px] opacity-85">{text}</span>;
}

function VerdictBubble({ s }) {
  const verb =
    s.kind === "pass"
      ? `delivered ${s.delivered}. I paid the full ${formatAmount(s.paid)} and returned its ${formatAmount(s.bondReturned)} deposit.`
      : `delivered ${s.delivered}. That clears the minimum of ${s.gate}, so I paid the full ${formatAmount(s.paid)}. It loses ${formatAmount(s.bondForfeited)} of its deposit.`;
  return (
    <div className="rounded-[4px_14px_14px_14px] bg-wash px-4 py-3 text-base">
      <Tag kind={s.kind}>{s.kindLabel}</Tag>
      <strong>{s.name}</strong> promised {s.promised} signups per 1,000 and {verb}
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-line pt-2 text-[13.5px] tabular-nums">
        {s.transfers.map((t) => (
          <span key={t.id}>
            {t.label} <Money amount={t.amount} badge={t.badge} />
          </span>
        ))}
      </div>
      <EvidencePanel supplier={s.supplier} />
    </div>
  );
}

function UnderGate({ s, shown, reduced, currency }) {
  const rows = [
    { label: `My ${formatAmount(s.reclaimed)} locked for ${s.name}, returned`, amount: s.reclaimed, badge: s.refundBadge },
    { label: `Its ${formatAmount(s.bondForfeited)} deposit, forfeited to me`, amount: s.bondForfeited, badge: forfeitBadge(s) },
  ];
  const promised = s.promised > 0 ? s.promised : 1;
  const markerAt = Math.min(100, (s.gate / promised) * 100);
  const fill = Math.min(100, (s.delivered / promised) * 100);
  const showCount = shown.has(`slip:${s.supplier}:2`);
  return (
    <div className="rounded-[6px_18px_18px_18px] border-2 border-under bg-under-bg px-3.5 py-4 text-lg leading-[1.4] sm:px-[22px] sm:py-5 sm:text-xl">
      <Tag kind="under_gate">Under gate</Tag>
      <strong>{s.name}</strong> promised {s.promised} signups per 1,000. It delivered{" "}
      <strong>{s.delivered > 0 ? s.delivered : "none"}</strong>
      {s.delivered > 0 ? `, below the minimum of ${s.gate}` : ""}. I do not pay for promises, so everything comes back to me.
      <div className="mb-1 mt-3.5 flex items-center gap-2.5 text-sm">
        <span>0</span>
        <div className="relative h-2.5 flex-1 rounded-[5px] border border-line bg-card">
          <div className="h-full rounded-[4px] bg-under" style={{ width: `${fill}%` }} />
          <i className="absolute -bottom-[5px] -top-[5px] w-0.5 bg-ink" style={{ left: `${markerAt}%` }} />
        </div>
        <span>{s.promised} promised · minimum {s.gate}</span>
      </div>
      {shown.has(`slip:${s.supplier}:0`) ? (
        <div className="mt-4 rounded-xl border border-line bg-card px-3 py-3 text-[15px] sm:px-[18px] sm:py-4 sm:text-base">
          <div className="text-[12.5px] opacity-75">REFUND SLIP · verdict signed first, then the money moved</div>
          {rows.map((r, i) =>
            shown.has(`slip:${s.supplier}:${i}`) ? (
              <SlipRow key={r.label} className="border-b border-dashed border-line py-2">
                <span>{r.label}</span>
                <Money amount={r.amount} badge={r.badge} sign="+" />
              </SlipRow>
            ) : null,
          )}
          {showCount ? (
            <SlipRow className="flex-wrap items-baseline pt-3 text-[28px] font-bold text-under sm:text-[32px]">
              <span className="text-base">Back in my wallet</span>
              <span>
                <Counter to={s.refundTotal} reduced={reduced} /> {currency}
                <Badges kinds={uniqueKinds([s.refundBadge, forfeitBadge(s)])} />
              </span>
            </SlipRow>
          ) : null}
        </div>
      ) : null}
      {shown.has(`button:${s.supplier}`) ? <ExplorerButton s={s} /> : null}
      <EvidencePanel supplier={s.supplier} />
    </div>
  );
}

function forfeitBadge(s) {
  return s.transfers.find((t) => t.reason === "bond_forfeit")?.badge ?? s.refundBadge;
}

function uniqueKinds(list) {
  return ["REAL", "PRE-RECORDED", "SIMULATED"].filter((k) => list.includes(k));
}

function SlipRow({ children, className = "" }) {
  return (
    <Motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`flex justify-between gap-2.5 tabular-nums ${className}`}
    >
      {children}
    </Motion.div>
  );
}

function Counter({ to, reduced }) {
  const [value, setValue] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced) {
      setValue(to);
      return undefined;
    }
    const controls = animate(0, to, { duration: 1.5, ease: "easeOut", onUpdate: setValue });
    return () => controls.stop();
  }, [to, reduced]);
  return <span>{formatFixed(value)}</span>;
}

function ExplorerButton({ s }) {
  if (s.explorerUrl) {
    return (
      <Motion.a
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        href={s.explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3.5 block rounded-[10px] bg-under px-3.5 py-3.5 text-center text-[17px] font-bold text-white no-underline"
      >
        Check the refund on the Cardano explorer ↗
      </Motion.a>
    );
  }
  return (
    <Motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mt-3.5 rounded-[10px] border border-dashed border-under px-3.5 py-3 text-center text-sm"
    >
      No explorer link: this refund is on the <Badge kind={s.refundBadge} /> ledger, not on chain.
    </Motion.div>
  );
}

function FinalReceipt({ view }) {
  const f = view.final;
  const perSignup = f.costPerSignup === null ? null : Number(f.costPerSignup.toFixed(2));
  return (
    <div className="rounded-[6px_18px_18px_18px] border-2 border-ink p-[18px]">
      <div className="text-[12.5px] opacity-75">FINAL RECEIPT</div>
      <div className="font-display text-[28px] leading-[1.1] tabular-nums sm:text-4xl">
        I paid <Money amount={f.paid} badges={f.badges} currency={view.currency} />
        <br />
        for {f.signups} verified signups.
      </div>
      {perSignup === null ? null : <p className="mt-1">About {perSignup} per signup. Ranked by cost per signup:</p>}
      <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {view.leaderboard.map((r) => (
          <LeaderCard key={r.supplier} r={r} />
        ))}
      </div>
      <RoundTwo roundTwo={view.roundTwo} />
      <div className="mt-3.5 border-t border-dashed border-line pt-2 text-[12.5px]">{tallyLine(view.tally)}</div>
    </div>
  );
}

const CARD = {
  pass: "border-l-pass",
  short_of_promise: "border-l-short",
  under_gate: "border-l-under bg-under-bg",
  lost_bid: "border-l-line opacity-60",
};

function LeaderCard({ r }) {
  return (
    <div className={`grid grid-cols-[34px_1fr] items-center gap-x-2.5 gap-y-0.5 rounded-[10px] border border-line border-l-[6px] px-3 py-2.5 ${CARD[r.kind] ?? ""}`}>
      <div className="row-span-2 font-display text-[26px]">{r.rank}</div>
      <div>
        <strong>{r.name}</strong> <span className="text-[12.5px] opacity-75">· {r.kindLabel}</span>
      </div>
      <div className={`font-display text-[22px] leading-tight tabular-nums ${r.kind === "under_gate" ? "text-under" : ""}`}>
        {r.kind === "under_gate" ? "Refunded" : r.costPerSignup === null ? "·" : <Money amount={r.costPerSignup} badges={r.badges} />}
        <small className="block text-xs font-normal opacity-75">{cardCaption(r)}</small>
      </div>
    </div>
  );
}

function cardCaption(r) {
  if (r.kind === "under_gate") {
    return (
      <>
        {r.signups} signups · {formatAmount(r.refunded)} back <Badges kinds={r.refundBadges} />
      </>
    );
  }
  if (r.kind === "lost_bid") {
    return (
      <>
        bid fee {formatAmount(r.bidFee)} <Badges kinds={r.bidFeeBadges} />
      </>
    );
  }
  return `per signup · ${r.signups} signups`;
}

const BAR = ["bg-pass text-white", "bg-short text-white", "bg-cobalt text-white", "bg-ink text-white"];

function RoundTwo({ roundTwo }) {
  const active = roundTwo.filter((r) => r.share > 0);
  const idle = roundTwo.filter((r) => r.share === 0);
  if (roundTwo.length === 0) return null;
  return (
    <>
      <p className="mt-3.5">
        <strong>Next round, shown not executed:</strong> budget share for each publisher.
      </p>
      <div className="my-1.5 flex h-[26px] overflow-hidden rounded-md text-xs font-semibold">
        {active.map((r, i) => (
          <span key={r.supplier} className={`flex items-center justify-center overflow-hidden whitespace-nowrap px-1 ${BAR[i % BAR.length]}`} style={{ width: `${r.share * 100}%` }}>
            {r.name} {Math.round(r.share * 100)}%
          </span>
        ))}
      </div>
      {idle.length > 0 ? <div className="text-[12.5px] opacity-75">{idle.map((r) => `${r.name} 0%`).join(" · ")}</div> : null}
    </>
  );
}

function tallyLine(t) {
  const fees = t.bidFeeBadges.length ? t.bidFeeBadges.join(" / ") : "SIMULATED";
  let locks;
  if (t.locksTotal > 0 && t.locksReal === t.locksTotal) {
    locks = `${t.locksReal} escrows REAL on Cardano preprod.`;
  } else if (t.locksReal > 0) {
    const rest = t.lockBadges.filter((b) => b !== "REAL").join(" / ");
    locks = `${t.locksReal} of ${t.locksTotal} escrows REAL on Cardano preprod, the rest ${rest}.`;
  } else {
    locks = `No escrow is REAL in this run, all ${t.locksTotal} are ${t.lockBadges.join(" / ") || "SIMULATED"}.`;
  }
  return `${locks} Bid fees ${fees}. Traffic SIMULATED. Suppliers are our own agents.`;
}
