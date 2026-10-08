# `lib/verifier/` — deterministic outcome verification

## Purpose

Turns signed conversion events into verified outcome counts. Deterministic —
no LLM, no judgement calls.

## Contract

- **Inputs:** conversion events + shop public key + attribution map
  (session → publisher) + campaign window.
- **Checks (all three must pass):**
  1. Signature valid (shop key)?
  2. Session ID attributed to this publisher?
  3. Timestamp within the campaign window?
- **Outputs:** `VerifiedCounts { publisherId: count }`.
- **Rules:** bot signals (click bursts, datacenter ASNs) are supporting
  context for the dashboard only — never the verdict. The gate is crude on
  purpose; the threshold is a policy choice (default ≥5 / 1k).

## Done when

8 / 6 / 0 counts are reproduced exactly, and a tampered signature or
out-of-window event is rejected.
