# Build plan: lanes and checkpoints

One file per lane. Each lane has a goal, ordered checkpoints and a definition of
done. Hours are proposals for the night of 8 Oct (build 21:00, code freeze 07:14
on 9 Oct, Prague time). Spec: Notion PRD v3.1, with the 9 Oct decisions below (#58). Rules: `AGENTS.md`.

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
| ~05:00 | The one real run (#45) recorded, judge URL and video backstop | `DEMO_MODE=canned` replay of that recording |
| 06:30 | Freeze scope. Canned replay is the fallback | `docs/demo-runbook.md` |

## Decisions that gate the plan

| ID | Question | Status | Owner |
|---|---|---|---|
| D9 | Preprod contract V1 or V2 | Closed 8 Oct (#21): V2, `addr_test1wzqgalcd93sfjrc5tsc4ycwx80a8lt0s3767a4g8nh45lrg044nd9`; current-policy `custom_address` accepted by operator | Vladimir |
| D10 | Under-gate refund path A2 or request-refund | Closed 8 Oct: A2 proven on preprod (refund 27.8 min, no seller signature), cooperative refund preferred and measured at 5.9 min (#28). A2 stays as the automatic fallback | Vladimir |
| D11 | Budget fill: skip a bid that does not fit and continue | Decided 8 Oct by Danila, PRD update tracked in #58 | Danila |
| D13 | Bid fees SIMULATED first or REAL | Decided 9 Oct: REAL, anchored on the sealed bid's commit hash (#50). `MASUMI_BID_FEES=simulated` stays as a labelled fallback only | Danila |
| Validator | Separate Validator agent or the Board verifier | Decided (PRD D7, reaffirmed 9 Oct, #58): no separate agent. The Board verifier (deterministic, inside the Board) signs the verdict, the reconciler (#49) drives settlement. See `GLOSSARY.md` | Danila |
| Settlement timing for the demo (#30, L3) | Warm run and attach, labelled time cut, or live wait | Decided 9 Oct by Danila: one real run, recorded (#45), with a labelled time cut. No separate warm run. The judge URL replays that recording badged PRE-RECORDED with its REAL tx links | Danila |
| Result hash on chain (#51) | What `submit-result` anchors | `sha256(canonical delivery report + verdict hash)`, the verdict hash alone when a run has no report | Danila |
| Video length | 2:00 or under 90 s | Decided 9 Oct by Danila: under 90 s (#58) | Danila |
| Deploys | Git-triggered or manual | Manual, by Danila, with the Vercel CLI (`AGENTS.md`, "Deploying"). Pushing to `main` does not deploy | Danila |
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
