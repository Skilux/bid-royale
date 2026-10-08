# Verdict-bound treasury (#29)

Railway holds the Admin credential and executes only Masumi plain transfers
required by a valid Board-signed verdict. Amounts are ADA, converted to integer
lovelace; less than 2 ADA returns `BelowMinimum` with PENDING and no node call.
The worker never implements chain transactions or escrow logic.

## Contract

`authorizeTransfer({ verdict, move, boardPublicKey })` returns `{ authorized,
reason? }`. It checks the signature and exact reason/from/to/amount membership
in `planSettlement(verdict)`'s plain transfers. The source is the configured
Board selling wallet; recipients are configured purchasing wallets.

`POST /transfers`: `{ id, verdict, move }`, bearer `TREASURY_TOKEN`.
`GET /transfers/:id`: same bearer; encode the receipt id as a URL component.
Both return `{ id, state, txHash, explorerUrl, badge, error? }`.
`GET /health` is public and returns `{ ok: true }`.
REAL requires a 64-character tx hash and a preprod Cardanoscan link. Other
results are PENDING, including rejections and failures; they are not paid.

The SHA-256 hex of the exact adapter receipt id keys
`treasury:transfer:<sha256(id)>` in the shared Board Upstash store. The full
receipt id is retained as `id` inside the record for audit. Persistent SET NX reserves it before POST; no TTL is used because
expiry could pay twice. The record binds the id to the signed verdict hash and
move. Duplicate requests poll `/wallet/transfer-funds?id=<transferId>` when an id
has been saved (Masumi POST returns `data.id`, stored as `transferId`). Concurrent requests never both POST. Timeout, 5xx, missing node
id, or failed persistence after submission leave a permanent reservation:
operator reconciliation against node records is required. Never delete a
reservation or retry the mutation just because its hash is absent. This favors
avoiding duplicate payments over automatic recovery after a process crash.
The caller must persist and reuse its receipt id; this is deduplication by receipt
id, not protection against an authorized caller minting multiple ids for a move.

## Vercel wiring (orchestrator after adapter changes land)

Import `createTreasuryClient` from `@/lib/masumi/treasury-client` and pass
`treasury: createTreasuryClient()` to `createRealAdapter` in `getAdapter()`.
The hook accepts the adapter's flattened `{ id, reason, from, to, amount,
verdict, bondEscrowId }`, sends `{ id, verdict, move }`, and returns
`{ state, txHash, error? }`. Repeated calls use POST to retrieve/poll the existing
record without resubmitting to Masumi. Errors return TransferPending; no throw
escapes into settlement. Only TREASURY_URL and TREASURY_TOKEN belong on Vercel.
No changes to real.js or index.js are included here.

## Deploy (operator only)

Create a Railway service from this repo, root directory `app/`, start command
`node scripts/treasury-server.mjs`. Use Node 22.15+ (registerHooks support) or
Node 24. Railway supplies PORT. Health path: `/health`. No new dependencies.
Configure Railway only: MASUMI_PAYMENT_BASE_URL (including /api/v1),
MASUMI_ADMIN_KEY, TREASURY_TOKEN, BOARD_PUBLIC_KEY (publicKeyHex output),
TREASURY_FROM_ADDRESS (Board selling wallet), TREASURY_ADDRESS_CONSUMER,
TREASURY_ADDRESS_TECHBLOG, TREASURY_ADDRESS_CODEPODCAST,
TREASURY_ADDRESS_DEVNEWSLETTER, TREASURY_ADDRESS_GAMINGFORUM,
UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. Missing env refuses startup;
credentials are read only by the server script, never imported by Vercel.
Each node request has a 15-second timeout; Redis uses 5 seconds. Incoming
requests have a size cap and a 30-second request timeout.

Tests use injected fetch/store and an in-process HTTP handler, with no network.
Live REAL proof requires an operator-run funded preprod trial; this ticket
implements and proves the path offline without moving funds or deploying.
