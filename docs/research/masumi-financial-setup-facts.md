# Masumi financial setup facts

Checked 2026-10-08 against official documentation. This is evidence only, not adoption of a hosting, token, wallet or settlement design.

## Starting the rails

- Masumi's Node handles wallet/payment blockchain work through its API. Buyer flow is discover service/payment terms → start job → create purchase → observe funds locked → retrieve and verify result → release or request refund. Actual state changes must be observed rather than inferred from a successful API request. [Payments & Escrow](https://www.masumi.network/dev/masumi/core-concepts/payments).
- A purchase locks money from the purchasing wallet; the selling wallet receives service revenue. Test ADA is supplied by faucets on preprod and has no monetary value. Both purchasing and selling wallets need test ADA. [Wallets](https://www.masumi.network/dev/masumi/core-concepts/wallets).
- Agent registration requires an accessible API URL and a funded selling wallet. Metadata includes capability and pricing, and registration returns an agent identifier after confirmation. The guide quotes 5–15 minutes for preprod registration; this is an estimate, not an SLA. [Register Your Agent](https://www.masumi.network/dev/masumi/documentation/get-started/register-agent).
- For a self-hosted fallback, official installation instructions offer Docker Compose and Railway templates; the payment service uses PostgreSQL and a Blockfrost API key. This is use of existing Masumi software, not a requirement to create a wallet engine. [Install Masumi Node](https://www.masumi.network/dev/masumi/documentation/get-started/install-masumi-node).

## Hosted-service evidence and unresolved access

The parent agent inspected Masumi as a Service documentation describing hosted application registration, network/wallet/API-key setup and a curated proxy. That route could avoid operating the Node ourselves. This researcher could not independently reopen that page through the browser tool. Source retained for review: [Masumi as a Service](https://www.masumi.network/dev/masumi/documentation/get-started/masumi-as-a-service).

Before treating hosted access as implementation-ready, confirm the actual account's API base URL, permissions, purchase/payment/refund support, supported networks and token funding. In particular, confirm whether its curated proxy exposes the transfers required for tender bid fees, performance bonds and forwarding forfeits. Public high-level escrow documentation does not prove these exact tender operations are available on hosted accounts.

## Token documentation conflict

The official [Top Up Your Wallets](https://www.masumi.network/dev/masumi/documentation/how-to-guides/top-up-your-wallets) page says USDM is unavailable on preprod and testing needs only ADA. The official [registration guide](https://www.masumi.network/dev/masumi/documentation/get-started/register-agent) explicitly lists a preprod tUSDM asset identifier and recommends USDM/tUSDM pricing for Sokosumi.

These statements do not establish whether the named tUSDM can currently be obtained and used with our chosen hosted/payment setup. Confirm with Masumi support or an actual preprod balance/purchase smoke check before promising a tUSDM demo. ADA sandbox escrow remains documented; changing the agreed tender currency requires Danila's decision.

## Settlement limits that matter

The escrow guide says funds locking takes on-chain confirmation (estimated 30–120 seconds), and a submitted result opens a dispute window. A refund request must be made before unlock time; it is distinct from authorized/confirmed repayment. [Payments & Escrow](https://www.masumi.network/dev/masumi/core-concepts/payments).

Inference: prove one complete small preprod escrow and refund path before integrating every tender branch. Keep award escrow, supplier bond and bid fee as separate financial purposes in the UI; do not assume ordinary service escrow implements a penalty/bond mechanic automatically. All actual preprod money movement should show a REAL sandbox badge and transaction proof, with replay/simulated entries separately identified.

Credentials, mnemonic phrases and API keys belong only in approved secret storage; none are included in this note.
