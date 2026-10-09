"use client";

import { motion as Motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { formatConversion } from "@/lib/conversion";
import { supplierBalances } from "@/lib/dashboard/balances";
import { formatAmount } from "./format";
import { Money } from "./Money";
import { VerdictChip } from "./VerdictChip";

const VERDICT_KINDS = ["pass", "short_of_promise", "under_gate"];
const txOf = (m) => (m?.explorerUrl ? { hash: m.txHash, url: m.explorerUrl } : null);

function subtitle(r) {
  if (r.kind === "pass") return `${formatConversion(r.delivered)} ≥ ${formatConversion(r.promised)} promised`;
  if (r.kind === "short_of_promise") return `${formatConversion(r.delivered)} of ${formatConversion(r.promised)} promised`;
  if (r.kind === "under_gate") return `${formatConversion(r.delivered)} < ${formatConversion(r.gate)} gate`;
  return `promised less than the ${formatConversion(r.gate)} gate`;
}

function Part({ sign, amount, label, refRow, tone = "" }) {
  return (
    <span className={`inline-flex items-baseline gap-1 whitespace-nowrap ${tone}`}>
      <Money amount={amount} dp={2} badge={refRow?.badge} sign={sign} tx={txOf(refRow)} />
      <span className="text-ink-3">{label}</span>
    </span>
  );
}

/** The bond split into what came back (pass green) and what was forfeited (under red). */
function BondBar({ r }) {
  if (!r.bond) return <span className="text-[11px] text-ink-3">no bond locked</span>;
  const back = (r.bondBack / r.bond) * 100;
  const lost = (r.bondLost / r.bond) * 100;
  const caption = r.bondLost === 0 && r.bondBack >= r.bond ? "all back" : r.bondBack === 0 && r.bondLost >= r.bond ? "all lost" : r.bondLost > 0 ? `${formatAmount(Number(r.bondLost.toFixed(2)))} lost` : "waiting for the return";
  const label = `Deposit: ${caption}`;
  const tone = r.bondLost > 0 ? "text-under" : "text-ink-2";
  return (
    <div className="min-w-[150px]">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-wash" role="img" aria-label={label}>
        <span className="block h-full bg-pass transition-[width] duration-700" style={{ width: `${back}%` }} />
        <span className="block h-full bg-under transition-[width] duration-700" style={{ width: `${lost}%` }} />
      </div>
      <div className={`mt-1 font-mono text-[10px] ${tone}`}>bond · {caption}</div>
    </div>
  );
}

function Row({ r, view, reduced }) {
  const lost = r.kind === "lost_bid";
  const under = r.kind === "under_gate";
  const signed = r.net > 0 ? "+" : r.net < 0 ? "−" : "";
  return (
    <Motion.li
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-line py-2.5 @min-[1100px]:grid-cols-[210px_minmax(0,1fr)_110px_170px] @min-[1100px]:items-center"
      data-balance={r.id}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <b className="font-display text-[17px] font-extrabold uppercase tracking-[0.03em]">{r.name}</b>
          <VerdictChip kind={r.kind} label={r.label} />
        </div>
        <div className="mt-0.5 text-[10.5px] text-ink-3">{subtitle(r)}</div>
      </div>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px] tabular-nums">
          <Part sign="−" amount={r.fee} label="fee" refRow={r.refs.fee} tone="text-ink-2" />
          {lost ? null : <Part sign="−" amount={r.bond} label="bond" refRow={r.refs.bond} tone="text-ink-2" />}
          {!lost && !under ? <Part sign="+" amount={r.awardPaid} label="award" refRow={r.refs.awardPaid} tone="text-pass" /> : null}
          {under ? (
            <span className="whitespace-nowrap text-under">
              award <Money amount={r.awardToConsumer} dp={2} badge={r.refs.awardToConsumer?.badge} tx={txOf(r.refs.awardToConsumer)} /> → NeoRack
            </span>
          ) : null}
          {!lost && !under ? <Part sign="+" amount={r.bondBack} label="back" refRow={r.refs.bondBack} tone="text-pass" /> : null}
        </div>
        {r.formula ? (
          <div className="mt-1 font-mono text-[10.5px] text-short" data-testid={`formula-${r.id}`}>
            {r.formula}
          </div>
        ) : null}
        {r.pendingParts.length ? (
          <div className="mt-1 text-[10.5px] italic text-ink-3">
            not moved yet, not counted: {r.pendingParts.map((p) => `${p.label} ${formatAmount(Number(p.amount.toFixed(2)))}`).join(", ")}
          </div>
        ) : null}
      </div>
      <div className={`font-display text-[24px] font-bold leading-none tabular-nums ${r.net < 0 ? "text-under" : r.net > 0 ? "text-pass" : "text-ink-2"}`} data-testid={`net-${r.id}`}>
        = <Money amount={Math.abs(r.net)} dp={2} fixed sign={signed} badges={r.badges.length ? r.badges : [view.fallbackBadge]} className="text-[inherit]" />
      </div>
      {lost ? <span className="text-[11px] text-ink-3">no bond, no award</span> : <BondBar r={r} />}
    </Motion.li>
  );
}

/**
 * "Who ended up with what" (#66 D6). Appears once the first verdict lands and gets one row per verdict. Each row is a signed
 * sum that ends in the supplier's net, plus its bond split into back and forfeited. The formula shows on Short of promise only.
 */
export function BalanceWidget({ view }) {
  const reduced = useReducedMotion();
  const rows = useMemo(() => supplierBalances(view), [view]);
  const landed = rows.filter((r) => VERDICT_KINDS.includes(r.kind));
  if (landed.length === 0) return null;
  const shown = rows.filter((r) => VERDICT_KINDS.includes(r.kind) || r.kind === "lost_bid");
  return (
    <section className="rounded-[14px] border border-line bg-card/80 p-3.5" data-testid="balance-widget">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[20px] font-extrabold uppercase tracking-[0.04em]">Who ended up with what</h2>
        <span className="text-[11px] text-ink-3">{view.currency} · per supplier: fee, bond, award and bond back</span>
      </div>
      <ul className="mt-2">
        {shown.map((r) => (
          <Row key={r.id} r={r} view={view} reduced={reduced} />
        ))}
      </ul>
    </section>
  );
}
