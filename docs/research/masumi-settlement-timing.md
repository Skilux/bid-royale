# Masumi escrow: end-to-end timing and what can be lowered

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
- Release (~41 min) and refund (~26 min) cannot happen within a 2-minute demo. Start
  those escrows **at least ~45 minutes before** the demo or recording, in parallel, as
  AGENTS.md's "lock escrows early" rule says. Show the resulting transactions as `REAL` links,
  and use `PRE-RECORDED` for any replay.
- For the full tender (11 escrows), all escrows must be created in one early batch.
  Each step's latency is per escrow, but they run in parallel.

## Open questions for the Masumi mentor

1. Can the 15-minute `submitResultTime`, unlock and dispute minimums be lowered on
   preprod, through configuration or a newer version, without forking?
2. Is the SDK's hardcoded 24 h `submitResultTime` intended? Is there a supported way to
   pass shorter windows through the SDK?
3. How does the 7 min + 10 min cooldown apply between lock, result, refund request and
   authorize?
