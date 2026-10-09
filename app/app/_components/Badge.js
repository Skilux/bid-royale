"use client";

import { createContext, useContext } from "react";

const STYLE = {
  REAL: "border border-pass bg-pass-bg text-pass",
  SIMULATED: "border border-dashed border-short text-short",
  "PRE-RECORDED": "border border-ink bg-ink text-paper",
  PENDING: "border border-dotted border-ink-3 bg-wash text-ink-2",
};

/**
 * Which badge kinds the current view draws. The badge is still derived in lib/receipt-view, so this only changes
 * rendering (#66 D1, D2): a recording hides REAL and PRE-RECORDED, a live real run hides REAL, a simulated run hides nothing.
 * A hidden REAL amount is drawn as a link pill by Money instead. The default hides nothing, so /receipt is unchanged.
 */
export const BadgePolicyContext = createContext({ hide: new Set() });
export const useBadgePolicy = () => useContext(BadgePolicyContext);

/** Money badge, DESIGN.md section 6. `kind` is the badge derived in lib/receipt-view. PENDING means not moved yet. */
export function Badge({ kind, className = "" }) {
  const { hide } = useBadgePolicy();
  const label = STYLE[kind] ? kind : "SIMULATED";
  if (hide.has(label)) return null;
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
