# `lib/masumi/` — Masumi client

## Purpose

Thin TypeScript client for the **hosted preprod** APIs. No chain code —
just REST calls with the API key in the `token` header.

## Contract

- **Functions (plan):**
  - `createPayment({ agentIdentifier, amount, inputHash, deadlines }) → { blockchainIdentifier }`
    — seller side, `POST /payment`. Creates signed terms, does **not** lock funds.
  - `lockEscrow({ blockchainIdentifier, identifierFromPurchaser }) → { txHash, explorerUrl }`
    — buyer side, `POST /purchase`
  - `getEscrowStatus(blockchainIdentifier) → onChainState` — seller `GET /payment`,
    buyer `GET /purchase`. States: `FundsLocked`, `FundsOrDatumInvalid`,
    `ResultSubmitted`, `RefundRequested`, `Disputed`, `WithdrawAuthorized`,
    `RefundAuthorized`, `Withdrawn`, `RefundWithdrawn`, `DisputedWithdrawn`
  - `submitResult(blockchainIdentifier, resultHash) → { txHash }` — seller,
    `POST /payment/submit-result`
  - `requestRefund(blockchainIdentifier) → { txHash }` — buyer,
    `POST /purchase/request-refund`
  - `authorizeRefund(blockchainIdentifier) → { txHash }` — seller,
    `POST /payment/authorize-refund`
  - `queryRegistry({ capability }) → AgentCard[]` — Registry `POST /registry-entry-search/`
  - `registerAgent(serviceCard) → { agentIdentifier }` — Payment Service `POST /registry`,
    then poll `GET /registry` until `agentIdentifier` is set. No top-level `did`.
- **No `release`.** There is no manual release endpoint. "Release" = the seller
  calls `submitResult`, then the Payment Service collects automatically after
  `unlockTime`. Treat the seller as paid only when its payment reaches `Withdrawn`.
- **Inputs:** API base URLs + keys from env: `MASUMI_PAYMENT_BASE_URL`,
  `MASUMI_PAYMENT_API_KEY`, `MASUMI_REGISTRY_BASE_URL`, `MASUMI_REGISTRY_API_KEY`,
  `MASUMI_NETWORK`, `MASUMI_SELLING_WALLET_VKEY`.
- **Outputs:** every op returns a tx hash + cardanoscan preprod link for the UI.
- **Rules:** timeouts on every call; poll state transitions (minutes each);
  explicit deadlines on every payment; call `submitResult` only after a Pass or
  Short of promise verdict (a buyer refund request after `ResultSubmitted`
  gives `Disputed`); on Under gate the Consumer reclaims the award (path A2,
  open until the D9 dry run) or requests a refund and the supplier authorizes;
  when `SIMULATE_PAYMENTS=true`, return labelled simulated receipts instead.
- **Escrows per run (10):** awards 3 + bonds 3 on the critical path, REAL on
  preprod unless the flag is on; bid fees 4 in the background, SIMULATED
  first and REAL only if the critical path passes its dry run and time allows.

## Done when

One lock → submit-result → `Withdrawn` cycle and one refund cycle (Under-gate
path) complete against preprod with real tx hashes, and the UI shows explorer
links. See `docs/masumi.md`.
