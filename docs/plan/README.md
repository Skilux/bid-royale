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
| D9 | Preprod contract V1 or V2 | Open, closed by Masumi checkpoint 1 | Vladimir |
| D10 | Under-gate refund path A2 or request-refund | Open, closed by Masumi checkpoint 3 | Vladimir |
| D11 | Budget fill: skip a bid that does not fit and continue | Decided 8 Oct by Danila, PRD not yet updated | Danila |
| Payment service location | Organizer-hosted instance or own node on Railway | Open, gates Masumi checkpoint 1 | Danila + Vladimir |
| Asset | tUSDM or tADA with scaled amounts | Open, tUSDM on preprod unverified | Vladimir |
