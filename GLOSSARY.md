# Glossary

Canonical terms for this repo (spec v3.1: Notion "Ad Slot Auction: Money Flow, Step by Step" + "Ad Auction — Diagrams"). Use these, not the old ones.

## Actors

- **User NeoRack**: the human advertiser. NeoRack is a GPU neocloud.
- **Consumer agent**: the NeoRack Consumer agent. Publishes the tender, locks the awards, receives refunds and forfeits.
- **Supplier agent**: a role. Bids, serves impressions, posts a bond, submits results. Business type stays publisher: TechBlog, CodePodcast, DevNewsletter, GamingForum.
- **Tender Board**: our service, the middleman. Not an agent. Parts: Tender API, Auction engine, Verifier, Settlement engine. Collects bid fees, holds bonds, verifies delivery and signs the verdict per supplier. Must not be the same entity as the customer.
- **Verifier**: `app/lib/verifier`, a module inside the Tender Board service. Not an agent. Checks signature, attribution and time window, counts verified signups, and the Board signs the verdict per supplier. Its hash goes to the decision log. No LLM in the verdict.
- **Masumi escrow**: the on-chain escrow every payment goes through. Rails we do not rebuild.
- **NeoRack signup feed**: the source of signed signup events (simulated shop).
- **Wrapper UI**: the judge-facing UI: tender, bids, dashboard, receipt. Replaces "playground".

## Tender and bids

- **Tender**: the brief published by the Consumer agent to the Board. Example: "Budget 200 tADA, audience technical users, pay per verified signup."
- **Tender terms**: gate 5 signups per 1,000 impressions, bond 25% of award, budget 200 tADA. Replaces "policy card".
- **Outcome**: a verified signup. Replaces conversion and checkout.
- **Signed signup event**: a signup event signed by the shop key.
- **Sealed bid**: commit hash `SHA-256(price, impressions, promised signups, salt)` sent before the deadline. After close, suppliers reveal the plain bid plus salt, and the Board recomputes and rejects mismatches.
- **Promised**: signups per 1,000 impressions stated in the bid.
- **Delivered**: verified signups per 1,000 impressions.
- **Gate**: 5 signups per 1,000 impressions. Bids promising less are ineligible.
- **Price per promised signup**: bid ÷ (impressions ÷ 1,000 × promised per 1,000). Bids are sorted cheapest first and accepted while the running total stays within the budget (fill rule for a bid that does not fit is open).
- **Win chance (proposal)**: a supplier bids only if win chance × margin − 0.2 > 0. Win chance = clamp(2 − p ÷ R, 0, 1), p = own price per promised signup, R = highest winning price per signup in the last auction. Open.

## Money

- **tADA**: test ADA on Cardano preprod, the demo currency. Amounts are the spec ×10 (#24): Masumi transfers have a 2 ADA minimum and small escrows risk min-UTxO errors. Replaces tUSDM, which replaced €.
- **Award**: the winning bid price, locked by the Consumer in escrow. Supplier is seller.
- **Bond**: 25% × award, locked by a winner in escrow. Board is seller.
- **Bid fee**: 2 tADA per bidder, never returned. Board is seller. Stays with the Board as an anti-spam fee.
- **Forfeit**: bond × (promised − delivered) ÷ promised, for Short of promise. Escrows cannot split, so the remainder returns as a plain transfer, and the Board forwards the forfeit to the Consumer as a plain transfer (trust assumption on the Board).
- **Escrow count**: 10 per run. 3 awards and 3 bonds on the critical path, REAL. 4 bid fees in the background, SIMULATED first and REAL if time allows (PRD D13).

## Verdicts

- **Pass**: delivered ≥ promised. Full award paid, bond returned.
- **Short of promise**: gate ≤ delivered < promised. Full award paid, bond forfeited pro rata.
- **Under gate**: delivered < 5. Award back to the Consumer, full bond forfeited to the Consumer. Refund path A2 is open until the D9 preprod dry run.
- **Lost bid**: rejected before the auction (below the gate). Pays the bid fee only.

## Badges

- **REAL**: preprod tx plus explorer link.
- **SIMULATED**: labelled ledger, "simulated, no funds moved".
- **PRE-RECORDED**: canned replay.

## Removed

- **Arbiter**: removed. No arbiter exists.
- **Allocator agent**: replaced by the Tender Board service.
- **Validator agent, Validator fee**: removed in v3.1 (PRD D7). Verification runs inside the Tender Board.
- **x402 / Base Sepolia fallback**: removed. Masumi-only.
