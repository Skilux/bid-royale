import { createHash } from "node:crypto";
import { TENDER } from "../config.js";

/**
 * @typedef {Object} Bid  revealed sealed bid, the shape supplier agents produce
 * @property {string} supplier         supplier id, e.g. "techblog"
 * @property {number} price            bid price, tADA (this is also the award if the bid wins)
 * @property {number} impressions      impressions offered
 * @property {number} promisedPer1000  promised conversion in signups per 1,000 impressions (7 = 0.7%)
 * @property {string} salt             random secret used in the commit
 * @property {string} commit           SHA-256 hex from commit(), posted before the deadline
 * @property {number} committedAt      epoch ms when the Board received the commit
 *
 * @typedef {Object} AuctionTender
 * @property {number} budget
 * @property {number} gate
 * @property {number} bondRate
 * @property {number} bidFee
 * @property {number} [deadline]       epoch ms, commits after this are late. No deadline means no late bids.
 *
 * @typedef {"below_gate" | "hash_mismatch" | "late" | "invalid_schema"} RejectReason
 *
 * @typedef {Object} RankedBid
 * @property {string} supplier
 * @property {number} price
 * @property {number} impressions
 * @property {number} promisedPer1000
 * @property {number} pricePerSignup   price / (impressions / 1000 * promisedPer1000)
 * @property {boolean} accepted        true if the bid fit the budget fill
 * @property {number} [award]          only when accepted, equals price
 * @property {number} [bond]           only when accepted, bondRate * award
 *
 * @typedef {Object} AuctionResult
 * @property {RankedBid[]} ranking     all eligible bids, cheapest per promised signup first
 * @property {RankedBid[]} accepted    winners in ranking order
 * @property {{ supplier: string, reason: RejectReason }[]} rejected
 *
 * @typedef {Object} SupplierResult  one entry per winner, from the Board's signed verdict
 * @property {string} supplier
 * @property {"pass" | "short_of_promise" | "under_gate"} kind
 *
 * @typedef {Object} Allocation
 * @property {string} supplier
 * @property {number} share            0 to 1, shares sum to 1 (or all 0 when nobody qualifies)
 */

const round = (n) => Math.round(n * 1e6) / 1e6;

const isPositive = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

/** SHA-256 hex of the sealed bid fields. Suppliers post this before the deadline. */
export function commit({ price, impressions, promisedPer1000, salt }) {
  return createHash("sha256").update(`${price}|${impressions}|${promisedPer1000}|${salt}`).digest("hex");
}

export function pricePerSignup({ price, impressions, promisedPer1000 }) {
  return price / ((impressions / 1000) * promisedPer1000);
}

function validSchema(bid) {
  return (
    bid !== null &&
    typeof bid === "object" &&
    typeof bid.supplier === "string" &&
    bid.supplier.length > 0 &&
    isPositive(bid.price) &&
    isPositive(bid.impressions) &&
    isPositive(bid.promisedPer1000) &&
    typeof bid.salt === "string" &&
    bid.salt.length > 0 &&
    typeof bid.commit === "string" &&
    Number.isFinite(bid.committedAt)
  );
}

/** Rejection reason for a bid, or null if it is eligible. Check order: schema, late, hash, gate. */
function rejectionFor(bid, tender) {
  if (!validSchema(bid)) return "invalid_schema";
  if (tender.deadline !== undefined && bid.committedAt > tender.deadline) return "late";
  if (commit(bid) !== bid.commit.toLowerCase()) return "hash_mismatch";
  if (bid.promisedPer1000 < tender.gate) return "below_gate";
  return null;
}

/**
 * Sealed-bid evaluation: reject, rank cheapest per promised signup first, then fill the
 * budget (D11): accept a bid if the running total stays within budget, else skip it and continue.
 *
 * @param {{ tender?: AuctionTender, bids: Bid[] }} input
 * @returns {AuctionResult}
 */
export function evaluateBids({ tender = TENDER, bids }) {
  const rejected = [];
  const eligible = [];

  for (const bid of bids) {
    const reason = rejectionFor(bid, tender);
    if (reason) {
      rejected.push({ supplier: bid?.supplier ?? null, reason });
    } else {
      eligible.push({
        supplier: bid.supplier,
        price: bid.price,
        impressions: bid.impressions,
        promisedPer1000: bid.promisedPer1000,
        pricePerSignup: pricePerSignup(bid),
        accepted: false,
      });
    }
  }

  eligible.sort((a, b) => a.pricePerSignup - b.pricePerSignup || a.supplier.localeCompare(b.supplier));

  let total = 0;
  const accepted = [];
  for (const bid of eligible) {
    if (round(total + bid.price) <= tender.budget) {
      total = round(total + bid.price);
      bid.accepted = true;
      bid.award = bid.price;
      bid.bond = round(bid.price * tender.bondRate);
      accepted.push(bid);
    }
  }

  return { ranking: eligible, accepted, rejected };
}

/**
 * Round-2 allocation, shown on the receipt only (no chain ops). Rule: suppliers that
 * ended Under gate get 0, every other winner gets an equal share of the next budget.
 *
 * @param {SupplierResult[]} results
 * @returns {Allocation[]}
 */
export function roundTwo(results) {
  const kept = results.filter((r) => r.kind !== "under_gate");
  const share = kept.length ? round(1 / kept.length) : 0;
  return results.map((r) => ({ supplier: r.supplier, share: r.kind === "under_gate" ? 0 : share }));
}
