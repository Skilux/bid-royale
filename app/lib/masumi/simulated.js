import { createHash } from "node:crypto";
import { planSettlement } from "@/lib/settlement/plan";

/**
 * @typedef {"REAL" | "SIMULATED" | "PRE-RECORDED" | "PENDING"} Badge
 * PENDING: real Masumi operation submitted, no transaction yet; money has not moved.
 *
 * @typedef {Object} Receipt
 * @property {string} id
 * @property {Badge} badge
 * @property {string} action
 * @property {number} amount
 * @property {string} from
 * @property {string} to
 * @property {string} txHash
 * @property {string | null} explorerUrl   null for SIMULATED
 * @property {string} state                escrow state, e.g. FundsLocked, Withdrawn
 */

const ledger = new Map();

const hash = (...parts) => createHash("sha256").update(parts.join("|")).digest("hex");

function record({ action, amount, from, to, state }) {
  const txHash = `sim_${hash(action, amount, from, to).slice(0, 56)}`;
  /** @type {Receipt} */
  const receipt = {
    id: txHash,
    badge: "SIMULATED",
    action,
    amount,
    from,
    to,
    txHash,
    explorerUrl: null,
    state,
  };
  ledger.set(receipt.id, receipt);
  return receipt;
}

export const simulatedAdapter = {
  badge: "SIMULATED",

  async lockBidFee({ supplier, amount }) {
    return record({ action: "bid_fee", amount, from: supplier, to: "board", state: "FundsLocked" });
  },

  async lockAward({ supplier, amount }) {
    return record({ action: "award", amount, from: "consumer", to: supplier, state: "FundsLocked" });
  },

  async lockBond({ supplier, amount }) {
    return record({ action: "bond", amount, from: supplier, to: "board", state: "FundsLocked" });
  },

  /** @param {import("@/lib/settlement/plan").Verdict} verdict */
  async settle(verdict) {
    return planSettlement(verdict).map((t) =>
      record({
        action: t.reason,
        amount: t.amount,
        from: t.from,
        to: t.to,
        state: t.via === "escrow" ? "Withdrawn" : "TransferSent",
      }),
    );
  },

  async getEscrowStatus(id) {
    return ledger.get(id)?.state ?? "Unknown";
  },
};
