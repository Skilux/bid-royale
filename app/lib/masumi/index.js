import { simulatedAdapter } from "@/lib/masumi/simulated";
import { realAdapter } from "@/lib/masumi/real";
import { getFlags } from "@/lib/config";

/**
 * Contract shared with the real adapter (Masumi checkpoint 6):
 *   lockBidFee({ supplier, amount }) -> Receipt
 *   lockAward({ supplier, amount })  -> Receipt
 *   lockBond({ supplier, amount })   -> Receipt
 *   settle(verdict)                  -> Receipt[]
 *   getEscrowStatus(id)              -> escrow state string
 *
 * Real only for explicit SIMULATE_PAYMENTS=false; otherwise safely simulated.
 * Real operations without a transaction hash have badge PENDING.
 * Real advance(receipt.id) progresses pending refund/result steps without waiting.
 * Real receipts carry a portable polling id; settlement can accept
 * awardEscrowId/bondEscrowId to resume across serverless invocations.
 */
export function getAdapter() {
  const { simulatePayments } = getFlags();
  return !simulatePayments && process.env.SIMULATE_PAYMENTS === "false" ? realAdapter : simulatedAdapter;
}
