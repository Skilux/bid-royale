"use client";

import { motion as Motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { coinFor } from "@/lib/dashboard/coins";
import { shortHash } from "@/lib/dashboard/reduce";
import { Badge } from "./Badge";
import { Chip } from "./Chip";
import { Counter } from "./Counter";
import { formatAmount } from "./format";
import { Money } from "./Money";
import { VerdictChip } from "./VerdictChip";

/*
 * The money flow dashboard, after docs/design/dashboard/money-flow.html. Dark theme tokens live in globals.css under
 * `.flow`, so this file only uses token utilities. Three columns (Consumer agent, escrow on Masumi, suppliers found in
 * the Masumi registry) share four grid rows, so the dashed rails run straight from the Consumer to each escrow row and
 * on to each supplier card. Money tokens fly along the rails when a row moves. Below 1100 px the columns stack and the
 * rails and tokens are off.
 */

const ROW_AT = ["min-[1100px]:row-start-2", "min-[1100px]:row-start-3", "min-[1100px]:row-start-4", "min-[1100px]:row-start-5"];

const OUTCOME_TONE = {
  award_release: "text-pass",
  bond_return: "text-pass",
  award_reclaim: "text-under",
  bond_forfeit: "text-under",
};

const CARD_TONE = {
  pass: "border-pass/50",
  short_of_promise: "border-short/50",
  under_gate: "border-under/70 shadow-[0_0_28px_var(--color-under-bg)]",
  escrowed: "border-cobalt/40",
  lost_bid: "border-line opacity-50",
};

const CELL_TONE = {
  wait: "border-dashed border-line text-ink-3",
  locked: "border-short/50 bg-short-bg text-ink-2",
  paid: "border-pass/45 bg-pass-bg",
  refund: "border-under/60 bg-under-bg",
  pending: "border-dotted border-ink-3 bg-wash text-ink-2",
};

const COIN = {
  award: "border-short text-short",
  bond: "border-short text-short",
  payout: "border-pass text-pass",
  back: "border-under text-under",
};

const txOf = (m) => (m?.explorerUrl ? { hash: m.txHash, url: m.explorerUrl } : null);

function Label({ children, className = "" }) {
  return <div className={`font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 ${className}`}>{children}</div>;
}

function Node({ children, className = "", ...rest }) {
  return (
    <section className={`rounded-[14px] border border-line bg-card/80 ${className}`} {...rest}>
      {children}
    </section>
  );
}

/** The embeddable dashboard. Draws a `buildDashboardView` result. `fresh` ({ key, events }) drives the money tokens. */
export function Dashboard({ view, fresh = null, onSelectStep = null }) {
  const quoteBadge = view.mode === "canned" ? "PRE-RECORDED" : "SIMULATED";
  const [flash, setFlash] = useState(false);
  return (
    <div className="space-y-2.5" data-testid="dashboard">
      <StepRail view={view} onSelect={onSelectStep} />
      {view.degraded ? (
        <div className="rounded-lg border border-dashed border-short bg-short-bg px-3 py-2 text-[12px]" data-testid="degraded">
          The live run failed{view.degraded.step ? ` at ${view.degraded.step}` : ""}. Showing the recorded run instead, badged <Badge kind="PRE-RECORDED" />.
        </div>
      ) : null}
      {view.failed ? <div className="rounded-lg border border-under bg-under-bg px-3 py-2 text-[12px]">Run failed: {String(view.failed)}</div> : null}
      <FlowStage view={view} fresh={fresh} quoteBadge={quoteBadge} onHero={setFlash} flash={flash} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[1100px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
        <BotPanel view={view} />
        <EventsPanel view={view} />
        <TrackFit view={view} quoteBadge={quoteBadge} />
      </div>
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 z-30 transition-opacity duration-500 ${flash ? "opacity-100" : "opacity-0"}`}
        style={{ background: "radial-gradient(100% 80% at 40% 40%, transparent 30%, var(--color-under-bg))" }}
      />
    </div>
  );
}

function StepRail({ view, onSelect }) {
  return (
    <ol className="flex items-center overflow-x-auto font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" aria-label="Run steps">
      {view.steps.map((s, i) => {
        const tone = s.status === "pending" ? "text-ink-3" : s.status === "running" ? "text-cobalt" : "text-ink-2";
        return (
          <li key={s.key} data-step={s.key} data-status={s.status} className="flex flex-1 items-center gap-2 whitespace-nowrap">
            <i
              className={`size-[9px] shrink-0 rounded-full border transition-all duration-500 ${
                s.status === "done"
                  ? "border-under bg-under"
                  : s.status === "running"
                    ? "border-cobalt bg-cobalt shadow-[0_0_0_4px_var(--color-wash),0_0_12px_var(--color-short)]"
                    : s.status === "failed"
                      ? "border-under bg-card"
                      : "border-ink-3 bg-transparent"
              }`}
            />
            {onSelect ? (
              <button type="button" onClick={() => onSelect(s.key)} className={`cursor-pointer uppercase tracking-[0.16em] hover:text-ink ${tone}`}>
                {s.label}
              </button>
            ) : (
              <span className={tone}>{s.label}</span>
            )}
            {i < view.steps.length - 1 ? <span className="mr-2 h-px flex-1 bg-ink-3/40" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Rails and tokens. Geometry is measured from the three columns, so the rails follow the real layout. */
function FlowStage({ view, fresh, quoteBadge, onHero, flash }) {
  const reduced = useReducedMotion();
  const stage = useRef(null);
  const cons = useRef(null);
  const escRows = useRef({});
  const supCards = useRef({});
  const pathEls = useRef({});
  const seen = useRef(new Set());
  const heroTimer = useRef(null);
  const [geo, setGeo] = useState({ ok: false, w: 0, h: 0, paths: {} });
  const [coins, setCoins] = useState([]);
  const ids = view.suppliers.map((s) => s.id).join(",");

  useLayoutEffect(() => {
    const measure = () => {
      const root = stage.current;
      if (!root || !cons.current || window.innerWidth < 1100) return setGeo((g) => (g.ok ? { ok: false, w: 0, h: 0, paths: {} } : g));
      const o = root.getBoundingClientRect();
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return { l: r.left - o.left, r: r.right - o.left, t: r.top - o.top, h: r.height };
      };
      const c = rect(cons.current);
      const curve = (x1, y1, x2, y2) => {
        const m = (x1 + x2) / 2;
        return `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`;
      };
      const paths = {};
      for (const id of ids.split(",").filter(Boolean)) {
        const e = escRows.current[id] && rect(escRows.current[id]);
        const s = supCards.current[id] && rect(supCards.current[id]);
        if (!e || !s) continue;
        paths[id] = {
          award: curve(c.r, c.t + c.h * 0.38, e.l, e.t + e.h * 0.3),
          back: curve(e.l, e.t + e.h * 0.74, c.r, c.t + c.h * 0.6),
          bond: curve(s.l, s.t + s.h * 0.74, e.r, e.t + e.h * 0.74),
          payout: curve(e.r, e.t + e.h * 0.3, s.l, s.t + s.h * 0.3),
        };
      }
      setGeo({ ok: true, w: o.width, h: o.height, paths });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ids]);

  useEffect(() => {
    if (!view.started) {
      seen.current.clear();
      setCoins([]);
      onHero(false);
    }
  }, [view.started, onHero]);

  useEffect(() => {
    if (!fresh?.events?.length || !geo.ok || reduced) return undefined;
    const amountOf = (id) => view.rows.find((r) => r.id === id)?.amount ?? null;
    const spawn = [];
    let hero = false;
    for (const e of fresh.events) {
      const c = coinFor(e, { mode: view.mode, amountOf });
      const key = c && `${c.id}:${c.path}`;
      const el = c && pathEls.current[`${c.path}-${c.supplier}`];
      if (!c || !el || seen.current.has(key)) continue;
      seen.current.add(key);
      if (c.hero) {
        hero = true;
        for (let i = 0; i < 6; i += 1) spawn.push({ key: `${key}:d${i}`, el, tone: "back", dur: 1800, delay: i * 140, dot: true });
        spawn.push({ key: `${key}:big`, el, tone: "back", dur: 1800, delay: 900, amount: c.amount, badge: c.badge, big: true });
      } else {
        spawn.push({ key, el, tone: c.path, dur: 1200, delay: 0, amount: c.amount, badge: c.badge });
      }
    }
    if (spawn.length) setCoins((list) => [...list, ...spawn]);
    if (hero) {
      onHero(true);
      clearTimeout(heroTimer.current);
      heroTimer.current = setTimeout(() => onHero(false), 2600);
    }
    return undefined;
  }, [fresh?.key]);

  useEffect(() => () => clearTimeout(heroTimer.current), []);

  const done = (key) => setCoins((list) => list.filter((c) => c.key !== key));
  const lit = (s, kind) => {
    const [award, bond] = s.cells ?? [];
    const moved = (m) => m && !m.pending;
    if (kind === "award") return moved(award?.lock);
    if (kind === "bond") return moved(bond?.lock);
    if (kind === "payout") return [...(award?.outcomes ?? []), ...(bond?.outcomes ?? [])].some((o) => moved(o) && o.to !== "consumer");
    return [...(award?.outcomes ?? []), ...(bond?.outcomes ?? [])].some((o) => moved(o) && o.to === "consumer");
  };
  const RAIL_TONE = { award: "amb", bond: "amb", payout: "grn", back: "red" };

  return (
    <div
      ref={stage}
      className={`relative grid grid-cols-[minmax(0,1fr)] gap-3 min-[1100px]:grid-cols-[238px_minmax(56px,150px)_340px_minmax(56px,110px)_minmax(0,1fr)] min-[1100px]:grid-rows-[46px_repeat(4,minmax(108px,auto))] min-[1100px]:gap-x-0 min-[1100px]:gap-y-1`}
      data-testid="flow"
    >
      <ConsumerNode view={view} quoteBadge={quoteBadge} refEl={cons} stamp={flash || !geo.ok} />

      <div className={`hidden min-[1100px]:col-start-3 min-[1100px]:row-span-5 min-[1100px]:row-start-1 min-[1100px]:block rounded-[14px] border border-line bg-card/80`} aria-hidden="true" />
      <EscrowHead view={view} />
      {view.suppliers.length === 0 ? (
        <p className={`min-[1100px]:col-start-3 min-[1100px]:row-start-2 relative z-10 px-4 py-3 text-[12px] text-ink-3`}>Nothing locked yet.</p>
      ) : null}
      {view.suppliers.map((s, i) => (
        <EscrowRow key={s.id} s={s} i={i} refEl={(el) => (escRows.current[s.id] = el)} />
      ))}

      <Label className={`min-[1100px]:col-start-5 min-[1100px]:row-start-1 min-[1100px]:pb-2 min-[1100px]:pt-1`}>Suppliers · found in the Masumi registry</Label>
      {view.suppliers.length === 0 ? <EmptyNote>Waiting for the tender…</EmptyNote> : null}
      {view.suppliers.map((s, i) => (
        <SupplierCard key={s.id} s={s} i={i} view={view} quoteBadge={quoteBadge} refEl={(el) => (supCards.current[s.id] = el)} />
      ))}

      {geo.ok ? (
        <svg className="pointer-events-none absolute left-0 top-0 z-[5]" width={geo.w} height={geo.h} aria-hidden="true" data-testid="rails">
          {view.suppliers.map((s) =>
            geo.paths[s.id]
              ? ["award", "back", "bond", "payout"].map((kind) => (
                  <path
                    key={`${kind}-${s.id}`}
                    ref={(el) => (pathEls.current[`${kind}-${s.id}`] = el)}
                    d={geo.paths[s.id][kind]}
                    className={`rail ${lit(s, kind) ? RAIL_TONE[kind] : ""}`}
                  />
                ))
              : null,
          )}
        </svg>
      ) : null}
      {geo.ok ? (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" data-testid="coins" aria-hidden="true">
          {coins.map((c) => (
            <Coin key={c.key} coin={c} onDone={done} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const ease = (p) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;

/** One money token travelling a rail. Position is written straight to the element, so it does not re-render. */
function Coin({ coin, onDone }) {
  const node = useRef(null);
  useEffect(() => {
    const path = coin.el;
    const len = path.getTotalLength();
    const t0 = performance.now() + coin.delay;
    let raf;
    const frame = (now) => {
      const el = node.current;
      if (el) {
        const k = Math.min(1, Math.max(0, (now - t0) / coin.dur));
        const pt = path.getPointAtLength(len * ease(k));
        el.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%)`;
        el.style.opacity = now < t0 ? 0 : k > 0.9 ? (1 - k) * 10 : 1;
        if (k >= 1) return onDone(coin.key);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [coin, onDone]);

  if (coin.dot) return <span ref={node} className="absolute left-0 top-0 size-3 rounded-full bg-under opacity-0 shadow-[0_0_12px_var(--color-under)]" />;
  return (
    <span
      ref={node}
      data-coin={coin.tone}
      className={`absolute left-0 top-0 inline-flex items-center gap-1 whitespace-nowrap rounded-full border-2 bg-paper font-mono font-bold opacity-0 shadow-[0_0_14px_currentColor] ${COIN[coin.tone]} ${coin.big ? "px-3 py-1 text-[16px]" : "px-2 py-px text-[12px]"}`}
    >
      <Money amount={coin.amount} badge={coin.badge} sign={coin.big ? "+" : ""} />
    </span>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line py-[3px] text-[11px] text-ink-2">
      <span>{label}</span>
      <b className="font-semibold text-ink">{value}</b>
    </div>
  );
}

function ConsumerNode({ view, quoteBadge, refEl, stamp }) {
  const { tender, wallet, budget } = view;
  const reduced = useReducedMotion();
  const hero = view.hero;
  return (
    <Node
      className={`relative z-10 p-3.5 min-[1100px]:col-start-1 min-[1100px]:row-span-5 min-[1100px]:row-start-1 ${hero ? "border-under/80 shadow-[0_0_0_1px_var(--color-under-bg),0_0_44px_var(--color-under-bg)]" : ""}`}
      data-testid="tender-card"
    >
      <div ref={refEl} className="absolute inset-0" aria-hidden="true" />
      <Label>NeoRack · consumer agent</Label>
      <p className="mb-2 mt-1.5 font-serif text-[19px] italic leading-[1.15]">
        {view.started ? (
          <>
            Budget <Money amount={tender.budget} badge={quoteBadge} currency={view.currency} />, {view.brief.audience}, {view.brief.goal}.
          </>
        ) : (
          "Waiting for the brief…"
        )}
      </p>
      <div className="flex flex-wrap gap-1 text-[10px]">
        <Chip tone="neutral">
          gate <b>{tender.gate}</b>/1,000
        </Chip>
        <Chip tone="neutral">
          bond <b>{Math.round(tender.bondRate * 100)}%</b>
        </Chip>
        <Chip tone="neutral">
          bid fee <Money amount={tender.bidFee} badge={quoteBadge} />
        </Chip>
        {view.discovery ? (
          <Chip tone={view.discovery.source === "live" ? "cobalt" : "neutral"}>
            <span data-testid="discovery-chip" title={view.discovery.agents.map((a) => `${a.name} ${a.apiBaseUrl}`).join("\n")}>
              {view.discovery.chip}
            </span>
          </Chip>
        ) : null}
      </div>

      <Label className="mt-3">budget allocated</Label>
      <div className="mt-1 text-[12px]" data-testid="budget">
        <Money amount={budget.allocated} badge={quoteBadge} /> / <Money amount={budget.total} badge={quoteBadge} currency={view.currency} />
      </div>
      <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-wash" role="img" aria-label="Budget allocated per supplier">
        {budget.segments.map((seg, i) => (
          <Motion.i
            key={seg.id}
            title={seg.name}
            initial={reduced ? false : { width: 0 }}
            animate={{ width: `${(seg.award / budget.total) * 100}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={`block h-full border-r-2 border-paper ${["bg-under", "bg-short", "bg-cobalt", "bg-pass"][i % 4]}`}
          />
        ))}
      </div>

      <Label className="mt-3">wallet · net</Label>
      <div className="font-display text-[40px] font-bold leading-[1.05] tabular-nums" data-testid="wallet-net">
        <Money amount={wallet.net} badges={[...new Set([...wallet.badgesOut, ...wallet.badgesBack])]} currency={view.currency} />
      </div>
      <div className="mt-1">
        <Line label="escrowed" value={<Money amount={wallet.escrowed} badges={wallet.badgesOut.length ? wallet.badgesOut : [quoteBadge]} />} />
        <Line label="back" value={<Money amount={wallet.back} badges={wallet.badgesBack.length ? wallet.badgesBack : [quoteBadge]} />} />
        {wallet.pendingOut > 0 ? <Line label="locking, not moved yet" value={<Money amount={wallet.pendingOut} badge="PENDING" />} /> : null}
        {wallet.pendingBack > 0 ? <Line label="returning, not moved yet" value={<Money amount={wallet.pendingBack} badge="PENDING" />} /> : null}
        <Line label="supplier bid fees" value={<Money amount={view.bidFees.total} badges={view.bidFees.badges.length ? view.bidFees.badges : [quoteBadge]} />} />
      </div>
      {hero && stamp ? (
        <Motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.7, rotate: -6 }}
          animate={{ opacity: 1, scale: 1, rotate: -3 }}
          transition={{ type: "spring", stiffness: 260, damping: 14 }}
          className="z-30 mt-4 rounded-lg bg-under px-3 py-2 text-center text-white shadow-[0_0_30px_var(--color-under)] min-[1100px]:absolute min-[1100px]:left-[calc(100%+8px)] min-[1100px]:top-[48%] min-[1100px]:mt-0 min-[1100px]:w-[134px]"
          data-testid="refund-stamp"
        >
          <div className="font-display text-[22px] font-extrabold uppercase leading-[1.1] tracking-[0.06em]">
            <Money amount={hero.amount} badge={hero.badge} sign="+" tx={txOf(hero)} /> back
          </div>
          <div className="mt-1 font-mono text-[9px] tracking-[0.12em]">UNDER GATE REFUND · {hero.name}</div>
        </Motion.div>
      ) : null}
      <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">released only on a signed verdict</p>
    </Node>
  );
}

function EscrowHead({ view }) {
  const { escrow } = view;
  return (
    <div className={`relative z-10 px-3.5 pt-3 min-[1100px]:col-start-3 min-[1100px]:row-start-1`} data-testid="escrow-panel">
      <Label>escrow · Masumi on Cardano preprod</Label>
      <div className="mt-1 font-mono text-[12px] font-semibold" data-testid="escrow-total">
        locked <Money amount={escrow.locked} badges={escrow.badges.length ? escrow.badges : [view.mode === "canned" ? "PRE-RECORDED" : "SIMULATED"]} /> / {formatAmount(escrow.total)} {view.currency}
        {escrow.pending > 0 ? (
          <span className="ml-2 text-ink-3">
            <Money amount={escrow.pending} badge="PENDING" /> waiting for lock
          </span>
        ) : null}
      </div>
    </div>
  );
}

function EscrowRow({ s, i, refEl }) {
  return (
    <div
      ref={refEl}
      data-escrow={s.id}
      className={`relative z-10 rounded-lg border border-line bg-card/80 px-3 py-2 min-[1100px]:col-start-3 ${ROW_AT[i]} min-[1100px]:rounded-none min-[1100px]:border-x-0 min-[1100px]:border-b-0 min-[1100px]:bg-transparent ${s.lost ? "opacity-45" : ""}`}
    >
      <div className="font-display text-[14px] font-bold uppercase leading-tight tracking-[0.06em]">{s.name}</div>
      {s.lost ? (
        <div className="mt-1 text-[11px] text-ink-3">no escrow</div>
      ) : (
        <div className="mt-0.5 space-y-[3px]">
          {s.cells.map((cell) => (
            <EscrowCell key={cell.kind} title={cell.kind} cell={cell} />
          ))}
        </div>
      )}
    </div>
  );
}

function EscrowCell({ title, cell }) {
  const { lock, outcomes, tone } = cell;
  return (
    <div className={`rounded-md border px-2 py-[3px] text-[10.5px] ${CELL_TONE[tone]}`} data-cell={title} data-tone={tone}>
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <span>{title}</span>
        {lock ? <Money amount={lock.amount} badge={lock.badge} tx={txOf(lock)} className="font-semibold text-ink" /> : <span className="text-ink-3">not locked yet</span>}
      </div>
      {lock?.pending ? <div className="text-[10px] italic text-ink-3">submitted, waiting for the chain. Not moved yet.</div> : null}
      {outcomes.map((o) => (
        <Motion.div
          key={o.id}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex flex-wrap items-center justify-between gap-x-2 ${o.pending ? "text-ink-3" : (OUTCOME_TONE[o.action] ?? "")}`}
        >
          <span>
            {o.pending ? "pending: " : o.to === "consumer" ? "← " : "→ "}
            {o.label}
          </span>
          <Money amount={o.amount} badge={o.badge} tx={txOf(o)} />
        </Motion.div>
      ))}
    </div>
  );
}

/** The supplier's NeoRack ad (#60, `public/creatives/<id>.svg`, illustrative). The CSS mockup is the fallback if the file is missing. */
function Creative({ id, name, lost }) {
  const [failed, setFailed] = useState(false);
  const known = ["techblog", "codepodcast", "devnewsletter", "gamingforum"].includes(id) ? id : "techblog";
  if (!failed) {
    return (
      <img
        src={`/creatives/${id}.svg`}
        alt={`NeoRack ad on ${name} (illustrative mock)`}
        width={52}
        height={92}
        onError={() => setFailed(true)}
        className={`cr-img ${lost ? "cr-lost" : ""}`}
      />
    );
  }
  return (
    <div className={`cr cr-${known} ${lost ? "cr-lost" : ""}`} aria-hidden="true">
      <i />
      <b>NeoRack</b>
      <span>GPUs for builders</span>
      <u>Sign up</u>
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className={`rounded-lg border border-dashed border-line px-3 py-4 text-[12px] text-ink-3 min-[1100px]:col-start-5 min-[1100px]:row-start-2`}>{children}</p>;
}

function SupplierCard({ s, i, view, quoteBadge, refEl }) {
  const tone = s.chip ? CARD_TONE[s.chip.kind] : "border-line";
  const gatePct = Math.min(100, (view.gate / view.scaleMax) * 100);
  const promisedPct = s.promised ? Math.min(100, (s.promised / view.scaleMax) * 100) : null;
  const fillPct = Math.min(100, (s.per1000 / view.scaleMax) * 100);
  return (
    <section
      ref={refEl}
      className={`relative z-10 flex gap-2.5 rounded-[14px] border bg-card/80 p-2.5 transition-colors duration-700 min-[1100px]:col-start-5 ${ROW_AT[i]} ${tone}`}
      data-supplier={s.id}
      data-verdict={s.chip?.kind ?? "none"}
    >
      <Creative id={s.id} name={s.name} lost={s.lost} />
      <div className="min-w-0 flex-1">
        <div className="flex min-h-[24px] items-center justify-between gap-2">
          <h3 className={`font-display text-[19px] font-extrabold uppercase leading-none tracking-[0.03em] ${s.lost ? "text-ink-3 line-through" : ""}`}>{s.name}</h3>
          {s.chip ? <VerdictChip kind={s.chip.kind} label={s.chip.label} /> : null}
        </div>
        <div className="mt-0.5 min-h-[15px] truncate text-[10px] text-ink-2">
          {s.rejectedNote ? (
            <span>{s.rejectedNote}</span>
          ) : s.bid ? (
            <span title={`commit ${s.commit}`}>
              <Money amount={s.bid.price} badge={quoteBadge} /> · {s.bid.impressions.toLocaleString("en-US")} impr. · <b className="text-ink">{s.bid.promisedPer1000}</b>/1,000
              {s.pricePerSignup !== null ? (
                <>
                  {" "}
                  · #{s.rank} <b className="text-ink">{s.pricePerSignup.toFixed(2)}</b>/signup
                </>
              ) : null}
            </span>
          ) : s.commit ? (
            <span title={s.commit}>sealed {shortHash(s.commit)}</span>
          ) : (
            <span className="text-ink-3">invited</span>
          )}
        </div>
        {s.lost ? null : (
          <>
            <div className="relative mt-3 h-[11px] rounded bg-wash" aria-hidden="true">
              <div className={`h-full rounded-l transition-[width] duration-700 ${s.verifiedKnown ? "bg-pass" : "bg-ink-3"}`} style={{ width: `${fillPct}%` }} />
              <u className="absolute -bottom-[3px] -top-[3px] w-0.5 bg-under no-underline" style={{ left: `${gatePct}%` }}>
                <span className="absolute left-[-12px] top-[15px] whitespace-nowrap font-mono text-[8px] text-under">gate {view.gate}</span>
              </u>
              {promisedPct !== null ? (
                <u className="absolute -bottom-[3px] -top-[3px] w-0.5 bg-cobalt no-underline" style={{ left: `${promisedPct}%` }}>
                  <span className="absolute left-[-18px] top-[-12px] whitespace-nowrap font-mono text-[8px] text-cobalt">promised {s.promised}</span>
                </u>
              ) : null}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <b className="font-display text-[24px] font-bold leading-none" data-testid={`count-${s.id}`}>
                <Counter to={s.served ? s.count : 0} />
              </b>
              <span className="text-[10px] text-ink-2" data-testid={`count-label-${s.id}`}>
                {s.verifiedKnown ? "verified signups" : s.served ? "received, not verified yet" : "verified signups"}
              </span>
              {s.served ? (
                <span className="ml-auto font-mono text-[10px] text-ink-3">
                  <Counter to={s.impressionsTarget} /> impr.
                </span>
              ) : null}
            </div>
            {s.verifiedKnown && s.delivered !== null ? (
              <div className="mt-0.5 text-[9px] text-ink-3" data-testid={`rejections-${s.id}`}>
                {Object.keys(s.rejections).length
                  ? `rejected: ${Object.entries(s.rejections)
                      .map(([k, n]) => `${n} ${k.replaceAll("_", " ")}`)
                      .join(", ")}`
                  : "no rejected signups"}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function Panel({ children, className = "", ...rest }) {
  return (
    <section className={`rounded-xl border border-line bg-card/80 p-2.5 ${className}`} {...rest}>
      {children}
    </section>
  );
}

function BotPanel({ view }) {
  return (
    <Panel data-testid="bot-panel">
      <Label>bot signals · context only, never the verdict</Label>
      <div className="mt-1 text-[10.5px]">
        {view.bots.length === 0 ? <div className="py-2 text-ink-3">No traffic yet.</div> : null}
        {view.bots.map((b) => (
          <div key={b.id} className="grid grid-cols-[1fr_auto] gap-x-2 border-t border-line py-1">
            <b className="font-semibold">{b.name}</b>
            <span className="text-right text-ink-2">{!b.served ? "·" : b.received ? `${b.received} received` : "no signups"}</span>
            {b.served && (b.flaggedBySignals || b.detail?.clickBursts || b.detail?.asns?.length) ? (
              <span className={`col-span-2 text-[10px] ${b.flaggedBySignals || b.detail?.clickBursts ? "text-short" : "text-ink-3"}`}>
                {b.flaggedBySignals || b.detail?.clickBursts ? `${b.flaggedBySignals || b.detail.clickBursts} flagged` : "0 flagged"}
                {b.detail?.clickBursts ? ", click burst" : ""}
                {b.detail?.asns?.length ? ` · ASN ${b.detail.asns.map((a) => `${a.asn} ×${a.count}`).join(", ")}` : ""}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function EventsPanel({ view }) {
  return (
    <Panel data-testid="events-panel">
      <Label>board events · SSE</Label>
      <ul className="mt-1 text-[10.5px]">
        {view.log.length === 0 ? <li className="py-2 text-ink-3">No events yet.</li> : null}
        {view.log.slice(0, 5).map((l, i) => (
          <li key={`${l.seq}-${l.name}-${i}`} className={`flex gap-2 border-t border-line py-[3px] ${i === 0 ? "text-ink" : "text-ink-2"}`}>
            <em className={`min-w-[128px] shrink-0 text-[9px] not-italic tracking-[0.08em] ${i === 0 ? "text-cobalt" : "text-ink-3"}`}>{l.name}</em>
            <span className="truncate">{l.text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function TrackFit({ view, quoteBadge }) {
  const r = view.receipt;
  return (
    <Panel data-testid="track-fit">
      <Label>track fit</Label>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Lit on={view.chips.discovery}>Discovery: Masumi registry</Lit>
        <Lit on={view.chips.wallet}>Wallet</Lit>
        <Lit on={view.chips.masumi}>Escrow: Masumi, Cardano preprod</Lit>
        <Lit on={view.chips.dispute} tone="under">
          Dispute path: refund
        </Lit>
      </div>
      <div className={`mt-2 transition-opacity duration-500 ${r ? "" : "opacity-25"}`} data-testid="mini-receipt">
        <div className="font-display text-[30px] font-extrabold leading-none tabular-nums text-cobalt">
          {r ? <Money amount={r.net} badges={r.badges.length ? r.badges : [quoteBadge]} currency={view.currency} /> : "·"}
        </div>
        {r ? (
          <div className="mt-1 text-[10.5px] leading-[1.5] text-ink-2">
            <b className="text-ink">{r.signups}</b> verified signups · <b className="text-ink">{r.costPerSignup === null ? "·" : Number(r.costPerSignup).toFixed(2)}</b> each
            {r.pending ? <div className="italic text-ink-3">Some rows are PENDING. The net is planned, not paid yet.</div> : null}
            {view.roundTwo ? (
              <div>
                Round 2, shown not executed: {view.roundTwo.map((x) => `${x.name} ${Math.round(x.share * 100)}`).join(" · ")} <Badge kind="SIMULATED" />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function Lit({ on, tone = "cobalt", children }) {
  return (
    <span className={`transition-opacity duration-500 ${on ? "opacity-100" : "opacity-35"}`}>
      <Chip tone={on ? tone : "neutral"}>{children}</Chip>
    </span>
  );
}
