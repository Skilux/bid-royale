import { simulatedAdapter } from "./simulated";

/**
 * Contract shared with the real adapter (Masumi checkpoint 6):
 *   lockBidFee({ supplier, amount }) -> Receipt
 *   lockAward({ supplier, amount })  -> Receipt
 *   lockBond({ supplier, amount })   -> Receipt
 *   settle(verdict)                  -> Receipt[]
 *   getEscrowStatus(id)              -> escrow state string
 *
 * Until the real adapter lands, every call is simulated and badged SIMULATED,
 * whatever SIMULATE_PAYMENTS says.
 */
export function getAdapter() {
  return simulatedAdapter;
}
