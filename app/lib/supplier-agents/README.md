# `app/lib/supplier-agents/` — supplier agent brains (S11)

The four supplier brains of the sealed-bid auction. Spec: `docs/agents/personas.md`. The agents live on Vercel
(ADR 0002): `POST /api/agents/<name>/tender-invite` and `/run` both run the brain in `brain.js`. The Masumi
MIP-003 routes under the same base path come from #37.

## Flow

1. `POST /api/agents/<name>/tender-invite` or `/run` (`handler.js`, same handler): 404 unknown name, 401 bad `x-agent-secret` (also when
   `AGENT_SHARED_SECRET` is unset), 400 body fails `InviteRequest` or `supplier` differs from `<name>`.
2. `runSupplier` (`brain.js`): up to 3 attempts, one model each from `OPENROUTER_MODELS` (cycled), 12 s `AbortController`
   per attempt, next model on HTTP error, timeout or zod failure.
3. One attempt (`llm.js`): OpenRouter chat completions with tools, max 4 turns. Tools `get_operator_config`,
   `estimate_win_chance`, `submit_bid`. `submit_bid` arguments are checked with `bidFor(id)` (the clamps).
4. Code, not the LLM, applies the D12 gate (`gate.js`). A quote that fails it becomes `decision: "skip"` and no bid.
5. Code makes the salt (`randomBytes(16)`) and `commit` (`commit()` from `../auction/index.js`).
6. Any failure, `PERSONA_MODE=pinned` or a missing key returns the pinned quote: `source: "pinned"`,
   `reason` one of `llm_error`, `zod`, `timeout`, `forced`. The route still answers 200.

No `@openai/agents`: the loop is raw OpenRouter function calling (the spec allows it), so tests mock `fetch` and no SDK sits
between the code and the free-tier models.

## Board hook

`createBidSource({ invite })` in `bid-source.js` is the Board `bidSource`. It invites all suppliers in parallel and drops skips (no
commit, no bid fee). A failed or malformed invite becomes the pinned quote with `reason: "invite_timeout"` or
`"invite_error"`. Output per bid: `{ supplier, price, impressions, promisedPer1000, salt, commit, source, rationale, gate }`,
plus `reason` and `model` when present, never `committedAt`.

`bidSourceFromEnv()` is wired into `app/lib/board/service.js`:

| Env | Effect |
|---|---|
| `SUPPLIER_INVITE_URLS` (JSON map supplier id to agent base URL, e.g. `https://ad-slot-auction.vercel.app/api/agents/techblog`) | `httpInvite`: `POST <base>/tender-invite`, header `x-agent-secret`, 45 s timeout |
| `SUPPLIER_AGENTS=local` | `localInvite`: brains run in-process, no HTTP hop |
| neither | undefined: the Board keeps its default pinned quotes |

## Env vars

`OPENROUTER_API_KEY`, `OPENROUTER_MODELS`, `AGENT_SHARED_SECRET`, `REFERENCE_PRICE` (default 1), `PERSONA_MODE`
(`pinned` forces pinned quotes), `SUPPLIER_INVITE_URLS`, `SUPPLIER_AGENTS`.

## Try it

```bash
cd app
node lib/supplier-agents/rehearse.js                       # one Board run, prints quotes, gates, winners
PERSONA_MODE=pinned node lib/supplier-agents/rehearse.js   # worked example, Consumer net -10.875, 14 signups
curl -s -X POST localhost:3000/api/agents/techblog/run -H "x-agent-secret: $AGENT_SHARED_SECRET" \
  -H 'content-type: application/json' \
  -d '{"runId":"r1","supplier":"techblog","tender":{"budget":20,"gate":5,"bondRate":0.25,"bidFee":0.2,"currency":"tUSDM"}}'
```

Tests: `node --test lib/supplier-agents`. They never call the network.
