"use client";

import { Badge, Badges, useBadgeHidden } from "./Badge";
import { formatAmount } from "./format";
import { TxLink, TxPill } from "./TxLink";

/**
 * An amount with its badge. Pass `badge` for one transfer or `badges` (array) for a total.
 * A missing badge renders SIMULATED, never nothing. A PENDING amount is muted: it has not moved yet.
 * Pass `tx` ({ hash, url }) to add the explorer link of a REAL transaction. Where the page hides the REAL badge
 * (#66 D2), a REAL amount with a tx renders as one link pill instead of amount + badge + link.
 */
export function Money({ amount, badge, badges, sign = "", currency = "", tx = null, className = "" }) {
  const pillOnly = useBadgeHidden("REAL");
  const pending = badge === "PENDING" || (badges?.length === 1 && badges[0] === "PENDING");
  if (pillOnly && badge === "REAL" && tx) {
    return <TxPill amount={amount} hash={tx.hash} url={tx.url} sign={sign} currency={currency} className={className} />;
  }
  return (
    <span className={`tabular-nums ${pending ? "italic text-ink-3" : ""} ${className}`}>
      {sign}
      {formatAmount(amount)}
      {currency ? ` ${currency}` : ""}
      {badges ? <Badges kinds={badges} /> : <Badge kind={badge} />}
      {tx ? <TxLink hash={tx.hash} url={tx.url} /> : null}
    </span>
  );
}
