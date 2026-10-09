# Ad Slot Auction

**From Dusk Till Dawn #01, Agentic Economy track (8–9 Oct 2026, Prague)**

The NeoRack Consumer agent publishes a tender, Supplier agents bid for the
budget in a sealed-bid auction, and the Consumer pays only for verified signups.
*Don't pay for impressions. Pay for outcomes.*

> Track rule: "An agent completes a transaction scenario with a visible outcome.
> A sandbox transaction counts; a simulated payment must be labelled."

Status as of 9 Oct 2026, read from `main` at `05bf1d1`. Nothing below claims a
deployed state: the judge URL and its `/api/health` response were not checked
when this page was written.

- Scenario spec: Notion (Ad Slot Auction PRD v3.1, "Ad Slot Auction: Money Flow, Step by Step", "Ad Auction — Diagrams"). `docs/` is the technical subset, not a mirror.
- Terms: [`GLOSSARY.md`](GLOSSARY.md). Build rules: [`AGENTS.md`](AGENTS.md).
- Money flow per run, every call, amount and measured time: [`docs/money-flow.md`](docs/money-flow.md)

## What is REAL, SIMULATED, PRE-RECORDED

Every money element in the UI carries one of these badges. A payment without a
badge is a bug. Source: [`docs/honest-limitations.md`](docs/honest-limitations.md).

| Part of a run | Label | Notes |
|---|---|---|
| 3 award escrows (65 / 55 / 60 tADA in the recorded run) | **REAL**, tx hashes in the recorded run | Masumi preprod (Cardano testnet). **PENDING** until a hash exists. Hashes: [proof table](#real-transaction-proof) |
| 3 bond escrows (16.25 / 13.75 / 15 tADA in the recorded run) | **REAL**, tx hashes in the recorded run | Same rail, same rule |
| Settlement per verdict (release, refund, bond return) | **REAL**, tx hashes in the recorded run | All three verdict branches settled on preprod. [`docs/money-flow.md`](docs/money-flow.md), step 7 |
| Forfeit and bond-remainder transfers | **REAL** once a tx hash exists | Plain transfers from the Board treasury, not escrow outputs. Recorded run: 2 REAL with a hash, node status `Pending`; 1 forfeit of 1.964286 tADA not sent, PENDING (#62) |
| 4 bid fees (2 tADA each) | **REAL**, tx hashes in the recorded run | Escrow input hash = the sealed bid's commit; the Board collected all 4. Fallback flag: SIMULATED, not used in the recorded run |
| NeoRack shop, signups, traffic and impressions | **SIMULATED** | Signed signup events from a simulated shop, "no funds moved" |
| DevNewsletter's zero signups | **SIMULATED** | Scripted. The verdict mechanism is what is on show |
| Round 2 reallocation | **SIMULATED** | Shown on the receipt, no chain operations |
| Supplier registration, agent identifiers | **REAL** | 5 agents registered on Preprod, see [`docs/plan/lane-masumi.md`](docs/plan/lane-masumi.md). Discovery in the recorded run was `live` from the registry, all four suppliers `RegistrationConfirmed` |
| Run totals, recorded run | **REAL** | 10 escrows per run (3 awards, 3 bonds, 4 bid fees), all locked REAL 2.1 min after settlement start. 20 of 21 ledger rows REAL, the last of them 17 min after settlement start |
| `DEMO_MODE=canned` replay | **PRE-RECORDED** | Judge URL and lifeline. Replays the one real recorded run, `app/data/canned/run.json` (`app/lib/replay`), with its time cut labelled; REAL tx links from the recording stay REAL. There is no separate warm run (#30). Stand-in data until the #45 recording is swapped in |

## Honest limitations

Honest labelling is 10% of the score. These are the limits of the demo, stated
here and in the UI. Full text with sources: [`docs/honest-limitations.md`](docs/honest-limitations.md).

**Who runs what**

- The four suppliers and the Tender Board are team-operated demonstration agents. They run in one Vercel project, and all wallets sit on our own Masumi node, whose operator can move every wallet (operator-managed custody, [ADR 0002](docs/adr/0002-seller-agents-on-vercel.md)). Third-party settlement would use the Disputed path.
- The Board is a trust assumption. Escrows cannot split, so the Board returns bond remainders and forwards forfeits to the Consumer as plain transfers from its treasury. It also holds bonds and collects bid fees.
- The Board both runs the auction and verifies delivery. The Board verifier is a deterministic module inside the Board, not a separate Validator agent (PRD D7, [`GLOSSARY.md`](GLOSSARY.md)). An independent, paid validator agent is the production path. Here the check is deterministic and its inputs are on the dashboard.
- Quotes are scripted. The commit-reveal sealed-bid mechanism is what is demonstrated.
- Proactive supplier discovery (GamingForum finds the Board itself) is pitch only. In the build, GamingForum is invited like the other three.

**What the verifier does and does not check**

- The verifier checks signature, attribution and time window. It is not a human check: it does not tell whether a signup is a real person. Bot signals are dashboard context only, never the verdict.
- Attribution is first-touch. Production needs multi-touch.
- Signed signups assume the shop key is safe. A compromised shop key mints signups.
- The 3 verdicts, the pro-rata forfeit (bond × (promised − delivered) ÷ promised) and the gate (5 verified signups per 1,000 impressions) are policy choices, crude next to real media-mix modeling.
- The supplier win-chance rule is a proposal. The budget fill rule for a bid that does not fit is not defined.

**Money**

- Amounts are tADA, the spec ×10 (#24), not a USD stablecoin. Masumi transfers have a 2 ADA minimum and small escrows risk min-UTxO errors. tADA has no value.
- The fast release of an award passes through `Disputed` on-chain before the buyer authorizes the payout. It is the V2 contract's buyer-approved release, not a real dispute, but the explorer shows it.
- The Under-gate award comes back by cooperative refund (5.9 min measured on preprod, 8 Oct). The automatic refund after the submit-result deadline (27.8 min) is the fallback. Source: [`docs/money-flow.md`](docs/money-flow.md).
- On-chain data is hashes and references only. Raw reports and evidence stay off-chain.
- Each treasury transfer needs a Board-signed verdict. The treasury transfer time is not measured yet ([`docs/money-flow.md`](docs/money-flow.md), "How long a full run takes").

**State of the build on `main`**

- The Board run API, auction, verifier, settlement plan, supplier brains, Masumi adapter, treasury client and receipt page exist and are tested. The judge page `/` (brief, Run, walkthrough, dashboard, receipt), `/dashboard` and `/receipt` are on `main` (#43, #9). Discovery reads the Masumi registry with a seeded fallback (#44), bid fees are REAL escrows (#50), the delivery report and result hash are wired (#51), the reconciler advances settlement escrows (#49) and the evidence bundle exists (#47). The dashboard design is the dark money-flow concept `docs/design/dashboard/money-flow.html`, picked 9 Oct 2026.
- A complete simulated run (`SIMULATE_PAYMENTS=true`) finishes through the API on a local machine. Checked on 9 Oct 2026 by calling `POST /api/run` and `POST /api/run/:id/all`. The one real run, `run_c1f40522`, is recorded under #45 and its tx hashes are in the proof table. It is replayed on the judge URL, there is no separate warm run (#30). Not checked here: that the deployed app still matches `main`.
- Production is set to real payments (`SIMULATE_PAYMENTS=false`) and live registry discovery (`MASUMI_REGISTRY_API_KEY` set), per Danila on 9 Oct 2026. These env values were not read from Vercel when this page was written.

## REAL transaction proof

Source: the one recorded run, `run_c1f40522` (9 Oct 2026, 01:45 to 02:05 Prague),
driven through the deployed app on Masumi preprod with live registry discovery
and LLM supplier quotes (#45, results comment). Every hash below is copied from
that run's ledger. The links open Cardanoscan preprod. Amounts are tADA.

Result: all three verdict branches settled on chain. 20 of 21 ledger rows are
REAL with a tx hash. The 21st is a 1.964286 tADA forfeit that the treasury
refused (last table). All 10 escrows were locked REAL 2.1 min after settlement
start. The Under-gate refund took 5.7 min and the last REAL treasury transfer
17.0 min.

**One lock tx can carry several escrows.** The Masumi node batches purchases.
The three award locks share one tx (`3bd1ae093a…`). Each supplier's bond and bid
fee share one tx. Every escrow is still distinct. Bid-fee collections are
batched the same way (`2790c21d53…` collects three fees).

Escrows (run amounts, not the worked example):

| Escrow | Party → party | tADA | Verdict | Lock tx | Settlement tx | State |
|---|---|---|---|---|---|---|
| Award, TechBlog | Consumer → TechBlog | 65 | Pass | [3bd1ae093a…](https://preprod.cardanoscan.io/transaction/3bd1ae093a8ee9970e31fbcf130588001188842fbe25885dcb4623c74eee8bae) | [6a8c5cab80…](https://preprod.cardanoscan.io/transaction/6a8c5cab80e4d583dbd6e654816b1ea6945fc4b9a4f1db81db6c4cf2dec383b6) (release to TechBlog) | Withdrawn |
| Bond, TechBlog | TechBlog → Board | 16.25 | Pass | [9ec76e214c…](https://preprod.cardanoscan.io/transaction/9ec76e214c4293c04bb5252cf30700906c6dd0fa6cb5338aca37b9fb8b8c0a97) | [f04d859e67…](https://preprod.cardanoscan.io/transaction/f04d859e67abc497d7f95aa60e463ea61ec9efed744c69fe64a2716aa7043e5f) (bond returned to TechBlog) | RefundWithdrawn |
| Award, CodePodcast | Consumer → CodePodcast | 55 | Short of promise | [3bd1ae093a…](https://preprod.cardanoscan.io/transaction/3bd1ae093a8ee9970e31fbcf130588001188842fbe25885dcb4623c74eee8bae) | [64383b40d3…](https://preprod.cardanoscan.io/transaction/64383b40d355a3f40e9d5895400e8cc5395ad8aa31eb3335286c2b0bc8d4b7a4) (release to CodePodcast) | Withdrawn |
| Bond, CodePodcast | CodePodcast → Board | 13.75 | Short of promise | [b2ebaefb69…](https://preprod.cardanoscan.io/transaction/b2ebaefb698c233cf0caf454342ebd0f4fe61023e2b942a847296cbb51184f0d) | no hash in the ledger, see the treasury transfers below | no row in the #45 ledger |
| Award, DevNewsletter | Consumer → DevNewsletter | 60 | Under gate | [3bd1ae093a…](https://preprod.cardanoscan.io/transaction/3bd1ae093a8ee9970e31fbcf130588001188842fbe25885dcb4623c74eee8bae) | [b4854bc3d6…](https://preprod.cardanoscan.io/transaction/b4854bc3d603c1ceec700ea7ac5ccdb674c3c74a962459cdf2caf935f71a84da) (refund to Consumer) | RefundWithdrawn |
| Bond, DevNewsletter | DevNewsletter → Board | 15 | Under gate | [14f5ceb13a…](https://preprod.cardanoscan.io/transaction/14f5ceb13a6d55c9d8dc3283fcffe753c09ceed67c3b184002e158dda00e5953) | no hash in the ledger, see the treasury transfers below | no row in the #45 ledger |

Bid fees (2 tADA each, REAL escrow, input hash = the sealed bid's commit hash, checked on the node):

| Bidder | Fee lock tx | Board collection tx | State |
|---|---|---|---|
| TechBlog | [9ec76e214c…](https://preprod.cardanoscan.io/transaction/9ec76e214c4293c04bb5252cf30700906c6dd0fa6cb5338aca37b9fb8b8c0a97) | [2790c21d53…](https://preprod.cardanoscan.io/transaction/2790c21d53a4a1933767ee1a06fc004c17188cd9f5c8ae2f13392243c11bf384) | Withdrawn |
| CodePodcast | [b2ebaefb69…](https://preprod.cardanoscan.io/transaction/b2ebaefb698c233cf0caf454342ebd0f4fe61023e2b942a847296cbb51184f0d) | [2790c21d53…](https://preprod.cardanoscan.io/transaction/2790c21d53a4a1933767ee1a06fc004c17188cd9f5c8ae2f13392243c11bf384) | Withdrawn |
| DevNewsletter | [14f5ceb13a…](https://preprod.cardanoscan.io/transaction/14f5ceb13a6d55c9d8dc3283fcffe753c09ceed67c3b184002e158dda00e5953) | [b527828a66…](https://preprod.cardanoscan.io/transaction/b527828a6615a256e7ed3222791d8ed291324780e9cedf061d3a7c5630000bfb) | Withdrawn |
| GamingForum (rejected below gate) | [9d5c245b89…](https://preprod.cardanoscan.io/transaction/9d5c245b89a4deacee45fa74e3b9b4ee03f9226b1e85813a335c91c8498df0e9) | [2790c21d53…](https://preprod.cardanoscan.io/transaction/2790c21d53a4a1933767ee1a06fc004c17188cd9f5c8ae2f13392243c11bf384) | Withdrawn |

Treasury transfers (plain transfers from the Board treasury, not escrow outputs):

| Transfer | Party → party | tADA | Verdict | Tx | State |
|---|---|---|---|---|---|
| Forfeit | Board → Consumer | 15 | Under gate | [83c3fa9dcb…](https://preprod.cardanoscan.io/transaction/83c3fa9dcbefcf88bddca80eeca15890cf7e7af261758e8fe4e96534c755f370) | Pending at the last poll |
| Bond remainder | Board → CodePodcast | 11.785714 | Short of promise | [6862bb4516…](https://preprod.cardanoscan.io/transaction/6862bb451697b72dfa4037481079f32bd17aae451fe7c2e1dd107ce77761c733) | Pending at the last poll |
| Forfeit | Board → Consumer | 1.964286 | Short of promise | none | PENDING, BelowMinimum, not moved ([#62](https://github.com/Skilux/bid-royale/issues/62)) |

Two honest notes on these rows:

- **Pending with a hash.** For the two REAL treasury transfers the node still
  reported transfer status `Pending` when settlement was collected. The tx hash
  exists and the explorer link is the proof. Whether each has confirmed on chain
  was not re-checked when this page was written.
- **The PENDING row.** CodePodcast was Short of promise (6 delivered vs 7
  promised), so its forfeit is 13.75 × (7 − 6) ÷ 7 = 1.964286 tADA. The treasury
  refused it because it is under its 2 tADA minimum. The row has no tx and counts
  as not moved. Issue [#62](https://github.com/Skilux/bid-royale/issues/62) is fixed on `main` in `76610cb`: a sub-minimum
  transfer is rounded up to 2 tADA and the Board pays the difference. The recorded
  run happened before that fix, so its ledger still shows this row PENDING. The
  fix needs a Vercel deploy and a Railway treasury redeploy, not checked here.

Other preprod proofs that already exist are wallet funding and agent
registration transactions, listed with explorer links in
[`docs/plan/lane-masumi.md`](docs/plan/lane-masumi.md). They show the setup, not an
auction run, so they are not in the tables above.

## Evidence and on-chain hashes

Each run keeps an evidence bundle in the Board store: tender terms, brief, every sealed bid
(commit hash, reveal, receive time), the ranking and budget fill, the signed signup events,
one verification report and one signed verdict per supplier, the money ledger, settlement
decisions and receipt. Every item is stored as canonical JSON (sorted keys, no whitespace, UTF-8)
next to its SHA-256, so a reader can recompute the hash from the exact bytes.
`GET /api/run/<id>/evidence` lists the items with hashes and sizes,
`GET /api/run/<id>/evidence/<name>` returns one. The receipt page has an Evidence panel: Verify
recomputes the hash in the browser. Details: [`app/lib/evidence/README.md`](app/lib/evidence/README.md).

| Goes on chain (Masumi escrow) | Stays off chain (evidence store) |
|---|---|
| `inputHash` on each award and bond lock: SHA-256 of the action, supplier, amount and a nonce. On each bid-fee lock it is the sealed bid's commit hash (#50) | Tender and brief, sealed bids and salts, rejected bids |
| `submitResultHash` on the award and bond settlement: `sha256(canonical delivery report + verdict hash)` (#51), the verdict hash alone when a run has no delivery report | Signed signup events, verification reports, bot signals |
| Escrow ids, amounts, tx hashes (Cardano itself) | Signed verdicts, delivery reports, ledger, receipt |

Not on chain today: the tender (spec) hash, the verification report
hash and the bundle hash. Raw reports, signup events and secrets never go on chain or into the repo.
In a canned replay the bundle is restored from the recording and shown PRE-RECORDED.

## Run it

1. **Judge URL:** `https://ad-slot-auction.vercel.app` (public, no signup, no wallet). Deploys are manual, so the URL can lag `main`. `GET /api/health` reports flags, payment adapter and which env vars are set.
2. **Local, simulated, no keys needed for payments:**

   ```bash
   cd app
   npm ci
   SHOP_SIGNING_KEY=$(openssl rand -hex 32) BOARD_SIGNING_KEY=$(openssl rand -hex 32) \
   SIMULATE_PAYMENTS=true PERSONA_MODE=pinned npm run dev
   ```

   Then `curl -X POST localhost:3000/api/run` returns a run ID, and
   `curl -X POST localhost:3000/api/run/<id>/all` runs every step. Open
   `localhost:3000/receipt?run=<id>`. For a persistent setup, copy `.env.example`
   to `app/.env.local` and fill it. Never commit `.env.local`.
3. **Flags:** `SIMULATE_PAYMENTS=true` uses the labelled simulated ledger, every badge reads SIMULATED. `false` uses real Masumi preprod escrows and needs the Masumi keys. `DEMO_MODE=canned` replays `app/data/canned/run.json` (see `docs/demo-runbook.md`, Canned replay), `live` is the default.
4. **Checks:** `npm run check` in `app/` (tests, secrets scan, layout rule, badge guard, ESLint). `npm run check:full` adds `next build`. `npm run setup:hooks` enables the pre-commit hook.

Deploying is manual from the team MacBook with the Vercel CLI, see
[`AGENTS.md`](AGENTS.md) and [`docs/hosting.md`](docs/hosting.md). Pushing to `main`
does not deploy.

## Use the service from an agent

- Customer (consumer) agents: [`docs/api/customer.md`](docs/api/customer.md), the Board API, the definition of done, how to read and verify the receipt.
- Supplier agents: [`docs/api/supplier.md`](docs/api/supplier.md), the invite and delivery-report routes, the sealed proposal, the offer algorithm, how the verdict is decided.

## Architecture

Diagram and component contracts: [`docs/architecture.md`](docs/architecture.md).
Hosting split: [ADR 0001](docs/adr/0001-railway-for-masumi-rails-vercel-for-product.md),
[ADR 0002](docs/adr/0002-seller-agents-on-vercel.md).

```text
 judges ──▶ Vercel: Wrapper UI + Tender Board (auction, verifier, settlement),
            4 supplier brains, MIP-003 agent routes, Masumi client
              ├──▶ Railway: Masumi Payment Service + Postgres (self-hosted, all wallets)
              ├──▶ Railway: treasury worker (forfeit and remainder transfers)
              ├──▶ Upstash Redis: Board state, agent job state
              ├──▶ OpenRouter: supplier LLM brains (model list in llm-config.js)
              └──▶ Cardano preprod: V2 escrow contract, registry, cardanoscan links
```

Per-supplier state machine:
`DRAFT → TENDERED → QUOTED → AUTHORIZED → ESCROWED → IN_PROGRESS → DELIVERED → VALIDATING → SETTLED | REFUNDED`.
Pass and Short of promise end in SETTLED, Under gate ends in REFUNDED, Lost bid
never leaves QUOTED. Masumi escrow states underneath:
`FundsLocked → ResultSubmitted → RefundRequested → Disputed`.

Masumi is the rails and we do not rebuild them: no wallet or payment engine,
no escrow contracts, no DID, no explorer.

## The demo run (tADA, the spec ×10)

Budget 200. The Board invites 4 suppliers through the Masumi registry, takes 4
commit-reveal sealed bids (2 bid fee each, in escrow with the commit hash), and picks 3 winners:
TechBlog 70, CodePodcast 60, DevNewsletter 70. The Consumer locks 3 awards,
winners lock 3 bonds (25% of award). The NeoRack feed emits signed signups, the
verifier counts them, the Board signs one verdict per supplier:

- TechBlog **Pass**: 70 paid, 17.5 bond returned.
- CodePodcast **Short of promise**: 60 paid, 3.75 of bond forfeited to the Consumer.
- DevNewsletter **Under gate** (0 signups): 70 back to the Consumer, 17.5 bond forfeited to the Consumer.
- GamingForum promises 4 per 1,000, below the gate: **Lost bid**.

This section is the pinned worked example. The recorded run used LLM quotes, so its amounts differ (awards 65 / 55 / 60, bonds 16.25 / 13.75 / 15), see the [proof table](#real-transaction-proof).

Worked example receipt: Consumer net −108.75 tADA for 14 verified signups (about 7.77 each),
plus an illustrative round-2 allocation. 10 escrows: 3 awards and 3 bonds on the
critical path, 4 bid fees, all REAL. A full run settles in about
15 min on preprod (measured 8 Oct 2026, [`docs/money-flow.md`](docs/money-flow.md)).

## Judging and schedule

Judging weights, from the Win Plan (Notion): value and track relevance 35%,
originality 25%, end-to-end 20%, technical 10%, honest limitations 10%.
An earlier version of this page listed end-to-end 35%, track 25%, technical 20%,
originality 10%, honesty 10%. The Win Plan wins (issue #48).

- **8 Oct:** doors 16:00, kickoff 17:30, building from 21:00
- **9 Oct:** code freeze 07:14, jury review 08:00–10:00, presentations 10:00, awards 11:30

## Stack

| Layer | Pick | Status |
|---|---|---|
| Frontend and hosting | Next.js 16 (App Router), Tailwind, Vercel | `app/` is the Vercel root directory, plain JS |
| Payment rail | Masumi preprod (Cardano), tADA, the spec amounts ×10 (#24), Masumi only | Self-hosted official Payment Service 0.29.0 + Postgres on Railway, treasury worker on Railway, seller agents on Vercel ([ADR 0001](docs/adr/0001-railway-for-masumi-rails-vercel-for-product.md), [ADR 0002](docs/adr/0002-seller-agents-on-vercel.md)) |
| Degrade path | Labelled simulated ledger (`SIMULATE_PAYMENTS`) | The track rule requires labelling |
| Supplier brains | OpenRouter models, tried in order, caps in `app/lib/supplier-agents/llm-config.js` | `PERSONA_MODE=pinned` skips the LLM |
| State | Upstash Redis, in-memory store when unset | Vercel instances do not share memory |
| Voice | ElevenLabs voiceover for the <90 s video, captions always on | Pre-generated, never burn quota live |

## Repo map

```text
bid-royale/
├── README.md            ← you are here
├── AGENTS.md            ← repo rules
├── GLOSSARY.md          ← canonical terms
├── DESIGN.md            ← visual system
├── .env.example         ← every env var the app needs, placeholders only
├── docs/
│   ├── README.md        ← which doc wins, conflict register
│   ├── architecture.md  ← components, contracts, data flow
│   ├── money-flow.md    ← one run, every call, amount, measured time
│   ├── honest-limitations.md ← real vs simulated, labelling rules
│   ├── masumi.md        ← Masumi integration notes
│   ├── hosting.md       ← Vercel and Railway setup, env vars, deploy
│   ├── services.md      ← external services: purpose, access, status
│   ├── demo-runbook.md  ← demo script, cut order, checklists
│   ├── api/             ← customer and supplier agent guides (docs only)
│   ├── adr/             ← accepted decisions (0001, 0002)
│   ├── plan/            ← lanes and live status (Masumi, Product)
│   └── research/        ← dated reference, never authoritative
└── app/                 ← Next.js project root = Vercel root directory
    ├── app/             ← routes: /, /dashboard, /receipt, /api/run, /api/events, /api/agents, /api/settlement/tick, /api/health
    ├── scripts/         ← check.mjs, treasury-server.mjs, poc-masumi.mjs
    ├── data/seeds/      ← worked-example run fixture, with its evidence bundle
    └── lib/
        ├── board/           ← Tender Board run API, store, SSE, receipt, reconciler
        ├── discovery/       ← registry discovery with seeded fallback
        ├── delivery-report/ ← supplier delivery report, result hash
        ├── evidence/        ← per-run evidence bundle, canonical hashes
        ├── replay/          ← canned replay loader and pacing
        ├── auction/         ← sealed-bid engine (pure functions)
        ├── verifier/        ← Board verifier: deterministic signup verification
        ├── settlement/      ← verdict → pay, forfeit, refund plan
        ├── outcome-feed/    ← NeoRack signup feed, signed events
        ├── signing/         ← signing helpers
        ├── supplier-agents/ ← the 4 supplier brains
        ├── agents/          ← contract README only
        ├── masumi/          ← Masumi client, real and simulated adapters
        ├── treasury/        ← verdict-bound plain transfers
        └── receipt-view/    ← receipt view model
```

**All code lives under `app/`.** Vercel builds with `app/` as the root
directory. Import with the alias `@/`: `import { verify } from "@/lib/verifier"`.
In the docs, `lib/x` means `app/lib/x`. Most `app/lib/*` directories have a
README with the contract (inputs → outputs, done when).
