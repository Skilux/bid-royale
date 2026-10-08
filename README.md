# Ad Slot Auction

> ⚠️ **Scaffold — nothing here is final.** This repo is a starting baseline, not a
> decided architecture. Every stack choice, service, component contract, and rule is
> a proposal and can change. **Before building on any of it — or changing anything
> that depends on the architecture — verify with the team first.** Never assume the
> scaffold is decided; never build blindly on it.

**From Dusk Till Dawn #01 — Agentic Economy track (Oct 8–9, 2026, Prague)**

Advertiser agents publish a tender, publisher agents bid for the budget in a
sealed-bid auction, and the advertiser pays only for verified outcomes.
*Don't pay for impressions. Pay for outcomes.*

> Track rule: "An agent completes a transaction scenario with a visible outcome.
> A sandbox transaction counts; a simulated payment must be labelled."

- Scenario spec: `docs/` mirrors the PRD — Ad Slot Auction v2.2 (Notion: "Ad Slot Auction — PRD & build brief")
- Technical baseline for this repo: `docs/architecture.md`, `docs/services.md`, `docs/hosting.md`
- Build rules for the night: `AGENTS.md`
- Demo runbook: `docs/demo-runbook.md`

## Architecture (high level)

```text
                    ┌─────────────────────────────────────┐
  judges open       │  PLAYGROUND (Next.js 16, Vercel)     │
  one public URL ──▶│  tender → bids → dashboard → receipt │
                    │  SSE event ledger, REAL/SIMULATED/   │
                    │  PRE-RECORDED badges                │
                    └──────────────┬──────────────────────┘
                                   │  API routes (server-side only)
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
   ┌────────▼────────┐   ┌─────────▼─────────┐   ┌────────▼────────┐
   │ OUR PRODUCT     │   │ MASUMI (hosted    │   │ LLM             │
   │ LAYER           │   │ preprod, Cardano) │   │ OpenAI primary  │
   │                 │   │                   │   │ Groq/Gemini     │
   │ • tender board  │   │ • registry        │   │ fallback        │
   │ • sealed-bid    │   │   (discovery)     │   └─────────────────┘
   │   auction       │   │ • payment service │
   │ • outcome feed  │   │   (3 escrows:     │
   │   (simulated    │   │   lock → release/ │
   │   shop, signed  │   │   refund)         │
   │   events)       │   │ • faucet, explorer│
   │ • verifier      │   │                   │
   │   (deterministic│   │ Rails we do NOT    │
   │   checks)       │   │ rebuild.           │
   │ • settlement    │   │                    │
   │   engine        │   │                    │
   └─────────────────┘   └───────────────────┘
```

**Money flow (the demo):** €20 campaign → 3 sealed bids → 3 winners →
€6 escrowed per publisher (3 Masumi escrows) → traffic serves →
outcome feed emits signed conversions → verifier counts verified outcomes →
gate check (≥5 verified outcomes / 1k impressions) →
TechBlog ✅ release / CodePodcast ✅ release / DevNewsletter ❌ 0 outcomes → refund →
receipt + round-2 allocation.

**Per-publisher state machine:**
`TENDERED → QUOTED → AUTHORIZED → ESCROWED → IN_PROGRESS → DELIVERED → VALIDATING → SETTLED | REFUNDED`
(Masumi escrow states underneath: `FundsLocked → ResultSubmitted → RefundRequested → Disputed`.)

## Stack

| Layer | Pick | Status |
|---|---|---|
| Frontend + hosting | Next.js 16 (App Router), Tailwind, Vercel | Scaffold on the night (`create-next-app`), Vercel linked |
| Agent runtime | OpenAI Agents SDK (primary) | Native to OpenAI; final call at kickoff once the credit form is known — fallbacks: Vercel AI SDK v7, raw OpenAI function calling |
| Payment rail | Masumi hosted preprod (Cardano) — ONLY | Topic partner's rails; escrow + dispute primitives; access confirmed Oct 2 — no Docker/VPS needed |
| Degrade path | Labelled simulated ledger (`SIMULATE_PAYMENTS`) | Demo never dies; the track rule requires labelling |
| Models | OpenAI primary → Groq / Gemini env-swap fallback | Credits confirmed; fallback keys pre-tested |
| State | In-memory + seeded JSON | No DB |
| Voice (optional) | ElevenLabs, pre-generated | Never burn quota live |

## Constraints the stack must respect

- ~6 on-chain ops (3 locks + 3 settlements); payment-service polling is
  multi-minute per transition → **lock escrows early in the night, in parallel**.
- Vercel Hobby functions: ~60s limit → stepwise scenario, SSE streaming,
  job-token + poll for the settlement step.
- Venue wifi only needs HTTPS (443) to the Vercel URL. All chain/RPC/LLM
  calls happen server-side on Vercel — never from the laptop.
- `DEMO_MODE=canned` replay (pre-recorded successful run) is the 07:00
  lifeline — build it in hour 1, not hour 9.

## Repo map

```text
ad-slot-auction/
├── README.md            ← you are here (technical overview)
├── AGENTS.md            ← repo rules for the build night
├── .env.example         ← every env var the app needs
├── docs/
│   ├── architecture.md  ← components, contracts, data flow
│   ├── services.md      ← every external service: purpose, access, status
│   ├── hosting.md       ← Vercel setup, env vars, collab, deploy pipeline
│   ├── masumi.md        ← Masumi integration notes (API, states, polling)
│   ├── demo-runbook.md  ← build order, demo script, cut order, checklists
│   └── honest-limitations.md ← what is real vs simulated, labelling rules
├── app/                 ← Next.js playground (scaffold on the night)
├── lib/
│   ├── masumi/          ← Masumi client (payment service + registry)
│   ├── agents/          ← agent runtime (advertiser, publishers, allocator)
│   ├── outcome-feed/    ← simulated shop + signed conversion events
│   ├── verifier/        ← deterministic outcome verification
│   └── settlement/      ← gate check → release / refund wiring
└── data/seeds/          ← seeded registry, tender schema, policy card schema
```

Each `lib/*` and `app/` directory currently holds a README describing its
contract (inputs → outputs, "done when"). No implementation code lives here
yet — the night of Oct 8 is for building.

## Night-of quickstart

1. `npx create-next-app@latest` (TypeScript, App Router, Tailwind) in `app/`
2. `npm i @openai/agents zod` (fallbacks if needed: `ai @ai-sdk/openai` or raw OpenAI calling)
3. Copy `.env.example` → `.env.local`, fill Masumi + model keys
4. Build order: outcome feed → UI shell → verifier → allocation →
   Masumi wiring (early, parallel) → publisher agents → settlement → video
5. `vercel` link the repo; `SIMULATE_PAYMENTS` + `DEMO_MODE` flags from hour 1

Full details: `AGENTS.md` and `docs/demo-runbook.md`.
