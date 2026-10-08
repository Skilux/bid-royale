# Masumi financial rails: researched setup plan

> **Superseded in part, 9 Oct 2026 (#58).** There is no separate Validator agent, wallet or fee: PRD D7 stands, and "Validator" means the Board verifier inside the Tender Board (see `GLOSSARY.md`). A run has 10 escrows (3 awards, 3 bonds, 4 bid fees), not 11. Read the rest as dated research.

Checked 2026-10-08. Research and proposed setup sequence only. No architecture adoption, deployment, registration, wallet creation, payment, commit or push was performed. Danila must confirm architecture-dependent implementation under AGENTS.md.

Updated with the user's [setup-video transcript](sources/masumi-setup-video-transcript.md). The video demonstrates a Python SDK agent connected to a separately deployed Masumi Payment Service and its `/admin` dashboard. It does not demonstrate buyer-wallet setup using an `app.masumi.network` API key. Verified differences from the current documentation are recorded in the [video assessment](masumi-video-setup-assessment.md).

## Answer: dashboards, operators, agents and wallets are separate

There is no documented requirement for one dashboard per agent. Masumi SaaS can associate multiple agents with a user. Its registration implementation creates a managed Cardano selling wallet for an agent and adds that wallet to the user's upstream payment-key scope. Therefore an operator can manage multiple agents in one dashboard. Independent parties need separately controlled authentication and financial permissions; using multiple agent names under a shared admin credential does not provide independent financial control. The latter is a security/design inference, not a mandate to run one physical server per agent. [SaaS registration implementation](https://github.com/masumi-network/masumi-saas/blob/f1fec777c634206949855fae7f5b31d99388b50b/apps/web/src/lib/agent-registration.ts#L741), [wallet scopes](https://github.com/masumi-network/masumi-saas/blob/f1fec777c634206949855fae7f5b31d99388b50b/apps/web/src/lib/payment-node/wallet-scopes.ts).

| Concept | Purpose | Per-agent requirement? |
|---|---|---|
| Dashboard/account | Operator management and access | No; an operator can own multiple agents |
| Agent registration | Discoverable service identity, metadata and endpoint | Register seller services used by the scenario |
| Selling wallet | Seller-side registration/payment operations and collection | SaaS creates a managed seller wallet in its registration path |
| Purchasing wallet | Pays for services and locks buyer funds | Needed for participants making purchases |
| Payment Service | Wallet management, signing, escrow processing and tracking | Can hold multiple wallets; deployment topology depends on administrative ownership |
| Agent runtime | Creates creatives, bids and reports | Runs separately from the Payment Service |
| MCP | Optional agent-tool interface to APIs | Does not supply wallet ownership or replace payment infrastructure |

Masumi documents purchasing, selling and optional collection wallet roles. The Node signs and processes transactions. The recommended hosting guide separates the Node and agent application infrastructure. [Wallet roles](https://www.masumi.network/dev/masumi/core-concepts/wallets), [hosting guide](https://www.masumi.network/dev/masumi/documentation/how-to-guides/hosting-guide), [MCP integration](https://www.masumi.network/dev/masumi/documentation/technical-documentation/_masumi-mcp-server).

## Correction to the earlier dashboard assessment

The absence of a standalone Cardano `/wallet` endpoint in the dashboard API does **not** mean the hosted app cannot provision Cardano wallets. Its registration source calls wallet generation, imports an `AddSellingWallets` entry, and attaches the new wallet to the user's scoped backend key. Collection defaults to a supplied payout address, external NFT-recipient address, or the generated wallet's own address. A payout address is not a signing credential. [Registration source](https://github.com/masumi-network/masumi-saas/blob/f1fec777c634206949855fae7f5b31d99388b50b/apps/web/src/lib/agent-registration.ts#L741).

The buyer-side gap remains: reviewed SaaS signup provisions a ReadAndPay key with an initially empty wallet scope, not a purchasing wallet. Its proxy manifest omits `/purchase`, purchasing-wallet provisioning and Cardano transfers. The live dashboard OpenAPI fetched earlier in this session likewise did not advertise those routes; managed wallet creation there concerned EVM/x402. This does not prove no other managed Masumi offering supports buyers. It means dashboard signup and a dashboard API key are insufficient evidence that the full scenario can run. [Signup source](https://github.com/masumi-network/masumi-saas/blob/f1fec777c634206949855fae7f5b31d99388b50b/apps/web/src/lib/payment-node/on-signup.ts), [proxy allowlist](https://github.com/masumi-network/masumi-saas/blob/f1fec777c634206949855fae7f5b31d99388b50b/apps/web/src/lib/v1-proxy/manifest.ts), [live dashboard API specification](https://app.masumi.network/api/openapi).

## Proposed step-by-step plan

### 1. Establish the operator model

For a team-operated demonstration, one team may administer the fixtures, with distinct wallets, credentials and service identities and an honest disclosure that the team controls the demo suppliers. For independently operated businesses, use separate operator credentials and wallet scopes, with explicit custody arrangements. A Node admin retains privilege over its managed wallets; wallet-scoped agent credentials do not remove that administrator's custody. [Scope and admin behavior](https://github.com/masumi-network/masumi-payment-service/blob/d569a338ca54d5be7441564770d75ebf89b71f12/src/routes/api/wallet/index.ts), [API-key schema](https://github.com/masumi-network/masumi-payment-service/blob/d569a338ca54d5be7441564770d75ebf89b71f12/src/routes/api/api-key/schemas.ts).

### 2. Obtain full Cardano preprod Payment Service access

Prefer the organizer-provided hosted service already contemplated by the scaffold. Obtain its base URL, admin/provisioning route, scoped read/pay credentials, supported payment-source configuration, purchasing-wallet access and transfer capability. Do not assume the app.masumi.network dashboard token is a direct upstream Payment Service token.

If hosted access lacks the required buyer/transfer operations, the documented fallback is deploying the official Masumi Payment Service with PostgreSQL and a preprod Blockfrost key, using its Railway or Docker setup. This is running Masumi's existing rails, not creating an escrow contract or wallet engine. It changes the proposed hosting architecture and requires Danila's confirmation before implementation. The agent/portal application stays separate. A custom Registry Service is unnecessary to start; the official installation guide permits the centrally provided registry. [Installation guide](https://www.masumi.network/dev/masumi/documentation/get-started/install-masumi-node).

### 3. Provision only the first buyer/seller pair

Start with the Consumer purchasing wallet and TechBlog selling wallet. For SaaS, supplier registration can provision the seller wallet internally. In the reviewed full Payment Service, `POST /wallet` generates wallet material but does not persist it. Admin provisioning must import it into a payment source using `PATCH /payment-source-extended`, with `AddPurchasingWallets` or `AddSellingWallets`. Keep mnemonic handling inside secure payment infrastructure; ordinary agent tools receive scoped API access, not seed phrases. Record public addresses, wallet IDs, network and seller verification keys. [Wallet implementation](https://github.com/masumi-network/masumi-payment-service/blob/d569a338ca54d5be7441564770d75ebf89b71f12/src/routes/api/wallet/index.ts), [import schema](https://github.com/masumi-network/masumi-payment-service/blob/d569a338ca54d5be7441564770d75ebf89b71f12/src/routes/api/payment-source-extended/schemas.ts).

Use read/pay keys restricted to the intended wallets and Preprod. Keep provisioning and admin-only transfers behind the operator backend. Confirm the deployed service version and effective scopes, rather than copying API examples from a different version. [Key schema](https://github.com/masumi-network/masumi-payment-service/blob/d569a338ca54d5be7441564770d75ebf89b71f12/src/routes/api/api-key/schemas.ts).

### 4. Confirm token funding, fees and overhead

Fund purchasing and selling wallets with test ADA for chain operations and required outputs. Confirm the exact tUSDM asset ID, decimals and faucet/dispenser access before using the agreed tUSDM economic example. Official documents conflict: registration lists preprod tUSDM, while the top-up guide says USDM is unavailable on Preprod. Changing the tender currency requires Danila's decision. [Registration guide](https://www.masumi.network/dev/masumi/documentation/get-started/register-agent), [funding guide](https://www.masumi.network/dev/masumi/documentation/how-to-guides/top-up-your-wallets).

Inspect the actual payment-source fee configuration. The reviewed source's V2 default is zero protocol fee; older V1 configuration can differ. [Seed configuration](https://github.com/masumi-network/masumi-payment-service/blob/d569a338ca54d5be7441564770d75ebf89b71f12/prisma/seed.ts). Transaction fees and minimum ADA attached to native-token outputs are separate from tUSDM economics. In the reviewed transfer schema, a transfer must include at least 2 ADA in addition to any native-token assets. That ADA is transferred value, not merely a network fee. Account for it explicitly. [Transfer schema](https://github.com/masumi-network/masumi-payment-service/blob/d569a338ca54d5be7441564770d75ebf89b71f12/src/routes/api/wallet/schemas.ts).

### 5. Deploy/register one supplier, then prove payment and refund

Deploy TechBlog's reachable agent API. Implement the MIP-003 job/status/availability/input-schema contract if using the standard integration. Registration records its endpoint and seller identity; it does not host its LLM runtime. Configure dynamic auction amounts using the exact supported schema of the chosen deployment. Retain the registered `agentIdentifier`. [MIP-003](https://www.masumi.network/dev/masumi/mips/_mip-003), [registration guide](https://www.masumi.network/dev/masumi/documentation/get-started/register-agent).

The video adds a documented Python alternative for the initial protocol proof: create a virtual environment, install the `masumi` package, run `masumi init`, configure credentials, run `masumi check`, then `masumi run`. The SDK supplies standard service endpoints, so handwritten MIP-003 endpoints are not required on this path. The current README confirms `PAYMENT_API_KEY`, `SELLER_VKEY`, `PAYMENT_SERVICE_URL` and `AGENT_IDENTIFIER`; explicitly set `NETWORK=Preprod` and the actual Payment Service URL ending in `/api/v1`. `AGENT_IDENTIFIER` may be omitted when initially starting the API, but is needed after paid-service registration. The transcript's "seller wiki" means the public seller verification key, not a wallet mnemonic. [Official Python SDK](https://github.com/masumi-network/pip-masumi).

A proposed minimal Python proof sequence is: existing/approved Payment Service access → obtain seller vKey and ReadAndPay key from its `/admin` → scaffold/run an echo service → expose a public test URL or deploy it → register that base URL → set returned agent identifier and restart the agent → hire one paid test job → observe confirmed lock, returned result and eventual collection → test a refund separately → add supplier business logic. A tunnel is optional; keep the registered URL reachable and stable. Sokosumi is an optional buyer/test interface in this walkthrough, not our tender board or our Consumer's wallet setup. Do not copy the video's fixed-price example into variable auction awards or bonds. Python runtime and self-hosted Payment Service adoption remain architecture proposals requiring Danila's confirmation.

Human-in-the-loop in the video is sample business logic, not a requirement for every campaign job. Work starts once escrow funding is confirmed; a completed SDK job or result hash does not by itself prove final seller collection. The transcript's statement about recording output on-chain should be read as recording its hash; creatives and outcome evidence remain off-chain. [Payment lifecycle](https://www.masumi.network/dev/masumi/core-concepts/payments), [MIP-004 hashing standard](https://www.masumi.network/dev/masumi/mips/_mip-004).

On two separate test jobs:

1. Get the seller's payment details and start a job.
2. Have the Consumer lock the requested award through its purchasing service.
3. Observe confirmed lock, not just HTTP acceptance.
4. Submit a valid result hash and observe eventual seller collection.
5. On the second job, request and authorize a refund and observe eventual buyer collection.
6. Retain transaction hashes and explorer links. Match input/result hashes to off-chain evidence.

The documented flow distinguishes agent job APIs, Registry lookup APIs, seller `/payment` operations and buyer `/purchase` operations. Refund requests and authorizations have different actors. [Payment flow](https://www.masumi.network/dev/masumi/core-concepts/payments), [refund flow](https://www.masumi.network/dev/masumi/core-concepts/refunds-and-disputes).

### 6. Validate the bond workflow before cloning the full cast

The agreed tender is an application policy built on existing escrows. Masumi is not documented as natively evaluating signup promises or calculating bond forfeits. Our deterministic verifier and settlement application must determine the permitted action. When retaining a bond, the Board is the escrow seller and must submit its bond-service result hash on time before collection. Holding an escrow alone does not establish permission to withdraw it. [Seller lifecycle](https://www.masumi.network/dev/masumi/core-concepts/payments).

For CodePodcast's partial-underperformance branch, validate: Board collects the bond, returns its remainder, and forwards the forfeit. The reviewed full Node has `POST /wallet/transfer-funds` and corresponding `GET` status reporting for existing ADA/native-asset transfers. It is admin-only and is not advertised in the dashboard proxy. Use the Node's implementation; do not build chain transaction code. Confirm availability and permissions on the chosen hosted deployment. [Mounted routes](https://github.com/masumi-network/masumi-payment-service/blob/d569a338ca54d5be7441564770d75ebf89b71f12/src/routes/api/index.ts#L345), [transfer implementation](https://github.com/masumi-network/masumi-payment-service/blob/d569a338ca54d5be7441564770d75ebf89b71f12/src/routes/api/wallet/index.ts).

Also prove the Board can use funds received on its selling side for outgoing validator/forfeit operations. Receipt into a selling wallet does not imply its purchasing wallet is funded. A managed transfer, deliberate purchasing float, or supported sweep must be accounted for. This is a required integration proof, not an assumption.

### 7. Expand to the agreed participants

| Participant | Financial capabilities needed | Proposed registered service |
|---|---|---|
| Consumer | Purchasing wallet; receive refunds and plain transfers | No seller listing required solely to buy |
| Four suppliers | Selling for awards; purchasing for fees/bonds | Four distinct supplier services |
| Tender Board | Selling for fees/bonds; purchasing for Validator; authorized bond transfers | Board's payment-facing service |
| Validator | Selling for verification fee | Verification service |

This is seven logical parties and six proposed seller-service registrations, not a requirement for seven dashboards or seven servers. The Board is a platform service, not an LLM agent. Wallets and identity counts are an application mapping from `tender-flow.md`, not universal Masumi protocol mandates.

The full tender has four bid-fee escrows, three award escrows, three bond escrows and one Validator-fee escrow: eleven total. Its example also has three plain transfers (CodePodcast's bond remainder and two forwarded forfeits), plus any wallet funding/sweeps. The latest API minimum-output behavior means chain-level ADA movements exceed the tUSDM-only worked accounting.

### 8. Plan timing and evidence honestly

The reviewed Payment Service source requires a result deadline at least 15 minutes in the future, unlock at least 15 minutes after that, and another minimum interval before external dispute unlock. These are source-version facts, not measurements of the organizer's deployment. A fresh end-to-end settlement cannot be promised within the fast playground on that version. Query effective settings and run escrows early. [Payment deadline validation](https://github.com/masumi-network/masumi-payment-service/blob/d569a338ca54d5be7441564770d75ebf89b71f12/src/routes/api/payments/index.ts#L145).

Use pending states for fresh operations and `PRE-RECORDED` for replayed confirmations. Actual preprod transactions get `REAL` plus network/token context and explorer links; simulated payments get `SIMULATED`. The unresolved DevNewsletter no-result versus seller-authorized refund path must be decided before settlement implementation. Do not present a requested refund or submitted result as money already collected.

## Immediate handoff to Masumi mentor

Ask for a Preprod Payment Service setup supporting Consumer purchases, supplier fees/bonds, seller result/refund operations, wallet-scoped credentials and Board native-token transfers. Confirm how to provision purchasing wallets alongside SaaS-generated selling wallets; whether direct credentials differ from the dashboard key; exact token funding/decimals; deployed version; protocol fees; and minimum settlement windows. This request should precede creating extra dashboard accounts.

## Supporting research

- [User-supplied setup-video transcript](sources/masumi-setup-video-transcript.md)
- [Current-docs assessment of that video](masumi-video-setup-assessment.md)
- [Party isolation and SaaS source findings](masumi-party-isolation.md)
- [Financial API/source findings](masumi-payment-setup.md)
- [Earlier live setup facts](masumi-financial-setup-facts.md)

Source code snapshots: Masumi SaaS `f1fec777c634206949855fae7f5b31d99388b50b`; Payment Service `d569a338ca54d5be7441564770d75ebf89b71f12`. Hosted versions may differ. No confidential account fields, API credentials, mnemonics or private keys are included here.
