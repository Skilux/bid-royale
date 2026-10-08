const STYLE = {
  pass: "border-pass bg-pass-bg text-pass",
  short_of_promise: "border-short bg-short-bg text-short",
  under_gate: "border-under bg-under text-white",
  lost_bid: "border-line text-ink-3 line-through",
  escrowed: "border-cobalt text-cobalt",
};

/** The only verdict states, DESIGN.md section 7: Pass, Short of promise, Under gate, Lost bid. Plus Escrowed before a verdict. */
export function VerdictChip({ kind, label }) {
  if (!STYLE[kind]) return null;
  return (
    <span
      data-verdict={kind}
      className={`inline-block rounded-[5px] border px-2 py-[3px] font-display text-[11px] uppercase tracking-[0.1em] ${STYLE[kind]} ${kind === "under_gate" ? "shadow-[0_0_14px_var(--color-under)]" : ""}`}
    >
      {label}
    </span>
  );
}
