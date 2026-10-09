"use client";

import { Badge, Badges } from "./Badge";
import { formatMoney } from "./format";
import { isLink, TxLink, TxPill, useTxPills } from "./TxLink";

/**
 * An amount with its badge. Pass `badge` for one transfer or `badges` (array) for a total.
 * A missing badge renders SIMULATED, never nothing. A PENDING amount is muted: it has not moved yet.
 * Pass `tx` ({ hash, url }) to add the explorer link of a REAL transaction. Where the view hides REAL pills (#66),
 * the amount and the short hash become one link pill instead. `dp` caps the decimals (default 4), `fixed` keeps trailing zeros.
 */
export function Money({ amount, badge, badges, sign = "", currency = "", tx = null, dp = 4, fixed = false, className = "" }) {
  const pills = useTxPills();
  const pending = badge === "PENDING" || (badges?.length === 1 && badges[0] === "PENDING");
  const text = `${sign}${formatMoney(amount, { dp, fixed })}${currency ? ` ${currency}` : ""}`;
  const asPill = pills && tx && isLink(tx.hash, tx.url);
  return (
    <span className={`tabular-nums ${pending ? "italic text-ink-3" : ""} ${className}`}>
      {asPill ? (
        <TxPill hash={tx.hash} url={tx.url}>
          {text}
        </TxPill>
      ) : (
        <>
          {text}
          {badges ? <Badges kinds={badges} /> : <Badge kind={badge} />}
          {tx ? <TxLink hash={tx.hash} url={tx.url} /> : null}
        </>
      )}
    </span>
  );
}
