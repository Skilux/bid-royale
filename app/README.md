# `app/` — the playground

**Build on the night:** `npx create-next-app@latest` (TypeScript, App Router,
Tailwind) scaffolded here.

## Purpose

The one public URL the judges open. No signup, no wallet, no install.
Campaign brief → tender board → live dashboard → settlement beat → receipt.

## Contract

- **Inputs:** user clicks ("Run demo"), SSE subscription.
- **Outputs:** rendered scenario stages; live event ledger; REAL / SIMULATED /
  PRE-RECORDED badges on every money element.
- **Routes (plan):** `/` (brief + run button), `/tender` (board + bids),
  `/dashboard` (impressions + verified outcomes per publisher, ROI),
  `/receipt` (spent / refunded, round-2 allocation), `/api/health` (pre-flight),
  `/api/events` (SSE stream), `/api/*` (orchestrator: tender, bids, settle).

## Done when

A judge opens the URL and reaches a running demo in under 30 seconds.
