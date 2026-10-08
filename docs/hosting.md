# Hosting — where everything runs and how we work together

## The whole production footprint

Vercel for the product and the seller agents, Railway for the Masumi node — see
[ADR 0001](adr/0001-railway-for-masumi-rails-vercel-for-product.md) and
[ADR 0002](adr/0002-seller-agents-on-vercel.md). The organizers did not provide a
hosted Payment Service, and it needs always-on background loops, which Vercel
functions can't provide. The LLM is
an API; the chain is Cardano preprod. Nothing runs on a laptop.

Board state (tender, bids, events) lives in Upstash Redis, added as a Vercel
integration (decided 8 Oct by Danila: Vercel instances do not share memory).

```text
Internet ──▶ Vercel URL (Next.js 16 Wrapper UI + Tender Board, harness, agent brains,
                 │        verifier, server-side API routes)
                 ├──▶ Railway: Masumi Payment Service + Postgres (per-party ReadAndPay keys)
                 ├──▶ Railway: treasury worker (forfeit transfers; holds the Admin key)
                 ├──▶ OpenRouter (free-tier models, tried in order)
                 └──▶ cardanoscan preprod (proof links, read-only)

Buyers / registry ──▶ Vercel /api/agents/<name>/… (MIP-003 routes + brains, ADR 0002)
                          └──▶ Railway Payment Service (that agent's own key)
```

## Railway setup

- Plan: Hobby ($5/month). Services: Payment Service + Postgres, treasury worker.
- Payment Service from the official Masumi Railway template (Payment Service +
  Postgres). Env: `ENCRYPTION_KEY`, `ADMIN_KEY`, `BLOCKFROST_API_KEY_PREPROD`.
  Public domain enabled; admin UI at `/admin`, Swagger at `/docs`.
- Admin key lives only in Railway env vars (node + treasury worker). Vercel gets one
  wallet-scoped, Preprod-only ReadAndPay key per party.
- Seller agents are not Railway services (ADR 0002). The registered `apiBaseUrl` is
  `https://ad-slot-auction.vercel.app/api/agents/<name>`. The old Python
  `techblog-agent` service is retired (#27).

## Vercel setup (do before Oct 8)

Project **`ad-slot-auction`** created 4 Oct (do not recreate). The Git remote is
now `bid-royale`; check the project's linked repo points at it:
- URL: https://ad-slot-auction.vercel.app (public — Vercel Authentication OFF)
- Framework preset: Next.js · Root directory: `app/` · Node.js: 24.x
- If the root directory ever looks wrong: Settings → General → Root Directory → `app`

1. `npm i -g vercel && vercel login`
2. `vercel link` in the repo (or import via dashboard from GitHub)
3. Project → Settings → Environment Variables — add every key from
   `.env.example` (Production + Preview)
4. Verify: deploy by hand (see Deploy pipeline below) → open the URL from your
   phone on cellular (proves no venue-wifi dependency)

## Environment variables

See `.env.example` for the full list. Rules:

- **Never commit `.env.local`.** It's gitignored. Keys live in Vercel env vars.
- Masumi: `MASUMI_PAYMENT_BASE_URL`, `MASUMI_PAYMENT_API_KEY` (ReadAndPay),
  `MASUMI_REGISTRY_BASE_URL`, `MASUMI_REGISTRY_API_KEY`, `MASUMI_NETWORK`
  (`Preprod`), `MASUMI_SELLING_WALLET_VKEY`. Names match `docs/masumi.md`
  and `.env.example`.
- Models: `OPENROUTER_API_KEY` only. The model list and caps live in
  `app/lib/supplier-agents/llm-config.js`, not in env vars (#40)
- Board state: `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash, injected by the Vercel integration)
- Flags: `SIMULATE_PAYMENTS` (false = real preprod, the production setting), `DEMO_MODE` (live | canned)
- Registry discovery is live when `MASUMI_REGISTRY_API_KEY` is set (Read-only key).
  `MASUMI_REGISTRY_BASE_URL` falls back to `MASUMI_PAYMENT_BASE_URL`
  (`app/lib/masumi/registry.js`). Without the key the Board uses the labelled seeded registry (#44).
- Shop signing key for the NeoRack signup feed: `SHOP_SIGNING_KEY` (demo-only
  key, generated locally — it signs simulated signup events)

## Working together (Danila + Vladimir)

- **Branches:** both push to `main`. No PR ceremony during the 10h build —
  speed beats process; the commit history is the audit trail.
- **Commits:** conventional commits, lowercase, <72 chars:
  `feat(ui): tender board renders bids`, `fix(settlement): verdict uses bid quote`
- **Lanes (merge points in `docs/demo-runbook.md`):**
  - Lane A — Masumi/payments: API wiring, 10 escrows, all REAL (3 awards and 3 bonds on the critical path, 4 bid fees, #50), settlement, dry runs
  - Lane B — Wrapper UI/agents/video: UI, agent loops, SSE ledger, script, video
- **Merge points:** escrow-lock API shape (night start), UI↔settlement
  wiring (~midnight), full run + video (~05:00 on Oct 9). The real build window is
  Oct 8 21:00 to Oct 9 07:14 (code freeze).
- **Vercel:** both added to the Vercel project. Pushing does not deploy: Git deploys are off (`app/vercel.json`), Danila deploys by hand.
- **GitHub:** Vladimir invited as collaborator (Settings → Collaborators)
  before Oct 8.

## Deploy pipeline

```text
push to main ──▶ nothing (Git deploys off) ──▶ Danila deploys by hand with the Vercel CLI ──▶ public URL updates
```

Pushing to `main` does not deploy. Vercel Hobby blocks Git-triggered deploys when
the commit author is not the account owner, so `app/vercel.json` turns them off.
Danila deploys production by hand with the Vercel CLI, from a clean copy of the
committed HEAD. Agents never deploy. The exact steps are in `AGENTS.md`,
"Deploying". After a deploy, quote the `/api/health` response: a green deploy is
not proof.

- The deployed URL is the demo URL. Test it from venue wifi and from a phone on
  cellular early in the build window (Oct 8 21:00 to Oct 9 07:14).
- `/api/health` pre-flight route reports: model reachability, Masumi API
  reachability, wallet balances (tADA) → green/amber/red on the Wrapper UI.
- Payments are Masumi only. No x402, no second rail.
- If a deploy breaks at 06:45: Vercel → Deployments → instant rollback to
  the last green build. Know where that button is before the night.
