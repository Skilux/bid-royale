# `app/lib/board/` — Tender Board run API

Orchestrates one auction run, stepwise: tender, bids, allocation, locks, feed, verification,
verdicts, settlement. Wires `outcome-feed`, `auction`, `verifier`, `settlement/plan` and the
payment adapter from `getAdapter()` (`app/lib/masumi`). Pure logic in `index.js`, I/O injected.
Routes under `app/app/api/` are thin wrappers (`service.js` wires env, store and adapter).

Every money element is badged. Today only the SIMULATED adapter exists, so every receipt in a
run is `SIMULATED` with `explorerUrl: null`. The Board never calls Masumi directly.

## Run it locally

```bash
cd app
export SHOP_SIGNING_KEY=$(openssl rand -hex 32) BOARD_SIGNING_KEY=$(openssl rand -hex 32)   # or .env.local
npm run dev
RUN=$(curl -s -X POST localhost:3000/api/run | jq -r .run.id)
curl -s -X POST localhost:3000/api/run/$RUN/all | jq .run.receipt.consumer     # net -108.75, signups 14
curl -N "localhost:3000/api/events?run=$RUN"                                  # replay the SSE stream
```

No keys: `POST /api/run` answers 500 `signing_secret_missing`. No Upstash env: state is in memory
(fine for `next dev`, lost between serverless invocations). Tests: `node --test "lib/**/*.test.js"`.

## Render without a server

`app/data/seeds/board-run.worked-example.json` holds one full run: `{ run, events }`. `run` is the
exact body of `GET /api/run/:id` after settlement, `events` are the SSE frames in order
(`{ seq, ts, name, data }`). Signed with throwaway fixture keys. A test fails if it drifts from the
code. Regenerate: `node lib/board/record-fixture.js`.

## Routes

All JSON. Errors are `{ error, message, ... }` with the status below.

| Route | Does | Success |
|---|---|---|
| `POST /api/run` | Create run, publish tender. Body optional: `{ brief?, seed? }` | 201 `{ run }` |
| `GET /api/run/:id` | Full run state | 200 `{ run }` |
| `POST /api/run/:id/bids` | 4 sealed commits, 4 bid fees locked (each escrow's inputHash = the commit), then reveals | 200 `{ step, repeated, run }` |
| `POST /api/run/:id/allocation` | Recompute commits, reject, rank, fill the 200 budget | same |
| `POST /api/run/:id/locks` | Lock award and bond per winner, in parallel | same |
| `POST /api/run/:id/feed` | NeoRack signed signup feed (scripted delivery) | same |
| `POST /api/run/:id/verification` | Deterministic verifier: signature, attribution, window | same |
| `POST /api/run/:id/verdicts` | Board signs one verdict per winner | same |
| `POST /api/run/:id/settlement` | Start the settlement job | 202 `{ step, job, repeated, run }` |
| `GET /api/run/:id/settlement?job=<token>` | Poll the job: runs one reconcile tick, then returns it | 200 `{ job, status, phase, pending, deadline, transfers, receipt }` |
| `GET\|POST /api/settlement/tick` | One reconcile tick for every run with settlement work left (max 3). Railway calls it every ~30 s | 200 `{ runs: [{ runId, status, phase, pending }] }` |
| `POST /api/run/:id/next` | Run whichever step is next | as that step |
| `POST /api/run/:id/all` | Run every remaining step and start settlement (done at once when simulated; real: poll) | 200 `{ run }` |
| `GET /api/events?run=<id>[&after=<seq>]` | SSE stream, see below | `text/event-stream` |
| `GET /api/events?run=<id>&format=json[&after=<seq>]` | Same events as JSON | `{ events, next, done }` |
| `GET /api/health` | Flags, adapter badge, `boardStore`, which env vars are set | 200 |

Rules:

- Steps run in order. Calling a step early gives 409 `out_of_order` with `expected`.
- A finished step is idempotent: calling it again gives 200 with `repeated: true` and no new money.
- Two concurrent calls to one step: one runs, the other gets 409 `in_progress`.
- Unknown run 404 `run_not_found`. Unknown step 404 `unknown_step`. Unknown job 404 `job_not_found`.
- A failed step closes the run (`status: "failed"`, events `step.failed`, `run.failed`) and answers
  500 `step_failed`. Upstash down gives 503 `store_unavailable`. If a canned replay is installed
  (see below) the run degrades to it instead and the answer is 200 with `degraded: true`.
- Every route stays under 60 s (`maxDuration = 60`). Settlement returns at once; its first tick runs
  after the response through Next `after()`. Simulated, that tick finishes it. Real, see "Settlement
  reconciliation" below. The UI polls the job, or just follows SSE.

## Run state (`GET /api/run/:id` → `run`)

```js
{
  id, createdAt, mode: "live" | "canned", badge: "SIMULATED", seed,
  status: "in_progress" | "completed" | "failed",
  nextStep: "bids" | ... | "settlement" | null,
  steps: { tender|bids|allocation|locks|feed|verification|verdicts|settlement:
           { status: "pending"|"running"|"done"|"failed", startedAt?, finishedAt?, error? } },
  brief: { advertiser, audience, goal },
  tender: { budget: 200, gate: 5, bondRate: 0.25, bidFee: 2, currency: "tADA", audience, deadline },
  suppliers: [{ id, name, persona }],                      // 4, fixed order
  keys: { shop, board },                                   // Ed25519 public keys, hex
  bids: [{ supplier, price, impressions, promisedPer1000, salt, commit, committedAt }],
  auction: { ranking, accepted, rejected: [{ supplier, reason }], totalAward },   // see lib/auction/README.md
  feed: { window: {start, end}, impressions: { [supplier]: n },
          events: [{ eventId, sessionId, supplier, ts, signature, signals: { asn, clickBurst } }] },
  verification: { verified: { [supplier]: n }, rejections: [{ eventId, supplier, reason }],
                  perSupplier: [{ supplier, received, verified, rejected: { [reason]: n } }] },
  verdicts: [{ supplier, kind, delivered, promised, gate, award, bond, hash, signature }],
  settlement: { job, status: "running"|"done"|"failed",
                phase: "waiting_for_lock"|"settling"|"timer_fallback"|"settled",
                startedAt, deadline, reconcileUntil, finishedAt?, settledAt?, lastTickAt, ticks,
                pending,                       // rows not yet final + suppliers not yet settled
                settled: [supplier],           // suppliers whose settle() has run
                transfers: [Receipt & { supplier, verdict }] } | null,
  ledger: [Receipt & { phase: "bid_fee" | "lock" | "settlement" | "bid_fee_collect", supplier }],   // every money movement
  receipt: { consumer: { awardsLocked, returned, net, signups, costPerSignup },
             board: { bidFees }, badges: ["SIMULATED"],
             leaderboard: [{ rank, supplier, name, kind, promised, delivered, verifiedSignups, countedSignups,
                             award, paidToSupplier, awardReclaimed, bond, bondReturned, bondForfeited,
                             consumerSpend, costPerSignup, supplierNet, verdictHash }],
             roundTwo: [{ supplier, share }] } | null,
  roundTwo: [{ supplier, share }] | null,
}
```

Notes for UI:

- `Receipt` = `{ id, badge, action, amount, from, to, txHash, explorerUrl, state, escrow? }` (see
  `lib/masumi/README.md`). Render `badge` next to every amount. `explorerUrl` is null while SIMULATED or
  PENDING. PENDING = real operation submitted, no transaction yet: never show it as money moved.
- `auction.accepted`, `verdicts` and `leaderboard` are in ranking order (cheapest per signup first), not
  supplier order. Sort by `suppliers` if you want TechBlog, CodePodcast, DevNewsletter.
- `leaderboard` ranks by `costPerSignup`, Under gate rows with no signups after that, `lost_bid` rows last.
  GamingForum is `kind: "lost_bid"`: rejected before the auction, its 2 bid fee is not returned.
- `feed.events[].signals` are dashboard context only. They never change a verdict.
- Receipt ids are deterministic per action and parties (the simulated adapter hashes them), so two runs
  on one server share ids. Key UI lists by `runId` + `id`.
- Worked example: Consumer net -108.75 tADA, 14 signups, 7.7679 per signup. TechBlog Pass (8 of 7),
  CodePodcast Short of promise (6 of 8, 3.75 forfeited), DevNewsletter Under gate (0 of 12, award 70
  back, 17.5 forfeited), GamingForum Lost bid (4 per 1,000, below the gate).

## SSE

`GET /api/events?run=<id>`. Each frame:

```
id: 12
event: bid.committed
data: {"seq":12,"runId":"run_ab12cd34","name":"bid.committed","ts":"2026-10-08T22:00:00.040Z","data":{...}}
```

- `id` is the seq. Browsers send `Last-Event-ID` on reconnect and the stream resumes. `?after=<seq>` does the same.
- Subscribe per name: `es.addEventListener("bid.committed", (e) => JSON.parse(e.data))`. There is no unnamed `message` event.
- The stream closes after `run.completed` or `run.failed`, and after 50 s (reconnect resumes). Once the run
  is closed and the client has every event, the route answers 204, which stops `EventSource` reconnecting.
- Heartbeat comment `: ping` every 15 s while idle.
- Start the stream before you call the steps, or after: the backlog replays either way.

| Event | `data` |
|---|---|
| `run.created` | `{ runId, mode, badge, keys }` |
| `tender.published` | `{ tender, brief, suppliers }` |
| `registry.discovered` | `{ source: "live" \| "seeded", label, reason?, endpoint, expected, found, agents: [{ supplier, name, persona, agentIdentifier, apiBaseUrl, state }] }`, first event of the `bids` step, before any invite. `seeded` is never shown as a live lookup. Also on `run.discovery` |
| `step.started` / `step.completed` | `{ step }` |
| `step.failed` | `{ step, error }` |
| `bid.committed` | `{ supplier, commit, committedAt }`, one per bidder, hash only |
| `bid.fee_locked` | `{ supplier, receipt }` |
| `bid.revealed` | `{ supplier, price, impressions, promisedPer1000, salt }` |
| `bid.rejected` | `{ supplier, reason }` (`below_gate`, `hash_mismatch`, `late`, `invalid_schema`) |
| `auction.ranked` | `{ ranking }` |
| `allocation.decided` | `{ accepted, rejected, totalAward, budget }` |
| `escrow.locked` | `{ supplier, kind: "award" \| "bond", receipt }` |
| `feed.served` | `{ supplier, impressions, signupsReceived, flaggedBySignals }` |
| `feed.generated` | `{ window, impressions, signupsReceived }` |
| `verification.completed` | `{ verified, rejections, perSupplier }` |
| `verdict.signed` | `{ supplier, kind, delivered, promised, gate, award, bond, hash, signature }` |
| `settlement.started` | `{ job }` |
| `settlement.transfer` | `{ supplier, verdict, receipt }`, when a row is created and again when it turns REAL |
| `settlement.progress` | `{ supplier, verdict, phase: "lock" \| "bid_fee" \| "settlement" \| "bid_fee_collect", action, receiptId, state, badge, txHash, explorerUrl, error? }`, on every state change of a lock, bid fee or settlement row |
| `settlement.completed` | `{ job, transfers }`; on timeout `{ job, transfers, fallback: "timer", pending }`; when a timed-out run's last row turns REAL later `{ job, transfers, late: true }` (after `run.completed`) |
| `receipt.ready` | `{ receipt }` |
| `round2.decided` | `{ allocations }` |
| `run.completed` | `{ runId, net, signups, badges }` |
| `run.failed` | `{ step, error }` |
| `mode.degraded` | `{ mode: "canned", step, error }`, see below |

Names are exported as `EVENTS` and `EVENT_NAMES` from `app/lib/board`.

## Settlement reconciliation (the reconciler, #49)

`reconcile.js`. A real settlement needs 2–4 escrow steps per row over ~15–20 min
(`docs/research/masumi-settlement-timing.md`). Nothing waits inside a request: every settlement poll and every
`/api/settlement/tick` runs one **tick** per run, claimed for 55 s so concurrent polls are no-ops:

1. Advance unconfirmed locks (`adapter.advance(lockId)`), bid fees included. Phase `waiting_for_lock` until both
   a supplier's award and bond are `FundsLocked` (REAL). Supplier settlement never waits on a bid fee.
2. `settle()` each supplier once its locks are confirmed, with `awardEscrowId` / `bondEscrowId` from the ledger.
   Then `collectBidFee()` once per confirmed REAL bid fee (#50): the Board keeps it, with
   `bidFeeResultHash(run, row)` (commit + auction outcome) as the result hash. Rows go to `settlement.feeTransfers`
   and ledger phase `bid_fee_collect`, outside the Consumer and supplier sums (the fee counted at lock).
3. `advance()` one PENDING row per escrow (Short of promise has two transfers on one bond; they take turns).
4. Rows are updated in place in `ledger`, `settlement.transfers` and `settlement.feeTransfers`; each change emits
   `settlement.progress`.
5. All rows final: receipt, `run.completed`. At `deadline` (40 min): the run completes anyway with phase
   `timer_fallback` and its PENDING rows labelled; it stays in `bidroyale:settling` and ticks keep advancing
   it until `reconcileUntil` (3 h). The escrows finish on chain by timer, but treasury transfers need a tick.

Each tick has a 45 s budget (locks and settle a third each); an unfinished call is retried next tick, which is
safe because `advance` re-reads both sides first. The simulated adapter has no `advance`, so its first tick
settles and finishes, as before. Railway: the treasury worker calls the tick route every 30 s when
`SETTLEMENT_TICK_URL` is set, so a run finishes with no browser open.

## State store

`createStoreFromEnv()`: Upstash Redis over REST when `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` are set (`KV_REST_API_URL` / `KV_REST_API_TOKEN` also work), otherwise one
in-memory store per server process. Every Upstash call has a 5 s AbortController timeout. Keys
`bidroyale:run:<id>` (JSON, 24 h TTL), `bidroyale:run:<id>:events` (list), `bidroyale:claim:*` (step locks),
`bidroyale:settling` (set of run ids with settlement work left, read by the tick route).
`/api/health` reports `boardStore: "upstash" | "memory"`.

## Hook points

- **Canned replay ([S12])**: `canned.js` `getCannedReplay()` is `createReplay()` from `app/lib/replay`.
  It returns `async ({ runId }) => ({ run, events })` in the fixture shape, from `app/data/canned/run.json`
  (or `REPLAY_RECORDING`). With `DEMO_MODE=canned`, `POST /api/run` stores that transcript under the new run id
  (`mode: "canned"`, `badge: "PRE-RECORDED"`) and the SSE stream replays it. Replay events keep their recorded `ts`
  and carry a `dueAt`; `service.js` wraps the store with `withReplayPacing`, which hides an event, and what it shows
  in `GET /api/run/:id`, until it is due. `REPLAY_SPEED=fast` (default) fits the stream in 25 s.
  When a live step fails, the Board does the same and emits `mode.degraded` after the events already sent,
  so a UI reducer should reset its view on `mode.degraded`. Steps on a canned run answer 409 `run_closed`:
  the UI only subscribes. See `docs/demo-runbook.md`, Canned replay.
- **Bid source ([S11])**: `createBoard({ bidSource })`, default `pinnedBids()` in `scenario.js` (pinned quotes
  that give the worked example). Signature `async ({ tender, suppliers, run }) => Bid[]` with
  `{ supplier, price, impressions, promisedPer1000, salt }`. If a bid carries its own `commit` and `committedAt`
  the Board keeps them, so a real agent's hash is checked and a late or tampered bid is rejected.
- **Real adapter**: swap behind `getAdapter()`. The Board calls only `lockBidFee`, `lockAward`, `lockBond`
  and `settle(verdict)`, and refuses any receipt without a `badge`.
- **Scripted delivery**: `scriptedDelivery()` in `scenario.js`. TechBlog 8, CodePodcast 6, DevNewsletter 0 per
  1,000. A winner not in the script delivers what it promised.

## Files

`index.js` orchestration and re-exports · `events.js` step and event names · `store.js` memory and Upstash
· `sse.js` frames and stream · `receipt.js` receipt and leaderboard from the ledger · `scenario.js` suppliers,
pinned bids, scripted delivery · `canned.js` replay hook · `service.js` env wiring for routes (uses `@/`) ·
`worked-example.js`, `record-fixture.js`, `test-alias.js` fixture and test helpers.
