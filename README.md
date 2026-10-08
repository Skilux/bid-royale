# Ad Slot Auction

**From Dusk Till Dawn #01, Agentic Economy track (8–9 Oct 2026, Prague)**

The NeoRack Consumer agent publishes a tender, Supplier agents bid for the
budget in a sealed-bid auction, and the Consumer pays only for verified signups.
*Don't pay for impressions. Pay for outcomes.*

> Track rule: "An agent completes a transaction scenario with a visible outcome.
> A sandbox transaction counts; a simulated payment must be labelled."

Status as of 9 Oct 2026, read from `main` at `80287ee`. Nothing below claims a
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
| 3 award escrows (70 / 60 / 70 tADA) | **REAL** once a tx hash exists | Masumi preprod (Cardano testnet). **PENDING** before. Hashes: [proof table](#real-transaction-proof) |
| 3 bond escrows (17.5 / 15 / 17.5 tADA) | **REAL** once a tx hash exists | Same rail, same rule |
| Settlement per verdict (release, refund, bond return) | **REAL** once a tx hash exists | [`docs/money-flow.md`](docs/money-flow.md), step 7 |
| Forfeit and bond-remainder transfers | **REAL** once a tx hash exists | Plain transfers from the Board treasury, not escrow outputs |
| 4 bid fees (2 tADA each) | **SIMULATED** | Labelled ledger rows, REAL only if time allows |
| NeoRack shop, signups, traffic and impressions | **SIMULATED** | Signed signup events from a simulated shop, "no funds moved" |
| DevNewsletter's zero signups | **SIMULATED** | Scripted. The verdict mechanism is what is on show |
| Round 2 reallocation | **SIMULATED** | Shown on the receipt, no chain operations |
| Supplier registration, agent identifiers | **REAL** | 5 agents registered on Preprod, see [`docs/plan/lane-masumi.md`](docs/plan/lane-masumi.md) |
| `DEMO_MODE=canned` replay | **PRE-RECORDED** | Lifeline only. The replay hook returns `null` on `main` until S12 lands (`app/lib/board/canned.js`) |

## Honest limitations

Honest labelling is 10% of the score. These are the limits of the demo, stated
here and in the UI. Full text with sources: [`docs/honest-limitations.md`](docs/honest-limitations.md).

**Who runs what**

- The four suppliers and the Tender Board are team-operated demonstration agents. They run in one Vercel project, and all wallets sit on our own Masumi node, whose operator can move every wallet (operator-managed custody, [ADR 0002](docs/adr/0002-seller-agents-on-vercel.md)). Third-party settlement would use the Disputed path.
- The Board is a trust assumption. Escrows cannot split, so the Board returns bond remainders and forwards forfeits to the Consumer as plain transfers from its treasury. It also holds bonds and collects bid fees.
- The Board both runs the auction and verifies delivery. There is no independent validator. An independent, paid validator agent is the production path. Here the check is deterministic and its inputs are on the dashboard.
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

- The Board run API, auction, verifier, settlement plan, supplier brains, Masumi adapter, treasury client and receipt page exist and are tested. The home page `app/app/page.js` is still a placeholder: there is no Wrapper UI with brief, tender and dashboard on `main` yet. The receipt page `/receipt` renders from the worked-example fixture or a run ID.
- A complete simulated run (`SIMULATE_PAYMENTS=true`) finishes through the API on a local machine. Checked on 9 Oct 2026 by calling `POST /api/run` and `POST /api/run/:id/all`. No real run is checked here: see the proof table.

## REAL transaction proof

Rows are filled from run logs only: #45 (end-to-end run through the deployed
app, logs collected) and #31 (full scenario on Preprod). **No hash is written
here that was not read from a run.** Until those issues deliver, every cell is
`TBD`. Link format: `https://preprod.cardanoscan.io/transaction/<hash>`.

Escrows (amounts from [`docs/money-flow.md`](docs/money-flow.md)):

| Escrow | Party → party | tADA | Verdict | Lock tx | Settlement tx | Status |
|---|---|---|---|---|---|---|
| Award, TechBlog | Consumer → TechBlog | 70 | Pass | TBD | TBD (release to TechBlog) | TBD |
| Bond, TechBlog | TechBlog → Board | 17.5 | Pass | TBD | TBD (bond returned to TechBlog) | TBD |
| Award, CodePodcast | Consumer → CodePodcast | 60 | Short of promise | TBD | TBD (release to CodePodcast) | TBD |
| Bond, CodePodcast | CodePodcast → Board | 15 | Short of promise | TBD | TBD (collected by Board) | TBD |
| Award, DevNewsletter | Consumer → DevNewsletter | 70 | Under gate | TBD | TBD (refund to Consumer) | TBD |
| Bond, DevNewsletter | DevNewsletter → Board | 17.5 | Under gate | TBD | TBD (collected by Board) | TBD |

Treasury transfers (plain transfers, not escrows):

| Transfer | Party → party | tADA | Verdict | Tx | Status |
|---|---|---|---|---|---|
| Forfeit | Board → Consumer | 3.75 | Short of promise | TBD | TBD |
| Bond remainder | Board → CodePodcast | 11.25 | Short of promise | TBD | TBD |
| Forfeit | Board → Consumer | 17.5 | Under gate | TBD | TBD |

Other preprod proofs that already exist are wallet funding and agent
registration transactions, listed with explorer links in
[`docs/plan/lane-masumi.md`](docs/plan/lane-masumi.md). They show the setup, not an
auction run, so they are not in the tables above.

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
3. **Flags:** `SIMULATE_PAYMENTS=true` uses the labelled simulated ledger, every badge reads SIMULATED. `false` uses real Masumi preprod escrows and needs the Masumi keys. `DEMO_MODE=canned` replays a recorded run once S12 provides it, `live` is the default.
4. **Checks:** `npm run check` in `app/` (tests, secrets scan, layout rule, badge guard, ESLint). `npm run check:full` adds `next build`. `npm run setup:hooks` enables the pre-commit hook.

Deploying is manual from the team MacBook with the Vercel CLI, see
[`AGENTS.md`](AGENTS.md) and [`docs/hosting.md`](docs/hosting.md). Pushing to `main`
does not deploy.

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
commit-reveal sealed bids (2 bid fee each, SIMULATED), and picks 3 winners:
TechBlog 70, CodePodcast 60, DevNewsletter 70. The Consumer locks 3 awards,
winners lock 3 bonds (25% of award). The NeoRack feed emits signed signups, the
verifier counts them, the Board signs one verdict per supplier:

- TechBlog **Pass**: 70 paid, 17.5 bond returned.
- CodePodcast **Short of promise**: 60 paid, 3.75 of bond forfeited to the Consumer.
- DevNewsletter **Under gate** (0 signups): 70 back to the Consumer, 17.5 bond forfeited to the Consumer.
- GamingForum promises 4 per 1,000, below the gate: **Lost bid**.

Receipt: Consumer net −108.75 tADA for 14 verified signups (about 7.77 each),
plus an illustrative round-2 allocation. 10 escrows: 3 awards and 3 bonds on the
critical path (REAL), 4 bid fees (SIMULATED first). A full run settles in about
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
│   ├── adr/             ← accepted decisions (0001, 0002)
│   ├── plan/            ← lanes and live status (Masumi, Product)
│   └── research/        ← dated reference, never authoritative
└── app/                 ← Next.js project root = Vercel root directory
    ├── app/             ← routes: /receipt, /api/run, /api/events, /api/agents, /api/health
    ├── scripts/         ← check.mjs, treasury-server.mjs, poc-masumi.mjs
    ├── data/seeds/      ← worked-example run fixture
    └── lib/
        ├── board/           ← Tender Board run API, store, SSE, receipt
        ├── auction/         ← sealed-bid engine (pure functions)
        ├── verifier/        ← deterministic signup verification
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
