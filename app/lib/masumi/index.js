import { simulatedAdapter } from "@/lib/masumi/simulated";
import { createRealAdapter, realAdapter } from "@/lib/masumi/real";
import { getFlags } from "@/lib/config";
import { createTreasuryClient } from "@/lib/masumi/treasury-client";

let treasuryAdapter;

/**
 * Contract shared with the real adapter (Masumi checkpoint 6):
 *   lockBidFee({ supplier, amount, commit }) -> Receipt   (real: commit is the escrow inputHash)
 *   lockAward({ supplier, amount })  -> Receipt
 *   lockBond({ supplier, amount })   -> Receipt
 *   settle(verdict)                  -> Receipt[]
 *   getEscrowStatus(id)              -> escrow state string
 *
 * Real only for explicit SIMULATE_PAYMENTS=false; otherwise safely simulated.
 * TREASURY_URL + TREASURY_TOKEN wire the plain-transfer worker when both are set.
 * Real operations without a transaction hash have badge PENDING.
 * Real advance(receipt.id) progresses pending refund/result steps without waiting.
 * Real receipts carry a portable polling id; settlement can accept
 * awardEscrowId/bondEscrowId to resume across serverless invocations.
 */
export function getAdapter() {
  const { simulatePayments } = getFlags();
  if (simulatePayments || process.env.SIMULATE_PAYMENTS !== "false") return simulatedAdapter;
  if (!process.env.TREASURY_URL || !process.env.TREASURY_TOKEN) return realAdapter;
  treasuryAdapter ??= createRealAdapter({ treasury: createTreasuryClient() });
  return treasuryAdapter;
}
