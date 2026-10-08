# `lib/settlement/` — verdict → pay / forfeit / refund

## Purpose

Settlement engine of the Tender Board. Decides money movement per supplier
from the Board-signed verdict (`lib/verifier/`) and executes it via `lib/masumi/`.

## Contract

- **Inputs:** signed verdict per supplier (Pass / Short of promise / Under gate)
  with delivered, promised and gate (5 signups per 1,000 impressions); the
  award and bond escrow ids per winner; revealed bids.
- **Money per winner:** award (Consumer → Supplier) + bond (25% of award,
  Supplier → Board), REAL. Bid fees (4) settle in the background,
  SIMULATED first and REAL if time allows. 10 escrows total, 6 on the
  critical path.
- **Decision per supplier:**
  - **Pass** (delivered ≥ promised): supplier submits the result, withdraws
    the full award after `unlockTime`. Board authorizes a bond refund, supplier
    withdraws the full bond. → SETTLED
  - **Short of promise** (delivered ≥ 5 but < promised): supplier submits the
    result, withdraws the full award. Board withdraws the bond, then pays by plain transfer
    bond − forfeit to the supplier and the forfeit to the Consumer.
    Forfeit = bond × (promised − delivered) ÷ promised. → SETTLED
  - **Under gate** (delivered < 5): Consumer reclaims the award. Board
    withdraws the full bond after `unlockTime` and forwards it to the Consumer
    by plain transfer. → REFUNDED
  - **Lost bid**: no award, no bond; the bid fee is not returned.
- **Under-gate path A2 (open until the D9 dry run):** the supplier never
  submits a result; after `submitResultTime` the Consumer reclaims the award
  without a supplier signature. Fallback: Consumer `requestRefund`, supplier
  `authorizeRefund`. See `docs/masumi.md`.
- **Plain transfers:** escrows cannot split, so the bond remainder and the
  forfeit leave the Board as plain transfers. Trust assumption on the Board;
  it belongs in honest limitations.
- **Outputs:** settlement decisions + tx hashes + explorer links; data for
  the receipt (paid / refunded / forfeited) and the round-2 decision.
- **Rules:** never move money without a signed verdict; never call
  `submitResult` on Under gate; surface every tx hash to the UI ledger.

## Done when

TechBlog Pass (7 paid, 1.75 bond returned), CodePodcast Short of promise
(6 paid, 0.375 forfeited, 1.125 returned), DevNewsletter Under gate (7 back to
the Consumer, 1.75 forfeited). Consumer net −10.875 tUSDM for 14 verified
signups. All with real preprod tx hashes (or labelled simulated receipts
under the flag).
