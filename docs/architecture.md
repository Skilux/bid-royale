# Architecture — Ad Slot Auction

High-level technical overview. No implementation details — components are
described by contract (inputs → outputs, "done when"). Terms: `GLOSSARY.md`.

## System diagram

```text
┌────────────────────────────────────────────────────────────────────────┐
│ BROWSER (judges, no signup, no wallet)                                 │
│  Wrapper UI: brief → tender → bids → live dashboard → settlement       │
│              beat → receipt (+ round-2 shown)                          │
│  Live SSE event ledger · REAL / SIMULATED / PRE-RECORDED badges        │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ HTTPS only (443)
┌───────────────────────────────▼────────────────────────────────────────┐
│ VERCEL — Next.js 16 App Router (single deployable)                     │
│                                                                        │
│  app/               UI routes + SSE stream                             │
│  TENDER BOARD       our service, not an agent. Tender API: publish     │
│                     tender, invite suppliers, collect bids. Auction    │
│                     engine: commit-reveal check, eligibility, rank,    │
│                     fill budget. Settlement engine: lib/settlement.    │
│  lib/agents/        OpenAI Agents SDK instances: Consumer agent        │
│                     (publishes tender, pays awards), 4 Supplier        │
│                     agents (bid, serve, report, post bond), Validator  │
│                     agent (wraps the verifier, signs verdicts)         │
│  lib/outcome-feed/  NeoRack signup feed: simulated shop, serves        │
│                     impressions, emits SIGNED signup events (shop key  │
│                     signs; attribution by click/session ID)            │
│  lib/verifier/      Deterministic checks: signature valid? signup      │
│                     attributed to the supplier? timestamp in window?   │
│                     → verified signup counts                           │
│  lib/settlement/    3 verdict branches per supplier (Pass / Short of   │
│                     promise / Under gate) → award, bond, forfeit       │
│  lib/masumi/        Thin client for Masumi hosted preprod: registry    │
│                     reads, payment-service escrow ops, tx-hash +       │
│                     explorer-link surfacing                            │
│  data/seeds/        Seeded supplier registry, tender terms schema      │
└───────────────┬─────────────────────────────────────┬──────────────────┘
┌───────────────▼──────────────────┐  ┌───────────────▼──────────────────┐
│ MASUMI HOSTED PREPOD (Cardano)   │  │ LLM PROVIDERS                    │
│ • Registry: discovery (read)     │  │ OpenAI (primary)                 │
│ • Payment service: 11 escrows    │  │ Groq / Gemini keys as fallback   │
│   (award, bond, bid fee,         │  └──────────────────────────────────┘
│   Validator fee), lock →         │
│   release / refund               │
│ • Faucet: tADA + test USDM       │
│   (tUSDM unverified)             │
│ • Explorer: tx links             │
│   (cardanoscan preprod)          │
└──────────────────────────────────┘

Degrade path if preprod is unreachable: labelled simulated ledger
(`SIMULATE_PAYMENTS`) + canned replay. Masumi-only by team decision.
```

## The money path (what the demo narrates)

All amounts are tUSDM (test USDM; availability on preprod unverified, fallback
tADA with scaled amounts).

1. **Brief and tender.** User NeoRack gives the Consumer agent the brief:
   budget 20, technical users, pay per verified signup. The Consumer agent
   publishes the tender to the Tender Board: gate 5 signups per 1,000
   impressions, bond 25% of award. The Board queries the Masumi registry
   (`POST /registry-entry`), reads each supplier's `api_base_url`, and sends
   the tender to a custom `POST /tender-invite` endpoint on our Supplier
   agents. MIP-003 `/start_job` is not used: calling it would make the Board a
   paying buyer. GamingForum is invited like the other three; proactive
   discovery (GamingForum finds the Board itself) is pitch only.
2. **Bidding.** Each Supplier agent decides whether to bid and locks the 0.2
   bid fee in escrow (Board is seller, never returned; 4 suppliers, 0.8 total).
   Sealed bid = commit hash `SHA-256(price, impressions, promised signups,
   salt)` before the deadline. After close, suppliers reveal bid + salt and the
   Board recomputes and rejects mismatches. Eligible only if promised per
   1,000 ≥ 5. Price per promised signup = bid ÷ (impressions ÷ 1,000 ×
   promised per 1,000). Sort cheapest first, accept each while the running
   total of bids ≤ 20. GamingForum (4 per 1,000) is rejected below the gate.
3. **Lock (critical path).** The Consumer agent locks each award in escrow
   (TechBlog 7, CodePodcast 6, DevNewsletter 7 = 20; Supplier is seller). Each
   winner locks its bond in a Supplier → Board escrow (1.75, 1.5, 1.75 = 5).
   Bidding, serving and measurement are off-chain; only locks and settlement
   touch the chain.
4. **Delivery and verification.** Traffic serves. The NeoRack signup feed
   sends signed signup events to the Validator agent, which counts verified
   signups per supplier (TechBlog 8 · CodePodcast 6 · DevNewsletter 0 per
   1,000). The Board pays the Validator 0.8 in escrow out of the bid fees. The
   Validator sends a signed verdict per supplier to the Consumer and the
   Board; its hash goes to the decision log.
5. **Settlement**, one of 3 verdicts per supplier (delivered ≥ promised =
   Pass; delivered ≥ 5 but below promise = Short of promise; delivered < 5 =
   Under gate):
   - **Pass** (TechBlog, promised 7, delivered 8): supplier submits the
     result and withdraws the full award 7 after `unlock_time`. Board
     authorizes a refund of the bond; supplier withdraws bond 1.75.
   - **Short of promise** (CodePodcast, promised 8, delivered 6): supplier
     submits the result and withdraws the full award 6. Board withdraws the
     bond and repays it minus the forfeit: 1.5 × (8 − 6) ÷ 8 = 0.375 forfeited,
     1.125 returned. Escrows cannot split, so the remainder returns as a
     plain transfer and the Board forwards the forfeit to the Consumer as a
     plain transfer.
   - **Under gate** (DevNewsletter, promised 12, delivered 0): award 7 goes
     back to the Consumer, supplier gets 0. Board withdraws the full bond
     1.75 after `unlock_time` and forwards it to the Consumer. **The demo's
     main event.**
6. **Receipt:** Consumer net -10.875 for 14 verified signups (8 + 6), about
   0.78 per signup. ROI leaderboard. Round-2 allocation shown as the
   optimizer's decision (TechBlog 50 / CodePodcast 50 / DevNewsletter 0) —
   illustrative, no chain ops.

Escrows per run: 11. Bid fee (Supplier → Board) 4 and Validator fee
(Board → Validator) 1 run in the background. Award (Consumer → Supplier) 3
and bond (Supplier → Board) 3 are the critical path (6 total). Lock early,
in parallel.

Payout mechanics (remainder and forfeit as plain transfers) are a trust
assumption on the Board.

## Component contracts

| Component | Inputs | Outputs | Done when |
|---|---|---|---|
| `app/` Wrapper UI | user clicks, SSE subscription | rendered tender → bids → dashboard → receipt; event ledger | <30s to a running demo; every money element badged |
| Tender Board (service in the app, not an agent) | tender, commit hashes, reveals, verdicts | invitations, eligible + ranked bids, winners, settlement calls | commit-reveal mismatches rejected; budget fill ≤ 20 |
| `lib/agents/` | tender terms, bids, signup counts | bids, tender, signed verdicts | ≤6–8 tool calls per run; roles distinct (Consumer / 4 Suppliers / Validator) |
| `lib/outcome-feed/` | supplier list, scenario script | signed signup events + impression counts | verifier accepts its signatures; DevNewsletter emits 0 verified signups |
| `lib/verifier/` | events + shop public key | verified signup counts per supplier | 3 deterministic checks only; bot signals never gate |
| `lib/settlement/` | verified counts, bids, gate | Pass / Short of promise / Under gate settlement + Masumi calls | checks measured signups vs bid quote AND gate; forfeit = bond × (promised − delivered) ÷ promised |
| `lib/masumi/` | escrow ops, registry queries | tx hashes + explorer links; agent cards | every chain op surfaces a clickable proof link |
| `data/seeds/` | — | supplier cards, tender terms schema | discovery works instantly with zero network |

## Masumi state mapping

Our per-supplier states map onto Masumi escrow states:

```text
OURS:      ESCROWED → IN_PROGRESS → DELIVERED → VALIDATING → SETTLED | REFUNDED
MASUMI:    FundsLocked → (work) → ResultSubmitted → (Validator verdict) → withdraw (Pass, Short of promise)
                                                                      ↘ refund (Under gate; path A2, open)
                                                                      (Disputed = third-party path; not our demo path)
```

Full chain per supplier: `DRAFT → TENDERED → QUOTED → AUTHORIZED → ESCROWED →
IN_PROGRESS → DELIVERED → VALIDATING → SETTLED | REFUNDED`. Pass and Short of
promise end in SETTLED, Under gate ends in REFUNDED, Lost bid never leaves
QUOTED.

## Open items

- **D9:** preprod contract V1 vs V2 (V2 allows AuthorizeRefund from any state,
  V1 only from Disputed). Decide before the dry run.
- **Refund path A2:** the supplier never submits a result and the Consumer
  reclaims the award after the submit-result deadline without a supplier
  signature. Open until the D9 preprod dry run confirms the contract allows it.
- **Budget fill rule:** "accept each bid while the running total stays within
  20" does not define whether a bid that does not fit stops the fill or is
  skipped. The demo example never hits this case.
- **Win-chance formula (proposal):** a supplier bids only if win chance ×
  margin − 0.2 > 0; win chance = clamp(2 − p ÷ R, 0, 1), p = own price per
  promised signup, R = highest winning price per signup in the last auction
  (operator-set for the first). An LLM estimate is an open question.

## Failure handling

- Masumi API unreachable/slow → `SIMULATE_PAYMENTS=true`: labelled simulated
  ledger continues the demo; badges flip to SIMULATED.
- LLM provider down → fall back to the Groq or Gemini keys; if all fail →
  `DEMO_MODE=canned`.
- Anything else on fire at 06:30 → canned replay + the Oct 7 video. The demo
  never dies; it degrades with honest labels. (06:30 and 07:00 are internal
  buffers before the 07:14 code freeze.)
