# `lib/settlement/` — gate check → release / refund

## Purpose

Decides money movement per publisher and executes it via `lib/masumi/`.

## Contract

- **Inputs:** verified outcome counts, sealed bids (promised outcome rate +
  price), performance gate, signed policy cards.
- **Decision per publisher:**
  - measured outcomes vs **bid quote** AND vs **performance gate**
  - both pass → `release(escrowId)` → SETTLED
  - either fails → publisher agent authorizes refund → `requestRefund(escrowId)`
    → REFUNDED
- **Outputs:** settlement decisions + tx hashes + explorer links; data for
  the receipt (spent / refunded) and the round-2 allocation.
- **Rules:** binary settle (D1 default); never move money without a verified
  count; surface every tx hash to the UI ledger.

## Done when

TechBlog + CodePodcast release, DevNewsletter refunds — with real preprod
tx hashes (or labelled simulated receipts under the flag).
