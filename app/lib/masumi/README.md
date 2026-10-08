# Masumi adapter

Plain JS REST wrapper for the Masumi 0.29.0 V2 payment service. No chain code.
`getAdapter()` reuses `getFlags()` and selects real only for the literal
`SIMULATE_PAYMENTS=false`; all other values select the existing simulated adapter.

## Contract

- `lockBidFee({ supplier, amount, commit }) → Promise<Receipt>`: Supplier buys from
  Board (#50). The escrow's `inputHash` is the bid's `commit` (64 hex), so the
  sealed bid is on Masumi before the reveal; the receipt carries it as
  `inputHash` and the Board checks the reveal against it. No valid commit → an
  `Error` receipt and no escrow. `MASUMI_BID_FEES=simulated` falls back to
  SIMULATED bid fees (awards and bonds stay real) if bid-fee escrows stall.
- Real `collectBidFee({ supplier, bidFeeEscrowId, resultHash }) → Promise<Receipt>`:
  the Board keeps the fee. Board `submit-result` with `resultHash`, then the same
  cooperative early release as a forfeited bond; `advance` drives the
  `bid_fee_collect` receipt to `Withdrawn` (REAL).
- `lockAward({ supplier, amount }) → Promise<Receipt>`: Consumer buys from Supplier.
- `lockBond({ supplier, amount }) → Promise<Receipt>`: Supplier buys from Board.
- `settle(verdict) → Promise<Receipt[]>`: follows `planSettlement` without changing
  its amounts. Verdict fields: `supplier`, `kind`, `award`, `bond`, `promised`,
  `delivered`, `gate`, optional Board verdict `hash` and `signature`.
- Real `advance(id) → Promise<Receipt>`: the follow-up driver for settlement;
  reads both sides and issues at most one state-changing request per escrow.
  No loops or sleeps. Portable ids work across adapter instances. On a lock
  receipt id (award, bond or bid fee) it confirms the lock instead: buyer-side read, REAL with the lock
  tx once the escrow is `FundsLocked` (or later). The Board's reconciler
  (`app/lib/board/reconcile.js`, #49) is the caller: it ticks every PENDING row.
- Real receipts also carry `escrow`: the blockchain identifier of the escrow the
  receipt drives (the bond for plain transfers), so a caller steps one escrow
  at a time. `settle` strips `awardEscrowId`/`bondEscrowId` before the verdict
  reaches the treasury.
- `getEscrowStatus(id) → Promise<string>`: resolve the seller-side payment by
  blockchain identifier; returns its on-chain state, queued action, or `Error`.

Receipt fields: `id`, `action`, `amount`, `from`, `to`, `state`, `badge`,
`txHash`, `explorerUrl`, optional `error`. Real receipts use `REAL` only with a
service-reported 64-character tx hash and a preprod Cardanoscan link. Settlement
receipts remain PENDING until the goal side has its terminal transaction hash
(seller `Withdrawn` for release, buyer `RefundWithdrawn` for refund); earlier lock
and intermediate hashes do not count as settlement proof. Until then
PENDING = real Masumi operation submitted, no transaction yet. For the Product
lane, the UI must never show it as money moved; it becomes REAL with an explorer link once a hash exists.
Pending hashes and links are null. HTTP success does not mean paid: seller payment must reach `Withdrawn`.
Configuration and API failures return `Error` receipts, without throwing into the
caller or silently creating simulated money. Bid fees are SIMULATED only with
`MASUMI_BID_FEES=simulated`.

The real receipt `id` is a portable job token containing only public escrow
references and party names, never credentials. Save the award/bond lock ids and
pass `awardEscrowId` and `bondEscrowId` on the verdict when resuming settlement
in another serverless invocation (the Board does this from its ledger). Within
one adapter instance the latest lock per supplier/kind is available as a
convenience. There is no confirmation loop here; the Board's reconciler calls
`advance` on each poll. No HTTP route or shared store is added here.

## Configuration and API

Required environment: `MASUMI_PAYMENT_BASE_URL` (including `/api/v1`),
`MASUMI_NETWORK=Preprod`, `MASUMI_SMART_CONTRACT_ADDRESS` (V2 source),
`MASUMI_KEY_<PARTY>` for each participating party, and `MASUMI_AGENT_<PARTY>`
for sellers. Parties are CONSUMER, BOARD, TECHBLOG, CODEPODCAST, DEVNEWSLETTER,
GAMINGFORUM. Keys must be wallet-scoped ReadAndPay, never Admin. No env files
are loaded. Missing settings become clear error receipts.

Optional Vercel settings: `TREASURY_URL` (Railway worker base URL) and
`TREASURY_TOKEN` (worker bearer token). When both are set, `getAdapter()` wires
`createTreasuryClient()` into the real adapter and reuses that adapter for later
advances. If either is absent, transfers stay `TransferPending`. The hook sends
`{ id, verdict, move: { reason, from, to, amount } }`; only a valid 64-hex worker
tx hash produces REAL with an explorer link. `MASUMI_ADMIN_KEY` belongs only on
the Railway worker; Vercel neither reads it nor calls Admin endpoints.

A lock creates seller terms with `/payment`, then purchases with `/purchase`
using the buyer key. Uses V2 source index 0, L1 routing, a fresh 24-character hex
nonce, integer-string lovelace (`unit: ""`), explicit ISO payment deadlines and
unchanged signed integer timestamps from the payment response for purchase.
The seller must be registered on the configured contract; its wallet vkey comes
from `SmartContractWallet.walletVkey`. Amounts are in ADA in the real adapter;
this ticket retains the seed/plan numbers. #24 owns the ×10 migration.

`createClient({ baseUrl, token, fetch, timeoutMs })` supports injected fetch and
an AbortController timeout (15 seconds by default). Errors include HTTP status
and JSON message; HTML/non-JSON responses report `Masumi HTTP <status>: non-JSON response`
with the same status available for retry reconciliation. POST has no automatic retry. Optional `retry: { query,
decide }` first executes a read-only status query; `decide` may return existing
`data`, explicitly prove `retry: true`, or leave the outcome ambiguous (error).
Never retry a purchase based only on a timeout or absent transaction hash.
Repeated settlement checks state, result hash and queued action before submitting.

`paymentDeadlines({ now, marginMs })` uses named V2 API floors verified in
`docs/research/masumi-settlement-timing.md` (V2 section, #20): result
≥ now + 15 min, payment ≤ result − 5 min, unlock ≥ result + 15 min, dispute
unlock ≥ unlock + 15 min. Default safety margin is 2 min at each boundary, covering the purchase
clock recheck. Explicit `marginMs` overrides must also be at least two minutes.
`createRealAdapter({ env, fetch, timeoutMs, now, marginMs, treasury })` exposes
these injection points for testing or adjusted timing.

## Agent routes (MIP-003)

`agent-api.js` serves `/api/agents/<name>/availability`, `/input_schema`, `/start_job` and `/status` for
`techblog`, `codepodcast`, `devnewsletter`, `gamingforum` and `board` (#37). Each route uses only that
agent's `MASUMI_KEY_<NAME>` and `MASUMI_AGENT_<NAME>`, through the same `createClient`. `/start_job` creates
payment terms (no funds move until a buyer locks) and stores the job in the Board store; `/status` maps the
node's `onChainState` to `awaiting_payment`, `running`, `completed` or `failed`. `SIMULATE_PAYMENTS` does not
apply: these routes always talk to the node. Nothing runs a job, so a funded job stays `running` until settlement
submits its result. `input_hash` is sha256 of `<identifier_from_purchaser>;<key-sorted input_data JSON>`.

## Settlement and treasury

Fast paths are measured on our V2 source in
`docs/research/masumi-settlement-timing.md`, “Fast (cooperative) paths, measured”.
Each `settle` starts the first eligible step. Save its receipt ids and call
`advance(id)` on later polls; repeating `settle` is not required. Both sides are
re-read before each step, and visible effects or queued Requested/Initiated
actions prevent resubmission. Every acting side must have
`NextAction.requestedAction=WaitingForExternalAction`.

| Path | Calls and required acting-side state | Goal |
|---|---|---|
| Award release (Pass / Short) | Supplier `submit-result` from seller `FundsLocked` → Consumer `request-refund` from buyer `ResultSubmitted` → Consumer `cancel-refund-request` from buyer `Disputed` | Seller `Withdrawn` |
| Bond collection (Short / Under gate) | Board `submit-result` from seller `FundsLocked` → Supplier `request-refund` from buyer `ResultSubmitted` → Supplier `cancel-refund-request` from buyer `Disputed` | Seller `Withdrawn` |
| Award reclaim (Under gate) | Consumer `request-refund` from buyer `FundsLocked`/`ResultSubmitted` → Supplier `authorize-refund` from seller `RefundRequested`/`Disputed` | Buyer `RefundWithdrawn` |
| Bond return (Pass) | Supplier `request-refund` from buyer `FundsLocked`/`ResultSubmitted` → Board `authorize-refund` from seller `RefundRequested`/`Disputed` | Buyer `RefundWithdrawn` |

Early release passes through **Disputed on chain**: this is the cooperative V2
flow, followed by buyer authorization of seller withdrawal (`WithdrawAuthorized`).
The UI must explain that state and keep the money pending until `Withdrawn`.
Measured early release took 13.1 min, cooperative award refund 5.9 min; these are
observations, not guarantees. A cancel can be rejected during the buyer window;
return the current pending receipt with its `error`, then retry on a later
advance after re-reading both sides. There is no immediate mutation retry.

The timer path remains the automatic fallback: after `submit-result`, the node
can collect for the seller at `unlockTime` if the cooperative sequence is not
completed. No manual release endpoint is called. A2 automatic refund remains
available if the Supplier never authorizes the Under-gate award; no result is
submitted on that award. Each seller mutation uses the payment creator's key;
request and cancel use the purchase creator's buyer key.

Plain-transfer follow-ups drive the bond's early-release steps themselves, then
send the forfeit/remainder once the Board-side bond is `Withdrawn`. Without a
treasury they still progress bond collection but remain `TransferPending`.
Each advance performs at most one escrow mutation. Default status reads run in
parallel (15-second timeout), followed by one bounded request; no confirmation
loop runs inside the adapter.

The plan's plain transfers (forfeit and bond remainder) return `TransferPending`
with null hashes by default. An injected `treasury({ id, ...transfer, verdict,
bondEscrowId }) → { state, txHash }` runs only once the bond reaches `Withdrawn`.
The idempotency key passed to the treasury is the exact receipt `id`, stable
through pending and paid states. The adapter caches treasury results carrying a
tx hash so repeated advances in that instance do not call the treasury again.
Across instances the treasury result is the source of truth: it must persist and
deduplicate by `id`, returning an existing result rather than sending again.
It must also verify authorization and implement its own bounded timeout and
status-before-retry. Without a treasury, advances remain `TransferPending` with
no hash even after bond withdrawal.
Its Admin-only transport is #23; no Admin key or transfer endpoint is wired here.
Polling escrow state alone cannot confirm a plain transfer.

## Offline proof

From `app/`: `SIMULATE_PAYMENTS=true npm run poc:masumi`. Reads the committed
worked-example seed, locks all three awards and bonds in parallel, then settles
all three verdicts and prints the receipt table and planned `consumerNet`.
In real mode the net is planned, not evidence that pending money moved.
All tests inject fetch; neither the tests nor this ticket's checks call the node.
The live-lock acceptance criterion remains for #26 / the orchestrator's dry run.
