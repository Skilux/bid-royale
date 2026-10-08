import { TENDER } from "../config.js";
import { bondFor, classify } from "../settlement/plan.js";
import { boardKey, eventPayload, sha256Hex, signText, toPublicKey, verifyText } from "../signing/index.js";

const round = (n) => Math.round(n * 1e6) / 1e6;

/** Sessions are issued as "<supplier>.<n>", so the session itself names the attributed supplier. */
export const attributedSupplier = (sessionId) => String(sessionId).split(".")[0];

/**
 * Three deterministic checks per event: shop signature, attribution, time window (start inclusive,
 * end exclusive). A repeated eventId is rejected so a replayed event cannot count twice.
 * Fields outside the signed payload (bot signals) are never read.
 *
 * @returns {{ verified: Record<string, number>, rejections: {eventId: string, supplier: string, reason: string}[] }}
 */
export function verify(events, { window, shopPublicKey }) {
  const publicKey = toPublicKey(shopPublicKey);
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const verified = {};
  const rejections = [];
  const seen = new Set();

  for (const e of events) {
    const reject = (reason) => rejections.push({ eventId: e?.eventId, supplier: e?.supplier, reason });
    if (!e || [e.eventId, e.sessionId, e.supplier, e.ts].some((v) => typeof v !== "string")) {
      reject("malformed");
      continue;
    }
    if (!verifyText(publicKey, eventPayload(e), e.signature)) reject("bad_signature");
    else if (attributedSupplier(e.sessionId) !== e.supplier) reject("wrong_attribution");
    else if (!(Date.parse(e.ts) >= start && Date.parse(e.ts) < end)) reject("outside_window");
    else if (seen.has(e.eventId)) reject("duplicate");
    else {
      seen.add(e.eventId);
      verified[e.supplier] = (verified[e.supplier] ?? 0) + 1;
    }
  }
  return { verified, rejections };
}

const verdictBody = (v) =>
  JSON.stringify([v.supplier, v.kind, v.delivered, v.promised, v.gate, v.award, v.bond]);

/**
 * Builds the Board-signed Verdict (type in settlement/plan.js).
 * delivered = verified signups / impressions * 1,000. hash = SHA-256 of the verdict fields,
 * signature = Board Ed25519 over the hash.
 */
export function buildVerdict({
  supplier,
  verified,
  impressions,
  promised,
  award,
  gate = TENDER.gate,
  bondRate = TENDER.bondRate,
  signingSecret,
}) {
  const delivered = impressions > 0 ? round((verified / impressions) * 1000) : 0;
  const verdict = {
    supplier,
    kind: classify({ delivered, promised, gate }),
    delivered,
    promised,
    gate,
    award,
    bond: bondFor(award, bondRate),
  };
  const hash = sha256Hex(verdictBody(verdict));
  const signature = signText(boardKey(signingSecret ?? process.env.BOARD_SIGNING_KEY), hash);
  return { ...verdict, hash, signature };
}

export function verifyVerdict(verdict, boardPublicKey) {
  return (
    sha256Hex(verdictBody(verdict)) === verdict.hash && verifyText(boardPublicKey, verdict.hash, verdict.signature)
  );
}
