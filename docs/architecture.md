# Architecture — Ad Slot Auction

High-level technical overview. No implementation details — components are
described by contract (inputs → outputs, "done when").

## System diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│ BROWSER (judges, no signup, no wallet)                          │
│  Playground: campaign brief → tender board → live dashboard     │
│              → settlement beat → receipt + round-2 allocation    │
│  Live SSE event ledger · REAL / SIMULATED / PRE-RECORDED badges │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS only (443)
┌──────────────────────────────▼──────────────────────────────────┐
│ VERCEL — Next.js 16 App Router (single deployable)              │
│                                                                 │
│  app/                    UI routes + SSE stream                  │
│  lib/agents/             OpenAI Agents SDK instances:               │
│                            advertiser (publishes tender, sets    │
│                            policy), allocator (picks winners,    │
│                            round-2), 3 publisher agents          │
│                            (bid, serve, report, authorize       │
│                            refund per signed policy)             │
│  lib/outcome-feed/       Simulated shop: serves impressions,    │
│                          emits SIGNED conversion events          │
│                          (shop key signs; attribution by         │
│                          click/session ID)                       │
│  lib/verifier/           Deterministic checks: signature valid? │
│                          session attributed? timestamp in        │
│                          window? → verified outcome counts       │
│  lib/settlement/         Gate check per publisher (measured vs   │
│                          bid quote + performance gate) →        │
│                          release or publisher-authorized refund   │
│  lib/masumi/             Thin client for Masumi hosted preprod: │
│                          registry reads, payment-service escrow │
│                          ops, tx-hash + explorer-link surfacing  │
│  data/seeds/             Seeded publisher registry, tender       │
│                          schema, policy card schema              │
└──────┬───────────────────────────────┬──────────────────────────┘
       │                               │
┌──────▼──────────────┐      ┌─────────▼───────────────────────────┐
│ MASUMI HOSTED       │      │ LLM PROVIDERS                       │
│ PREPROD (Cardano)   │      │ OpenAI (primary, credits confirmed) │
│                     │      │ → Groq → Gemini (env-swap fallback) │
│ • Registry: agent   │      └─────────────────────────────────────┘
│   discovery (read)  │
│ • Payment service:  │
│   3 escrows — lock →│      ┌─────────────────────────────────────┐
│   release / refund  │      │ x402 / Base Sepolia                 │
│ • Faucet: tADA +    │      │ DORMANT fallback only. Wired iff    │
│   test USDM         │      │ the Oct 7 go/no-go says Masumi      │
│ • Explorer: tx links│
│   (cardanoscan      │
│   preprod)          │
└─────────────────────┘

Degrade path if preprod is unreachable: labelled simulated ledger
(`SIMULATE_PAYMENTS`) + canned replay. No x402 — Masumi-only by team decision.
```

## The money path (what the demo narrates)

1. Advertiser agent publishes **tender** on our board: budget (€20), audience,
   outcome definition (completed checkout), performance gate, signed policy card.
2. Publisher agents (found via Masumi registry) submit **sealed bids**: promised
   outcome rate + price.
3. Allocation engine picks **3 winners** → **€18 locked in 3 Masumi escrows**
   (€6 each). Bidding/serving/measurement are off-chain; only lock + settlement
   touch the chain.
4. Traffic serves. Outcome feed emits signed conversions; verifier counts
   verified outcomes per publisher:
   TechBlog 8 ✅ · CodePodcast 6 ✅ · DevNewsletter 0 ❌ (bot flood).
5. **Settlement:** TechBlog €6 released, CodePodcast €6 released,
   DevNewsletter fails the gate → its policy-bound agent authorizes the refund →
   **€6 back.** (The demo's main event.)
6. **Receipt:** €12 spent, €6 refunded. ROI leaderboard. Round-2 allocation
   shown as the optimizer's decision (TechBlog 50 / CodePodcast 50 /
   DevNewsletter 0) — no extra chain ops.

## Component contracts

| Component | Inputs | Outputs | Done when |
|---|---|---|---|
| `app/` playground | user clicks, SSE subscription | rendered tender → bids → dashboard → receipt; event ledger | <30s to a running demo; every money element badged |
| `lib/agents/` | tender spec, bids, outcome counts | bid submissions, winner picks, refund authorizations | ≤6–8 tool calls per run; roles distinct (advertiser / allocator / publishers) |
| `lib/outcome-feed/` | publisher list, scenario script | signed conversion events + impression counts | verifier accepts its signatures; DevNewsletter emits 0 real outcomes |
| `lib/verifier/` | events + shop public key | verified outcome counts per publisher | 3 deterministic checks only; bot signals never gate |
| `lib/settlement/` | verified counts, bids, gate | release / refund decisions + Masumi calls | checks measured outcomes vs bid quote AND gate |
| `lib/masumi/` | escrow ops, registry queries | tx hashes + explorer links; agent cards | every chain op surfaces a clickable proof link |
| `data/seeds/` | — | publisher cards, tender/policy schemas | discovery works instantly with zero network |

## Masumi state mapping

Our per-publisher states map onto Masumi escrow states:

```text
OURS:      ESCROWED → IN_PROGRESS → DELIVERED → VALIDATING → SETTLED | REFUNDED
MASUMI:    FundsLocked → (work) → ResultSubmitted → (our verifier) → release
                                                              ↘ RefundRequested → refund
                                                              (Disputed = third-party path; not our demo path)
```

## Failure handling

- Masumi API unreachable/slow → `SIMULATE_PAYMENTS=true`: labelled simulated
  ledger continues the demo; badges flip to SIMULATED.
- LLM provider down → Groq → Gemini env swap; if all fail → `DEMO_MODE=canned`.
- Anything else on fire at 06:30 → canned replay + the Oct 7 video. The demo
  never dies; it degrades with honest labels.
