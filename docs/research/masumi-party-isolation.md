# Masumi parties, agents and payment access

Primary-source investigation, 2026-10-08. Evidence and onboarding options only; no architecture decision or external account/wallet mutation.

## A dashboard belongs to an operator, not necessarily one agent

Masumi SaaS associates agents with users. Its registration path generates a managed Cardano selling wallet, adds it to a payment source, and scopes that user's backend Payment Node key to the wallet. A payout/collection address is a destination; it is not the managed wallet's signing credential. When omitted, collection defaults to the generated selling wallet (or configured external NFT recipient). One account can therefore register multiple agents; the source does not impose one account/dashboard per agent. [Registration implementation](https://github.com/masumi-network/masumi-saas/blob/f1fec777c634206949855fae7f5b31d99388b50b/apps/web/src/lib/agent-registration.ts#L741), [wallet scoping](https://github.com/masumi-network/masumi-saas/blob/f1fec777c634206949855fae7f5b31d99388b50b/apps/web/src/lib/payment-node/wallet-scopes.ts).

Signup provisions an encrypted backend ReadAndPay API key with wallet-scope filtering enabled and an initially empty wallet list. It does not provision a purchasing wallet in that function. [Signup implementation](https://github.com/masumi-network/masumi-saas/blob/f1fec777c634206949855fae7f5b31d99388b50b/apps/web/src/lib/payment-node/on-signup.ts#L35).

Inference: if one hackathon team owns all supplier agents, one account can manage them, while the UI honestly explains that these are team-operated demonstration suppliers. If suppliers represent independently controlled businesses, each needs its own authenticated operator context and wallet permissions; shared broad credentials do not establish independent control. This is an ownership/security distinction, not a protocol rule requiring separate physical machines.

## Hosted SaaS is not the full Payment Service API

The SaaS curated proxy includes `/payment`, `/payment/submit-result` and `/payment/authorize-refund`, plus registry operations. Its explicit allowlist contains no `/purchase`, purchasing-wallet provisioning, or wallet-fund-transfer route. Payment proxy auth resolves the user's upstream token server-side. [Proxy manifest](https://github.com/masumi-network/masumi-saas/blob/f1fec777c634206949855fae7f5b31d99388b50b/apps/web/src/lib/v1-proxy/manifest.ts#L62).

The parent agent's downloaded live dashboard OpenAPI (`/private/tmp/masumi-dashboard-openapi.json`) similarly exposes managed EVM/x402 wallet schemas, but no Cardano `/wallet` or `/purchase` proxy. This evidence does not prove Cardano buyer functionality is unavailable through another managed offering; it does mean we cannot infer it from dashboard signup or treat an EVM wallet as a Cardano escrow wallet.

Hosted onboarding path: create each intended operator account, select preprod, register its supplier endpoint, obtain that agent's managed seller wallet/identifier and scoped integration credentials. Before adding buyer/bond roles, obtain the provider-supported Cardano purchasing wallet and API endpoint/permissions explicitly. Confirm transfers and supplier-bond flows as well. If unavailable, use the documented self-hosted Payment Service route for those roles; do not invent missing SaaS endpoints.

## Self-hosted Payment Service supports multiple wallets and scoped keys

The Node API supports multiple hot wallets; API-key schemas expose `canRead`, `canPay`, `canAdmin`, `NetworkLimit`, `walletScopeEnabled` and `WalletScopeHotWalletIds`. Wallet-scope helpers restrict reads to selected IDs and reject wallets outside scope. [Key schema](https://github.com/masumi-network/masumi-payment-service/blob/d569a338ca54d5be7441564770d75ebf89b71f12/src/routes/api/api-key/schemas.ts), [scope helpers](https://github.com/masumi-network/masumi-payment-service/blob/d569a338ca54d5be7441564770d75ebf89b71f12/src/utils/shared/wallet-scope.ts).

The wallet route's source states admin keys receive all Cardano networks and unrestricted wallet scope. It also makes wallet-fund transfers admin-only. Consequently, a shared Node can provide wallet-scoped read/pay credentials to agents, but its administrator remains privileged over the hosted wallets. This is operator-managed custody, not independent self-custody. [Wallet routes](https://github.com/masumi-network/masumi-payment-service/blob/d569a338ca54d5be7441564770d75ebf89b71f12/src/routes/api/wallet/index.ts).

Documented self-hosted onboarding: deploy Masumi Payment Service with its database/configuration, select preprod, provision and fund buying/selling wallets, issue narrow agent credentials, register suppliers, then perform one purchase/result/refund rehearsal. Operators requiring separate administrative control can run separate service instances; multiple agents owned by one operator do not inherently require separate instances. [Install guide](https://www.masumi.network/dev/masumi/documentation/get-started/install-masumi-node), [wallet roles/faucets](https://www.masumi.network/dev/masumi/core-concepts/wallets), [purchase lifecycle](https://www.masumi.network/dev/masumi/core-concepts/payments).

## Still needs explicit confirmation

- Hosted Cardano buyer access and purchasing wallet creation/funding, including whether a different managed Payment Service URL/key is provided.
- Exact hosted transfer permissions for bid fees, bonds and forfeits.
- Whether desired organization ownership produces the needed separate financial scopes; user scoping in reviewed code is not evidence of every organization-role isolation behavior.
- The actual deployed service version: source main was pinned above, but a hosted deployment can differ.
- tUSDM availability/funding: official top-up and registration documents conflict (see `masumi-financial-setup-facts.md`).

Recommended proof before expanding: one actual preprod seller and buyer, observed escrow lock, valid result, successful refund path and transaction hashes; then validate distinct wallet permissions before adding further parties. All preprod transfers remain sandbox transactions and need honest labels.
