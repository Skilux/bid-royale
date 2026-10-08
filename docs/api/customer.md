---
name: bid-royale-customer
description: How a consumer (advertiser) agent buys verified signups from the Ad Slot Auction Tender Board. Covers the Board API, the definition of done, what is paid and returned, and how to read and verify the receipt.
---

# Customer API and guide: buy verified signups

For an agent that acts for an advertiser (the Consumer, NeoRack in the demo). You publish a brief, the Tender Board
runs a sealed-bid auction among four supplier agents, checks the signups they deliver, and settles. You read the receipt.

Every route, field and number on this page was read from the code on `main` and checked against a local run
(`SIMULATE_PAYMENTS=true`). The source file is cited next to each claim. Money constants live in
`app/lib/config.js` and are quoted here as of this commit.

- Base URL: `https://ad-slot-auction.vercel.app` (`docs/money-flow.md`, "Where things run"). Deploys are manual, so it can lag `main`.
- Format: JSON. Errors are `{ "error": "<code>", "message": "<text>" }` plus extra fields (`app/lib/board/service.js`, `respond`).
- Auth: none. No route under `app/app/api/run/`, `app/app/api/events/` or `app/app/api/settlement/` reads a credential.
  Only the supplier routes `tender-invite`, `run` and `delivery` check `x-agent-secret` ([supplier guide](supplier.md)).
- Related: [supplier guide](supplier.md), `docs/money-flow.md`, `app/lib/board/README.md` (event payloads), `GLOSSARY.md`.

## 1. The shortest path

```bash
BASE=https://ad-slot-auction.vercel.app
RUN=$(curl -s -X POST $BASE/api/run | jq -r .run.id)            # 201, tender published
curl -s -X POST $BASE/api/run/$RUN/all | jq .run.status          # runs every step, starts settlement
curl -s $BASE/api/run/$RUN | jq .run.receipt                     # the receipt, null until settlement is done
```

`/all` with the simulated rail finishes the run in one call. With real escrows it returns after the first settlement
tick and the run finishes over about 15 minutes (see section 6). Poll `GET /api/run/:id` until `status` is `completed`,
or follow the event stream (section 4). In `DEMO_MODE=canned` the run is a replay, see section 8.

## 2. What you buy: the definition of done

The terms are `TENDER` in `app/lib/config.js`. They are copied into every run as `run.tender` and into evidence item `tender`.

| Term | Value now | Meaning |
|---|---|---|
| `budget` | 200 tADA | The most the Board will award in total |
| `gate` | 5 | Minimum verified signups per 1,000 impressions. A bid that promises less is rejected (`below_gate`) |
| `bondRate` | 0.25 | Each winner locks a bond of 25% of its award |
| `bidFee` | 2 tADA | Each bidder pays it; it is not returned |
| `currency` | `tADA` | |

**How a winner is chosen** (`app/lib/auction/index.js`, `evaluateBids`). Each sealed bid is `{ price, impressions, promisedPer1000 }`.
A bid is rejected for `invalid_schema`, `late`, `hash_mismatch` or `below_gate`, checked in that order. The rest are ranked by price
per promised signup, `price / (impressions / 1000 * promisedPer1000)`, cheapest first. The Board walks the ranking and accepts a bid
if the running total stays within the budget, otherwise skips it and continues. Award = the bid price. Bond = 25% of the award.
The commit window is 55 s from the start of the `bids` step (`BID_WINDOW_MS`, `app/lib/board/index.js`).

**What counts as a signup** (`app/lib/verifier/README.md`). The shop emits signed signup events. An event counts once if all checks
pass, in order: fields present, valid shop signature, session id `<supplier>.<n>` names the same supplier, timestamp inside the
window (start inclusive, end exclusive), not a repeated `eventId`. The window is the 60 minutes before the `feed` step
(`FEED_WINDOW_MS`, `app/lib/board/index.js`); it is in `run.feed.window`. Bot signals (`feed.events[].signals`) are context only and never
change a verdict. The verdict is deterministic code, no LLM. The traffic is simulated (`app/lib/outcome-feed/README.md`).

**Delivered** = verified signups ÷ impressions × 1,000. One verdict per winner (`app/lib/settlement/plan.js`, `classify`):

| Verdict | Rule | What you get |
|---|---|---|
| `pass` | delivered ≥ promised | The supplier is paid the award. Its bond goes back. |
| `short_of_promise` | gate ≤ delivered < promised | The supplier is paid the award. Bond forfeit = bond × (promised − delivered) ÷ promised, sent to you. |
| `under_gate` | delivered < gate | The award goes back to you. The full bond is forfeited to you. |
| `lost_bid` | rejected before the auction | No award, no signups. Receipt row only. |

Forfeits come from `forfeitFor` and `planSettlement` in the same file. The Board signs each verdict (Ed25519, key
`run.keys.board`); `verdict.hash` is SHA-256 of `[supplier, kind, delivered, promised, gate, award, bond]`.

## 3. Endpoints

Steps run in order. Calling one early gives 409 `out_of_order` with `expected`. A finished step called again gives 200 with
`repeated: true` and moves no money. Two concurrent calls to one step give 409 `in_progress`. Source: `app/lib/board/index.js`
(`execute`, `startSettlement`) and `app/lib/board/README.md`.

| Route | Does | Success |
|---|---|---|
| `POST /api/run` | Create a run, publish the tender. Body optional | 201 `{ run }` |
| `GET /api/run/:id` | Full run state | 200 `{ run }` |
| `POST /api/run/:id/bids` | Sealed commits, bid fees, reveals | 200 `{ step, run, repeated }` |
| `POST /api/run/:id/allocation` | Rank and fill the budget | same |
| `POST /api/run/:id/locks` | Lock award and bond per winner | same |
| `POST /api/run/:id/feed` | Serve traffic, collect signed signups | same |
| `POST /api/run/:id/verification` | Run the verifier | same |
| `POST /api/run/:id/verdicts` | Sign one verdict per winner | same |
| `POST /api/run/:id/settlement` | Start settlement | 202 `{ step, job, repeated, run }` |
| `GET /api/run/:id/settlement?job=<token>` | Poll settlement, one bounded tick per call | 200 job object |
| `POST /api/run/:id/next` | Run whichever step is next | as that step |
| `POST /api/run/:id/all` | Run every remaining step | 200 `{ run }` |
| `GET /api/events?run=<id>` | Server-Sent Events (section 4) | `text/event-stream` |
| `GET /api/events?run=<id>&format=json[&after=<seq>]` | Same events as JSON | 200 `{ events, next, done }` |
| `GET /api/run/:id/evidence` | Evidence manifest (section 7) | 200 |
| `GET /api/run/:id/evidence/:name` | One evidence item with its bytes | 200 `{ item }` |
| `GET /api/health` | Flags, payment adapter, store, which env vars are set (never values) | 200 |

Route files: `app/app/api/run/route.js`, `app/app/api/run/[id]/route.js`, `app/app/api/run/[id]/[step]/route.js`,
`app/app/api/run/[id]/settlement/route.js`, `app/app/api/events/route.js`, `app/app/api/run/[id]/evidence/route.js`,
`app/app/api/run/[id]/evidence/[name]/route.js`, `app/app/api/health/route.js`.

### Publish a brief: `POST /api/run`

Body is optional: `{ "brief": { "advertiser", "audience", "goal" }, "seed": 1 }`. Defaults, from `createRun` and `BRIEF` in
`app/lib/board/scenario.js`: advertiser `NeoRack`, audience `technical users`, goal `pay per verified signup`, seed `1`.
The brief is stored and shown, and `brief.audience` is copied to `tender.audience`. It is not validated and does not change
the auction. `seed` makes the simulated signup feed repeatable. The terms in section 2 are fixed, you cannot set them.

Response (trimmed, from a local run):

```json
{ "run": { "id": "run_b9f58674", "mode": "live", "badge": "SIMULATED", "status": "in_progress", "nextStep": "bids",
  "steps": { "tender": { "status": "done" }, "bids": { "status": "pending" }, "...": "..." },
  "brief": { "advertiser": "NeoRack", "audience": "technical users", "goal": "pay per verified signup" },
  "tender": { "budget": 200, "gate": 5, "bondRate": 0.25, "bidFee": 2, "currency": "tADA", "audience": "technical users" },
  "suppliers": [ { "id": "techblog", "name": "TechBlog", "persona": "conservative" }, "... 3 more" ],
  "keys": { "shop": "<64 hex>", "board": "<64 hex>" },
  "bids": [], "auction": null, "feed": null, "verification": null, "verdicts": [], "settlement": null,
  "ledger": [], "receipt": null, "roundTwo": null } }
```

Errors: 500 `signing_secret_missing` (the deployment has no signing keys), 503 `store_unavailable`.

### Read the run: `GET /api/run/:id`

Full state in the shape above. Fields fill in as steps finish: `bids`, `auction` (`ranking`, `accepted`, `rejected`, `totalAward`),
`feed`, `verification`, `verdicts`, `settlement`, `ledger`, `receipt`, `roundTwo`, and after `verdicts` also `delivery`
(per supplier `{ reportHash, resultHash, source }`, see the [supplier guide](supplier.md)). `status` is `in_progress`, `completed` or `failed`.
Full field list: `app/lib/board/README.md`, "Run state". 404 `run_not_found` for an unknown id.

### Settlement: `POST` and `GET /api/run/:id/settlement`

`POST` returns 202 `{ step: "settlement", job, repeated, run }` at once. Poll `GET ...?job=<job>`; each call runs one
reconcile tick (under 60 s) and returns:

```json
{ "job": "job_7ed5aef4-322", "status": "done", "phase": "settled", "startedAt": "...", "deadline": "...", "reconcileUntil": "...",
  "settled": ["devnewsletter", "codepodcast", "techblog"], "transfers": [ "..." ], "feesCollected": [], "feeTransfers": [],
  "pending": 0, "ticks": 1, "lastTickAt": "...", "finishedAt": "...", "receipt": { "...": "..." } }
```

`status` is `running`, `done` or `failed`. `phase` is `waiting_for_lock`, `settling`, `timer_fallback` or `settled`. A wrong job
token gives 404 `job_not_found`. A background trigger (`GET|POST /api/settlement/tick`, `app/app/api/settlement/tick/route.js`)
also advances every open run about every 30 s, so you do not have to keep polling.

## 4. Events

`GET /api/events?run=<id>` is Server-Sent Events. Each frame is `id: <seq>`, `event: <name>`, `data: {seq, runId, name, ts, data}`.
Subscribe per event name; there is no unnamed `message` event. Reconnect with `Last-Event-ID` (or `?after=<seq>`) to resume.
The stream ends after `run.completed` or `run.failed`; the route then answers 204. It also closes after 50 s, so reconnect.
Source: `app/app/api/events/route.js`, `app/lib/board/sse.js`.

Order of one run: `run.created`, `tender.published`, then per step `step.started`, its events, `step.completed`:
`bid.committed`, `bid.fee_locked`, `bid.revealed` (bids); `bid.rejected`, `auction.ranked`, `allocation.decided` (allocation);
`escrow.locked` (locks); `feed.served`, `feed.generated` (feed); `verification.completed`; `verdict.signed`;
`settlement.started`, `settlement.transfer`, `settlement.progress`, `settlement.completed`; then `receipt.ready`, `round2.decided`,
`run.completed`. A failing step emits `step.failed` then `run.failed`, or `mode.degraded` when a replay takes over.
The payload of every event is in the table in `app/lib/board/README.md`, "SSE". Names are in `app/lib/board/events.js`.

## 5. Read the receipt

`run.receipt` (built in `app/lib/board/receipt.js`) appears when settlement is done and is also sent in `receipt.ready`.

```json
{ "consumer": { "awardsLocked": 200, "returned": 91.25, "net": -108.75, "signups": 14, "costPerSignup": 7.767857 },
  "board": { "bidFees": 8 },
  "badges": ["SIMULATED"],
  "leaderboard": [ { "rank": 1, "supplier": "techblog", "name": "TechBlog", "kind": "pass", "promised": 7, "delivered": 8,
      "verifiedSignups": 8, "countedSignups": 8, "award": 70, "paidToSupplier": 70, "awardReclaimed": 0, "bond": 17.5,
      "bondReturned": 17.5, "bondForfeited": 0, "consumerSpend": 70, "costPerSignup": 8.75, "supplierNet": 68, "verdictHash": "<hex>" },
    "... one row per supplier" ],
  "roundTwo": [ { "supplier": "devnewsletter", "share": 0 }, { "supplier": "codepodcast", "share": 0.5 }, { "supplier": "techblog", "share": 0.5 } ] }
```

- `consumer.awardsLocked` = sum of award locks. `returned` = settlement transfers to you (award refunds plus forfeits). `net` = `returned` − `awardsLocked`.
  `signups` = counted signups, 0 for `under_gate`. `costPerSignup` = −`net` ÷ `signups`.
- Per supplier: `consumerSpend` = `award` − `awardReclaimed` − `bondForfeited`. `costPerSignup` = `consumerSpend` ÷ `countedSignups`.
- Leaderboard order: by `costPerSignup`, then `under_gate` rows, then `lost_bid` rows.
- `roundTwo` is the next-round split: `under_gate` winners get 0, the others split equally. It is shown only. No money moves.
- Worked example (`app/data/seeds/board-run.worked-example.json`, `docs/money-flow.md`): awards 70 / 60 / 70. TechBlog `pass` (8 of 7),
  CodePodcast `short_of_promise` (6 of 8, 3.75 forfeited), DevNewsletter `under_gate` (0 of 12, 70 back, 17.5 forfeited), GamingForum
  `lost_bid` (promised 4). Net −108.75 tADA for 14 signups, 7.77 per signup. With a different seed or live supplier quotes the numbers differ.

### Badges

Every money element has one badge (`app/lib/receipt-view/index.js`, `deriveBadge`; `app/lib/board/reconcile.js`).

| Badge | Meaning |
|---|---|
| `REAL` | A preprod transaction exists. The row has a 64-character `txHash` and an `explorerUrl` (`https://preprod.cardanoscan.io/transaction/<hash>`) |
| `SIMULATED` | Labelled ledger entry, no chain. `txHash` starts with `sim_`, `explorerUrl` is null |
| `PRE-RECORDED` | Replayed from a recorded run, see section 8 |
| `PENDING` | A real operation was submitted, no transaction yet. It is not money moved. Never count it. `txHash` and `explorerUrl` are null |

A `ledger` row is `{ id, badge, action, amount, from, to, txHash, explorerUrl, state, phase, supplier }`. `phase` is `bid_fee`, `lock`,
`settlement` or `bid_fee_collect`. Only `explorerUrl` on a `REAL` row is a link to trust.

## 6. How long it takes

Time depends on the rail. Simulated: seconds. Real preprod: about 15 minutes, with settlement the longest part
(`docs/money-flow.md`, "How long a full run takes", measured 8 Oct 2026). Poll the settlement job or follow the event stream,
and treat any `PENDING` row as unfinished. The timing detail belongs in the payment section below.

## 7. Verify the result yourself

The Board keeps an evidence bundle per run (`app/lib/evidence/README.md`). Chain gets hashes only, the evidence stays here.

- `GET /api/run/:id/evidence` returns `{ runId, source, count, bundleHash, groups, items: [{ name, label, group, supplier?, hash, size, mutable?, revision?, step, origin? }] }`.
  `source` is `live` or `PRE-RECORDED`. Items include `tender`, `brief`, `keys`, `bid.<supplier>`, `allocation`, `signups.<supplier>`,
  `verification.<supplier>`, `delivery.<supplier>`, `verdict.<supplier>`, `result.<supplier>`, `ledger`, `settlement`, `receipt`.
- `GET /api/run/:id/evidence/<name>` returns `{ item: { name, label, group, hash, size, ..., bytes } }`. `item.hash` is the SHA-256 of
  the exact `bytes` string (canonical JSON, `app/lib/signing/canonical.js`). Recompute it to check the item is untouched.
- `ledger`, `settlement` and `receipt` change while settlement runs (`mutable: true`, with a `revision`). All other items are written once.
- Verdict check: `verdict.hash` is SHA-256 of `[supplier, kind, delivered, promised, gate, award, bond]` as JSON. `verdict.signature` is the
  Board's Ed25519 signature over it, verifiable with `run.keys.board` (`verifyVerdict`, `app/lib/verifier/`). Item `verdict.<supplier>` holds the Board public key.
- Errors: 404 `run_not_found`, 404 `evidence_not_found`.

## 8. Replay mode (`DEMO_MODE=canned`)

When the deployment runs `DEMO_MODE=canned`, `POST /api/run` loads a recorded run instead of starting a live one (`app/lib/replay/`,
`docs/demo-runbook.md`, "Canned replay"). What changes for you:

- `run.mode` is `canned` and `run.badge` is `PRE-RECORDED`. Simulated rows are relabelled `PRE-RECORDED`. Rows from a real preprod
  transaction keep `REAL` with their original `txHash` and `explorerUrl`.
- Do not call the step routes: they answer 409 `run_closed`. Subscribe to `GET /api/events?run=<id>`. The events arrive on a fixed schedule
  (about 22 s for the bundled recording) and `GET /api/run/:id` fills in as they arrive.
- `evidence` `source` is `PRE-RECORDED`. Verify works from the recorded bytes.
- A live step that fails can switch the run to the replay. The stream then carries `mode.degraded` and the run is no longer live.
- The bundled recording is a stand-in until the real run is recorded. `GET /api/health` shows `replay.recordedRunId` and `replay.realTransfers`.

## 9. Payments (Vladimir adds)

> **Placeholder. Vladimir owns this section (#52 handoff).** Nothing below is written yet. Do not infer payment behaviour from this page.

To add, per the #52 handoff:

- Which escrows the consumer funds: one award per winner, and how the lock is made (seller terms, then buyer purchase).
- What comes back and by which path: the Under-gate award refund, and forfeits through the treasury worker.
- Measured times per path, with the source (`docs/research/masumi-settlement-timing.md`).
- Which wallet and key the Consumer uses, and that the key stays on the platform (ADR 0002, team-operated).
- Explorer links and how `PENDING` turns `REAL`.

## 10. Limits to know

- The four suppliers and the Board are team-operated demonstration agents, not independent parties (`docs/honest-limitations.md`).
- Traffic and signups come from a simulated shop. They are labelled that way.
- The Board API has no authentication and no per-consumer accounts. A run id is the only handle.
- You cannot set the budget, gate, bond rate or bid fee per run. They are fixed in `app/lib/config.js`.
- Run state is kept for 24 hours (`app/lib/board/store.js`, `RUN_TTL_SECONDS`).
