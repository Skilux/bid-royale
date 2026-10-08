# `lib/verifier/` — deterministic signup verification

## Purpose

Turns signed signup events into verified signup counts and a signed verdict
per supplier. A module inside the Tender Board service, not an agent; the
Board signs the verdict. Deterministic —
no LLM, no judgement calls.

## Contract

- **Inputs:** signup events + shop public key + attribution map
  (session → supplier) + campaign window + per supplier: impressions served
  and promised signups per 1,000 + the gate (5 per 1,000).
- **Checks (all three must pass):**
  1. Signature valid (shop key)?
  2. Session ID attributed to this supplier?
  3. Timestamp within the campaign window?
- **Outputs (plan):** `VerifiedCounts { supplierId: count }` and
  `Verdict { supplierId, delivered, promised, verdict }`, signed by the
  Board.
  `verdict` = `Pass | ShortOfPromise | UnderGate`. `LostBid` is set by the
  Board before the auction and never reaches the verifier.
- **Verdict rule:** delivered ≥ promised → Pass; delivered ≥ 5 but below
  promised → ShortOfPromise; delivered < 5 → UnderGate. Delivered = verified
  signups per 1,000 impressions.
- **Rules:** bot signals (click bursts, datacenter ASNs) are supporting
  context for the dashboard only — never the verdict. The gate is crude on
  purpose; 5 per 1,000 is a policy choice. The verdict hash goes to the
  decision log. No Validator fee.

## Done when

Delivered 8 / 6 / 0 is reproduced exactly (TechBlog Pass, CodePodcast Short
of promise, DevNewsletter Under gate), and a tampered signature or
out-of-window event is rejected.
