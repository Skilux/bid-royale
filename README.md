# Ad Slot Auction

> ⚠️ **Scaffold — nothing here is final.** This repo is a starting baseline, not a
> decided architecture. Every stack choice, service, component contract, and rule is
> a proposal and can change. **Before building on any of it — or changing anything
> that depends on the architecture — verify with the team first.** Never assume the
> scaffold is decided; never build blindly on it.

**From Dusk Till Dawn #01 — Agentic Economy track (Oct 8–9, 2026, Prague)**

The NeoRack Consumer agent publishes a tender, Supplier agents bid for the
budget in a sealed-bid auction, and the Consumer pays only for verified signups.
*Don't pay for impressions. Pay for outcomes.*

> Track rule: "An agent completes a transaction scenario with a visible outcome.
> A sandbox transaction counts; a simulated payment must be labelled."

- Scenario spec: Notion (Ad Slot Auction PRD v3.0, plus "Ad Slot Auction: Money Flow, Step by Step" and "Ad Auction — Diagrams"). `docs/` is the technical subset, not a mirror.
- Technical baseline for this repo: `docs/architecture.md`, `docs/services.md`, `docs/hosting.md`
- Build rules for the night: `AGENTS.md`
- Terms: `GLOSSARY.md`
- Demo runbook: `docs/demo-runbook.md`

## Architecture (high level)

```text
                     ┌──────────────────────────────────────┐
  judges open        │ WRAPPER UI (Next.js 16, Vercel)      │
  one public URL ──▶ │ tender → bids → dashboard → receipt  │
                     │ SSE event ledger, REAL/SIMULATED/    │
                     │ PRE-RECORDED badges                  │
                     └───────────────┬──────────────────────┘
                                     │  API routes (server-side only)
           ┌─────────────────────────┼─────────────────────────┐
┌──────────▼───────────┐  ┌──────────▼───────────┐  ┌──────────▼───────────┐
│ AGENTS               │  │ TENDER BOARD (ours)  │  │ MASUMI RAILS         │
│ • Consumer agent     │  │ • Tender API         │  │ • Registry           │
│ • 4 Supplier agents  │  │ • Auction engine     │  │ • Escrow contract    │
│ • Validator agent    │  │ • Settlement engine  │  │   (11 escrows/run)   │
│   (verifier module,  │  │                      │  │ • faucet, explorer   │
│   signs verdicts)    │  │ A service, not an    │  │ Rails we do NOT      │
│                      │  │ agent.               │  │ rebuild.             │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
┌──────────────────────┐  ┌──────────────────────┐
│ EXTERNAL             │  │ LLM                  │
│ NeoRack signup feed  │  │ OpenAI primary,      │
│ (simulated, signed)  │  │ Groq/Gemini fallback │
└──────────────────────┘  └──────────────────────┘
```

**Money flow (the demo, all tUSDM):** budget 20 → Board invites 4 suppliers
via the Masumi registry → 4 commit-reveal sealed bids (0.2 bid fee each) →
3 winners (TechBlog 7, CodePodcast 6, DevNewsletter 7 = 20) → Consumer locks
3 awards, winners lock 3 bonds (25% of award = 5) → traffic serves → NeoRack
signup feed emits signed signups → Validator counts verified signups and
signs a verdict per supplier → settlement, one of 3 verdicts:
TechBlog **Pass** (7 paid, 1.75 bond returned) /
CodePodcast **Short of promise** (6 paid, 0.375 of bond forfeited to Consumer) /
DevNewsletter **Under gate** (0 signups: 7 back to Consumer, 1.75 bond forfeited to Consumer) →
receipt: Consumer net -10.875 for 14 verified signups (about 0.78 each) +
round-2 allocation (illustrative, shown not executed).
GamingForum bids below the gate (4 per 1,000 promised) and is a **Lost bid**.
11 escrows total: 4 bid fees + 1 Validator fee in the background, 3 awards + 3 bonds on the critical path.

**Per-supplier state machine:**
`DRAFT → TENDERED → QUOTED → AUTHORIZED → ESCROWED → IN_PROGRESS → DELIVERED → VALIDATING → SETTLED | REFUNDED`
(Pass and Short of promise end in SETTLED, Under gate ends in REFUNDED, Lost bid never leaves QUOTED.
Masumi escrow states underneath: `FundsLocked → ResultSubmitted → RefundRequested → Disputed`.)

## Judging and schedule

Judging weights: end-to-end 35%, track relevance 25%, technical 20%,
originality 10%, honest limitations 10%.

- **Oct 8:** doors 16:00, kickoff 17:30, building 21:00
- **Oct 9:** code freeze 07:14, jury review 08:00–10:00, presentations 10:00, awards 11:30

## Stack

| Layer | Pick | Status |
|---|---|---|
| Frontend + hosting | Next.js 16 (App Router), Tailwind, Vercel | `app/` already scaffolded (plain JS, no Tailwind yet), Vercel linked |
| Agent runtime | OpenAI Agents SDK (primary) | Native to OpenAI; final call at kickoff once the credit form is known — fallbacks: Vercel AI SDK v7, raw OpenAI function calling |
| Payment rail | Masumi hosted preprod (Cardano), tUSDM (availability on preprod unverified; fallback tADA with scaled amounts) — ONLY | Topic partner's rails; escrow + dispute primitives; hosted preprod access per win plan, no Docker/VPS needed; credit activation is a kickoff question |
| Degrade path | Labelled simulated ledger (`SIMULATE_PAYMENTS`) | Demo never dies; the track rule requires labelling |
| Models | OpenAI primary; Groq / Gemini keys as fallback | OpenAI credits per win plan, activation is a kickoff question; fallback keys pre-tested |
| State | In-memory + seeded JSON | No DB |
| Voice (optional) | ElevenLabs, pre-generated | Never burn quota live |

## Constraints the stack must respect

- 11 escrows per run: 6 on the critical path (3 awards + 3 bonds), 5 in the
  background (4 bid fees + 1 Validator fee). Payment-service polling is
  multi-minute per transition → **lock escrows early in the night, in parallel**.
- Vercel Hobby functions: ~60s limit → stepwise scenario, SSE streaming,
  job-token + poll for the settlement step.
- Venue wifi only needs HTTPS (443) to the Vercel URL. All chain/RPC/LLM
  calls happen server-side on Vercel — never from the laptop.
- `DEMO_MODE=canned` replay (pre-recorded successful run) is the 07:00
  lifeline (an internal buffer before the 07:14 freeze) — build it in hour 1, not hour 9.

## Repo map

```text
bid-royale/
├── README.md            ← you are here (technical overview)
├── AGENTS.md            ← repo rules for the build night
├── GLOSSARY.md          ← canonical terms
├── .env.example         ← every env var the app needs
├── docs/
│   ├── architecture.md  ← components, contracts, data flow
│   ├── services.md      ← every external service: purpose, access, status
│   ├── hosting.md       ← Vercel setup, env vars, collab, deploy pipeline
│   ├── masumi.md        ← Masumi integration notes (API, states, polling)
│   ├── demo-runbook.md  ← build order, demo script, cut order, checklists
│   └── honest-limitations.md ← what is real vs simulated, labelling rules
├── app/                 ← Next.js Wrapper UI (scaffolded, plain JS)
├── lib/
│   ├── masumi/          ← Masumi client (payment service + registry)
│   ├── agents/          ← agent runtime (Consumer, Suppliers, Validator)
│   ├── outcome-feed/    ← NeoRack signup feed + signed signup events
│   ├── verifier/        ← deterministic outcome verification
│   └── settlement/      ← 3 verdict branches → award / bond settlement wiring
└── data/seeds/          ← seeded registry, tender terms schema
```

Each `lib/*` and `app/` directory currently holds a README describing its
contract (inputs → outputs, "done when"). No implementation code lives here
yet — the night of Oct 8 is for building.

## Night-of quickstart

1. `app/` is already scaffolded (Next 16.3.8, React 19, plain JS); add Tailwind
2. `npm i @openai/agents zod` (fallbacks if needed: `ai @ai-sdk/openai` or raw OpenAI calling)
3. Copy `.env.example` → `.env.local`, fill Masumi + model keys
4. Build order: NeoRack signup feed → Wrapper UI shell → verifier →
   Auction engine → Masumi wiring (early, parallel) → Supplier agents →
   settlement → video
5. `vercel` link the repo; `SIMULATE_PAYMENTS` + `DEMO_MODE` flags from hour 1

Full details: `AGENTS.md` and `docs/demo-runbook.md`.
