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
4. Verify: push a commit → deploy goes green → open the URL from your phone
   on cellular (proves no venue-wifi dependency)

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
- Flags: `SIMULATE_PAYMENTS` (false = real preprod), `DEMO_MODE` (live | canned)
- Shop signing key for the NeoRack signup feed: `SHOP_SIGNING_KEY` (demo-only
  key, generated locally — it signs simulated signup events)

## Working together (Danila + Vladimir)

- **Branches:** both push to `main`. No PR ceremony during the 10h build —
  speed beats process; the commit history is the audit trail.
- **Commits:** conventional commits, lowercase, <72 chars:
  `feat(ui): tender board renders bids`, `fix(settlement): verdict uses bid quote`
- **Lanes (merge points in `docs/demo-runbook.md`):**
  - Lane A — Masumi/payments: API wiring, 10 escrows (6 critical-path REAL, 4 bid fees SIMULATED first), settlement, dry runs
  - Lane B — Wrapper UI/agents/video: UI, agent loops, SSE ledger, script, video
- **Merge points:** escrow-lock API shape (night start), UI↔settlement
  wiring (~midnight), full run + video (~05:00 on Oct 9). The real build window is
  Oct 8 21:00 to Oct 9 07:14 (code freeze).
- **Vercel:** both added to the Vercel project; preview deploys per push.
- **GitHub:** Vladimir invited as collaborator (Settings → Collaborators)
  before Oct 8.

## Deploy pipeline

```text
git push main ──▶ Vercel auto-deploy ──▶ public URL updates (~1–2 min)
```

- The deployed URL is the demo URL. Test it from venue wifi and from a phone on
  cellular early in the build window (Oct 8 21:00 to Oct 9 07:14).
- `/api/health` pre-flight route reports: model reachability, Masumi API
  reachability, wallet balances (tADA) → green/amber/red on the Wrapper UI.
- Payments are Masumi only. No x402, no second rail.
- If a deploy breaks at 06:45: Vercel → Deployments → instant rollback to
  the last green build. Know where that button is before the night.
