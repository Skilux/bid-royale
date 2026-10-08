# Lane: Masumi (Vladimir)

## Goal

One script, `npm run poc:masumi`, runs the full money flow with hard-coded
verdict inputs on Preprod. It prints a table of every escrow: tx hash, final
state, explorer link. The same script with `SIMULATE_PAYMENTS=true` prints the
same table with SIMULATED badges.

Scope: payment logic only. No UI, agents or verifier. Rails stay Masumi's (see
`AGENTS.md`, "The one rule above all"). Amounts and flow: `docs/masumi.md`.

## Checkpoints

| # | By | Checkpoint | Done when |
|---|---|---|---|
| 1 | 21:30 | Access | Base URL and key work. `GET /registry/wallet?network=Preprod` returns a wallet. Contract version V1 or V2 written down (closes D9). Wallets exist and are funded for Consumer, 4 Suppliers, Board. Asset decided (tUSDM or tADA). Payment service deployed on Railway (ADR 0001) and reachable. |
| 2 | 23:00 | One real lock to release | `POST /payment`, `POST /purchase`, `submit-result`, poll to `Withdrawn`. Tx hash saved. Minutes per state transition recorded. |
| 3 | 00:00 | Refund dry run | Path A2 tried (Consumer reclaims after `submitResultTime`, no supplier signature). If the contract rejects it, `request-refund` then `authorize-refund` reaches `RefundWithdrawn`. Result and tx hash saved (closes D10). If neither works by 01:00, escalate to the Masumi mentor. The real refund tx is on the never-cut list. |
| 4 | 01:00 | Bond and plain transfers | Pass: Board `authorize-refund`, Supplier collects the full bond. Short of promise and Under gate: Board `submit-result`, collects, then plain transfers (forfeit 3.75 to Consumer and 11.25 back to Supplier, or the full 17.5 to Consumer). |
| 5 | 03:00 | Full scenario | 3 awards and 3 bonds lock in parallel. All 3 verdict branches settle. Ledger matches the spec ×10: Consumer net −108.75 tADA for 14 verified signups. 4 suppliers registered and discovered through `registry-entry-search`, `apiBaseUrl` read. |
| 6 | 03:30 | Integration module | `app/lib/masumi` exposes `lockAward`, `lockBond`, `settle(verdict)`, `getEscrowStatus`. Every call has an `AbortController` timeout and checks status before a retry. Long steps return a job token and a poll route. A simulated adapter implements the same functions. |

## Progress

Status as of 2026-10-08 ~21:35. Checkpoint 1 partly done.

| Checkpoint 1 item | Status |
|---|---|
| Payment service deployed on Railway and reachable | Done. Upgraded to 0.29.0, `/api/v1/health` ok. `https://masumi-payment-service-production-5263.up.railway.app` (`/api/v1`, `/admin`, `/docs`), project `bid-royale-masumi` |
| Base URL and key work | Admin key works on 0.29.0 (`MASUMI_ADMIN_API_KEY` in gitignored `app/.env.local`, local scripts only). Scoped `ReadAndPay` key for `techblog-agent` not re-checked since the upgrade |
| Wallets exist and are funded | Partly. Seeded selling wallet (`…kewhxz`) and purchasing wallet (`…8cp47j`) hold 10,000 tADA each (checked on chain). Mnemonics backed up off-repo. Per-party wallets (Consumer, 4 Suppliers, Board) not created yet |
| Contract version (D9) | Seeded source is V1 (`Web3CardanoV1`, `addr_test1wz7j4kmg2cs7yf92uat3ed4a3u97kr7axxr4avaz0lhwdsqukgwfm`, 5% fee). Decided: run on a new V2 source (L1 below); closes when W1 is done |
| Asset decided (tUSDM or tADA) | Decided: tADA, spec amounts × 10 (L2 below) |
| `GET /registry/wallet` returns a wallet | Not run yet |

Done so far:

- **Payment Service on Railway**, pinned to image
  `ghcr.io/masumi-network/masumi-payment-service:0.29.0` (released
  2026-10-05). 0.22.0 built transactions with outdated Cardano cost
  parameters, so every contract tx failed (the first `techblog-agent`
  registration ended `RegistrationFailed`, no funds moved). The upgrade
  migration stalled on `20260824160000_add_transaction_tx_hash_index`
  (`CREATE INDEX CONCURRENTLY`); recovered by dropping the half-built index,
  marking the migration rolled back and migrating again. All 142 migrations
  applied, wallets and keys kept. The seed step still crashes on 0.29.0
  (`Cannot find package '@masumi/payment-core'`) and the DB is already seeded,
  so the start command is `pnpm run prisma:migrate && pnpm run start` with no
  seed. Slow template polling vars removed, so the defaults apply (payment
  and refund checks every ~30 s). Protocol fee on the payment source: 50
  permille (5%).
- **Fund transfers** go through the Payment Service, not our code:
  `POST /wallet/transfer-funds` (Admin key, min 2 ADA, queued as `Pending`,
  poll `GET /wallet/transfer-funds` for the tx hash). Use it to fund
  per-party wallets and for the checkpoint 4 plain transfers (forfeits).
  New wallets: `POST /wallet`.
- **`techblog-agent`** (Python SDK `masumi==1.2.0`, `app/lib/agents/techblog-agent`)
  deployed as Railway service at `https://techblog-agent-production.up.railway.app`.
  `/availability` and `/input_schema` answer publicly. Not registered yet
  (no `AGENT_IDENTIFIER`). Business logic is still the scaffold echo + HITL stub.
- **Local sandbox**: Docker Compose quickstart (`~/Documents/masumi-services-dev-quickstart`,
  still on 0.22.0, needs the same bump) with its own funded wallets. Not used for the demo.
- Secrets live only in Railway variables, gitignored `.env` files and
  `~/.config/bid-royale/railway-masumi.env`.

Timing (from code, not yet measured on chain — see
`docs/research/masumi-settlement-timing.md`): the SDK's default 24 h result
deadline puts seller release at ~30 h. Passing minimum deadlines brings release
to ~41 min and refund to ~26 min. Checkpoint 2 must pass explicit deadlines.

Next: the work plan below.

## Decisions (2026-10-08 ~21:50, Vladimir)

| # | Decision | Why | Sign-off |
|---|---|---|---|
| L1 | **Run the money flow on a new `Web3CardanoV2` payment source** on our 0.29.0 node. The seeded V1 source stays as a fallback. Closes D9 by choice: V2. | V2 is Masumi's current default. Its fee must be 0 (V1 takes 5% per escrow, which breaks the spec ledger). V2 allows `authorize-refund` from any state, and its cooldown is configurable. | Lane-internal |
| L2 | **Amounts are the spec × 10, in tADA.** Awards 70 / 60 / 70, bonds 17.5 / 15 / 17.5, bid fee 2, Short-of-promise forfeit 3.75 (11.25 back to the Supplier), Consumer net −108.75 tADA. tUSDM dropped. | `transfer-funds` has a 2 ADA minimum, and small escrows risk min-UTxO errors. tUSDM on Preprod is unverified. We hold 20,000 tADA. | **Danila**: changes the numbers in `app/lib/settlement/plan.js` and on the receipt |
| L3 | **Settlement timing for the demo is decided after the measured run** (W4–W6). Warm run + attach, video time cut, or live wait. | The 41 min / 26 min floors come from code, not measurement. | Danila, once numbers exist |
| L4 | **"Hall" topology: one node, one scoped key per party, suppliers live on Vercel (#12).** All wallets sit on our Railway node. The Board's settlement engine calls Masumi with each party's wallet-scoped `ReadAndPay` key. 4 suppliers + Board register via `POST /registry` with `apiBaseUrl` on Vercel. The Python `techblog-agent` is retired. | Supplier logic already lives in #8 / #12, the Python SDK hardcodes 24 h deadlines, and `/start_job` is unused. Fewer services to keep alive overnight. | Matches #12; tell Danila the Python agent is retired |

Honest limitations this adds: team-operated suppliers, operator-managed custody
(the node admin can move every wallet), plain transfers trust the Board.

## Work plan (ticket-ready)

Wall-clock is the constraint: every chain transition takes minutes. So the
three dry runs (W4–W6) start **together as one batch**, and the code (W7) is
written while they settle.

```text
W1 V2 source ─► W2 wallets + keys ─► W3 register agents ─┬─► W4 award release  ─┐
                                                          ├─► W5 award refund   ─┼─► W8 timing decision
                                                          └─► W6 bonds+transfers ┘          │
                         W7 real adapter + poc script (starts after W2, uses W4–W6 data) ─► W9 full scenario ─► W10 docs
```

### W1. V2 payment source (≈22:15)

- Generate fresh wallets with `POST /wallet` (V2 vkeys must not collide with
  V1): one admin wallet, plus the purchasing and selling wallets the source
  needs to start.
- `POST /payment-source-extended`: `paymentSourceType: Web3CardanoV2`,
  `network: Preprod`, Blockfrost key, `AdminWallets` = [our admin],
  `requiredAdminSignatures: 1`, `feeRatePermille: 0`, `cooldownTime` lowered
  from the 7 min default (try 60 s, record what the contract accepts).
- Fund collateral where V2 requires it (Masumi ADR 0007).
- **Done when:** the source is `in_sync`, its `smartContractAddress` is
  recorded here, mnemonics are backed up off-repo, D9 is marked closed (V2) in
  `docs/plan/README.md`.

### W2. Party wallets, funding, scoped keys (≈22:40)

- 10 hot wallets on the V2 source: Consumer (purchasing), Board (selling), and
  for each of the 4 Suppliers one selling wallet (awards) plus one purchasing
  wallet (bid fee, bond).
- Fund from the two seeded V1 wallets with `POST /wallet/transfer-funds`:
  Consumer 400, Board selling 150, each Supplier purchasing 60 and selling 20
  (tADA, covers ×10 amounts + fees + collateral, with room for re-runs).
- One `ReadAndPay` key per party: `walletScopeEnabled`, scoped to that party's
  wallet IDs, Preprod only. Keys go in `app/.env.local` and Vercel env.
  The Admin key never goes to Vercel.
- **Done when:** a balance table (address suffix, tADA, funding tx link) is in
  this doc, and one negative test shows a party key rejected on another
  party's wallet.

### W3. Register 4 suppliers + Board (≈23:00, starts right after W2)

- `POST /registry` on the V2 source for TechBlog, CodePodcast, DevNewsletter,
  GamingForum (each with its own selling wallet) and the Board (seller of bond
  and bid-fee escrows). `apiBaseUrl` = the Vercel routes from #12 (production
  domain + per-supplier path; agree the paths with the Product lane).
- Poll until `RegistrationConfirmed`, record each `agentIdentifier`.
- `registry-entry-search` with the V2 source filter returns all 4 suppliers
  with their `apiBaseUrl` (the discovery part of checkpoint 5).
- Register TechBlog first: W4–W6 only need TechBlog and the Board.
- Retire the Python `techblog-agent` Railway service (stop it; delete once
  nothing references it).
- **Done when:** 5 `agentIdentifier`s and registration tx links are in this
  doc and the search returns the 4 suppliers.

### W4. Award release, timed (checkpoint 2)

- TechBlog key: `POST /payment` with minimum windows (`submitResultTime` =
  now + 15 min + margin, `unlockTime` + 15 min, `externalDisputeUnlockTime`
  + 15 min, `payByTime` ≤ `submitResultTime` − 5 min). Consumer key:
  `POST /purchase`. TechBlog: `submit-result` once `FundsLocked`. Poll to
  seller-side `Withdrawn`.
- Log a timestamp for every state change.
- Check whether V2 offers a faster happy path than waiting out `unlockTime`
  (the V2 scheduler has an authorize-withdrawal job). Record the answer.
- **Done when:** tx hashes, explorer links and minutes per transition are in
  `docs/research/masumi-settlement-timing.md` under "Measured".

### W5. Award refund, timed (checkpoint 3, closes D10)

- Two escrows Consumer → TechBlog, started with W4:
  - **A2:** lock, never submit, wait for the automatic refund after
    `submitResultTime` (+10 min per code).
  - **Fast path:** lock, Consumer `request-refund`, TechBlog
    `authorize-refund`.
- **Done when:** both outcomes, tx hashes and minutes are recorded, D10 is
  closed with the path the Under-gate branch will use. If neither reaches
  `RefundWithdrawn` by 01:00, escalate to the Masumi mentor (never-cut item).

### W6. Bonds and plain transfers (checkpoint 4)

- Three bond escrows TechBlog → Board, started with W4:
  - **Pass:** Board `authorize-refund` from `FundsLocked` → `RefundWithdrawn`.
  - **Short of promise:** Board `submit-result` → `Withdrawn`, then
    `transfer-funds` 3.75 to Consumer and 11.25 to the Supplier.
  - **Under gate:** Board `submit-result` → `Withdrawn`, then `transfer-funds`
    17.5 to Consumer.
- **Open, needs Danila:** `transfer-funds` is Admin-only, and the Admin key
  must stay out of Vercel. In the live run, who sends the plain transfers?
  (a) a small Railway "treasury" worker that holds the Admin key and only
  executes transfers for a Board-signed verdict; (b) the operator's local
  script; (c) something else. Pick before W7 wires `settle()`.
- **Done when:** all three bond paths end in their terminal state with tx
  links and minutes recorded.

### W7. Real adapter + `npm run poc:masumi` (checkpoint 6, starts after W2)

- `app/lib/masumi/client.js`: REST client with `token` header,
  `AbortController` timeout on every call, status query before any retry,
  unique `identifierFromPurchaser` per lock.
- `app/lib/masumi/real.js`: same contract as `simulated.js`
  (`lockBidFee`, `lockAward`, `lockBond`, `settle(verdict)`,
  `getEscrowStatus`). Long steps return a job token. Bid fees stay SIMULATED
  (badged) until W9 passes.
- `getAdapter()` picks real or simulated from `SIMULATE_PAYMENTS`.
- `app/scripts/poc-masumi.mjs` + `npm run poc:masumi`: drives the adapter
  through the 3 verdict branches and prints the escrow table (tx hash, state,
  explorer link, badge).
- **Done when:** the poc prints the full table with `SIMULATE_PAYMENTS=true`,
  and the real adapter passes one lock → state read against the node.

### W8. Timing decision (decision ticket, after W4–W6)

- From the measured minutes, propose warm run + attach, video time cut, or
  live wait (`docs/research/masumi-settlement-timing.md` options 3–5).
- **Done when:** Danila has picked one and it's in `docs/plan/README.md`.

### W9. Full scenario on Preprod (checkpoint 5)

- `npm run poc:masumi` against the node: 3 awards and 3 bonds lock in
  parallel, the three verdict branches settle (TechBlog Pass, CodePodcast
  Short of promise, DevNewsletter Under gate).
- **Done when:** the ledger shows Consumer net −108.75 tADA for 14 verified
  signups, every row has a REAL tx link, and the run is saved as the canned
  replay source.

### W10. Docs and handoff

- `app/lib/masumi/README.md`: final contract, verdict input shape, ×10 amounts.
- Honest limitations (L4 note above) in `docs/honest-limitations.md`.
- Tx hash proof table for the README.
- **Done when:** the Product lane can switch `SIMULATE_PAYMENTS=false`
  without reading this doc.

## Rules for this lane

- Deadlines are explicit on every payment: `payByTime`, `submitResultTime`,
  `unlockTime`, `externalDisputeUnlockTime`.
- Never mark a supplier paid on HTTP 200 from `submit-result`. Paid means
  seller-side `Withdrawn`.
- Bid fees stay SIMULATED until checkpoint 5 passes. Then REAL if time allows (D13).
- Every chain op surfaces a tx hash and an explorer link. Every simulated op
  carries the SIMULATED badge.
- No keys in the repo. `ReadAndPay` keys only, never `Admin` in Vercel.

## Hands off to Product lane

At checkpoint 1: function signatures and the verdict input shape, posted in
`app/lib/masumi/README.md`. Product codes against a stub adapter until checkpoint 6.
