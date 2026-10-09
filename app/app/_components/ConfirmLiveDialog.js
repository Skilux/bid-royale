"use client";

import { useEffect, useRef, useState } from "react";
import { fetchActiveRun } from "@/lib/run-source";
import { WATCH_RECORDING, activeRunLine, liveDialogCopy } from "@/lib/run-source/live-gate";
import { Badge } from "./Badge";

const BADGE = { real: "REAL", simulated: "SIMULATED", replay: "PRE-RECORDED" };
const action = "cursor-pointer rounded-[9px] px-5 py-2.5 text-[15px] font-semibold";

/**
 * The question Run live asks before anything is sent (#43). A native modal <dialog>: the browser traps focus inside,
 * Esc cancels, and focus returns to the Run live button. No animation, so reduced motion needs no special case.
 * On a real Board it first asks GET /api/run whether a live run is still settling, and then offers to attach to it
 * instead of starting another. A failed check does not block: the Board answers 409 to a second start anyway.
 */
export function ConfirmLiveDialog({ gate, kind }) {
  const copy = liveDialogCopy(kind);
  const ref = useRef(null);
  const focusRef = useRef(null);
  const [active, setActive] = useState(undefined);
  const open = gate.asking;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open || kind !== "real") return undefined;
    setActive(undefined);
    const ctrl = new AbortController();
    fetchActiveRun({ signal: ctrl.signal })
      .then((body) => setActive(body?.active ?? null))
      .catch(() => !ctrl.signal.aborted && setActive(null));
    return () => ctrl.abort();
  }, [open, kind]);

  useEffect(() => {
    if (open) focusRef.current?.focus();
  }, [open, active]);

  const checking = kind === "real" && active === undefined;

  return (
    <dialog
      ref={ref}
      aria-labelledby="live-title"
      aria-describedby="live-body"
      data-testid="live-dialog"
      onCancel={(e) => {
        e.preventDefault();
        gate.cancel();
      }}
      onClick={(e) => e.target === ref.current && gate.cancel()}
      className="m-auto w-[min(92vw,34rem)] max-h-[92vh] overflow-auto rounded-xl border border-line bg-card p-0 text-ink backdrop:bg-black/70"
    >
      <div className="p-5">
        <h2 id="live-title" className="font-display text-[22px] leading-tight">
          {copy.title}
          <Badge kind={BADGE[kind]} />
        </h2>
        <p id="live-body" className="mt-3 text-[14.5px] leading-relaxed">
          {copy.body}
        </p>
        {copy.timings.length > 0 ? (
          <ul className="mt-3 space-y-1 rounded-lg border border-dashed border-line px-3 py-2 text-[13px] text-ink-2" aria-label="What to expect">
            {copy.timings.map((t) => (
              <li key={t.at}>
                <b className="text-ink">{t.at}:</b> {t.what}
              </li>
            ))}
          </ul>
        ) : null}
        {checking ? (
          <p className="mt-3 text-[12.5px] text-ink-3" role="status">
            Checking whether a live run is already in flight…
          </p>
        ) : null}
        {active ? (
          <p className="mt-3 rounded-lg border border-short bg-wash px-3 py-2 text-[13.5px]" role="status" data-testid="live-active">
            A live run is already in flight: {activeRunLine(active)}. Starting another one locks more test ADA while it settles. Attach to it to watch it finish.
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          {active ? (
            <button type="button" ref={focusRef} className={`${action} bg-cobalt text-paper hover:opacity-90`} onClick={() => gate.attachTo(active.id)} data-testid="live-attach">
              Attach to {active.id}
            </button>
          ) : (
            <button type="button" className={`${action} bg-cobalt text-paper hover:opacity-90`} onClick={() => gate.confirm()} data-testid="live-confirm">
              {copy.confirm}
            </button>
          )}
          <button
            type="button"
            ref={active ? undefined : focusRef}
            className={`${action} border border-line bg-card hover:border-ink`}
            onClick={() => gate.watchInstead()}
            data-testid="live-watch"
          >
            {WATCH_RECORDING}
          </button>
        </div>
      </div>
    </dialog>
  );
}
