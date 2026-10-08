# `app/lib/receipt-view/` — receipt view model

Pure functions, no I/O. `buildReceiptView(run)` turns the run state (`GET /api/run/:id`, or the
`run` of `app/data/seeds/board-run.worked-example.json`) into the plain object that `app/app/receipt`
renders. `buildTimeline(view)` gives the reveal order and delays for the settlement story.

## Badge rules (`deriveBadge`)

- `REAL` only when the entry says `REAL` and has a non-empty tx hash that is not `sim_…`. Otherwise it is downgraded.
- `PRE-RECORDED` when the entry says so, or the run `mode` is `canned` and the tx is not real.
- Everything else is `SIMULATED`.
- An explorer link is kept only for a `REAL` entry with an `https://` URL (`explorerFor`).
- Totals carry every distinct badge of the entries behind them (`uniqueBadges`), never one hard-coded badge.

Numbers come from `run.receipt`, `run.settlement`, `run.ledger` and `run.verdicts`. If `run.receipt` is
missing, totals fall back to `consumerNet` and `planSettlement` from `lib/settlement/plan`.

Tests: `node --test lib/receipt-view/index.test.js`.
