# Services — what we use, why, and who sets it up

Every external dependency of the build. If it's not on this list, we don't
need it on the night.

## Masumi hosted preprod (primary payment rail) — THE critical dependency

| Item | Detail |
|---|---|
| What | Hosted payment-service API (escrow), registry (discovery), faucet, explorer |
| Why | Topic partner's rails; escrow + dispute primitives; 25% track relevance |
| Access | Provided for the event (confirmed Oct 2): hosted payment-service API + docs |
| We need from organizers/partner | API base URL, API keys (ReadAndPay level minimum), faucet access for tADA + test USDM, registry write for our 3 publisher agents |
| Our usage | 3 escrow locks (€6 each) early in the night, in parallel; settlement release/refund; registry reads for discovery; tx hashes → cardanoscan preprod links in UI |
| Permission levels | Read (queries) / ReadAndPay (lock, release, refund — **this is what we need**) / Admin (disputed arbitration — we do NOT plan to use; our refund path is publisher-authorized, uncontested) |
| Gotchas | Polling is multi-minute per state transition → lock early, parallel; verify auth + reachability before Oct 8 |
| Status | ☐ API credentials in hand · ☐ auth verified · ☐ wallets funded · ☐ one lock→release dry run with tx hash saved |

## Vercel (hosting)

| Item | Detail |
|---|---|
| What | Next.js 16 hosting for the playground — the single public URL judges open |
| Why | Public URL in minutes; all chain/LLM calls happen server-side; venue wifi only needs HTTPS |
| Setup | `vercel` CLI; link repo; env vars in project settings; Hobby plan is enough |
| Limits to respect | ~60s function timeout → stepwise scenario + SSE + job-token/poll for settlement |
| Status | ☐ project linked · ☐ env vars set · ☐ deploy pipeline green |

## LLM providers

| Item | Detail |
|---|---|
| Primary | OpenAI (credits confirmed for the event — mechanics to confirm at kickoff) |
| Fallback | Groq → Gemini, env-swap via AI SDK provider switch; keys pre-tested |
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
| What | Private repo (flip to public at code freeze Oct 9 — open-sourcing may help the overall prize) |
| Why | Codebase is a judged deliverable; commit history is evidence |
| Collab | Invite Vladimir as collaborator before Oct 8; both push to `main` |

## Payment rail: Masumi ONLY (team decision Oct 4)

No x402, no second rail. If Masumi preprod is unreachable, the demo degrades
to the labelled simulated ledger + canned replay — both honest, both built
in from hour 1.

## ElevenLabs (optional)

| Item | Detail |
|---|---|
| What | TTS narration for the 2-min video |
| Rule | Pre-generate before Oct 8; never burn quota live; captions are the fallback |
| Status | ☐ narration MP3s rendered and downloaded |

## Explicitly NOT needed

VPS / Docker payment service (hosted access supersedes it) · database
(in-memory + seeded JSON) · MetaMask / browser wallets (server-side custodial
pattern) · custom domain (Vercel URL is fine) · any Cardano/chain code.
