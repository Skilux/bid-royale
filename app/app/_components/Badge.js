const STYLE = {
  REAL: "border border-pass bg-pass-bg text-pass",
  SIMULATED: "border border-dashed border-short text-short",
  "PRE-RECORDED": "border border-ink bg-ink text-white",
  PENDING: "border border-dotted border-ink-3 bg-wash text-ink-2",
};

/** Money badge, DESIGN.md section 6. `kind` is the badge derived in lib/receipt-view. PENDING means not moved yet. */
export function Badge({ kind, className = "" }) {
  const label = STYLE[kind] ? kind : "SIMULATED";
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
