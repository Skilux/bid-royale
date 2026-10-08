# Masumi integration notes

How we use the hosted preprod — the rails. Source of truth for API shapes:
the Masumi docs (https://docs.masumi.network) and
`masumi-payment-service/CLAUDE.md`
(https://github.com/masumi-network/masumi-payment-service/blob/main/CLAUDE.md).
Verify endpoint signatures against the live API on the night; don't trust memory.

## What we use

| Masumi primitive | Our usage |
|---|---|
| Payment service (hosted preprod) | 6 escrows per run, all tADA (spec ×10, #24): 3 awards + 3 bonds, REAL. 4 bid fees SIMULATED (PRD D13). Settlement per verdict: every call, amount and measured time in [`docs/money-flow.md`](money-flow.md) |
| Registry | Board discovers supplier agents for the tender; register OUR 4 policy-bound supplier agents (TechBlog, CodePodcast, DevNewsletter, GamingForum) so discovery is real |
| Escrow state machine | `FundsLocked → ResultSubmitted → RefundRequested → Disputed` — surfaced in the UI ledger (full state list below) |
| Decision logging | We send hashes (tender terms, outcome report, signed verdicts); Masumi anchors them |
| Faucet | tADA for fees and escrow funds (decided 8 Oct, #24) |
| Explorer | cardanoscan preprod links per tx, shown in the UI |

## Masumi platform facts (Perplexity deep research, 2026-10-04)

Facts only — strategy suggestions from that research are discussed separately.
Items marked **UNVERIFIED** could not be confirmed; verify at preflight.

### Hosted API endpoints & auth

| Resource | URL |
|---|---|
| Payment API base | `https://payment.masumi.network/api/v1` |
| Payment Swagger | `https://payment.masumi.network/docs/` |
| Payment OpenAPI JSON | `https://payment.masumi.network/api-docs` |
| Registry API base | `https://registry.masumi.network/api/v1` |
| Registry Swagger | `https://registry.masumi.network/docs/` |
| Registry OpenAPI JSON | `https://registry.masumi.network/api-docs` |
| Preprod explorer | `https://preprod.cardanoscan.io/transaction/{txHash}` |

- Auth = API key in the literal **`token`** header, NOT `Authorization: Bearer`.
- Env names (same set in `docs/hosting.md` and `.env.example`): `MASUMI_PAYMENT_BASE_URL`, `MASUMI_PAYMENT_API_KEY`, `MASUMI_REGISTRY_BASE_URL`, `MASUMI_REGISTRY_API_KEY`, `MASUMI_NETWORK` (`Preprod`), `MASUMI_SELLING_WALLET_VKEY` (registration field `sellingWalletVkey`).
- Permission levels: **Read** (queries, status reads) / **ReadAndPay** (everything for this build: create, lock, submit result, request/authorize refund) / **Admin** (key management, operator ops). Use `ReadAndPay`; keep `Admin` out of Vercel.
- **UNVERIFIED:** public self-service issuance of credentials for `payment.masumi.network` — confirm organizer-provided keys before Oct 8. The public Registry service is explicitly experimental / for testing & development (fine for the hackathon, not production).

### Endpoints we use

| Operation | Endpoint | Permission |
|---|---|---|
| Get selling wallet | `GET /registry/wallet?network=Preprod` | Read |
| Register supplier agent | `POST /registry` (goes through the **Payment Service**, not the read-only Registry service) | ReadAndPay |
| Registration status | `GET /registry?network=Preprod` | Read |
| Discover supplier agents | Registry `POST /registry-entry-search/` | Registry API key |
| Create escrow terms | `POST /payment` — produces signed `blockchainIdentifier`; does **NOT** lock funds | ReadAndPay |
| Lock funds | `POST /purchase` — buyer builds & submits the lock tx | ReadAndPay |
| Seller-side status | `GET /payment` | Read |
| Buyer-side status | `GET /purchase` | Read |
| Submit outcome | `POST /payment/submit-result` — submits the completed-job hash, **begins** unlock; does not immediately transfer funds | ReadAndPay |
| Request refund | `POST /purchase/request-refund` | ReadAndPay |
| Authorize refund | `POST /payment/authorize-refund` — seller surrenders right to receive, initiates the refund | ReadAndPay |
| Webhooks | `GET/POST/PATCH/DELETE /webhooks`; events: `PURCHASE_ON_CHAIN_STATUS_CHANGED`, `PAYMENT_ON_CHAIN_STATUS_CHANGED`, `PURCHASE_ON_ERROR`, `PAYMENT_ON_ERROR`, `WALLET_LOW_BALANCE` | ReadAndPay |

**Critical:** there is no documented manual `/release` endpoint. "Release" in our
demo = `POST /payment/submit-result` → `ResultSubmitted` → after `unlockTime`,
the Payment Service authorizes and collects automatically → `Withdrawn`. Do NOT
mark the supplier as paid on HTTP 200 from submit-result — only when the
seller-side payment reaches `Withdrawn`. "Withdraw" is therefore not an API call
we make: we poll for `Withdrawn` (payment) or `RefundWithdrawn` (refund).

### Escrow state machine (`onChainState` values)

`FundsLocked` · `FundsOrDatumInvalid` · `ResultSubmitted` · `RefundRequested` ·
`Disputed` · `WithdrawAuthorized` · `RefundAuthorized` · `Withdrawn` ·
`RefundWithdrawn` · `DisputedWithdrawn`

| From | Trigger | Actor | To |
|---|---|---|---|
| — | `POST /purchase` | Buyer | `FundsLocked` |
| `FundsLocked` | `POST /payment/submit-result` | Seller | `ResultSubmitted` |
| `ResultSubmitted` | Dispute window passes + `unlockTime`; node authorizes/collects | Automatic | `WithdrawAuthorized` → `Withdrawn` |
| `FundsLocked` | `POST /purchase/request-refund` (before result) | Buyer | `RefundRequested` |
| `ResultSubmitted` | `POST /purchase/request-refund` | Buyer | `Disputed` |
| `RefundRequested` | `POST /payment/authorize-refund` | Seller | `RefundAuthorized` → `RefundWithdrawn` |
| `Disputed` | `POST /payment/authorize-refund` | Seller | `RefundAuthorized` → refund terminal |
| `RefundRequested` | Seller submits a result | Seller | `Disputed` |
| Any active state, malformed datum | Automatic reconciliation | Automatic | `FundsOrDatumInvalid` |

- The arbitrated path to `DisputedWithdrawn` is **UNVERIFIED** — avoid it: verify first, call submit-result only on Pass / Short of promise, and never after a buyer refund request (a refund request after `ResultSubmitted` gives `Disputed`).
- **D9 (open, deadline before 8 Oct):** preprod contract V1 vs V2. V2 allows `AuthorizeRefund` from any state, V1 only from `Disputed`. This decides whether the `RefundRequested` → `RefundAuthorized` rows above and the bond refund on Pass work as written. Settle it with the preprod dry run.
- No idempotency-key header is documented for `POST /purchase`: if the call times out, query status by `blockchainIdentifier` before retrying — duplicate attempts can conflict.

Terminal states for polling: `Withdrawn`, `RefundWithdrawn`, `DisputedWithdrawn`, `FundsOrDatumInvalid`.

### Timing expectations

- No hosted-preprod settlement SLA is published. Each public-chain attempt involves roughly a 20s confirmation step; the node may require multiple confirmations plus periodic worker passes.
- Plan for: API acceptance = seconds · first tx hash = seconds to minutes · stable `FundsLocked` = several minutes · each state transition = potentially 5–15 min · registry index visibility = a few minutes (self-host config shows ~2-min registry update cycles) · final withdrawal only after `unlockTime` + node processing.
- Polling guidance: poll our own status route every ~8s at first, back off to 15–30s after a minute, exponential backoff on 429/5xx. Never hold a Vercel function open waiting for settlement (job-token + poll). Display pending state + tx hash + confirmations + Cardanoscan link; don't promise judges a fixed settlement time.
- Hosted node confirmation threshold and scheduler frequency: **UNVERIFIED**.

### Agent registration & discovery

- Registration is submitted via Payment Service `POST /registry`; the Registry service then indexes the on-chain NFT and makes it searchable.
- Shortest path for a 10h build: **V1 dynamic-price agent** — each winning bid supplies its own amount. Registration fields: `network`, `type: "OpenApi"`, `sellingWalletVkey`, `name`, `description`, `openApiSpecUrl`, `Tags`, `ExampleOutputs`, `Capability: {name, version}`, `AgentPricing: {pricingType: "Dynamic"}`, `Author: {name, organization, contactOther}`.
- Poll `GET /registry?network=Preprod` until `agentIdentifier` is non-null, then call Registry `POST /registry-entry-refresh/` if the agent isn't discoverable yet.
- Discovery query (`POST /registry-entry-search/`): fields `network, query, limit, filter {status, tags, capability, paymentTypes}, cursorId`. Older examples using singular `paymentType`, `page`, or `onlineOnly` are stale — don't copy them.
- **V1 vs V2:** Masumi 0.28 recommends V2 for new agents (0% protocol fee, per-payment-source pricing). V2 registration requires `supportedPaymentSources[].pricing` and **forbids** top-level `AgentPricing`; payment creation requires `supportedPaymentSourceIndex`. Mixing V1 and V2 fields is one of the most likely causes of immediate 400s. Use V1 unless organizers provide a tested V2 source configuration, source index, and registered agent.
- Register as `type: "OpenApi"` (input/output schemas in the linked OpenAPI 3.1 doc) OR as `Standard` with `apiBaseUrl` — not both.

### Payment creation details

- Always submit explicit deadlines (`payByTime`, `submitResultTime`, `unlockTime`, `externalDisputeUnlockTime`) — the generated OpenAPI shows misleading epoch-era defaults for some date fields; omitting them is unsafe.
- ADA amount: `unit: ""` (empty string). Non-ADA token: `unit` = concatenated Cardano policy ID + hex asset name. Never `"lovelace"`.
- Amounts are smallest-unit **integer strings** — no decimals.
- `identifierFromPurchaser`: 14–26 chars, never reused. Decision hash = SHA-256 over `${identifierFromPurchaser};${canonicalPayload}` with sorted-JSON canonicalization; retain the exact preimage with the evidence.

### Decision logging

- On-chain: hashes only — `inputHash` commits the tender/bid terms (version, tender, supplier `agentIdentifier`, bid commitment, accepted bid, creative hash, verification-policy hash); `resultHash` commits the outcome manifest (escrow id, outcome, impressions/signups, policy version, evidence Merkle root, evidence URI, evaluated-at). `resultHash` is the proof used in settlement/dispute.
- Off-chain (evidence store): tender body, all sealed bids + salts, losing bids, creatives, impression/signup logs, user identifiers/IPs, oracle receipts, full verification trace, hash preimages. Store manifests immutably; if an object URL can change, hash the bytes and include the content hash in the anchored manifest.

### Identity / DID note

- The current registration API exposes **no top-level `did` field**; the Registry search response doesn't consistently return one. The durable on-chain identity is the registry NFT's **`agentIdentifier`**.
- Masumi's conceptual docs describe W3C-style agent/creator/organization DIDs, but that's ahead of the verified registration schema — treat native Masumi DID creation/resolution as **UNVERIFIED** for the build.
- The service card is a project-defined off-chain document, not a verified native Masumi Registry schema.

### Webhooks

- Exposed events listed above; an extended webhook needs a public HTTPS URL + auth token; process deliveries idempotently (retries/duplicates expected).
- For the night: polling is easier and safer. Whether the hosted account/key permits webhook creation is **UNVERIFIED**.

### Funding & faucets

- The safe payment asset is **tADA**: Cardano testnet faucet; preprod tADA has no monetary value.
- Funding checklist (tADA): Consumer purchasing wallet (200 tADA of awards + tx overhead), 4 supplier wallets (bid fee 2 + bond up to 17.5; they also sell, so each needs ADA for submit-result fees), Board wallet (forwarded forfeits and bond remainders; sells bid fees and bonds), registry minting wallet; add collateral if requested. Fund ≥24h before the event; don't rely on a faucet during the demo.
- Amounts go to Masumi as lovelace integer strings (1 tADA = 1,000,000 lovelace), e.g. 3.75 → `"3750000"`.
- **Test USDM on Preprod is UNVERIFIED and contradictory:** the Masumi Dispenser advertises ADA + USDM for Testnet but requires a verification code + ADA collateral; older official docs say USDM is not available on Preprod. Research recommendation: **tADA for the judged flow**; use test USDM only if organizers provide a dispenser code, exact policy/asset ID, decimals, and funded wallets. Never hard-code mainnet USDM's policy ID into Preprod. Dispenser rate limits: **UNVERIFIED**. Commonly reported faucet limit: one request per address per 24h (confirm in the faucet UI on the day).
- Decided 8 Oct (#24, Danila approved): tADA, spec amounts ×10. tUSDM dropped.

### Fees & minimums

- V2: 0% Masumi protocol fee; Cardano network fees still apply. V1 fee is payment-source configuration, not a fixed number — inspect `GET /payment-source` or the hosted dashboard; treat the hosted V1 fee as **UNVERIFIED until preflight**.
- No universal minimum escrow amount is documented; transactions must satisfy Cardano min-UTxO + collateral. Avoid dust: the ×10 amounts keep every escrow at 15 tADA or more, and `transfer-funds` has a 2 ADA minimum. Keep the purchasing wallet funded well above the 200 tADA of awards; keep several tADA in every seller wallet.

### Integration paths (TypeScript team, ~10h)

| Path | Verdict |
|---|---|
| Direct REST from TypeScript | **Recommended** — native Next.js/Vercel, exact control over all required calls |
| `pip-masumi` (Python) | Reference only — Python runtime, API drift, open MIP-003 alignment issue. Still valuable as a **hash test oracle** (MIP-004 helpers) for canonical-hash compatibility |
| Masumi MCP server | Not for this build — Python/`uv` sidecar, built around MCP job orchestration, incomplete refund/registration control |
| Docker quickstart | Emergency fallback only — PostgreSQL, Blockfrost, migrations, wallet setup, funding ops |

### Common failures (research gotchas)

Missing `/api/v1` in base URL · `Authorization: Bearer` instead of `token` header · key leaked via `NEXT_PUBLIC_*` · `unit: "lovelace"` instead of `""` · decimals instead of integer strings · reusing `identifierFromPurchaser` · V1 `AgentPricing` fields on a V2 registration · omitting `supportedPaymentSourceIndex` for V2 · querying without `filterPaymentSourceType` (V1 compatibility view) · assuming `POST /payment` locks funds · assuming submit-result 200 = released · retrying `POST /purchase` after timeout without a status query · blocking a Vercel request on chain confirmation · submitting a result near `submitResultTime` · late registration vs registry indexing lag · funding only the purchasing wallet · hashing JSON without storing the canonical bytes.

### Source map

- Payment service repo: https://github.com/masumi-network/masumi-payment-service
- Registry service repo: https://github.com/masumi-network/masumi-registry-service
- Payment OpenAPI: https://payment.masumi.network/api-docs · Registry OpenAPI: https://registry.masumi.network/api-docs
- Decision logging: https://docs.masumi.network/core-concepts/decision-logging
- Refunds & disputes: https://docs.masumi.network/core-concepts/refunds-and-disputes
- Wallets/funding: https://docs.masumi.network/core-concepts/wallets
- Dispenser: https://dispenser.masumi.network/
- `pip-masumi`: https://github.com/masumi-network/pip-masumi · MCP server: https://github.com/masumi-network/masumi-mcp-server · Docker quickstart: https://github.com/masumi-network/masumi-services-dev-quickstart
- Full research with copy-paste TypeScript client: `workspace/user/files/Masumi_integration_guide.md` (uploaded 2026-10-04)

## Auth levels

- **Read** — registry queries, payment status reads.
- **ReadAndPay** — lock escrow, submit results (release happens automatically
  after `unlockTime`), request/authorize refunds. **This is the level we need.**
- **Admin** — key management and operator ops, not arbitration. We do NOT use
  it and keep it out of Vercel. Our failure path is the refund path below,
  not the arbitrated `DisputedWithdrawn` path.

## The escrow lifecycle in our demo

Step by step, with who calls what with whose key, amounts, escrow states and
measured preprod times: **[`docs/money-flow.md`](money-flow.md)**. In short:

- 6 escrows, all tADA, locked in parallel as soon as winners are picked:
  3 awards (Consumer buys from Supplier: 70 / 60 / 70) and 3 bonds (Supplier
  buys from Board: 17.5 / 15 / 17.5). Each lock is seller `POST /payment`, then
  buyer `POST /purchase`. `FundsLocked` in 1.6–3.2 min.
- 4 bid fees of 2 tADA are SIMULATED, never returned.
- Settlement uses the fast cooperative paths (`app/lib/masumi/real.js`):
  Pass and Short of promise awards by early release (13.1 min, passes through
  `Disputed`), Pass bond by cooperative return (4.7 min), Under-gate award by
  cooperative refund (5.9 min; A2 automatic refund 27.8 min as fallback).
  The Board collects Short-of-promise and Under-gate bonds by early release,
  then the treasury worker sends the forfeit to the Consumer and any remainder
  to the Supplier (plain transfers, Board-signed verdict required).
- Never `submit-result` on an Under-gate award: a refund request after
  `ResultSubmitted` gives `Disputed`.
- Per-supplier states: Pass and Short of promise end `SETTLED`, Under gate ends
  `REFUNDED`, Lost bid never leaves `QUOTED`.

**Timing reality:** a full run settles in about 15 min. Locks go out as soon as
winners are picked; the UI polls and streams progress via SSE. Never block the
demo on a synchronous chain call — job-token + poll.

## Registry usage

- Our 4 supplier agents (TechBlog, CodePodcast, DevNewsletter, GamingForum) get
  registered with service cards: capability ("tech-audience ad inventory"),
  input/output schema, price, delivery window.
- The Board discovers them via registry query (`POST /registry-entry-search/`),
  reads each entry's `apiBaseUrl` and sends the tender to our custom
  `POST /tender-invite`. MIP-003 `/start_job` is NOT used: calling it would make
  the Board a paying buyer. Each agent still exposes the MIP-003 routes on Vercel (ADR 0002, #37). (Reading `apiBaseUrl` implies registering as
  `Standard`, not `OpenApi`: confirm at preflight.) The registry is passive: it
  doesn't run bidding; the Tender Board + sealed-bid auction is our product layer.
  Proactive supplier discovery (GamingForum finds the Board) is pitch only.

## What we need from the organizers / Masumi mentor

- [ ] Hosted payment-service base URL + API keys (ReadAndPay)
- [ ] Registry base URL + permission to register our 4 supplier agents
- [ ] Faucet access / pre-funded wallets (tADA)
- [ ] Contract version on preprod (V1 or V2) and whether a buyer can reclaim an award after `submitResultTime` without the seller (D9)
- [ ] Kickoff questions: recommended integration path for a 10h build
      (payment-service REST vs `pip-masumi` vs MCP server)? What breaks most
      often? Any rate limits for the night?

## Fallback

If preprod is unreachable → labelled simulated ledger (`SIMULATE_PAYMENTS`)
+ canned replay. No second rail: the team decided Masumi-only. The scenario,
UI, and demo script are unchanged; only the settlement adapter swaps to
simulated receipts.
