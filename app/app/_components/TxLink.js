"use client";

import { useBadgePolicy } from "./Badge";

const short = (h) => (typeof h === "string" && h.length > 10 ? `${h.slice(0, 4)}…${h.slice(-4)}` : h);
const isLink = (hash, url) => Boolean(hash) && typeof url === "string" && /^https:\/\//.test(url);

/** Explorer link for a REAL transaction: `tx 8f3a…c21e ↗`. Renders nothing without a hash and an https url. */
export function TxLink({ hash, url, className = "" }) {
  if (!isLink(hash, url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`ml-1 whitespace-nowrap font-mono text-[10.5px] text-pass underline decoration-dotted underline-offset-2 hover:text-ink ${className}`}
    >
      tx {short(hash)} ↗
    </a>
  );
}

/**
 * A REAL amount as one highlighted link: `55 ↗ 8f3a…c21e` (#66 D2). The amount and the short hash share one click target.
 * It pulses once when it mounts, which is when its row turns REAL during playback (`pill-pulse` in globals.css, off under
 * reduced motion). `children` is the amount text.
 */
export function TxPill({ hash, url, children }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`View tx ${hash} on the Cardano preprod explorer`}
      data-tx-pill=""
      className="tx-pill inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border border-cobalt px-1.5 py-px align-middle font-semibold no-underline transition-colors hover:bg-cobalt hover:text-paper"
    >
      <span className="tabular-nums">{children}</span>
      <span className="font-mono text-[0.78em] font-medium opacity-90">↗ {short(hash)}</span>
    </a>
  );
}

/** True when the current view hides REAL pills, so a tx renders as the link pill. */
export function useTxPills() {
  return useBadgePolicy().hide.has("REAL");
}

export { isLink };
