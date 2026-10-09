import { formatAmount } from "./format";

const short = (h) => (typeof h === "string" && h.length > 10 ? `${h.slice(0, 4)}…${h.slice(-4)}` : h);
const isHttps = (url) => typeof url === "string" && /^https:\/\//.test(url);

/** Explorer link for a REAL transaction: `tx 8f3a…c21e ↗`. Renders nothing without a hash and an https url. */
export function TxLink({ hash, url, className = "" }) {
  if (!hash || !isHttps(url)) return null;
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
 * A REAL amount as one link pill (#66 D2): `55 ↗ 8f3a…c21e`, amount and short hash in one click target. It replaces
 * the REAL badge: a pill means the row is a REAL transaction you can check. It pulses once on mount, so a row turning
 * REAL during playback glows (off under prefers-reduced-motion, globals.css). Null without a hash and an https url.
 */
export function TxPill({ amount, hash, url, sign = "", currency = "", className = "" }) {
  if (!hash || !isHttps(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      data-badge-real="pill"
      title={`View tx ${hash} on the Cardano preprod explorer`}
      className={`tx-pill inline-flex cursor-pointer items-baseline gap-1 whitespace-nowrap rounded-full border border-cobalt px-1.5 py-px tabular-nums no-underline hover:bg-cobalt hover:text-paper ${className}`}
    >
      <span>
        {sign}
        {formatAmount(amount)}
        {currency ? ` ${currency}` : ""}
      </span>
      <span className="font-mono text-[0.8em] opacity-80">↗ {short(hash)}</span>
    </a>
  );
}
