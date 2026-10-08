# Services — what we use, why, and who sets it up

Every external dependency of the build. If it's not on this list, we don't
need it on the night.

## Masumi hosted preprod (primary payment rail) — THE critical dependency

| Item | Detail |
|---|---|
| What | Hosted payment-service API (escrow), registry (discovery), faucet, explorer |
| Why | Topic partner's rails; escrow + dispute primitives; 25% track relevance |
| Access | Superseded by [ADR 0001](adr/0001-railway-for-masumi-rails-vercel-for-product.md): organizers did not provide a hosted Payment Service, so we run our own node on Railway. Registry, faucet and explorer stay Masumi's |
| We need from organizers/partner | API base URL, API keys (ReadAndPay level minimum), faucet access for tADA + tUSDM (test USDM on preprod is **UNVERIFIED**, fallback tADA with scaled amounts), registry write for our 4 supplier agents |
| Our usage | 10 escrows (tUSDM) per run: 6 on the critical path (3 awards, 3 bonds), REAL; 4 bid fees in the background, SIMULATED first and REAL if time allows; locked early, in parallel. Settlement per verdict (Pass, Short of promise, Under gate). Registry reads for discovery; tx hashes → cardanoscan preprod links in UI |
| Permission levels | Read (queries) / ReadAndPay (lock, submit result, request/authorize refund — **this is what we need**) / Admin (key management, not arbitration — keep out of Vercel) |
| Gotchas | Polling is multi-minute per state transition → lock early, parallel; verify auth + reachability before Oct 8 |
| Status | ☐ API credentials in hand · ☐ auth verified · ☐ wallets funded (Consumer, 4 suppliers, Board) · ☐ one lock → submit-result → withdraw dry run with tx hash saved · ☐ one refund dry run (Under-gate path, D9) |

## Vercel (hosting)

| Item | Detail |
|---|---|
| What | Next.js 16 hosting for the Wrapper UI and the Tender Board — the single public URL judges open |
| Why | Public URL in minutes; all chain/LLM calls happen server-side; venue wifi only needs HTTPS |
| Setup | Project `ad-slot-auction` exists (created 4 Oct, do not recreate); Git remote is now `bid-royale`; env vars in project settings; Hobby plan is enough |
| Limits to respect | ~60s function timeout → stepwise scenario + SSE + job-token/poll for settlement |
| Status | ☐ project linked · ☐ env vars set · ☐ deploy pipeline green |

## LLM providers

| Item | Detail |
|---|---|
| Primary | OpenAI Agents SDK (final call at kickoff); OpenAI credits for the event, activation to confirm at kickoff |
| Fallback | Vercel AI SDK v7, or raw OpenAI function calling; Groq → Gemini keys as LLM fallback, pre-tested |
| Usage | Agent tool loops only; tight prompts, ≤6–8 tool calls per scenario run |
| Status | ☐ OpenAI key working · ☐ Groq key tested · ☐ Gemini key tested |

## Cardano explorer (preprod)

| Item | Detail |
|---|---|
| What | preprod.cardanoscan.io — tx-hash links shown in the UI ledger |
| Why | "Sandbox transaction counts" — the link IS the proof |
| Status | ☐ sample preprod tx link renders correctly |

## GitHub (this repo)

| Item | Detail |
|---|---|
| What | Private repo `bid-royale` (flip to public at code freeze Oct 9 — open-sourcing may help the overall prize) |
| Why | Codebase is a judged deliverable; commit history is evidence |
| Collab | Invite Vladimir as collaborator before Oct 8; both push to `main` |

## Payment rail: Masumi ONLY (team decision Oct 4)

No x402, Masumi-only, no second rail. If Masumi preprod is unreachable, the demo degrades
to the labelled simulated ledger + canned replay — both honest, both built
in from hour 1.

## ElevenLabs (optional)

| Item | Detail |
|---|---|
| What | TTS narration for the 2-min video |
| Rule | Pre-generate before Oct 8; never burn quota live; captions are the fallback |
| Status | ☐ narration MP3s rendered and downloaded |

## Explicitly NOT needed

A VPS (the Payment Service runs on Railway, ADR 0001) · a relational database
for the Board (state is Upstash Redis + seeded JSON, decided 8 Oct) · MetaMask / browser wallets (server-side custodial
pattern) · custom domain (Vercel URL is fine) · any Cardano/chain code.
