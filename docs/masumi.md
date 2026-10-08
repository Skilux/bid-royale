# Masumi integration notes

How we use the hosted preprod — the rails. Source of truth for API shapes:
the Masumi docs (https://docs.masumi.network) and
`masumi-payment-service/CLAUDE.md`
(https://github.com/masumi-network/masumi-payment-service/blob/main/CLAUDE.md).
Verify endpoint signatures against the live API on the night; don't trust memory.

## What we use

| Masumi primitive | Our usage |
|---|---|
| Payment service (hosted preprod) | 10 escrows per run, all tUSDM: 6 critical (3 awards, 3 bonds), REAL + 4 background bid fees, SIMULATED first and REAL if time allows (PRD D13). Settlement per verdict, calls per branch in "The escrow lifecycle in our demo" |
| Registry | Board discovers supplier agents for the tender; register OUR 4 policy-bound supplier agents (TechBlog, CodePodcast, DevNewsletter, GamingForum) so discovery is real |
| Escrow state machine | `FundsLocked → ResultSubmitted → RefundRequested → Disputed` — surfaced in the UI ledger (full state list below) |
| Decision logging | We send hashes (tender terms, outcome report, signed verdicts); Masumi anchors them |
| Faucet | tADA (fees) + tUSDM (escrow funds) for our wallets — ⚠️ test USDM on preprod is **UNVERIFIED**, see "Funding" below |
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
- Funding checklist (tUSDM + ADA): Consumer purchasing wallet (20 tUSDM of awards + tx overhead), 4 supplier wallets (bid fee 0.2 + bond; they also sell, so each needs ADA for submit-result fees), Board wallet (forwarded forfeits and bond remainders; sells bid fees and bonds), registry minting wallet; add collateral if requested. Fund ≥24h before the event; don't rely on a faucet during the demo.
- Amounts like 0.2, 0.375 and 1.125 tUSDM need the asset's decimals as integer strings; the decimals are **UNVERIFIED** with the asset itself.
- **Test USDM on Preprod is UNVERIFIED and contradictory:** the Masumi Dispenser advertises ADA + USDM for Testnet but requires a verification code + ADA collateral; older official docs say USDM is not available on Preprod. Research recommendation: **tADA for the judged flow**; use test USDM only if organizers provide a dispenser code, exact policy/asset ID, decimals, and funded wallets. Never hard-code mainnet USDM's policy ID into Preprod. Dispenser rate limits: **UNVERIFIED**. Commonly reported faucet limit: one request per address per 24h (confirm in the faucet UI on the day).
- ⚠️ Conflicts with this file's plan (all amounts in tUSDM, test USDM **UNVERIFIED**): fallback is tADA with scaled amounts. Decide with Vladimir once the organizers answer.

### Fees & minimums

- V2: 0% Masumi protocol fee; Cardano network fees still apply. V1 fee is payment-source configuration, not a fixed number — inspect `GET /payment-source` or the hosted dashboard; treat the hosted V1 fee as **UNVERIFIED until preflight**.
- No universal minimum escrow amount is documented; transactions must satisfy Cardano min-UTxO + collateral. Avoid dust — a few tADA per escrow in the tADA fallback. Keep the purchasing wallet funded well above the 20 tUSDM of awards; keep several tADA in every seller wallet.

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

All 10 escrows use the same two lock calls: the seller creates terms with
`POST /payment` (no funds move), the buyer locks with `POST /purchase`.
Every escrow ends in `Withdrawn` or `RefundWithdrawn`, collected by the node.

| Escrow | Count | Path | Buyer (locks) | Seller (submits result, collects) |
|---|---|---|---|---|
| Bid fee, 0.2 tUSDM | 4 | background, SIMULATED first | Supplier agent | Board |
| Award (7, 6, 7) | 3 | critical, REAL | Consumer agent | Supplier agent |
| Bond, 25% of award (1.75, 1.5, 1.75) | 3 | critical, REAL | Supplier agent (winner) | Board |

Bid fee: seller calls `submit-result`, then collects after `unlockTime`. No
refund calls, ever (the bid fee is never returned). The Board's signed
verdicts are hashed into the decision log (inferred from "Decision logging").

Award and bond calls per settlement branch (the Board's verifier signs the
verdict before any call; "collect" = automatic after `unlockTime`):

| Branch | Award (Consumer buys from Supplier) | Bond (Supplier buys from Board) |
|---|---|---|
| Pass (delivered ≥ promised) | Supplier `submit-result`, collects the full award → `Withdrawn` | Board `authorize-refund`, Supplier collects the full bond → `RefundWithdrawn` |
| Short of promise (≥ 5, < promised) | Same as Pass | Board `submit-result`, collects the full bond → `Withdrawn`; then plain transfers: bond − forfeit to Supplier, forfeit to Consumer. Forfeit = bond × (promised − delivered) ÷ promised |
| Under gate (< 5) | Path A2 (below): Supplier never submits; Consumer reclaims after `submitResultTime` | Board `submit-result`, collects the full bond → `Withdrawn`; then a plain transfer of the full bond to Consumer |
| Lost bid | No award | No bond; bid fee only, not returned |

- **A2, Under-gate award (open until the D9 dry run):** the Supplier never calls
  `submit-result`. After `submitResultTime` the Consumer reclaims the award with
  no supplier signature. The exact Masumi call for a buyer-only reclaim is not in
  this research: confirm it in the dry run. Fallback if the contract rejects it:
  Consumer `POST /purchase/request-refund` (`FundsLocked` → `RefundRequested`),
  then Supplier `POST /payment/authorize-refund` → `RefundWithdrawn`. Our own
  supplier agent signs it. Never `submit-result` here: a refund request after
  `ResultSubmitted` gives `Disputed`.
- **Pass, bond refund (inferred, depends on D9):** under V1 the Board's
  `authorize-refund` may need the Supplier's `request-refund` first
  (`RefundRequested`); under V2 it works from `FundsLocked`.
- **Plain transfers** (bond remainder, forfeit) are not escrows and not Masumi
  calls. They are a trust assumption on the Board and go in honest limitations.
- Per-supplier states: Pass and Short of promise end `SETTLED`, Under gate ends
  `REFUNDED`, Lost bid never leaves `QUOTED`.

```text
1. Brief + tender: Consumer publishes the tender (gate 5/1,000, bond 25%); Board
   finds suppliers in the registry, POSTs /tender-invite to each api_base_url
2. Bidding: each of 4 suppliers locks the 0.2 bid fee (4 escrows, background,
   SIMULATED first);
   commit hash, reveal, Board checks hashes, ranks cheapest per promised signup,
   picks 3 winners within budget 20
3. Lock (IN PARALLEL, early in the night): Consumer locks 3 awards, each winner
   locks its bond → FundsLocked (save tx hash + explorer link)
4. Traffic serves (off-chain, simulated); NeoRack signup feed → Board; the
   Board's verifier counts verified signups and the Board signs a verdict per
   supplier
5. Settlement engine, per supplier, by verdict (table above):
     Pass / Short of promise → submit result → collect → SETTLED
     Under gate → refund path → REFUNDED
```

**Timing reality:** polling a state transition takes minutes. Locks go out as
soon as winners are picked; the UI polls and streams progress via SSE.
Never block the demo on a synchronous chain call — job-token + poll.

## Registry usage

- Our 4 supplier agents (TechBlog, CodePodcast, DevNewsletter, GamingForum) get
  registered with service cards: capability ("tech-audience ad inventory"),
  input/output schema, price, delivery window.
- The Board discovers them via registry query (`POST /registry-entry-search/`),
  reads each entry's `apiBaseUrl` and sends the tender to our custom
  `POST /tender-invite`. MIP-003 `/start_job` is NOT used: calling it would make
  the Board a paying buyer. (Reading `apiBaseUrl` implies registering as
  `Standard`, not `OpenApi`: confirm at preflight.) The registry is passive: it
  doesn't run bidding; the Tender Board + sealed-bid auction is our product layer.
  Proactive supplier discovery (GamingForum finds the Board) is pitch only.

## What we need from the organizers / Masumi mentor

- [ ] Hosted payment-service base URL + API keys (ReadAndPay)
- [ ] Registry base URL + permission to register our 4 supplier agents
- [ ] Faucet access / pre-funded wallets (tADA + tUSDM — ⚠️ test USDM UNVERIFIED, see above)
- [ ] Contract version on preprod (V1 or V2) and whether a buyer can reclaim an award after `submitResultTime` without the seller (D9)
- [ ] Kickoff questions: recommended integration path for a 10h build
      (payment-service REST vs `pip-masumi` vs MCP server)? What breaks most
      often? Any rate limits for the night?

## Fallback

If preprod is unreachable → labelled simulated ledger (`SIMULATE_PAYMENTS`)
+ canned replay. No second rail: the team decided Masumi-only. The scenario,
UI, and demo script are unchanged; only the settlement adapter swaps to
simulated receipts.
