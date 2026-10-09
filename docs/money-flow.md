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
| Railway | Masumi Payment Service 0.29.0 + Postgres: holds all wallets, signs and submits transactions, runs the background loops. Treasury worker (Admin key) for plain transfers (#29), deployed 8 Oct at `https://treasury-worker-production-cce6.up.railway.app` |
| Cardano Preprod | V2 escrow contract `addr_test1wzqgalcd93sfjrc5tsc4ycwx80a8lt0s3767a4g8nh45lrg044nd9` holds locked tADA; registry entries for the 5 agents |
| Upstash Redis | Board state, agent job state, treasury dedupe |

See ADR 0002 (`docs/adr/0002-seller-agents-on-vercel.md`).

## Parties and wallets (V2 payment source)

| Party | Wallet | Pays | Receives |
|---|---|---|---|
| Consumer (NeoRack) | purchasing | 3 awards | Under-gate award refund, forfeits |
| Tender Board | selling | — | bid fees, bonds it collects for forfeits |
| TechBlog, CodePodcast, DevNewsletter | selling + purchasing | bid fee, bond (purchasing) | award (selling), bond back |
| GamingForum | selling + purchasing | bid fee only | nothing: Lost bid |

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
| 3 | Sealed bids | each supplier → Board | Vercel + payment node | commit hash is the bid-fee escrow's `inputHash`, then reveal; Board recomputes and rejects a reveal that does not match the escrow | 4 bid fees × 2 = 8 | 4 bid-fee escrows (Board seller, supplier buyer); the Board collects each by `submit-result` + early release | lock ~2–3 min in parallel, collect ~13 min inside settlement | **REAL** (#50; `MASUMI_BID_FEES=simulated` falls back to SIMULATED) |
| 4 | Allocation | Board | Vercel | rank by price per promised signup, fill the budget (D11); GamingForum is below the gate | 70 + 60 + 70 = 200 | — | seconds | no money |
| 5a | Award locks (3, in parallel) | Consumer → each winner | Vercel → Railway → Preprod | supplier `POST /payment` (supplier key), Consumer `POST /purchase` (Consumer key) | 70 / 60 / 70 | `FundsLocked` | 1.6–3.2 min | **PENDING** until the tx hash exists, then **REAL** + explorer link |
| 5b | Bond locks (3, in parallel with 5a) | each winner → Board | Vercel → Railway → Preprod | Board `POST /payment` (Board key), supplier `POST /purchase` (supplier key) | 17.5 / 15 / 17.5 | `FundsLocked` | 1.6–3.2 min | **PENDING**, then **REAL** |
| 6 | Traffic, signups, Board verifier | shop, Board | Vercel, off-chain | signed signup events, the Board verifier (deterministic, inside the Board, no separate Validator agent) checks signature + attribution + window; Board signs one verdict per supplier. A winner may post a delivery report (#51), context only | — | unchanged | seconds | traffic **SIMULATED** |
| 7 | Settlement per verdict, driven by the reconciler (#49) | see below | Vercel `settle` + `advance` → Railway → Preprod | see below | see below | see below | see below | **REAL** (escrow and treasury, once a tx hash exists) |
| 8 | Receipt + ledger | Board → Consumer | Vercel | — | Consumer net −108.75 for 14 signups | all escrows terminal | — | every row badged |

### Step 7: settlement per verdict

Every `submit-result` in this step carries the result hash `sha256(canonical delivery report + verdict hash)` (#51). The
report is the supplier's delivery report, or the scripted one the Board builds when a winner posts none. If a run has no
report, the verdict hash alone is anchored. The reconciler (`app/lib/board/reconcile.js`, #49) advances every escrow below
until it is terminal, and the Railway treasury worker triggers it every 30 s, so no browser has to stay open.

**Pass, TechBlog (delivered 8 of 7 promised)**

| Escrow | Calls in order (whose key) | Money moves | States | Measured |
|---|---|---|---|---|
| Award 70 (early release) | TechBlog `submit-result` (TechBlog) → Consumer `request-refund` (Consumer) → Consumer `cancel-refund-request` (Consumer) → node pays out | 70 to TechBlog | `FundsLocked` → `ResultSubmitted` → `Disputed` → `WithdrawAuthorized` → `Withdrawn` | 13.0 min (`run_c1f40522`) |
| Bond 17.5 (cooperative return) | TechBlog `request-refund` (TechBlog) → Board `authorize-refund` (Board) | 17.5 back to TechBlog | `FundsLocked` → `RefundRequested` → `RefundWithdrawn` | 6.8 min (`run_c1f40522`) |

**Short of promise, CodePodcast (delivered 6 of 8)**

| Escrow | Calls in order (whose key) | Money moves | States | Measured |
|---|---|---|---|---|
| Award 60 (early release) | same as Pass: CodePodcast `submit-result` → Consumer `request-refund` → Consumer `cancel-refund-request` | 60 to CodePodcast | as Pass | 13.0 min (as Pass, `run_c1f40522`) |
| Bond 15 (Board collects by early release) | Board `submit-result` (Board) → CodePodcast `request-refund` (CodePodcast) → CodePodcast `cancel-refund-request` (CodePodcast) | 15 to the Board | as Pass | 13.0 min (inferred from the award release in `run_c1f40522`, same path) |
| Treasury transfers (not escrows) | treasury worker, Admin key, only for a Board-signed verdict, after the bond is `Withdrawn` | 3.75 to the Consumer, 11.25 to CodePodcast | — | bond remainder 16.1 min; the sub-2-tADA forfeit was refused (`BelowMinimum`, #62), `run_c1f40522` |

**Under gate, DevNewsletter (delivered 0 of 12)**

| Escrow | Calls in order (whose key) | Money moves | States | Measured |
|---|---|---|---|---|
| Award 70 (cooperative refund) | Consumer `request-refund` (Consumer) → DevNewsletter `authorize-refund` (DevNewsletter) | 70 back to the Consumer | `FundsLocked` → `RefundRequested` → `RefundWithdrawn` | 5.7 min (`run_c1f40522`) |
| Award fallback (A2) | none: DevNewsletter never submits, the node refunds after the submit-result deadline | 70 back to the Consumer | `FundsLocked` → `RefundWithdrawn` | 27.8 min |
| Bond 17.5 (Board collects by early release) | as CodePodcast's bond | 17.5 to the Board | as Pass | 13.0 min (inferred, as CodePodcast's bond) |
| Treasury transfer | treasury worker, Board-signed verdict required | 17.5 to the Consumer | — | 17.0 min (`run_c1f40522`) |

**Lost bid, GamingForum (promised 4 per 1,000, below the gate)**: no escrow.
Only the 2 tADA bid fee, REAL, not returned: the Board collects it like every
other bid fee.

## How long a full run takes

Measured on the recorded production run `run_c1f40522` (9 Oct 2026, Prague time, event log, #45). Money was REAL
within **17.0 min** of settlement start for 20 of 21 rows. The run itself ended at **40.1 min**, because the
CodePodcast forfeit of 1.964286 tADA was refused by the treasury (`BelowMinimum`, bug #62) and the 40-min timer
fallback closed the run. With the #62 fix on `main` that wait disappears.

| Step | Start (Prague) | Duration (minutes after settlement start unless noted) |
|---|---|---|
| Tender, bids, allocation, locks submitted, feed, verification, verdicts signed | 01:45:43 | 10.4 s in total (bids 7.0 s, locks submitted 1.6 s) |
| Settlement start (Board begins to poll the node) | 01:45:54 | 0 |
| All 10 locks (6 awards and bonds, 4 bid fees) `FundsLocked`, REAL | 01:45:51 | 2.1 min (first poll that saw them) |
| Under-gate award back to the Consumer (cooperative refund), REAL | 01:45:54 | 5.7 min |
| Pass bond return (cooperative), REAL | 01:45:54 | 6.8 min |
| Early release of both awards (TechBlog, CodePodcast), REAL | 01:45:54 | 13.0 min |
| Bid fees collected by the Board, REAL | 01:45:54 | first 13.0 min, last 15.1 min |
| Treasury: CodePodcast bond remainder 11.785714 to CodePodcast, REAL | 01:45:54 | 16.1 min |
| Treasury: DevNewsletter bond forfeit 15 to the Consumer, REAL | 01:45:54 | 17.0 min |
| Treasury: CodePodcast forfeit 1.964286 refused, stays PENDING | 01:45:54 | first refused at 15.4 min, never REAL |
| Timer-fallback completion (`settlement.completed`, then receipt) | 01:45:54 | 40.1 min |

- Lock, refund and release times are the first poll that saw the final state, so they can be up to one poll
  interval (30–90 s) late.
- The longest step is the early release, 13.0 min. The cooperative refund and bond return run in parallel inside it.
- Treasury transfers start once a bond is `Withdrawn`: 16.1 and 17.0 min in this run (#31 asked for this number).
- Slow timer paths stay as automatic fallbacks and were **not** exercised in this run. Measured in the 8 Oct
  isolated test: release after the unlock time **45.5 min**, refund after the submit-result deadline (A2) **27.8 min**.
- Earlier isolated paths (8 Oct): early release 13.1 min, cooperative refund 5.9 min, bond return 4.7 min.
  The Pass bond return took longer in the full run (6.8 min); the cause was not investigated.

## Honest labelling

- The early release passes through **`Disputed`** on-chain before the buyer
  authorizes the payout. That is the V2 contract's buyer-approved release, not a
  real dispute. The explorer shows it, so we say it.
- Treasury transfers (forfeits, bond remainder) are plain transfers, not
  escrows: a trust assumption on the Board, and only for a Board-signed verdict.
  Badge **PENDING** until the transfer has a tx hash, **REAL** with an explorer
  link after.
- Bid fees are **REAL** escrows (#50, inputHash = the bid's commit), **PENDING** until
  the lock and the Board's collection have tx hashes; **SIMULATED** only if the
  fallback flag is set. Traffic is **SIMULATED**.
  Anything replayed in canned mode is **PRE-RECORDED**. The judge URL replays
  the one real recorded run (#45), with its time cut labelled and its REAL tx
  links kept. There is no separate warm run (#30).
- Awards, bonds and their settlement are **REAL** once a tx hash exists, with
  `https://preprod.cardanoscan.io/transaction/<hash>`; **PENDING** before.
