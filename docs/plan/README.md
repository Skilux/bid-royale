# Build plan: lanes and checkpoints

One file per lane. Each lane has a goal, ordered checkpoints and a definition of
done. Hours are proposals for the night of 8 Oct (build 21:00, code freeze 07:14
on 9 Oct, Prague time). Spec: Notion PRD v3.1. Rules: `AGENTS.md`.

| Lane | Owner | File | Goal |
|---|---|---|---|
| Masumi | Vladimir | [`lane-masumi.md`](lane-masumi.md) | Payment logic as a standalone PoC, tested on all verdict branches |
| Product | Danila | [`lane-product.md`](lane-product.md) | Outcome feed, verifier, auction engine, supplier agents, UI shell |

## Merge points

| When | What is merged | Contract |
|---|---|---|
| Masumi checkpoint 1 (21:30) | Function signatures of `lib/masumi` and the verdict input shape | `lib/masumi/README.md`, `lib/settlement/README.md` |
| ~00:00 | UI wired to settlement through the simulated adapter | `SIMULATE_PAYMENTS=true` |
| Masumi checkpoint 6 (03:30) | Real adapter replaces the simulated one | Same function signatures |
| ~05:00 | Full run recorded, video backstop | `DEMO_MODE=canned` replay |
| 06:30 | Freeze scope. Canned replay is the fallback | `docs/demo-runbook.md` |

## Decisions that gate the plan

| ID | Question | Status | Owner |
|---|---|---|---|
| D9 | Preprod contract V1 or V2 | Closed 8 Oct (#21): V2, `addr_test1wzqgalcd93sfjrc5tsc4ycwx80a8lt0s3767a4g8nh45lrg044nd9`; current-policy `custom_address` accepted by operator | Vladimir |
| D10 | Under-gate refund path A2 or request-refund | A2 proven on preprod 8 Oct (refund 27.8 min, no seller signature); cooperative refund (faster) to measure in #28 | Vladimir |
| D11 | Budget fill: skip a bid that does not fit and continue | Decided 8 Oct by Danila, PRD not yet updated | Danila |
| Payment service location | Own node on Railway, product on Vercel. Organizers did not provide a hosted instance | Decided, [ADR 0001](../adr/0001-railway-for-masumi-rails-vercel-for-product.md) | Vladimir |
| Seller agents | On Vercel (MIP-003 routes + brains), not Python SDK services on Railway | Decided 8 Oct, [ADR 0002](../adr/0002-seller-agents-on-vercel.md) | Vladimir |
| Asset | tUSDM or tADA with scaled amounts | Decided 8 Oct: tADA, spec ×10 (#24) | Vladimir |
| Board state | Upstash Redis on Vercel | Decided 8 Oct by Danila | Danila |
| Signup feed | Simple scripted generator, fixed seed, no live click path | Decided 8 Oct by Danila | Danila |
| Supplier agents | LLM decides bids from a persona template and context (aggressive, passive, ...). Outcomes stay scripted in the feed | Decided 8 Oct by Danila | Danila |
| Code layout | All code under `app/` (Vercel root directory): `app/lib/*`, `app/data/seeds`, import via `@/lib/...` | Decided 8 Oct, moved in the same change | Danila |

## Code layout

Vercel root directory is `app/` (`docs/hosting.md`). Next.js cannot import
`../lib/*` by default, and Vercel only includes files outside the root if the
project setting "Include source files outside of the Root Directory" is on
(not checked on the live project). So `lib/` and `data/` moved under `app/`.
The rule is in `AGENTS.md`, "Code layout".
