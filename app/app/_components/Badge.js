"use client";

import { createContext, useContext } from "react";

const STYLE = {
  REAL: "border border-pass bg-pass-bg text-pass",
  SIMULATED: "border border-dashed border-short text-short",
  "PRE-RECORDED": "border border-ink bg-ink text-paper",
  PENDING: "border border-dotted border-ink-3 bg-wash text-ink-2",
};

/**
 * Which badge kinds a page leaves undrawn (#66 D1). The judge page sets it per run: a recording says PRE-RECORDED once
 * in a banner, and a REAL amount is its explorer link pill. The badge is still derived in lib/receipt-view, only the
 * pill is hidden. The default hides nothing, so /receipt and every other page keep every badge.
 */
export const BadgePolicyContext = createContext({ hide: new Set() });

export function useBadgeHidden(kind) {
  return useContext(BadgePolicyContext).hide.has(kind);
}

/** Money badge, DESIGN.md section 6. `kind` is the badge derived in lib/receipt-view. PENDING means not moved yet. */
export function Badge({ kind, className = "" }) {
  const label = STYLE[kind] ? kind : "SIMULATED";
  const hidden = useBadgeHidden(label);
  if (hidden) return null;
  return (
    <span
      data-badge={label}
      className={`ml-1 inline-block rounded-[4px] px-[5px] py-px align-middle font-mono text-[10.5px] font-semibold tracking-[0.04em] ${STYLE[label]} ${className}`}
    >
      {label}
    </span>
  );
}

/** One badge per distinct kind, for totals that mix transfers. */
export function Badges({ kinds }) {
  const list = kinds?.length ? kinds : ["SIMULATED"];
  return list.map((k) => <Badge key={k} kind={k} />);
}
