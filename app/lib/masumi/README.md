# Masumi adapter

Plain JS REST wrapper for the Masumi 0.29.0 V2 payment service. No chain code.
`getAdapter()` reuses `getFlags()` and selects real only for the literal
`SIMULATE_PAYMENTS=false`; all other values select the existing simulated adapter.

## Contract

- `lockBidFee({ supplier, amount }) → Promise<Receipt>`: always SIMULATED until #31.
- `lockAward({ supplier, amount }) → Promise<Receipt>`: Consumer buys from Supplier.
- `lockBond({ supplier, amount }) → Promise<Receipt>`: Supplier buys from Board.
- `settle(verdict) → Promise<Receipt[]>`: follows `planSettlement` without changing
  its amounts. Verdict fields: `supplier`, `kind`, `award`, `bond`, `promised`,
  `delivered`, `gate`, optional Board verdict `hash` and `signature`.
- Real `advance(id) → Promise<Receipt>`: advances a settlement receipt without
  waiting for chain confirmation. Portable ids work across adapter instances.
- `getEscrowStatus(id) → Promise<string>`: resolve the seller-side payment by
  blockchain identifier; returns its on-chain state, queued action, or `Error`.

Receipt fields: `id`, `action`, `amount`, `from`, `to`, `state`, `badge`,
`txHash`, `explorerUrl`, optional `error`. Real receipts use `REAL` only with a
service-reported 64-character tx hash and a preprod Cardanoscan link. Until then
PENDING = real Masumi operation submitted, no transaction yet. For the Product
lane, the UI must never show it as money moved; it becomes REAL with an explorer link once a hash exists.
Pending hashes and links are null. HTTP success does not mean paid: seller payment must reach `Withdrawn`.
Configuration and API failures return `Error` receipts, without throwing into the
caller or silently creating simulated money. Bid fees retain SIMULATED receipts.

The real receipt `id` is a portable job token containing only public escrow
references and party names, never credentials. Save the award/bond lock ids and
pass `awardEscrowId` and `bondEscrowId` on the verdict when resuming settlement
in another serverless invocation. Within one adapter instance the latest lock
per supplier/kind is available as a convenience. There is no confirmation loop;
callers poll `getEscrowStatus`. No HTTP route or shared store is added here.

## Configuration and API

Required environment: `MASUMI_PAYMENT_BASE_URL` (including `/api/v1`),
`MASUMI_NETWORK=Preprod`, `MASUMI_SMART_CONTRACT_ADDRESS` (V2 source),
`MASUMI_KEY_<PARTY>` for each participating party, and `MASUMI_AGENT_<PARTY>`
for sellers. Parties are CONSUMER, BOARD, TECHBLOG, CODEPODCAST, DEVNEWSLETTER,
GAMINGFORUM. Keys must be wallet-scoped ReadAndPay, never Admin. No env files
are loaded. Missing settings become clear error receipts.

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

## Settlement and treasury

Pass submits the award result and requests the bond refund using the Supplier's
buyer key. Under gate requests the award refund using the Consumer key; it never
submits the award result. Both return `RefundRequestedPending` while the request
is queued. Persist the settlement receipt `id` and call `advance(id)` on later
polls. Only once seller-side state is `RefundRequested` or `Disputed` does the
Board (bond) or Supplier (award) authorize the refund, using the same key that
created the payment. Queued authorizations are reconciled rather than repeated.
`RefundWithdrawn` is the refund's terminal state. A2 automatic refund remains the
fallback if the Supplier never authorizes; no result is submitted on that award.

Short of promise submits both award and full bond results; Under gate also
submits the full bond result. Result submission waits for `FundsLocked`.
Pending award result receipts can also be progressed with `advance(id)`;
repeat `settle(verdict)` with the saved lock ids to progress bond collection.
Plain-transfer receipts also carry portable follow-ups: `advance(id)` re-reads
the Board-side bond state and sends the transfer once it reaches `Withdrawn`. Calls return current states, with no chain confirmation loop.
All seller mutations use the payment creator's key; refund requests use the
purchase creator's buyer key. The default HTTP path takes at most two sequential
15-second calls per progress step (status reads run in parallel).

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
