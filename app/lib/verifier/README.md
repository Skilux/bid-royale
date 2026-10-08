# `app/lib/verifier/` — deterministic signup verification

## Purpose

Turns signed signup events into verified signup counts and a signed verdict
per supplier. A module inside the Tender Board service, not an agent; the
Board signs the verdict. Deterministic —
no LLM, no judgement calls.

## Contract

- `verify(events, { window, shopPublicKey })` returns
  `{ verified: { supplier: count }, rejections: [{ eventId, supplier, reason }] }`.
  `shopPublicKey` is a KeyObject, PEM, or 64 hex chars of the raw key.
- **Checks, in order:** `malformed` (missing fields), `bad_signature` (shop key over
  `eventId|sessionId|supplier|ts`), `wrong_attribution` (the `<supplier>.<n>` session id names a
  different supplier), `outside_window` (start inclusive, end exclusive), `duplicate` (repeated
  eventId counts once).
- `buildVerdict({ supplier, verified, impressions, promised, award, gate, bondRate })` returns a
  `Verdict` (type in `settlement/plan.js`) with `hash` = SHA-256 of
  `[supplier, kind, delivered, promised, gate, award, bond]` as JSON and `signature` = Board
  Ed25519 over the hash, key derived from `BOARD_SIGNING_KEY`. `kind` comes from `classify`.
  `verifyVerdict(verdict, boardPublicKey)` re-checks both.
- Delivered = verified signups ÷ impressions × 1,000. Zero impressions gives delivered 0.
- **Rules:** bot signals are dashboard context only, never the verdict. No LLM. `LostBid` is set
  by the Board before the auction and never reaches the verifier. The verdict hash goes to the
  decision log.

## Done when

Delivered 8 / 6 / 0 is reproduced exactly (TechBlog pass, CodePodcast short of promise,
DevNewsletter under gate), and a tampered signature or out-of-window event is rejected.
Covered by `verifier.test.js`.
