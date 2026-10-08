import { EVENTS } from "../board/events.js";
import { deriveBadge } from "../receipt-view/index.js";

/**
 * Which money token flies for one Board event, if any. Paths: "award" Consumer to escrow, "bond" supplier to escrow,
 * "payout" escrow to supplier, "back" escrow to Consumer. A token flies only when money actually moved: a PENDING row
 * has no token, and the same receipt never flies twice (the caller keeps the ids it has shown).
 * `amountOf(id)` finds the amount of a row for settlement.progress, which carries none.
 */
export function coinFor(event, { mode = "live", amountOf = () => null } = {}) {
  const d = event?.data ?? {};
  if (!d.supplier) return null;

  let receipt = null;
  let phase = null;
  if (event.name === EVENTS.escrowLocked) {
    receipt = { ...d.receipt, action: d.receipt?.action ?? d.kind };
    phase = "lock";
  } else if (event.name === EVENTS.settlementTransfer) {
    receipt = d.receipt;
    phase = "settlement";
  } else if (event.name === EVENTS.settlementProgress) {
    receipt = { id: d.receiptId, action: d.action, badge: d.badge, txHash: d.txHash, amount: amountOf(d.receiptId) };
    phase = d.phase === "lock" ? "lock" : "settlement";
  } else return null;

  if (!receipt?.id || !Number.isFinite(receipt.amount)) return null;
  const badge = deriveBadge({ badge: receipt.badge, txHash: receipt.txHash }, { mode });
  if (badge === "PENDING") return null;

  const path = {
    award: "award",
    bond: "bond",
    award_release: "payout",
    bond_return: "payout",
    bond_forfeit: "back",
    award_reclaim: "back",
  }[receipt.action];
  if (!path) return null;
  if (phase === "lock" && path !== "award" && path !== "bond") return null;
  if (phase === "settlement" && (path === "award" || path === "bond")) return null;

  return { id: receipt.id, supplier: d.supplier, path, amount: receipt.amount, badge, hero: receipt.action === "award_reclaim" };
}
