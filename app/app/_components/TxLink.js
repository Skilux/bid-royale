const short = (h) => (typeof h === "string" && h.length > 10 ? `${h.slice(0, 4)}…${h.slice(-4)}` : h);

/** Explorer link for a REAL transaction: `tx 8f3a…c21e ↗`. Renders nothing without a hash and an https url. */
export function TxLink({ hash, url, className = "" }) {
  if (!hash || typeof url !== "string" || !/^https:\/\//.test(url)) return null;
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
