# `app/lib/supplier-agents/` — supplier agent brains (S11)

The four supplier brains of the sealed-bid auction. Spec: `docs/agents/personas.md`. The agents live on Vercel
(ADR 0002): `POST /api/agents/<name>/tender-invite` and `/run` both run the brain in `brain.js`. The Masumi
MIP-003 routes under the same base path come from #37.

## Flow

1. `POST /api/agents/<name>/tender-invite` or `/run` (`handler.js`, same handler): 404 unknown name, 401 bad `x-agent-secret` (also when
   `AGENT_SHARED_SECRET` is unset), 400 body fails `InviteRequest` or `supplier` differs from `<name>`.
2. `runSupplier` (`brain.js`): up to 3 attempts, one model each from `llm-config.js` (cycled), 12 s `AbortController`
   per attempt, next model on HTTP error, timeout or zod failure.
3. One attempt (`llm.js`): OpenRouter chat completions with tools, max 4 turns, `reasoning` off (asked again with it on if the
   model answers 400 "reasoning is mandatory"), the last turn forces `submit_bid`. Tools `get_operator_config`,
   `estimate_win_chance`, `submit_bid`. `submit_bid` arguments are checked with `bidFor(id)` (the clamps).
4. Code, not the LLM, applies the D12 gate (`gate.js`). A quote that fails it becomes `decision: "skip"` and no bid.
5. Code makes the salt (`randomBytes(16)`) and `commit` (`commit()` from `../auction/index.js`).
6. Any failure, `PERSONA_MODE=pinned` or a missing key returns the pinned quote: `source: "pinned"`,
   `reason` one of `llm_error`, `zod`, `timeout`, `forced`. The route still answers 200.
7. Every failed attempt is in `attempts` on the response and on the Board bid: `{ model, reason, status?, error }`. `error` is the first
   200 characters of the provider body with the key removed. The same record goes to `console.error`
   (`supplier-agents <name> attempt failed {...}`), so Vercel logs show why a supplier fell back. `rehearse.js` prints them.
   A 200 with an `error` body (an overloaded upstream) is reported with status 200.

No `@openai/agents`: the loop is raw OpenRouter function calling (the spec allows it), so tests mock `fetch` and no SDK sits
between the code and the free-tier models.

## LLMs and spend guards: `llm-config.js`

The one place that defines the models and every cap. `OPENROUTER_MODELS` only overrides the model list.

| Guard | Default | Effect |
|---|---|---|
| `models` | claude-haiku-5.5, mimo-v2.6-flash, gpt-6-luna, deepseek-v4.1-flash, glm-5.3-flash, gpt-oss-120b, qwen3.7-flash | tried in order, one per attempt, only the first 3 are reached per invite, the rest are reserve |
| `maxOutputTokens` | 800 | `max_tokens` on every call |
| `maxInputChars` | 8,000 | call refused before sending, quote pinned (`reason: "budget"`) |
| `historyEntries` | 5 | past results in the prompt. The route schema also bounds every string and `history` to 20 rows |
| `maxPrice` | 0.5 / 2 USD per M tokens | sent as `provider.max_price`: OpenRouter will not route to a dearer provider |
| `maxCallsPerInvite` | 6 | all attempts of one supplier together |
| `maxTokensPerInvite` | 12,000 | from `usage.total_tokens`, stops further calls |
| `maxInvitesPerMinute` | 24 | per server instance, over it the route answers pinned `rate_limited` with no LLM call |

Worst case is 6 calls per supplier, so 24 per run, under $0.01 per run at these prices. `usage: { calls, tokens }` comes back on
every response. These caps are per instance and per invite. The hard ceiling is the credit limit on the OpenRouter key
(OpenRouter dashboard, Keys, set a credit limit), which only the key owner can set.

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

`OPENROUTER_API_KEY`, `OPENROUTER_MODELS` (optional override), `AGENT_SHARED_SECRET`, `REFERENCE_PRICE` (default 10), `PERSONA_MODE`
(`pinned` forces pinned quotes), `SUPPLIER_INVITE_URLS`, `SUPPLIER_AGENTS`.

## Try it

```bash
cd app
node lib/supplier-agents/rehearse.js                       # one Board run, prints quotes, gates, winners
PERSONA_MODE=pinned node lib/supplier-agents/rehearse.js   # worked example, Consumer net -108.75, 14 signups
curl -s -X POST localhost:3000/api/agents/techblog/run -H "x-agent-secret: $AGENT_SHARED_SECRET" \
  -H 'content-type: application/json' \
  -d '{"runId":"r1","supplier":"techblog","tender":{"budget":200,"gate":5,"bondRate":0.25,"bidFee":2,"currency":"tADA"}}'
```

Tests: `node --test lib/supplier-agents`. They never call the network.
