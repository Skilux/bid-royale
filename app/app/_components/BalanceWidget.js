"use client";

import { motion as Motion, useReducedMotion } from "motion/react";
import { supplierBalances } from "@/lib/dashboard/balances";
import { formatConversion } from "@/lib/conversion";
import { Badges } from "./Badge";
import { Money } from "./Money";
import { VerdictChip } from "./VerdictChip";

const txOf = (m) => (m?.explorerUrl ? { hash: m.txHash, url: m.explorerUrl } : null);

const NET_TONE = { pass: "text-pass", short_of_promise: "text-short", under_gate: "text-under", lost_bid: "text-ink-3" };

function verdictLine(b) {
  if (b.kind === "pass") return `${formatConversion(b.delivered)} ≥ ${formatConversion(b.promised)} promised`;
  if (b.kind === "short_of_promise") return `${formatConversion(b.delivered)} of ${formatConversion(b.promised)} promised`;
  if (b.kind === "under_gate") return `${formatConversion(b.delivered)} < ${formatConversion(b.gate)} gate`;
  return "no award, bid fee only";
}

/**
 * "Who ended up with what" (#66 D6). Full width under the flow, from the verdicts step on, one row per verdict as it
 * lands. Each row is a signed sum ending in the supplier's net, and a bond bar split into back and forfeited. Amounts
 * go through Money, so REAL rows are explorer link pills and PENDING parts are muted and left out of the net.
 */
export function BalanceWidget({ view }) {
  const reduced = useReducedMotion();
  const rows = supplierBalances(view);
  if (rows.length === 0) return null;
  return (
    <section className="rounded-[14px] border border-line bg-card/80 p-3" data-testid="balances">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">who ended up with what · each supplier, in {view.currency}</div>
      <div className="mt-1">
        {rows.map((b) => (
          <Motion.div
            key={b.id}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-1 items-center gap-x-4 gap-y-1 border-t border-line py-2 first:border-t-0 min-[900px]:grid-cols-[180px_minmax(0,1fr)_110px_minmax(0,220px)]"
            data-balance={b.id}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <b className="font-display text-[16px] font-extrabold uppercase leading-none tracking-[0.03em]">{b.name}</b>
                <VerdictChip kind={b.kind} label={b.label} />
              </div>
              <div className="mt-0.5 text-[10px] text-ink-3">{verdictLine(b)}</div>
            </div>

            <div className="min-w-0 text-[11.5px]">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {b.parts.map((p) => (
                  <span key={p.key} className={`whitespace-nowrap ${p.sign === 0 ? "text-ink-3" : ""}`} data-part={p.key}>
                    {p.sign < 0 ? "−" : p.sign > 0 ? "+" : ""}
                    <Money amount={p.amount} badge={p.row.badge} tx={txOf(p.row)} /> <span className="text-ink-3">{p.label}</span>
                  </span>
                ))}
              </div>
              {b.formula ? (
                <div className="mt-1 font-mono text-[10.5px] text-short" data-testid={`formula-${b.id}`}>
                  bond forfeit pro rata: {b.formula}
                </div>
              ) : null}
            </div>

            <div className={`font-display text-[22px] font-bold leading-none tabular-nums min-[900px]:text-right ${NET_TONE[b.kind] ?? ""}`} data-testid={`net-${b.id}`}>
              = {b.net > 0 ? "+" : b.net < 0 ? "−" : ""}
              {Math.abs(b.net).toFixed(2)}
              <Badges kinds={b.badges} />
            </div>

            <BondBar b={b} />
          </Motion.div>
        ))}
      </div>
      {rows.some((b) => b.pendingParts > 0) ? (
        <p className="mt-1 text-[10.5px] italic text-ink-3">Muted parts are PENDING: no transaction yet, so they are not in the net.</p>
      ) : null}
    </section>
  );
}

/** Back vs forfeited share of the bond lock. */
function BondBar({ b }) {
  if (!b.bondBar) return <div className="hidden min-[900px]:block" />;
  const { total, back, forfeit, pendingForfeit } = b.bondBar;
  const backPct = (back / total) * 100;
  const lostPct = (forfeit / total) * 100;
  const caption = forfeit === 0 && back === total ? "all back" : back === 0 && forfeit === total ? "all lost" : forfeit > 0 ? `${forfeit.toFixed(2)} lost` : pendingForfeit > 0 ? `${pendingForfeit.toFixed(2)} lost, PENDING` : "waiting";
  // These amounts repeat the row's parts, which are drawn with their Badge (or REAL pill) next to this bar.
  return (
    <div className="flex items-center gap-2 text-[10px] text-ink-2" aria-label={`Bond ${total}: ${back} back, ${forfeit} forfeited`}>
      <span className="text-ink-3">bond</span>
      <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-wash">
        <i className="block h-full bg-pass transition-[width] duration-700" style={{ width: `${backPct}%` }} />
        <i className="block h-full bg-under transition-[width] duration-700" style={{ width: `${lostPct}%` }} />
      </div>
      <span className="whitespace-nowrap">{caption}</span>
    </div>
  );
}
