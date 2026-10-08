const STYLE = {
  REAL: "text-badge-real",
  SIMULATED: "text-badge-simulated",
  "PRE-RECORDED": "text-badge-prerecorded",
};

/** Money badge. `kind` is the derived badge from lib/receipt-view (REAL, SIMULATED or PRE-RECORDED). */
export function Badge({ kind, className = "" }) {
  const label = STYLE[kind] ? kind : "SIMULATED";
  return (
    <span
      data-badge={label}
      className={`ml-1 inline-block rounded-[4px] border border-current px-[5px] py-px align-middle text-[10.5px] font-semibold tracking-[0.04em] ${STYLE[label]} ${className}`}
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
