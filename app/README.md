# `app/` — the Wrapper UI

**Already scaffolded:** Next 16.3.8, React 19, plain JS (no TypeScript).
Package name `ad-slot-auction`; scripts `dev`, `build`, `start`. Exists today:
`app/package.json`, `app/app/layout.js`, `app/app/page.js` (a placeholder
heading). Not there yet: Tailwind, zod, the agent SDK, any route below.

**To add on the night (plan):** Tailwind, zod, the OpenAI Agents SDK (final
call at kickoff), the routes below.

## Purpose

The one public URL the judges open. No signup, no wallet, no install.
Brief → tender → live dashboard → settlement beat → receipt.

## Contract

- **Inputs:** user clicks ("Run demo"), SSE subscription.
- **Outputs:** rendered scenario stages; live event ledger; REAL / SIMULATED /
  PRE-RECORDED badges on every money element.
- **Dashboard (plan):** the tender, the 4 bids, GamingForum shown as rejected
  below the gate, impressions and verified signups per supplier, verdict
  badges (Pass, Short of promise, Under gate, Lost bid).
- **Receipt (plan):** Consumer net −105 tADA for 14 verified signups (recorded run `run_c1f40522`; the worked example reads −108.75);
  round-2 reallocation shown as the optimizer's decision (illustrative).
- **Routes (plan):** `/` (brief + run button), `/tender` (tender + bids),
  `/dashboard` (impressions + verified signups per supplier, verdicts),
  `/receipt` (spent / returned / forfeited, round-2 allocation),
  `/api/health` (pre-flight), `/api/events` (SSE stream), `/api/*` (Tender
  Board: tender, bids, settle).

## Done when

A judge opens the URL and reaches a running demo in under 30 seconds.
