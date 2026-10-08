---
name: bid-royale-supplier
description: How a supplier (publisher) agent answers a tender invite, seals and reveals a bid, prices an offer, reports delivery, and is judged by the Tender Board. Covers the supplier routes, the offer algorithm and the verdict rules.
---

# Supplier API and guide: price, seal and deliver an offer

For an agent that sells ad slots (a publisher: blog, podcast, newsletter, forum). The Tender Board invites you to bid on a
Consumer's tender. You answer with a sealed quote. If you win, you serve traffic and the Board checks the signups the
shop attributes to you. You are paid, or penalised, by that verdict.

Every route, field and number on this page was read from the code on `main`, and the routes were called on a local run
(`SIMULATE_PAYMENTS=true`, `PERSONA_MODE=pinned`). The source file is cited next to each claim. Money constants live in
`app/lib/config.js` and are quoted as of this commit.

- Base URL: `https://ad-slot-auction.vercel.app` (`docs/money-flow.md`, "Where things run"). Deploys are manual, so it can lag `main`.
- Supplier ids (route `<name>`): `techblog`, `codepodcast`, `devnewsletter`, `gamingforum` (`app/lib/supplier-agents/personas.js`).
  The MIP-003 routes also accept `board`.
- Auth for `tender-invite`, `run` and `delivery`: header `x-agent-secret` equal to the deployment's `AGENT_SHARED_SECRET`.
  A missing or wrong secret gives 401, and so does an unset `AGENT_SHARED_SECRET` (`secretMatches`, `app/lib/supplier-agents/handler.js`).
  The MIP-003 routes check no header.
- Related: [customer guide](customer.md), `app/lib/supplier-agents/README.md` (the built-in brains), `docs/agents/personas.md`, `docs/money-flow.md`.

## 1. The life of a bid

1. The Board calls `POST <your base>/tender-invite` with the tender (`app/lib/supplier-agents/bid-source.js`, `httpInvite`). It invites all four suppliers
   in parallel and waits up to 45 s for each.
2. You answer with a sealed quote: price, impressions, promised signups per 1,000, a random `salt`, and `commit` = SHA-256 of those fields (section 3).
   Or you answer `skip`.
3. The Board stamps the receive time (`committedAt`) and publishes only the `commit` (`bid.committed`). It locks the bid fee for every committed bid. Then it
   publishes the reveal (`bid.revealed`: price, impressions, promisedPer1000, salt). `app/lib/board/index.js`, handler `bids`.
4. Allocation recomputes every commit, rejects, ranks and fills the budget (section 4). Winners lock their award and bond.
5. The shop serves traffic and emits signed signups. You may post a delivery report (section 6).
6. The Board verifies the signups, signs one verdict per winner and settles (section 5).

If your invite times out, fails, or returns something that does not match `InviteResponse`, the Board does not drop you. It substitutes the pinned quote of the
persona with your id (`reason: "invite_timeout"` or `"invite_error"`, `bid-source.js`). A `skip` is different: no commit, no bid fee, no bid.

## 2. `POST /api/agents/<name>/tender-invite`

`POST /api/agents/<name>/run` is the same handler (`app/app/api/agents/[name]/run/route.js`, `.../tender-invite/route.js`, `app/lib/supplier-agents/handler.js`).
Max duration 60 s.

### Request (`InviteRequest`, `app/lib/supplier-agents/schemas.js`)

| Field | Type | Notes |
|---|---|---|
| `action` | `"bid"` | optional, default `"bid"` |
| `runId` | string, max 100 | |
| `supplier` | one of the four ids | must equal `<name>` in the route, else 400 |
| `tender.budget` | number | the Consumer's total budget |
| `tender.gate` | number | minimum signups per 1,000 impressions |
| `tender.bondRate` | number | bond as a share of the award |
| `tender.bidFee` | number | fee every bidder pays |
| `tender.currency` | string, max 20 | |
| `tender.audience` | string, max 200 | optional |
| `tender.deadline` | number | optional, epoch ms. Commits received after it are `late` |
| `reference` | `{ pricePerSignup: number, source: "operator" \| "history" }` | optional. The Board sends `pricePerSignup` = `REFERENCE_PRICE`, default 10 (`bidSourceFromEnv`). If you omit it the schema default is 1 |
| `history` | up to 20 of `{ supplier, kind, price, promised, delivered }` | optional, default `[]`. The Board sends `[]` today |

```bash
curl -s -X POST $BASE/api/agents/techblog/tender-invite \
  -H "x-agent-secret: $AGENT_SHARED_SECRET" -H 'content-type: application/json' \
  -d '{"runId":"r1","supplier":"techblog",
       "tender":{"budget":200,"gate":5,"bondRate":0.25,"bidFee":2,"currency":"tADA"},
       "reference":{"pricePerSignup":10,"source":"operator"}}'
```

### Response (`InviteResponse`, 200)

| Field | Notes |
|---|---|
| `supplier` | your id |
| `decision` | `"bid"` or `"skip"` |
| `bid` | required when `decision` is `"bid"`: `{ supplier, price, impressions, promisedPer1000, salt, commit }` |
| `rationale` | string |
| `gate` | optional `{ pricePerSignup, winChance, margin, ev, passed }`, the self-check from section 3 |
| `source` | `"llm"` or `"pinned"` |
| `reason`, `model`, `turns`, `usage`, `attempts` | optional. Why a pinned quote was used, which model, spend, failed attempts |

Example from a local run with `PERSONA_MODE=pinned` (`reason: "forced"`):

```json
{ "supplier": "techblog", "decision": "bid",
  "bid": { "supplier": "techblog", "price": 70, "impressions": 1000, "promisedPer1000": 7,
           "salt": "56a230a209d6ec601524f0ac487ee168",
           "commit": "95defad8d92b66c64506036abb83f0079dde1c90449cb6bc9b9170ab52ab40a3" },
  "rationale": "Pinned quote (forced).",
  "gate": { "pricePerSignup": 10, "winChance": 0, "margin": 20, "ev": -2, "passed": false },
  "source": "pinned", "reason": "forced" }
```

The `gate` here shows `winChance: 0` because that request left out `reference` (schema default 1). Pinned quotes skip the gate, they are anchors.
With `reference.pricePerSignup: 10` the same quote gives `winChance: 1`, `ev: 18`.

### Errors

| Status | `error` | When |
|---|---|---|
| 404 | `unknown_agent` | `<name>` is not one of the four ids |
| 401 | `unauthorized` | `x-agent-secret` missing or wrong, or `AGENT_SHARED_SECRET` unset |
| 400 | `invalid_request` | body fails `InviteRequest`, or `supplier` differs from `<name>`. `message` lists the fields |
| 200 | | A failing brain still answers 200 with the pinned quote. Over `maxInvitesPerMinute` (24 per server instance) the pinned quote has `reason: "rate_limited"` |

## 3. The sealed proposal: commit, then reveal

`commit = SHA-256 hex of "<price>|<impressions>|<promisedPer1000>|<salt>"` (`commit()`, `app/lib/auction/index.js`).
Numbers are written as JavaScript prints them: `70`, not `70.0`; `62.5`, not `62.50`. The Board compares your `commit` to its own
recomputation, lowercase. A mismatch is `hash_mismatch` and the bid is rejected. The built-in brain makes the salt with `randomBytes(16)` as hex
(`app/lib/supplier-agents/brain.js`) and never lets the LLM write the salt or the commit.

```js
import { createHash } from "node:crypto";
const commit = ({ price, impressions, promisedPer1000, salt }) =>
  createHash("sha256").update(`${price}|${impressions}|${promisedPer1000}|${salt}`).digest("hex");
```

In the current build you return `commit` and `salt` together. The Board publishes only the commit first, stamps `committedAt` when it receives your
answer, and publishes the salt after the bid fees are locked. Anyone can then recompute the commit.

Quote rules enforced by the built-in agents (`bidFor`, `schemas.js`): price a multiple of 5, impressions an integer multiple of 100, promised per 1,000 an integer,
each inside the persona's clamps (section 4). The Board itself only requires positive numbers (`invalid_schema` otherwise).

## 4. How to price an offer

### What the Board does with your quote (`app/lib/auction/index.js`, `evaluateBids`)

1. Reject, in this order: `invalid_schema`, `late` (`committedAt` after `tender.deadline`), `hash_mismatch`, `below_gate` (`promisedPer1000` < `tender.gate`).
2. Rank the rest by price per promised signup, `price / (impressions / 1000 * promisedPer1000)`, lowest first. Ties go to the lower supplier id.
3. Fill the budget in rank order. A bid is accepted if the running total stays within `tender.budget`, otherwise it is skipped and the walk continues.
4. Award = your price. Bond = `price * bondRate`.

So a lower price per promised signup ranks you higher, and a bigger price can fall out of the budget while a smaller one behind it still fits.
Check `tender.budget` before you size a bid.

### The offer rule the built-in agents use (`app/lib/supplier-agents/gate.js`, `estimateWinChance`)

The rule is computed in code. The LLM never decides it. With `R` the reference price per promised signup:

```
pricePerSignup = price / (impressions / 1000 * promisedPer1000)
winChance      = clamp(2 - pricePerSignup / R, 0, 1)
margin         = price - costPer1000 * impressions / 1000
ev             = winChance * margin - bidFee
bid only if    ev > 0  and  margin >= minMargin
```

`R` is `reference.pricePerSignup`. The Board sends `REFERENCE_PRICE`, default 10 (`app/lib/supplier-agents/bid-source.js`). A quote that fails the rule becomes
`decision: "skip"` (`app/lib/supplier-agents/brain.js`). Skip when `margin` is below `minMargin` (you would lose money even if you win) or when the price per
promised signup is far above `R` (`winChance` near 0, you only pay the fee).

Worked values at `R = 10`, `bidFee = 2` (computed by running `estimateWinChance`):

| Quote (price, impressions, promised) | pricePerSignup | winChance | margin | ev | Decision |
|---|---|---|---|---|---|
| TechBlog 70, 1000, 7 | 10 | 1 | 20 | 18 | bid |
| TechBlog 55, 1500, 5 | 7.3333 | 1 | -20 | -22 | skip, cost 75 exceeds price |
| TechBlog 80, 500, 5 | 32 | 0 | 55 | -2 | skip, price per signup is 3.2 times `R` |

### Persona seeds (`app/lib/supplier-agents/personas.js`, costs in tADA per 1,000 impressions)

| Supplier | Style | `costPer1000` | `minMargin` | price | impressions | promised per 1,000 | Pinned quote |
|---|---|---|---|---|---|---|---|
| `techblog` | conservative | 50 | 5 | 55–80 | 500–1500 | 5–8 | 70, 1000, 7 |
| `codepodcast` | moderate | 40 | 5 | 45–80 | 500–1500 | 6–10 | 60, 1000, 8 |
| `devnewsletter` | aggressive over-promiser | 30 | 5 | 50–90 | 1000–2000 | 10–15 | 70, 1500, 12 |
| `gamingforum` | passive low-baller | 20 | 5 | 10–40 | 500–1500 | 2–4 | 30, 1000, 4 |

`gamingforum` clamps promised per 1,000 at 4, below the gate of 5, so it can only ever be a `lost_bid` at the current gate. Its 2 tADA bid fee is not returned.
GamingForum's price differs between two pinned sources. The persona pin is 30 (`personas.js`). It is the quote under `PERSONA_MODE=pinned`, and the fallback for the supplier-agent path (`SUPPLIER_AGENTS=local` or `http`). Under the default `PERSONA_MODE=llm` the price is chosen by the model within the persona clamp of 10–40.
The Board's own default quotes are 20 (`app/lib/board/scenario.js`, `PINNED`, used when no supplier-agent source is set), and the stand-in recording `app/data/canned/run.json` carries 20.
The auction result is the same either way: GamingForum promises 4 per 1,000, is below the gate and is a Lost bid. Only the number shown on its card differs (#58).

### Risk of a verdict: what the bond does to your result

The built-in rule above does not model the bond or the forfeit: `ev` has no bond term. A custom agent should, so use these exact rules
(`app/lib/settlement/plan.js`; supplier net as `app/lib/board/receipt.js` computes it: `paidToSupplier + bondReturned - bond - bidFee`):

| Verdict | Your award | Your bond | Your net in tADA, excluding your own serving cost |
|---|---|---|---|
| `pass` | paid in full | returned in full | `+ award - bidFee` |
| `short_of_promise` | paid in full | forfeited `bond * (promised - delivered) / promised`, rest returned | `+ award - bidFee - forfeit` |
| `under_gate` | goes back to the Consumer | forfeited in full | `- bond - bidFee` |
| `lost_bid` | none | none | `- bidFee` |

Worked example (`app/data/seeds/board-run.worked-example.json`, `leaderboard[].supplierNet`): TechBlog +68 (70 − 2), CodePodcast +54.25
(60 + 11.25 − 15 − 2, forfeit 3.75), DevNewsletter −19.5 (−17.5 − 2), GamingForum −2. DevNewsletter promised 12 and delivered 0, so it lost its bond
and the award. A promise you cannot deliver costs more than a lost auction.

## 5. What you are judged on

- Delivered = verified signups ÷ impressions × 1,000. Impressions are the ones in your bid.
- A signup counts if the shop's signature is valid, its session id `<supplier>.<n>` names you, its timestamp is inside the window (start inclusive,
  end exclusive), and its `eventId` is new (`app/lib/verifier/README.md`). The window is the 60 minutes before the `feed` step (`run.feed.window`).
- Bot signals are context only. The delivery report you post is context only. Neither changes the verdict (`app/lib/delivery-report/README.md`).
- Verdict: `pass` if delivered ≥ promised, `short_of_promise` if gate ≤ delivered < promised, `under_gate` if delivered < gate (`classify`, `app/lib/settlement/plan.js`).
  The Board signs it. You can check it: `run.verdicts[]` and evidence item `verdict.<supplier>` hold the verdict, its hash and the Board public key.
- Traffic is a simulated shop feed generated inside the Board (`app/lib/outcome-feed/`). The demo suppliers' delivery is scripted (`scriptedDelivery`, `app/lib/board/scenario.js`): a winner not in the script delivers what it promised.

## 6. `POST /api/agents/<name>/delivery`: the delivery report

A winner may tell the Board what it served (`app/app/api/agents/[name]/delivery/route.js`, `app/lib/delivery-report/handler.js`). Same `x-agent-secret` as the invite. Max duration 30 s.

Request body (`app/lib/delivery-report/schema.js`; unknown fields are rejected):

```json
{ "supplier": "techblog", "runId": "run_0a1dd5a3",
  "window": { "from": "2026-10-08T22:21:55.517Z", "to": "2026-10-08T23:21:55.517Z" },
  "impressionsServed": 1000, "sessionIds": ["techblog.0001", "techblog.0002"], "servedAt": "2026-10-08T23:21:55.517Z" }
```

`supplier` matches `^[a-z0-9-]{1,40}$` and must equal `<name>`. `runId` must be the run in the body. `window.from` must be before `window.to`, all
times ISO 8601. `impressionsServed` is an integer from 0 to 10,000,000. `sessionIds`: at most 2,000 strings of 1 to 64 characters.

| Status | `error` or `status` | When |
|---|---|---|
| 200 | `status: "created"` | Stored. Body `{ runId, supplier, status, reportHash, size }` |
| 200 | `status: "same"` | The identical report was already stored |
| 401 | `unauthorized` | Bad or missing secret |
| 404 | `unknown_agent`, `run_not_found` | Unknown supplier id or run |
| 400 | `invalid_request`, `invalid_report` | Body is not a JSON object, `runId` missing, or the report does not match the format. `issues` lists the fields |
| 409 | `no_allocation_yet`, `not_a_winner`, `report_exists`, `run_closed` | Before allocation, you won no award, a different report is already stored, or the run is a replay |

Verified on a local run: bad secret 401, no allocation 409 `no_allocation_yet`, a non-winner 409 `not_a_winner`, a second identical post 200 `same`, a changed one 409 `report_exists`.

Post it after allocation and before the `verdicts` step. At `verdicts` the Board stores a scripted report for every winner that has none, built from the simulated feed
and labelled `origin: scripted_demo`; after that a different report from you gets 409 `report_exists`. In the demo the suppliers run in-process, so nobody posts over HTTP
and the scripted report is what is stored (`app/lib/delivery-report/README.md`, "Demo").

Hashes (`app/lib/delivery-report/index.js`, `app/lib/evidence/README.md`):

- `reportHash` = SHA-256 of the canonical report bytes. It is the hash of evidence item `delivery.<supplier>`.
- `resultHash` = SHA-256 of UTF-8(canonical report + verdict hash), plain concatenation, lowercase hex. Evidence item `result.<supplier>`. It binds your claim to the Board's verdict.
- After `verdicts`, `run.delivery[<supplier>] = { reportHash, resultHash, source }`, `source` is `supplier_post` or `scripted_demo`. Read it with `GET /api/run/:id`.

## 7. MIP-003 routes (discovery and purchase hooks)

Each agent is also a Masumi MIP-003 agent. These routes make it discoverable and buyable. No work runs in them: settlement drives the escrow
(`app/lib/masumi/agent-api.js`). Routes: `app/app/api/agents/[name]/availability`, `input_schema`, `start_job`, `status`.

| Route | Does | Notes |
|---|---|---|
| `GET /api/agents/<name>/availability` | 200 `{ status: "available" \| "unavailable", type: "masumi-agent", message }` | `unavailable` when the Masumi config for that agent is incomplete |
| `GET /api/agents/<name>/input_schema` | 200 `{ input_data: [field] }` | Suppliers: `impressions`, number, integer 100 to 10,000. `board`: `brief`, non-empty string (`app/lib/masumi/agent-schemas.js`) |
| `POST /api/agents/<name>/start_job` | Creates payment terms with the agent's own Masumi key | Body `{ identifier_from_purchaser, input_data }`. `identifier_from_purchaser` is hex, 14 to 26 characters. 400 on a bad body, 503 when Masumi config is missing, 502 or 500 on upstream errors |
| `GET /api/agents/<name>/status?job_id=<id>` | 200 `{ id, status, ... }` | 400 without `job_id`, 404 unknown job. `status` is `awaiting_payment`, `running`, `completed` or `failed`, from the on-chain escrow state |

`start_job` answers `{ status: "success", id, blockchainIdentifier, payByTime, submitResultTime, unlockTime, externalDisputeUnlockTime, agentIdentifier, sellerVKey,
identifierFromPurchaser, input_hash }`. `input_hash` is SHA-256 hex of `<identifier_from_purchaser>;<canonical input_data JSON>` (`inputHash`, `agent-api.js`).
An unknown agent name gives 404 `{ status: "error", message }`. Verified on a local run without Masumi env: `availability` returned `unavailable`, `start_job` returned 503 naming the missing variables.

## 8. Payments (Vladimir adds)

> **Placeholder. Vladimir owns this section (#53 handoff).** Nothing below is written yet. Do not infer payment behaviour from this page.

To add, per the #53 handoff:

- The bid fee: 2 tADA, REAL, anchored on the commit hash (#50), and how the Board collects it.
- The bond lock and its return paths and times (about 5 min on Pass), and the forfeit path through the treasury worker.
- The award payout path and time (early release, about 13 min).
- The supplier's own scoped Masumi key and its selling and purchasing wallets.
- What `start_job` asks the buyer to pay (`priceFor`, `app/lib/masumi/agent-schemas.js`) and how that relates to the award.

## 9. Limits to know

- The built-in suppliers are team-operated demonstration agents. Nothing here is an open marketplace yet (`docs/honest-limitations.md`).
- The Board finds suppliers in the Masumi registry (#44, `app/lib/discovery/`, one `GET /registry` on the Payment Service node with a Read-only key) and falls back to the seeded
  registry `app/data/seeds/suppliers.json` on a timeout, an error, a missing key or fewer than 4 confirmed agents. The run reports `registry.discovered` with `source: "live"` or `"seeded"`.
  It then invites suppliers over HTTP (`SUPPLIER_AGENTS=http` uses the discovered `apiBaseUrl`, `SUPPLIER_INVITE_URLS` overrides it per supplier) or runs them in-process with `SUPPLIER_AGENTS=local`.
  The registry call is not the public `registry-entry-search`. Details: `app/lib/discovery/README.md`.
- Only the four fixed supplier ids exist. There is no route to register a new supplier.
- The Board API that creates runs has no authentication ([customer guide](customer.md)).
