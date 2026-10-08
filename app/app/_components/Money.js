import { Badge, Badges } from "./Badge";
import { formatAmount } from "./format";
import { TxLink } from "./TxLink";

/**
 * An amount with its badge. Pass `badge` for one transfer or `badges` (array) for a total.
 * A missing badge renders SIMULATED, never nothing. A PENDING amount is muted: it has not moved yet.
 * Pass `tx` ({ hash, url }) to add the explorer link of a REAL transaction.
 */
export function Money({ amount, badge, badges, sign = "", currency = "", tx = null, className = "" }) {
  const pending = badge === "PENDING" || (badges?.length === 1 && badges[0] === "PENDING");
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
