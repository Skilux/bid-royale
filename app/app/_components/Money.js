import { Badge, Badges } from "./Badge";
import { formatAmount } from "./format";

/**
 * An amount with its badge. Pass `badge` for one transfer or `badges` (array) for a total.
 * A money element without a badge is a bug, so a missing badge renders SIMULATED, never nothing.
 */
export function Money({ amount, badge, badges, sign = "", currency = "", className = "" }) {
  return (
    <span className={`tabular-nums ${className}`}>
      {sign}
      {formatAmount(amount)}
      {currency ? ` ${currency}` : ""}
      {badges ? <Badges kinds={badges} /> : <Badge kind={badge} />}
    </span>
  );
}
