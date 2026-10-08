# Masumi escrow: end-to-end timing and what can be lowered

For the current source, see [Measured on preprod](#measured-on-preprod-v2-0290) and [V2 on 0.29.0 (derived, not measured)](#v2-on-0290-derived-not-measured).

Checked 2026-10-08 against what we actually run: Payment Service image
`ghcr.io/masumi-network/masumi-payment-service:0.22.0` (read from `dist/index.js` in the
running container), the Python SDK `masumi` 1.2.0 (`.venv/.../masumi/payment.py`), and
the interval variables currently set on our Railway service. Times are **derived from
code, not measured** on preprod — run one escrow end to end and replace the estimates
with measurements before relying on them for the demo script.

## TL;DR

| Path | Today (SDK defaults + Railway intervals) | Best possible without forking Masumi |
|---|---|---|
| Lock visible to seller | up to ~8 min | ~2–3 min |
| Result hash on-chain | up to ~6 min after job done | ~1–2 min |
| **Seller release (happy path)** | **≥ ~30 h 10 min** | **~42–43 min** |
| **Buyer refund (no result)** | **≥ ~24 h 10 min** | **~27–28 min** |

The biggest lever is ours, not Masumi's: the Python SDK hardcodes a 24-hour result
deadline, and the Payment Service then defaults the unlock to 6 h after that.
Passing minimum windows gets release down to about 41 minutes. That ~41 min (release)
and ~26 min (refund) are hard floors coded into the service.

## The rules (0.22.0 source)

### Hard floors — in code, not configurable

| Rule | Value | Source message / query |
|---|---|---|
| `submitResultTime` ≥ now + 15 min at payment creation | 15 min | "Submit result time must be in the future (min. 15 minutes)" |
| `unlockTime` ≥ `submitResultTime` + 15 min | 15 min | "Submit result time must be before unlock time with at least 15 minutes difference" |
| `externalDisputeUnlockTime` ≥ `unlockTime` + 15 min | 15 min | "External dispute unlock time must be after unlock time (min. 15 minutes difference)" |
| `payByTime` ≤ `submitResultTime` − 5 min | 5 min | "Pay by time must be before submit result time (min. 5 minutes)" |
| Seller collection only picks up payments whose `unlockTime` ≤ now − 10 min | +10 min | `collectOutstandingPaymentsV1` query |
| Buyer refund collection only picks up payments whose `submitResultTime` ≤ now − 10 min (state `RefundRequested` or `FundsLocked`) | +10 min | `collectRefundV1` query |
| Result submission only runs while `submitResultTime` ≥ now + 1 min | −1 min | `submitResultV1` query |
| Cooldown written into the datum: preprod cooldown + 10 min buffer | 7 + 10 min | `COOLDOWN_TIME_PREPROD`, `newCooldownTime` |

The cooldown's effect on each transition was **not traced**. It is a risk for
back-to-back actions by opposite parties, for example a refund request right after a lock.
Measure it.

### Defaults when the caller omits times

| Field | Default |
|---|---|
| `unlockTime` | `submitResultTime` + 6 h |
| `externalDisputeUnlockTime` | `submitResultTime` + 12 h |
| `payByTime` / `submitResultTime` (schema defaults) | 12 h |

### What the Python SDK sends (`masumi` 1.2.0, `payment.py` lines 111–127)

- `payByTime` = now + **12 h**
- `submitResultTime` = now + **24 h**
- no `unlockTime` or `externalDisputeUnlockTime`, so the service defaults apply: unlock is
  now + **30 h**, external dispute unlock is now + **36 h**

These values are hardcoded, and `create_payment_request` takes no parameters to change them.

### Polling and confirmations (configurable)

| Variable | Railway now | 0.22.0 code default |
|---|---|---|
| `CHECK_TX_INTERVAL` (detect lock) | 180 s | 20 s |
| `BATCH_PAYMENT_INTERVAL` (buyer purchase batch) | 240 s | 80 s |
| `CHECK_SUBMIT_RESULT_INTERVAL` | 300 s | 30 s |
| `CHECK_COLLECTION_INTERVAL` | 300 s | 30 s |
| `CHECK_COLLECT_REFUND_INTERVAL` | 300 s | 30 s |
| `CHECK_SET_REFUND_INTERVAL` / `CHECK_UNSET_REFUND_INTERVAL` / `CHECK_AUTHORIZE_REFUND_INTERVAL` | 300 s | 30 s |
| `REGISTER_AGENT_INTERVAL` / `DEREGISTER_AGENT_INTERVAL` | 300 s | 30 s |
| `CHECK_WALLET_TRANSACTION_HASH_INTERVAL` | 60 s | 30 s |
| `BLOCK_CONFIRMATIONS_THRESHOLD` | unset | 1 |

The Railway template's values match the newer `main` `.env.example`, not 0.22.0's
defaults. `BLOCK_CONFIRMATIONS_THRESHOLD=20` from that file does **not** apply to us,
since it is unset and defaults to 1.

Assumptions: preprod block ≈ 20 s; a transaction takes ~0.5–1 min to land and confirm
at 1 confirmation; agent work takes seconds.

## Timelines (T0 = seller payment request created, i.e. `/start_job`)

### A. Today: SDK defaults + Railway intervals

| Step | When |
|---|---|
| Buyer purchase batched and locked | T0 + ≤ 4 min batch + ~1 min tx |
| Seller sees `FundsLocked` | + ≤ 3 min (worst case ~T0 + 8 min) |
| Job runs; result hash submitted | + ≤ 5 min poll + ~1 min tx |
| `unlockTime` | T0 + 30 h |
| **Seller collects** | **≥ T0 + 30 h 10 min** (+ ≤ 5 min poll + tx) |
| **Refund collected (no result)** | **≥ T0 + 24 h 10 min** (+ ≤ 5 min poll + tx) |

Neither settlement can be shown on the night unless it was started a day earlier.

### B. Minimum windows + Railway intervals (only our agent code changes)

Request `submitResultTime` = T0 + 16 min (1 min margin), `unlockTime` = T0 + 31 min,
`externalDisputeUnlockTime` = T0 + 46 min, `payByTime` ≤ T0 + 11 min.

| Step | When |
|---|---|
| Seller sees lock | ~T0 + 2–8 min |
| Result hash submitted (must land before T0 + 15 min) | ~T0 + 3–14 min |
| **Seller collects** | **~T0 + 41–47 min** |
| **Refund collected (no result)** | **~T0 + 26–32 min** |

At Railway's 5-minute polling, the result submission can run close to the
T0 + 15 min cutoff. That's a reason to also do C.

### C. Minimum windows + code-default intervals (best without forking)

| Step | When |
|---|---|
| Seller sees lock | ~T0 + 2–3 min |
| Result hash submitted | ~T0 + 3–5 min |
| **Seller collects** | **~T0 + 41–43 min** |
| **Refund collected (no result)** | **~T0 + 26–28 min** |

The dispute path (result submitted, buyer requests a refund before unlock, seller
authorizes) was not timed. It involves at least two more transactions plus cooldowns, so
expect it to take longer than the refund path above.

## What can be lowered

| Lever | Who controls it | Effect | Cost / risk |
|---|---|---|---|
| **Pass explicit minimum time windows** instead of the SDK's hardcoded 12 h / 24 h | Us: agent code (subclass/override payment creation, or call `POST /payment` directly) | Release ~30 h → ~41 min; refund ~24 h → ~26 min | Agent must finish and submit within ~14 min, or the job forfeits to refund. Fine for our short jobs. Not a rails change. |
| **Delete the Railway interval overrides** so 0.22.0 defaults apply | Us: Railway variables | Removes up to ~5 min per step, ~10–15 min total | More Blockfrost and DB calls. Check the Blockfrost free-tier rate limits with ~11 escrows in flight. |
| Lower `BLOCK_CONFIRMATIONS_THRESHOLD` | Us | Already 1; 0 is allowed | 0 can act on a transaction that later rolls back. Keep 1. |
| 15/15/15 min windows, 10 min collection lag, 7 min cooldown | Masumi code only | Would cut the ~41 min floor | Requires forking the Payment Service, which breaks the AGENTS.md "Masumi is the rails" rule. The on-chain validator also enforces timing, and the API minimums may protect against rejected transactions. Ask the Masumi mentor. |

## Demo implications

- Live on stage: lock (~2–3 min) and result hash submission are realistic as `REAL`
  with explorer links, given fast intervals.
- Release (~41 min) and refund (~26 min) cannot happen within a <90 s demo. Start
  those escrows **at least ~45 minutes before** the demo or recording, in parallel, as
  AGENTS.md's "lock escrows early" rule says. Show the resulting transactions as `REAL` links,
  and use `PRE-RECORDED` for any replay.
- For the full tender (11 escrows), all escrows must be created in one early batch.
  Each step's latency is per escrow, but they run in parallel.

## Speed-up options for the live demo, ranked

We can't get a release under ~41 min or a refund under ~26 min without forking Masumi.
These options get the delays down to that floor, then make sure the waiting happens
before the demo starts. **Proposal, not decided:** options 3 and 4 change the demo flow
and the UI's contract with settlement, so they need Danila's sign-off (AGENTS.md
scaffold rule).

| # | Option | Gain | Effort | Risk |
|---|---|---|---|---|
| **1** | **Pass the shortest allowed time windows.** Call `POST /payment` directly instead of the Python SDK, which hardcodes 12 h / 24 h. | Release 30 h → ~41 min, refund 24 h → ~26 min | Low | The supplier has ~14 min to submit its result, or the escrow goes to refund. Simulated traffic makes that easy. |
| **2** | **Delete the Railway interval overrides** so the service's 20–30 s polling defaults apply. | ~10–15 min saved per run. It also keeps result submission clear of the T0 + 15 min cutoff, which 5-min polling can miss. | Trivial | More Blockfrost calls with ~10 escrows in flight. Check the free-tier rate limit. |
| **3** | **Start the escrows early.** Kick off a "warm run" ≥ 50 min before the recording or judging. The live UI run still locks fresh escrows for real, on screen. Its settlement beat shows the warm run's settlement txs: `REAL`, with explorer links and their actual timestamps. Any replay is badged `PRE-RECORDED`. | Settlement looks instant on stage and stays honest | Low–Med | Needs a run ID / "attach to run" switch in the UI. For the <90 s video, a labelled time cut ("41 min later") is honest and costs nothing. |
| **4** | **Stagger runs.** A cron starts a full scenario every ~10–15 min during the judging window, so a run's settlement is always landing within minutes. | Covers judges who open the URL at random times | Med | Each run costs ~11 tUSDM plus ADA fees, so faucet limits matter. Only worth it if judges click through (an open organizer question). |
| **5** | **Measure whether a refund the seller agrees to is faster** (`request-refund` → `authorize-refund`) than waiting out the timer. If it skips the `submitResultTime` + 10 min wait, the Under-gate refund and the Pass bond return could happen live. | Possibly ~26 min → a few minutes for the demo's key moment | Low to test | Not traced in the code. The 7 + 10 min cooldown may cancel the gain. Run it at Masumi checkpoint 3. |
| **6** | **Have the Board pay forfeits from its own funds.** The Short-of-promise and Under-gate bond forfeits are already plain transfers, so the Board can send them right at the verdict and recover the money from the bond escrow later. | Forfeit txs show up in seconds | Low | The money on screen no longer comes from the escrow. It needs a clear label, and the Under-gate award refund itself must still be the escrow refund. |
| **7** | **Ask the Masumi mentor** whether preprod (through configuration or a newer version) allows shorter minimum windows. | Could lower the 41-min floor | Low | Unlikely to come through in time. Ask at kickoff anyway. |
| ✗ | Fork or patch the payment service, drop the bond escrows, or label simulated settlement as `REAL` | — | — | Breaks "Masumi is the rails", the never-cut list, or the labelling rule. The on-chain validator probably enforces the time windows anyway. |

### Recommendation

- **Do 1 + 2 + 3 together.** That's the baseline and none of it is hard. Option 3 is
  AGENTS.md's "lock escrows early" rule pushed one step further.
- **Test option 5 during the refund dry run**, since it's the only lever that might make
  the key moment happen live.
- **Do option 4 only if the organizers confirm judges click through.**

Two caveats:

- **Every time in this doc is worked out from the code, not measured on preprod.** Lane
  Masumi checkpoint 2 has to record real minutes per step before anyone writes the demo
  script around 41 / 26.
- **The code suggests the Consumer can reclaim an Under-gate award with no supplier
  signature (path A2).** The `collectRefundV1` query also picks up escrows still in
  `FundsLocked` once `submitResultTime` + 10 min has passed. That points toward closing
  D10 in favor of A2, but the refund dry run still has to confirm it.

## Open questions for the Masumi mentor

1. Can the 15-minute `submitResultTime`, unlock and dispute minimums be lowered on
   preprod, through configuration or a newer version, without forking?
2. Is the SDK's hardcoded 24 h `submitResultTime` intended? Is there a supported way to
   pass shorter windows through the SDK?
3. How does the 7 min + 10 min cooldown apply between lock, result, refund request and
   authorize?


## Measured on preprod (V2, 0.29.0)

First real escrows on our V2 source (`cmuzylds0000347p4qfsw0ed3`, cooldown 60 s),
8 Oct 2026, through `app/lib/masumi` with wallet-scoped party keys. 5 tADA each,
Consumer → TechBlog, minimum deadlines + 2 min margin. Times are UTC.

| Step | Escrow 1 (A2 refund, no result) | Escrow 2 (release) |
|---|---|---|
| Lock requested (`/payment` + `/purchase`) | 20:31:45 | 20:32:28 |
| `FundsLocked` (seen by seller) | 20:34:57 (**3.2 min**) | 20:35:11 (**2.7 min**) |
| Result submitted → `ResultSubmitted` | — | 20:35:19 → 20:36:42 (**1.4 min**) |
| Terminal | `RefundWithdrawn` 20:59:36 (**27.8 min** after lock request) | `Withdrawn` 21:17:57 (**45.5 min** after lock request) |

### Fast (cooperative) paths, measured

Three more 5 tADA escrows, locks requested together at 21:13:40 UTC; each step
fired as soon as the chain allowed (driver polls every 15 s). Minutes are from
the lock request.

| Path | Demo case | Steps (who) | Terminal | vs slow path |
|---|---|---|---|---|
| Bond return | Pass: bond back | buyer `request-refund` (TechBlog) → seller `authorize-refund` (Board) → buyer collects | `RefundWithdrawn` **4.7 min** | — |
| Cooperative refund | Under gate: award back | buyer `request-refund` (Consumer) → seller `authorize-refund` (TechBlog) → buyer collects | `RefundWithdrawn` **5.9 min** | 27.8 min (A2) |
| Early release | Pass: supplier paid | seller `submit-result` → buyer `request-refund` (`Disputed`) → buyer `cancel-refund-request` (`WithdrawAuthorized`) → seller collects | `Withdrawn` **13.1 min** | 45.5 min |

- Locks reached `FundsLocked` in **1.6 min**; the two award locks shared one transaction.
- Every call was accepted on the first attempt; no cooldown rejections (cooldown 60 s).
- Early release: ~7.4 min of the 13.1 are the buyer's wait between `cancel-refund-request`
  (3.9 min) and `WithdrawAuthorized` (11.3 min), the request validity window + cooldown
  #20 derived. Everything else is ~1–1.5 min per transaction.
- On-chain, the early release passes through `Disputed`; the buyer then authorizes the
  withdrawal. Legitimate V2 flow, but visible on the explorer: say so in the demo.
- Driver: `bin/fast-paths.mjs` in the orchestration state dir; raw log `logs/fast-paths.jsonl`.

- Agent registration (`POST /registry` → `RegistrationConfirmed`): **6.5 min**.
- A2 works: the buyer's money came back with no seller signature and no refund
  request, as #20 derived (submit deadline + 10 min). D10 can use A2 as the
  fallback; the cooperative refund (request → authorize) is still to measure (#28).
- One status read failed transiently (20:56 UTC); the next read succeeded.

## V2 on 0.29.0 (derived, not measured)

Read-only source review for #20; no Payment Service or chain calls. All numbers below are **derived from code**, not measured. API and validator restrictions differ; use the executable checks, not comments. The saved OpenAPI confirms the singular paths `/payment/authorize-refund`, `/purchase/request-refund`, and `/purchase/cancel-refund-request`; see the tagged [route map](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/index.ts#L192-L243).

### TL;DR

These are L1 planning formulas in minutes, not a settlement SLA. `T0` is payment creation; `C` is the **UNVERIFIED** time per transaction to submit, confirm and reconcile on both sides. `W` is any remaining buyer cooldown after requesting a refund (see Q4). Poll allowances assume idle workers, default configuration, no retries or wallet contention: action/collection polls are **0.25 min derived from code**, automatic decisions **0.5 min derived from code** ([defaults](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-core/src/config.ts#L34-L106)).

| Path | Expected minutes (derived from code; chain latency UNVERIFIED) | Source |
|---|---|---|
| Release, normal result | Earliest eligibility **T0 + 40 min**; planning **T0 + 40.75 + C min** with minimum deadlines | [auto withdrawal](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/automatic-decisions/service.ts#L47-L76), [API minimums](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/payments/index.ts#L148-L163) |
| Release, buyer-approved dispute | From reconciled `ResultSubmitted`: **W + 1.25 + 3C min**; skips unlock, but requires request → cancel → collect | [cancel API](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/purchases/cancel-refund-request/index.ts#L78-L87), [buyer approval](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L460-L501), [early collection](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/automatic-decisions/service.ts#L54-L75) |
| Refund, cooperative, no result | From reconciled `FundsLocked`: **1.25 + 3C min** for request → authorize → collect; no deadline wait | [refund API](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/payments/authorize-refund/index.ts#L31-L56), [auto refund](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/automatic-decisions/service.ts#L109-L137) |
| Pass bond return | Same **1.25 + 3C min**; Supplier requests, Board authorizes, Supplier collects. Direct Board authorization from `FundsLocked` fails at API | [refund API](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/payments/authorize-refund/index.ts#L31-L56), [refund validator](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L407-L458) |
| A2, no result | Earliest eligibility **T0 + 25 min**; planning **T0 + 25.75 + C min** with minimum deadline | [auto refund](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/automatic-decisions/service.ts#L109-L137), [API minimum](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/payments/index.ts#L158-L163) |

The formulas sum the relevant polls and transaction counts; they exclude initial lock and result submission except where the time origin is `T0`. Actual minutes and the configured node intervals remain **UNVERIFIED**. Auto withdrawal/refund default to enabled ([flags](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-core/src/config.ts#L90-L97)); confirmation threshold defaults to **1, derived from code** ([threshold](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-core/src/config.ts#L122-L127)).

### Q1. Minimum windows, ordering and scheduler delays

Both payment creation and purchase creation check the following; purchase rechecks against its own current time, so the minimum at payment creation needs margin ([payment checks](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/payments/index.ts#L132-L163), [purchase checks](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/purchases/shared.ts#L46-L68)). Every duration in this table is **derived from code**.

| API rule | Minimum / ordering |
|---|---|
| `payByTime` | ≤ `submitResultTime` − **5 min**; ≥ request time − **5 min** (the error says “future”, but code permits this past tolerance) |
| `submitResultTime` | ≥ request time + **15 min** |
| `unlockTime` | ≥ `submitResultTime` + **15 min** |
| `externalDisputeUnlockTime` | ≥ `unlockTime` + **15 min** |
| Omitted unlock / external dispute | Defaults to submit deadline + **6 h / 12 h** |

The spending validator does **not** encode those API gaps or a standalone pay-by clock check; it preserves the datum deadlines and checks action-specific validity ranges ([datum fields and validator](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L106-L142), [preserved deadlines](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L672-L699)). Normal withdrawal starts at/after unlock; refund request must end strictly before unlock; no-result refund starts at/after submit deadline; first result must end strictly before submit deadline, while an existing result can be updated before external dispute unlock; arbitration starts at/after external dispute unlock ([withdraw](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L254-L274), [request/refund](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L391-L458), [result](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L643-L699), [arbitration](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L506-L520)). Boundary comparisons are inclusive lower / strict upper ([time helpers](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L1129-L1181)).

The **+10 min derived from code** extra wait survives in V2 for both automatic initialization and L1 collection on timed release/refund. Authorized states skip it ([auto decisions](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/automatic-decisions/service.ts#L47-L75), [auto refunds](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/automatic-decisions/service.ts#L109-L137), [collection](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/collection/service.ts#L1315-L1334), [refund collection](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/purchases/collect-refund/service.ts#L1217-L1236)).

First result submission has **5 min derived from code** scheduler slack, rather than the old V1 one-minute cutoff. Submit promptly after lock; a near-expired no-result escrow is not eligible for first submission ([slack](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/submit-result/service.ts#L165-L203), [L1 query](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/submit-result/service.ts#L1495-L1535)).

### Q2. Seller refund authorization and Pass bond return

- **On-chain:** seller can authorize from `FundsLocked`, `ResultSubmitted`, `RefundRequested`, or `Disputed`, with seller signature and seller cooldown respected; there is no upper deadline ([AuthorizeRefund](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L702-L759)).
- **API:** `POST /payment/authorize-refund` accepts only `RefundRequested` or `Disputed`, with `WaitingForExternalAction` and a current transaction. Thus the Board cannot directly return the Pass bond from `FundsLocked` through this API; Supplier must first call `/purchase/request-refund` ([worker state filter](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/authorize-refund/service.ts#L1238-L1243), [route checks](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/payments/authorize-refund/index.ts#L31-L61)).
- Authorization clears the result hash and moves to `RefundAuthorized`; buyer collection then needs neither the submit deadline nor cooldown to pass ([built datum](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/authorize-refund/service.ts#L254-L265), [refund spend](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L407-L458)).

### Q3. Authorize withdrawal: caller, API and early payout

Buyer calls `POST /purchase/cancel-refund-request`; for V2 it queues `AuthorizeWithdrawalRequested` **only from `Disputed`**, never directly from `ResultSubmitted` or `RefundRequested` ([API](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/purchases/cancel-refund-request/index.ts#L37-L87)). The V2 job builds `AuthorizeWithdrawal`, preserving the result, and the validator requires buyer signature, nonempty result, `Disputed`, and elapsed buyer cooldown; it writes `WithdrawAuthorized` ([job](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/purchases/authorize-withdrawal/service.ts#L278-L305), [validator](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L460-L501)).

Yes, seller collection can then happen before `unlockTime`: `WithdrawAuthorized` bypasses unlock and cooldown, and automatic decisions/collection have no timed filter for that state ([withdraw branch](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L238-L274), [automatic collection](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/automatic-decisions/service.ts#L47-L75), [collection query](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/collection/service.ts#L1322-L1332)). Getting there through the API requires result → buyer request-refund (`Disputed`) → buyer cancel-refund-request → seller collection. The extra buyer action means this is a potential timing lever, not a direct release endpoint ([request transition](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L343-L402), [cancel restriction](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/purchases/cancel-refund-request/index.ts#L78-L87)). Changing our settlement flow needs Danila's decision; this research does not make that change.

### Q4. Cooldown and the lowest safe demo setting

Cooldown gates repeated actions by the **same party**, not opposite parties: seller actions set seller cooldown and reset buyer cooldown; buyer actions do the reverse. Refund request → seller authorization can proceed without a cooldown wait; refund request → buyer withdrawal authorization must wait ([buyer update](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L378-L395), [seller update](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L678-L692), [approval update](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L484-L499), [refund update](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L740-L753)).

`cooldownTime` is milliseconds; default **7 min derived from code**, API minimum **0 ms derived from code** ([source schema](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/payment-source-extended/schemas.ts#L111-L117), [Preprod default](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-core/src/config.ts#L439-L443)). The new timestamp is transaction validity **upper bound + cooldown + 1 s derived from code**, not confirmation time ([datum utility](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/utils/converter/string-datum-convert/index.ts#L436-L450), [on-chain derivation](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L139-L142)).

With the default request window well before unlock, its upper bound is about build time + **5 min + 30 slots, derived from code**. Thus `W` expires around that upper bound + configured cooldown + **1 s derived from code**; setting cooldown to zero still leaves a validity-window wait. Near unlock the request window is shortened ([window builder](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/services/shared/tx-window.ts#L45-L109), [window constants](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-core/src/config.ts#L398-L403), [request build](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/purchases/request-refund/service.ts#L285-L294)).

Lowest **code-valid** setting is zero; lowest operationally **safe** demo value is **UNVERIFIED**. A proposed **60 s** is a test candidate, not a confirmed minimum or a safety guarantee. Measure before selecting either; lowering cooldown does not remove timed collection's extra wait ([schema](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/payment-source-extended/schemas.ts#L111-L117), [timed query](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/collection/service.ts#L1322-L1332)).

### Q5. A2: automatic refund without a result

Yes, with auto refunds enabled: `handleAutomaticDecisionsV2` finds an error-free `WaitingForExternalAction` purchase with null result and `FundsLocked` or `RefundRequested` after submit deadline + **10 min derived from code**, queues `WithdrawRefundRequested`, and `collectRefundV2` spends it as buyer. No refund request or seller signature is needed ([flag and source selection](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/automatic-decisions/service.ts#L20-L32), [initialization](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/automatic-decisions/service.ts#L109-L137), [collection conditions](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/purchases/collect-refund/service.ts#L1217-L1236), [buyer-only spend](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L407-L458)).

It is service automation, not a timer that moves funds on-chain independently. Disabled automation, an errored/pending action, unsynchronized source, or failed transactions can prevent completion; actual A2 settlement time remains **UNVERIFIED** ([eligibility](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/automatic-decisions/service.ts#L20-L32), [action guard](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/automatic-decisions/service.ts#L109-L124)).

### Q6. Admin-wallet involvement

Normal release needs seller signature, refund withdrawal needs buyer signature, refund authorization needs seller signature, and early withdrawal authorization needs buyer signature. None needs an admin-wallet signature ([seller withdrawal](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L254-L274), [buyer refund](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L407-L458), [buyer approval](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L494-L501), [seller authorization](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L749-L759)). The API checks ownership/scope and allows an admin override; that is permission handling, not a mandatory admin signature ([seller route](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/payments/authorize-refund/index.ts#L58-L61), [buyer route](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/purchases/cancel-refund-request/index.ts#L70-L75)).

Admin signatures are required for `WithdrawDisputed` arbitration after external dispute unlock. Keep this distinct from buyer cancellation resolving `Disputed` into `WithdrawAuthorized`; our release/refund/bond-return paths need no arbitration ([arbitration](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L506-L550), [signature threshold](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L616-L641), [buyer approval](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/smart-contracts/payment-v2/validators/vested_pay.ak#L494-L501)).

### Open questions for the Masumi mentor

- Is the API restriction on seller authorization from `FundsLocked` intentional? Is a supported direct bond-return API planned? ([restriction](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/payments/authorize-refund/index.ts#L43-L56))
- Is request-refund then cancel-refund-request the intended supported early-payment workflow? ([V2 cancellation](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/purchases/cancel-refund-request/index.ts#L78-L87))
- What cooldown and validity-window settings are tested as safe on Preprod? Can the timed collection buffer be configured without a fork? ([cooldown schema](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/src/routes/api/payment-source-extended/schemas.ts#L111-L117), [collection buffer](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/packages/payment-source-v2/src/services/payments/collection/service.ts#L1322-L1332))
- What measured `C`, intervals and confirmation threshold should our demo budget use? All real timings and deployment/contract correspondence remain **UNVERIFIED**; upgrades change script hashes, and old locked funds need the old validator ([upgrade warning](https://github.com/masumi-network/masumi-payment-service/blob/0.29.0/docs/migrations/web3-cardano-v2.md#L3-L8)).
