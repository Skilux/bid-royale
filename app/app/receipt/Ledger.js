"use client";

import { useState } from "react";
import { Badges } from "../_components/Badge";
import { Money } from "../_components/Money";

const uniq = (list) => ["REAL", "PENDING", "PRE-RECORDED", "SIMULATED"].filter((k) => list.includes(k));

/**
 * One ledger per agent, tabs for the Consumer, the Board and the four suppliers (DESIGN.md section 8).
 * Amounts are signed from that agent's side. A PENDING row is listed but not in the net: it has not moved.
 * The nets of all agents add up to 0. Draws `view.ledgers` from lib/receipt-view.
 */
export function AgentLedger({ ledgers, currency }) {
  const [id, setId] = useState(ledgers[0]?.id);
  const l = ledgers.find((x) => x.id === id) ?? ledgers[0];
  if (!l) return null;
  const counted = l.rows.filter((r) => !r.pending);
  return (
    <section className="mt-4" data-testid="ledger">
      <div className="text-[12.5px] opacity-75">LEDGER PER AGENT · signed from the agent&apos;s side, PENDING rows are not counted</div>
      <div role="tablist" className="mt-1.5 flex flex-wrap gap-1.5">
        {ledgers.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === l.id}
            onClick={() => setId(x.id)}
            className={`cursor-pointer rounded-full border px-3 py-[3px] text-[12.5px] ${x.id === l.id ? "border-ink bg-ink text-paper" : "border-line"}`}
          >
            {x.name}
          </button>
        ))}
      </div>
      <table className="mt-2 w-full border-collapse text-[13px] tabular-nums">
        <thead>
          <tr className="text-left text-[11.5px] opacity-70">
            <th className="py-1 pr-2 font-medium">Step</th>
            <th className="py-1 pr-2 font-medium">What</th>
            <th className="hidden py-1 pr-2 font-medium sm:table-cell">With</th>
            <th className="py-1 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {l.rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="border-t border-line py-2 opacity-70">
                No money rows yet.
              </td>
            </tr>
          ) : null}
          {l.rows.map((r) => (
            <tr key={r.id} className={`border-t border-line ${r.pending ? "opacity-70" : ""}`} data-pending={r.pending ? "true" : undefined}>
              <td className="py-1 pr-2">{r.step}</td>
              <td className="py-1 pr-2">{r.what}</td>
              <td className="hidden py-1 pr-2 opacity-75 sm:table-cell">{r.counterparty}</td>
              <td className={`py-1 text-right ${r.pending ? "" : r.amount < 0 ? "text-under" : "text-pass"}`}>
                <Money amount={r.amount} badge={r.badge} sign={r.amount > 0 ? "+" : ""} tx={r.explorerUrl ? { hash: r.txHash, url: r.explorerUrl } : null} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink font-bold">
            <td colSpan={3} className="py-1.5 pr-2">
              Net of {counted.length} counted rows{l.pendingCount ? `, ${l.pendingCount} PENDING left out` : ""}
            </td>
            <td className="py-1.5 text-right">
              <Money amount={l.net} sign={l.net > 0 ? "+" : ""} currency={currency} badges={counted.length ? uniq(counted.map((r) => r.badge)) : ["SIMULATED"]} />
            </td>
          </tr>
        </tfoot>
      </table>
      {counted.length === 0 ? <Badges kinds={["SIMULATED"]} /> : null}
    </section>
  );
}
