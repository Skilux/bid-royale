# 0001 — Railway hosts the Masumi rails; Vercel hosts the product

- **Status:** Accepted — 2026-10-08, confirmed by Danila and Vladimir
- **Supersedes:** the scaffold assumption "Masumi hosted preprod, no Docker/VPS needed"
  (`README.md` stack table, `docs/hosting.md`)

## Context

The organizers did not provide a hosted Masumi Payment Service. We need our own
preprod Payment Service, and our seller agents need stable public URLs to register.

Two components cannot run on Vercel functions (stateless, frozen after the
response, ~60s limit):

- **Masumi Payment Service** — starts ~15 async interval loops at boot
  (`CHECK_TX_INTERVAL`, `CHECK_COLLECTION_INTERVAL`, `REGISTER_AGENT_INTERVAL`, …;
  log line `Initialized async intervals`). These loops detect locks, submit
  results, collect and refund. Porting it to serverless would be rebuilding the rails.
- **Masumi Python SDK agents** (`masumi` 1.2.0) — run a background payment-monitor
  loop (`payment.py` `start_status_monitoring`), start job execution as a background
  task after the request returns (`server.py` `_handle_payment_confirmed`), and keep
  jobs and HITL state in memory by default.

## Decision

| Component | Host |
|---|---|
| Masumi Payment Service + Postgres (official Railway template) | **Railway** |
| Python SDK seller endpoints (TechBlog, other suppliers, Board, Validator) — one service each | **Railway** |
| Harness: tender → bids → allocation → verify → settle, UI, SSE | **Vercel** |
| Agent brains (LLM reasoning), verifier, outcome feed, `app/lib/masumi` TS client | **Vercel** |

- Python seller agents are **thin payment adapters**: the SDK handles MIP-003 routes,
  payment requests, lock monitoring and result-hash submission; `process_job` calls a
  Vercel endpoint (e.g. `POST /api/agents/<name>/run`) for the actual work.
- The Payment Service gets a **public Railway domain**, because the Vercel harness
  calls it (purchases/locks, refunds). Vercel gets only a **ReadAndPay, Preprod-only,
  usage-limited** key. The admin key stays in Railway env vars and never reaches Vercel.
- Registry lookups: open. Use a central Masumi preprod Registry Service if one is
  available to us; otherwise add the official Registry Service to Railway.
- Railway plan: **Hobby ($5/month)** — the free trial's 5-service cap is too small
  for Payment Service + Postgres + 6 seller agents.

## Consequences

- The demo no longer depends on a laptop or tunnel being up.
- Agent URLs are Railway domains; optionally fronted by Vercel rewrites for clean,
  movable URLs (not decided).
- Wallets: the local Docker Compose Payment Service used for the first proof has its
  own wallets. Railway gets fresh wallets (or imported mnemonics); fund via faucet again.
- Not a rails rebuild: we run Masumi's official Payment Service image unchanged.
- Two hosting accounts to manage; secrets split between Railway and Vercel env vars.
