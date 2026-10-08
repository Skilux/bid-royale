# `lib/masumi/` — Masumi client

## Purpose

Thin TypeScript client for the **hosted preprod** APIs. No chain code —
just REST calls with the API key.

## Contract

- **Functions (plan):**
  - `lockEscrow({ publisherDid, amount, policyHash }) → { escrowId, txHash, explorerUrl }`
  - `getEscrowStatus(escrowId) → FundsLocked | ResultSubmitted | RefundRequested | Disputed`
  - `submitResult(escrowId, resultHash) → { txHash }`
  - `release(escrowId) → { txHash }`
  - `requestRefund(escrowId) → { txHash }`
  - `queryRegistry({ capability }) → AgentCard[]`
  - `registerAgent(serviceCard) → { did }`
- **Inputs:** API base URLs + `MASUMI_API_KEY` from env.
- **Outputs:** every op returns a tx hash + cardanoscan preprod link for the UI.
- **Rules:** timeouts on every call; poll state transitions (minutes each);
  when `SIMULATE_PAYMENTS=true`, return labelled simulated receipts instead.

## Done when

One lock → release cycle completes against preprod with real tx hashes,
and the UI shows explorer links. See `docs/masumi.md`.
