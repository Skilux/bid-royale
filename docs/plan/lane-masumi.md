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
| 4 | 01:00 | Bond and plain transfers | Pass: Board `authorize-refund`, Supplier collects the full bond. Short of promise and Under gate: Board `submit-result`, collects, then plain transfers (forfeit 0.375 to Consumer, or the full 1.75). |
| 5 | 03:00 | Full scenario | 3 awards and 3 bonds lock in parallel. All 3 verdict branches settle. Ledger matches the spec: Consumer net -10.875 for 14 verified signups. 4 suppliers registered and discovered through `registry-entry-search`, `apiBaseUrl` read. |
| 6 | 03:30 | Integration module | `app/lib/masumi` exposes `lockAward`, `lockBond`, `settle(verdict)`, `getEscrowStatus`. Every call has an `AbortController` timeout and checks status before a retry. Long steps return a job token and a poll route. A simulated adapter implements the same functions. |

## Progress

Status as of 2026-10-08 ~21:00. Checkpoint 1 partly done.

| Checkpoint 1 item | Status |
|---|---|
| Payment service deployed on Railway and reachable | Done. `https://masumi-payment-service-production-5263.up.railway.app` (`/api/v1`, `/admin`, `/docs`), project `bid-royale-masumi` |
| Base URL and key work | Done. Scoped `ReadAndPay`, Preprod-only, usage-limited key issued to `techblog-agent`; `masumi check` passes |
| Wallets exist and are funded | Partly. One seeded selling wallet (`…kewhxz`, 10,000 tADA) and one purchasing wallet (`…8cp47j`, **0 tADA**). Mnemonics backed up off-repo. Per-party wallets (Consumer, 4 Suppliers, Board) not created yet |
| Contract version (D9) | Open. Seeded preprod contract `addr_test1wz7j4kmg2cs7yf92uat3ed4a3u97kr7axxr4avaz0lhwdsqukgwfm`; V1/V2 not confirmed |
| Asset decided (tUSDM or tADA) | Open. Preprod tUSDM availability unverified |
| `GET /registry/wallet` returns a wallet | Not run yet |

Done so far:

- **Payment Service on Railway**, pinned to image
  `ghcr.io/masumi-network/masumi-payment-service:0.22.0`. The official
  template builds from `main`, whose seed currently crashes
  (`Cannot find package '@masumi/payment-core'`); the DB was reset once to the
  0.22.0 schema. Slow template polling vars removed, so the 0.22.0 defaults
  apply (payment and refund checks every ~30 s). Protocol fee on the payment
  source: 50 permille (5%).
- **`techblog-agent`** (Python SDK `masumi==1.2.0`, `app/lib/agents/techblog-agent`)
  deployed as Railway service at `https://techblog-agent-production.up.railway.app`.
  `/availability` and `/input_schema` answer publicly. Not registered yet
  (no `AGENT_IDENTIFIER`). Business logic is still the scaffold echo + HITL stub.
- **Local sandbox**: Docker Compose quickstart (`~/Documents/masumi-services-dev-quickstart`,
  same 0.22.0 image) with its own funded wallets. Not used for the demo.
- Secrets live only in Railway variables, gitignored `.env` files and
  `~/.config/bid-royale/railway-masumi.env`.

Timing (from code, not yet measured on chain — see
`docs/research/masumi-settlement-timing.md`): the SDK's default 24 h result
deadline puts seller release at ~30 h. Passing minimum deadlines brings release
to ~41 min and refund to ~26 min. Checkpoint 2 must pass explicit deadlines.

Next:

1. Decide price asset; register `techblog-agent` (selling wallet funded), set
   `AGENT_IDENTIFIER` on Railway, redeploy.
2. Fund the purchasing wallet; run checkpoint 2 (one real lock → release) and
   record minutes per transition.
3. Create per-party wallets for Consumer, Suppliers and Board.

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
