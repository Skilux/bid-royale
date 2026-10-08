# Money flow: one full run, step by step

Every step of a demo run in order: who acts, where it runs, which call (and
whose key), the amount, the escrow state, the measured time and the label.
Amounts are the spec ×10 in tADA (#24): Masumi's transfer endpoint has a 2 ADA
minimum and small escrows risk min-UTxO errors. Times were measured on Cardano
Preprod on 8 Oct 2026 (`docs/research/masumi-settlement-timing.md`, "Measured
on preprod" and "Fast (cooperative) paths, measured"). Nothing here is a
projection unless it says so.

## Where things run

| Platform | Role |
|---|---|
| Vercel (`https://ad-slot-auction.vercel.app`) | UI, Tender Board (auction, verifier, settlement), the 4 supplier brains, MIP-003 agent routes `/api/agents/<name>/…` (#37), Masumi REST client with one wallet-scoped ReadAndPay key per party |
| Railway | Masumi Payment Service 0.29.0 + Postgres: holds all wallets, signs and submits transactions, runs the background loops. Treasury worker (Admin key) for plain transfers (#29, not deployed yet: #42) |
| Cardano Preprod | V2 escrow contract `addr_test1wzqgalcd93sfjrc5tsc4ycwx80a8lt0s3767a4g8nh45lrg044nd9` holds locked tADA; registry entries for the 5 agents |
| Upstash Redis | Board state, agent job state, treasury dedupe |

See ADR 0002 (`docs/adr/0002-seller-agents-on-vercel.md`).

## Parties and wallets (V2 payment source)

| Party | Wallet | Pays | Receives |
|---|---|---|---|
| Consumer (NeoRack) | purchasing | 3 awards | Under-gate award refund, forfeits |
| Tender Board | selling | — | bid fees (SIMULATED), bonds it collects for forfeits |
| TechBlog, CodePodcast, DevNewsletter | selling + purchasing | bid fee, bond (purchasing) | award (selling), bond back |
| GamingForum | selling + purchasing | bid fee only (SIMULATED) | nothing: Lost bid |

All 5 agents (TechBlog, CodePodcast, DevNewsletter, GamingForum, Tender Board)
are registered on Preprod: `RegistrationConfirmed`, 6.5 min each.

## The amounts

| Item | tADA |
|---|---|
| Budget | 200 |
| Bid fee, per bidder (4 bidders) | 2 |
| Awards TechBlog / CodePodcast / DevNewsletter | 70 / 60 / 70 |
| Bonds, 25% of award | 17.5 / 15 / 17.5 |
| CodePodcast forfeit (Short of promise): 15 × (8 − 6) ÷ 8 | 3.75 |
| CodePodcast bond remainder | 11.25 |
| DevNewsletter forfeit (Under gate): full bond | 17.5 |
| Consumer net for 14 verified signups (8 + 6) | **−108.75** (about 7.77 per signup) |

Consumer net = −200 awards + 70 DevNewsletter award back + 3.75 + 17.5
forfeits = −108.75. The gate is unchanged: 5 signups per 1,000 impressions.

## The flow

"Seller" and "buyer" are Masumi's roles on one escrow. Every lock is two calls:
the seller creates terms with `POST /payment` using the seller's key (no funds
move), then the buyer locks with `POST /purchase` using the buyer's key. The
Payment Service on Railway signs and submits; the contract holds the money.

| # | Step | Who | Where | Call (whose key) | Amount (tADA) | Escrow state | Measured time | Label |
|---|---|---|---|---|---|---|---|---|
| 1 | Brief + tender | Consumer → Board | Vercel | Board API, no Masumi call | — | — | seconds | no money |
| 2 | Discovery | Board → 4 suppliers | Vercel → Vercel | `POST /registry-entry-search` (Board key), read each `apiBaseUrl`, `POST <apiBaseUrl>/tender-invite` | — | — | seconds | no money |
| 3 | Sealed bids | each supplier → Board | Vercel | commit hash, then reveal; Board recomputes and rejects mismatches | 4 bid fees × 2 = 8 | none (ledger only) | seconds | **SIMULATED** |
| 4 | Allocation | Board | Vercel | rank by price per promised signup, fill the budget (D11); GamingForum is below the gate | 70 + 60 + 70 = 200 | — | seconds | no money |
| 5a | Award locks (3, in parallel) | Consumer → each winner | Vercel → Railway → Preprod | supplier `POST /payment` (supplier key), Consumer `POST /purchase` (Consumer key) | 70 / 60 / 70 | `FundsLocked` | 1.6–3.2 min | **PENDING** until the tx hash exists, then **REAL** + explorer link |
| 5b | Bond locks (3, in parallel with 5a) | each winner → Board | Vercel → Railway → Preprod | Board `POST /payment` (Board key), supplier `POST /purchase` (supplier key) | 17.5 / 15 / 17.5 | `FundsLocked` | 1.6–3.2 min | **PENDING**, then **REAL** |
| 6 | Traffic, signups, verifier | shop, Board | Vercel, off-chain | signed signup events, verifier checks signature + attribution + window; Board signs one verdict per supplier | — | unchanged | seconds | traffic **SIMULATED** |
| 7 | Settlement per verdict | see below | Vercel `settle` + `advance` → Railway → Preprod | see below | see below | see below | see below | **REAL** (escrow), **PENDING** (treasury, until #42) |
| 8 | Receipt + ledger | Board → Consumer | Vercel | — | Consumer net −108.75 for 14 signups | all escrows terminal | — | every row badged |

### Step 7: settlement per verdict

**Pass, TechBlog (delivered 8 of 7 promised)**

| Escrow | Calls in order (whose key) | Money moves | States | Measured |
|---|---|---|---|---|
| Award 70 (early release) | TechBlog `submit-result` (TechBlog) → Consumer `request-refund` (Consumer) → Consumer `cancel-refund-request` (Consumer) → node pays out | 70 to TechBlog | `FundsLocked` → `ResultSubmitted` → `Disputed` → `WithdrawAuthorized` → `Withdrawn` | 13.1 min |
| Bond 17.5 (cooperative return) | TechBlog `request-refund` (TechBlog) → Board `authorize-refund` (Board) | 17.5 back to TechBlog | `FundsLocked` → `RefundRequested` → `RefundWithdrawn` | 4.7 min |

**Short of promise, CodePodcast (delivered 6 of 8)**

| Escrow | Calls in order (whose key) | Money moves | States | Measured |
|---|---|---|---|---|
| Award 60 (early release) | same as Pass: CodePodcast `submit-result` → Consumer `request-refund` → Consumer `cancel-refund-request` | 60 to CodePodcast | as Pass | 13.1 min (as Pass) |
| Bond 15 (Board collects by early release) | Board `submit-result` (Board) → CodePodcast `request-refund` (CodePodcast) → CodePodcast `cancel-refund-request` (CodePodcast) | 15 to the Board | as Pass | 13.1 min (same path as the award) |
| Treasury transfers (not escrows) | treasury worker, Admin key, only for a Board-signed verdict, after the bond is `Withdrawn` | 3.75 to the Consumer, 11.25 to CodePodcast | — | not measured yet |

**Under gate, DevNewsletter (delivered 0 of 12)**

| Escrow | Calls in order (whose key) | Money moves | States | Measured |
|---|---|---|---|---|
| Award 70 (cooperative refund) | Consumer `request-refund` (Consumer) → DevNewsletter `authorize-refund` (DevNewsletter) | 70 back to the Consumer | `FundsLocked` → `RefundRequested` → `RefundWithdrawn` | 5.9 min |
| Award fallback (A2) | none: DevNewsletter never submits, the node refunds after the submit-result deadline | 70 back to the Consumer | `FundsLocked` → `RefundWithdrawn` | 27.8 min |
| Bond 17.5 (Board collects by early release) | as CodePodcast's bond | 17.5 to the Board | as Pass | 13.1 min |
| Treasury transfer | treasury worker, Board-signed verdict required | 17.5 to the Consumer | — | not measured yet |

**Lost bid, GamingForum (promised 4 per 1,000, below the gate)**: no escrow.
Only the 2 tADA bid fee, SIMULATED, not returned.

## How long a full run takes

About **15 min** end to end, measured per path:

- Locks: ~2–3 min, all 6 in parallel.
- Verdicts: seconds.
- Settlement: the longest step is the early release, ~13 min. Everything else
  (bond return 4.7 min, cooperative refund 5.9 min) runs in parallel inside it.
- Treasury transfers start once a bond is `Withdrawn`; their time is not
  measured yet (#42).
- Slow timer paths stay as automatic fallbacks: release after the unlock time
  **45.5 min**, refund after the submit-result deadline (A2) **27.8 min**.

## Honest labelling

- The early release passes through **`Disputed`** on-chain before the buyer
  authorizes the payout. That is the V2 contract's buyer-approved release, not a
  real dispute. The explorer shows it, so we say it.
- Treasury transfers (forfeits, bond remainder) are plain transfers, not
  escrows: a trust assumption on the Board, and only for a Board-signed verdict.
  Badge **PENDING** until the worker is deployed (#42), **REAL** with a tx hash
  after.
- Bid fees are **SIMULATED** (labelled ledger rows). Traffic is **SIMULATED**.
  Anything replayed in canned mode is **PRE-RECORDED**.
- Awards, bonds and their settlement are **REAL** once a tx hash exists, with
  `https://preprod.cardanoscan.io/transaction/<hash>`; **PENDING** before.
