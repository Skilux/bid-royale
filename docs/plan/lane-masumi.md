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
| 1 | 21:30 | Access | Base URL and key work. `GET /registry/wallet?network=Preprod` returns a wallet. Contract version V1 or V2 written down (closes D9). Wallets exist and are funded for Consumer, 4 Suppliers, Board. Asset decided (tUSDM or tADA). Payment service location settled. |
| 2 | 23:00 | One real lock to release | `POST /payment`, `POST /purchase`, `submit-result`, poll to `Withdrawn`. Tx hash saved. Minutes per state transition recorded. |
| 3 | 00:00 | Refund dry run | Path A2 tried (Consumer reclaims after `submitResultTime`, no supplier signature). If the contract rejects it, `request-refund` then `authorize-refund` reaches `RefundWithdrawn`. Result and tx hash saved (closes D10). If neither works by 01:00, escalate to the Masumi mentor. The real refund tx is on the never-cut list. |
| 4 | 01:00 | Bond and plain transfers | Pass: Board `authorize-refund`, Supplier collects the full bond. Short of promise and Under gate: Board `submit-result`, collects, then plain transfers (forfeit 0.375 to Consumer, or the full 1.75). |
| 5 | 03:00 | Full scenario | 3 awards and 3 bonds lock in parallel. All 3 verdict branches settle. Ledger matches the spec: Consumer net -10.875 for 14 verified signups. 4 suppliers registered and discovered through `registry-entry-search`, `apiBaseUrl` read. |
| 6 | 03:30 | Integration module | `app/lib/masumi` exposes `lockAward`, `lockBond`, `settle(verdict)`, `getEscrowStatus`. Every call has an `AbortController` timeout and checks status before a retry. Long steps return a job token and a poll route. A simulated adapter implements the same functions. |

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
