# Hosting — where everything runs and how we work together

## The whole production footprint

One Vercel app. That's it. Masumi is hosted by the partner; the LLM is an API;
the chain is Cardano preprod. Nothing of ours runs on a laptop or a VPS.

```text
Internet ──▶ Vercel URL (Next.js 16 Wrapper UI + Tender Board, server-side API routes)
                 ├──▶ Masumi hosted preprod API (escrow + registry)
                 ├──▶ OpenAI (primary) / Groq / Gemini (LLM fallback)
                 └──▶ cardanoscan preprod (proof links, read-only)
```

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
- Models: `OPENAI_API_KEY` (primary), `GROQ_API_KEY`, `GEMINI_API_KEY` (LLM fallback)
- Flags: `SIMULATE_PAYMENTS` (false = real preprod), `DEMO_MODE` (live | canned)
- Shop signing key for the NeoRack signup feed: `SHOP_SIGNING_KEY` (demo-only
  key, generated locally — it signs simulated signup events)

## Working together (Danila + Vladimir)

- **Branches:** both push to `main`. No PR ceremony during the 10h build —
  speed beats process; the commit history is the audit trail.
- **Commits:** conventional commits, lowercase, <72 chars:
  `feat(ui): tender board renders bids`, `fix(settlement): verdict uses bid quote`
- **Lanes (merge points in `docs/demo-runbook.md`):**
  - Lane A — Masumi/payments: API wiring, 11 escrows (6 on the critical path), settlement, dry runs
  - Lane B — Wrapper UI/agents/video: UI, agent loops, SSE ledger, script, video
- **Merge points:** escrow-lock API shape (night start), UI↔settlement
  wiring (~midnight), full run + video (Oct 7 evening / ~05:00).
- **Vercel:** both added to the Vercel project; preview deploys per push.
- **GitHub:** Vladimir invited as collaborator (Settings → Collaborators)
  before Oct 8.

## Deploy pipeline

```text
git push main ──▶ Vercel auto-deploy ──▶ public URL updates (~1–2 min)
```

- The deployed URL is the demo URL. Test it from venue wifi at 17:30 on
  Oct 8, before building starts.
- `/api/health` pre-flight route reports: model reachability, Masumi API
  reachability, wallet balances (tUSDM + ADA) → green/amber/red on the Wrapper UI.
- Payments are Masumi only. No x402, no second rail.
- If a deploy breaks at 06:45: Vercel → Deployments → instant rollback to
  the last green build. Know where that button is before the night.
