# Supplier personas and bid logic (S7, issue #8)

Spec for the four supplier agent brains. Build issue: #12 (S11). Decided with Danila on 8 Oct 2026.
D12 (win-chance formula) is Vladimir's call. Every line marked **needs Vladimir** is a default until he confirms.

## Decisions

| # | Decision |
|---|---|
| 1 | **LLM decides the quote within wide per-persona clamps.** No outcome guarantee and no rehearsal check. `DEMO_MODE=canned` is the lifeline for the exact worked example. |
| 2 | Pinned quotes apply on **errors only** (transport, timeout, LLM error, zod failure), per supplier. `PERSONA_MODE=pinned` is a manual env switch that forces them for all four. |
| 3 | **D12, needs Vladimir.** The LLM proposes a quote. Code applies `winChance × margin − bidFee > 0`. First auction `R = 1.00`, operator-set. |
| 4 | Persona seed config and clamps: table below. |
| 5 | **OpenAI Agents SDK with tools**, max 4 turns, one agent run per supplier. Model provider is **OpenRouter** (free-tier models, `OPENROUTER_MODELS` tried in order), per `docs/hosting.md`: no OpenAI credits received. |
| 6 | The Board reaches each brain at the registered `api_base_url`: `POST <api_base_url>/tender-invite` on Vercel (ADR 0002, replaces the Railway forwarder). `SUPPLIER_AGENTS=local` runs the same brain in-process. |
| 7 | A supplier that fails or times out bids its **pinned quote**, tagged `source: "pinned"`. |
| 8 | A quote that fails the formula gate is an **honest skip**: no bid, no fee, the UI shows the numbers. |

Deviation from #12 "Done when": the line "a rehearsal run produces the expected winners, or pinned quotes take over" is replaced by the acceptance list at the end of this file.

## What stays scripted

Delivery. `scriptedDelivery(bid)` in `app/lib/board/scenario.js` keys on the supplier, and the feed takes impressions from the bid, so nothing the agent outputs changes delivered signups per 1,000. TechBlog delivers 8, CodePodcast 6, DevNewsletter 0. GamingForum is never served.

Confirmed: `app/lib/outcome-feed/index.js` `WORKED_EXAMPLE`, `scenario.js`.

## Persona seed config and clamps

Costs are tUSDM per 1,000 impressions. Prices are multiples of 0.5, impressions multiples of 100, promised per 1,000 integers (keeps the commit string and the budget fill free of float noise).

| Persona | Cost | Min margin | Impressions | Price | Promised per 1,000 | Pinned quote (price / impressions / promised) |
|---|---|---|---|---|---|---|
| `techblog`, conservative | 5 | 0.5 | 500–1500 | 5.5–8 | 5–8 | 7 / 1000 / 7 |
| `codepodcast`, moderate | 4 | 0.5 | 500–1500 | 4.5–8 | 6–10 | 6 / 1000 / 8 |
| `devnewsletter`, aggressive over-promiser | 3 | 0.5 | 1000–2000 | 5–9 | 10–15 | 7 / 1500 / 12 |
| `gamingforum`, passive low-baller | 2 | 0.5 | 500–1500 | 1–4 | 2–4 | 3 / 1000 / 4 |

Rules the clamps encode:
- GamingForum cannot promise 5 or more. Its audience is its capacity, so it ends below the gate by persona, not by a guard.
- DevNewsletter's promised range is above any realistic rate. Delivery is scripted at 0.
- Anchors (the pinned quotes) all pass the D12 gate at `R = 1.00`: win chance 1 for all four, margins 2, 2, 2.5, 1 against the 0.2 fee.

Known risk with wide clamps (inferred): the budget is 20 with zero slack at the anchors. Examples that change the winners: TechBlog 8 + CodePodcast 8 + DevNewsletter 9 = 25, so D11 drops the lowest-ranked bid that does not fit. A CodePodcast promise of 6 or less makes it Pass. A TechBlog promise above 8 makes it Short of promise. The receipt value -10.875 holds only at the anchors. A live run can differ. Canned mode replays the exact example.

Note for #12: `app/lib/board/scenario.js` `PINNED` has GamingForum at price 2. Notion and this spec say 3. Either change it to 3 and regenerate the fixture (`node lib/board/record-fixture.js`), or leave it. It only affects the lost-bid display.

## Decision rule (D12, needs Vladimir)

Computed in code after the LLM proposes a quote, never by the LLM:

```
pricePerSignup = price / (impressions / 1000 * promisedPer1000)
winChance      = clamp(2 - pricePerSignup / R, 0, 1)
margin         = price - costPer1000 * impressions / 1000
ev             = winChance * margin - tender.bidFee
passed         = ev > 0 && margin >= minMargin
```

- `R`: env `REFERENCE_PRICE`, default 1.00 for auction 1. From the next auction, the highest winning price per promised signup of the last run. The demo has one auction, so `history` is `[]`.
- `passed` false after the LLM's last turn: `decision: "skip"`.

What the LLM sees: its persona prompt, the tender (budget, gate, bond rate, bid fee, currency, audience, deadline), its operator config (cost per 1,000, min margin, clamps), `R`, and its own past results (`history`). It does not see other suppliers, other bids, the scripted delivery, or the expected winners.

## Persona prompts

Shared system preamble, then one persona block. Keep prompts short (agents README rule).

```text
You are the bidding brain of a publisher agent in a sealed-bid ad auction.
A tender asks for verified signups from technical users. Budget {budget} {currency} in total, gate {gate} signups per 1,000 impressions (a bid promising less is rejected), winners lock a bond of {bondRate*100}% of their price, every bidder pays a {bidFee} {currency} fee that is never returned.
Bids are ranked by price per promised signup, cheapest first. You win only if you rank well and fit in the budget. If you win and deliver less than you promised, you forfeit part of your bond.
Your cost is {costPer1000} per 1,000 impressions. The reference clearing price is {R} per promised signup. Past results: {history}.
Procedure: call get_operator_config once, propose a quote, call estimate_win_chance on it, adjust at most once, then call submit_bid. If no quote passes, call submit_bid with decision "skip".
Stay inside the clamps. Rationale: max 2 sentences, plain words, no price numbers beyond your own quote.
```

Persona blocks:

- **TechBlog, conservative.** "You run TechBlog, a developer news site. Past campaigns converted at about 8 to 9 signups per 1,000 impressions. You promise below what you expect and price near cost plus a fair margin. You never chase the lowest price. A missed promise costs you more than a lost auction."
- **CodePodcast, moderate.** "You run CodePodcast, a developer audio show. Past campaigns converted at about 6 to 8 per 1,000. You stretch your promise a little to rank well and take a middling margin. You accept some risk of falling short."
- **DevNewsletter, aggressive over-promiser.** "You run DevNewsletter, a developer email list. You believe your list converts at 12 or more per 1,000, from a past campaign with a different audience. You promise a lot to rank first and you take the largest slot you can. You treat the bond as a cost of winning."
- **GamingForum, passive low-baller.** "You run GamingForum, a gaming community. Your audience is not technical, you expect about 4 signups per 1,000. You bid low and small, only to see whether a slot is left over. You do not stretch your promise."

## Agent runtime (Agents SDK)

- Package: `@openai/agents` (TypeScript) pointed at OpenRouter through an OpenAI-compatible client (`baseURL: https://openrouter.ai/api/v1`, `OPENROUTER_API_KEY`, Chat Completions API, not Responses). If the SDK cannot be pointed at OpenRouter cleanly, fall back to the Vercel AI SDK with the OpenRouter provider or raw function calling, as the agents README allows. #12 decides on the day.
- Models: `OPENROUTER_MODELS` (comma list, first is primary), already in `.env.example` and `/api/health`. Confirmed on 8 Oct 2026 against the OpenRouter models API: `poolside/laguna-s-2.1:free`, `nvidia/nemotron-3-ultra-550b-a55b:free` and `google/gemma-4-31b-it:free` all support `tools` and `tool_choice`. Only gemma supports `response_format`.
- So the final answer is a **`submit_bid` tool call**, not an SDK `outputType`. Structured output would fail on the first two models.
- Model attempts: one model per attempt, 12 s `AbortSignal` each, next model in the list on error, timeout or zod failure, max 3 attempts, 36 s total. All attempts failed gives the pinned quote (`reason: "llm_error"`).
- Free-tier models are rate-limited and slower. Four parallel suppliers share one key. Expect `429`s: treat as an error and move to the next model. Run a rehearsal of all four before the night.
- One `Agent` per attempt, `maxTurns: 4`.
- Tools (zod parameter schemas):
  - `get_operator_config()` returns `{ costPer1000, minMargin, clamps, reference: { pricePerSignup, source }, history }`.
  - `estimate_win_chance({ price, impressions, promisedPer1000 })` returns `{ pricePerSignup, winChance, margin, ev, passed }`. It is the exact formula above.
  - `submit_bid(bidFor(id))`, the schema below. It ends the run. Its arguments are the LLM's answer.
- No `commitBid` or `revealBid` tools: salt and commit are made in plain code after `submit_bid`.
- Salt: `crypto.randomBytes(16).toString("hex")`, generated by code, never by the LLM.
- Commit: `commit({ price, impressions, promisedPer1000, salt })` from `@/lib/auction`.

## zod schemas

```js
import { z } from "zod";
import { PERSONAS } from "@/lib/agents/personas"; // seed table above

export const bidFor = (id) => {
  const c = PERSONAS[id].clamps;
  return z.object({
    decision: z.enum(["bid", "skip"]),
    price: z.number().min(c.price[0]).max(c.price[1]).multipleOf(0.5),
    impressions: z.number().int().min(c.impressions[0]).max(c.impressions[1]).multipleOf(100),
    promisedPer1000: z.number().int().min(c.promisedPer1000[0]).max(c.promisedPer1000[1]),
    rationale: z.string().min(1).max(280),
  });
};

export const InviteRequest = z.object({
  action: z.literal("bid").default("bid"),
  runId: z.string(),
  supplier: z.enum(["techblog", "codepodcast", "devnewsletter", "gamingforum"]),
  tender: z.object({
    budget: z.number(), gate: z.number(), bondRate: z.number(), bidFee: z.number(),
    currency: z.string(), audience: z.string().optional(), deadline: z.number().optional(),
  }),
  reference: z.object({ pricePerSignup: z.number(), source: z.enum(["operator", "history"]) }).default({ pricePerSignup: 1, source: "operator" }),
  history: z.array(z.object({ supplier: z.string(), kind: z.string(), price: z.number(), promised: z.number(), delivered: z.number() })).default([]),
});

export const InviteResponse = z.object({
  supplier: z.string(),
  decision: z.enum(["bid", "skip"]),
  bid: z.object({
    supplier: z.string(), price: z.number(), impressions: z.number(), promisedPer1000: z.number(),
    salt: z.string(), commit: z.string(),
  }).optional(),
  rationale: z.string(),
  gate: z.object({ pricePerSignup: z.number(), winChance: z.number(), margin: z.number(), ev: z.number(), passed: z.boolean() }).optional(),
  source: z.enum(["llm", "pinned"]),
  reason: z.string().optional(),
  model: z.string().optional(),
  turns: z.number().optional(),
});
```

The `price` min/max in `bidFor` keeps a skip valid: on `skip`, the agent repeats its last in-clamp quote and code ignores it.

## Route contract

### Board to supplier: `POST <api_base_url>/tender-invite`

Called by `bidSource({ tender, suppliers, run })` for all four suppliers in parallel, one `fetch` each with an `AbortController` of 45 s. `api_base_url` is `https://ad-slot-auction.vercel.app/api/agents/<name>` (as registered on Masumi, ADR 0002). It comes from `SUPPLIER_INVITE_URLS` (JSON map supplier id to base URL) until the registry lookup is wired. Header `x-agent-secret: $AGENT_SHARED_SECRET`. Body is `InviteRequest`. Response is `InviteResponse`.

`POST /api/agents/<name>/run` is the same handler. Both routes serve `<name>` in `techblog`, `codepodcast`, `devnewsletter`, `gamingforum`. Statuses: 200 `InviteResponse` (including `skip` and `pinned`), 401 bad secret, 400 body fails `InviteRequest`, 404 unknown name. A failure inside the brain returns 200 with `source: "pinned"` and `reason` (`llm_error`, `zod`, `timeout`, `forced`). Each route sets `maxDuration = 60`.

`action: "bid"` is the only action. Serving is scripted in the feed, so the agents compute nothing else. `action` leaves room if that changes.

The Masumi MIP-003 routes (`/availability`, `/input_schema`, `/start_job`, `/status`, issue #37) share this base path and serve `board` too. This spec does not cover them.

### What `bidSource` returns

Per supplier with `decision: "bid"`: `{ supplier, price, impressions, promisedPer1000, salt, commit, source, rationale, gate }`. `commit` comes from the agent, `committedAt` is left out so the Board stamps it. Extra fields pass the auction's `validSchema`. Skipped suppliers return no entry, so they get no commit and no bid fee.

If the invite call fails or times out, `bidSource` builds the pinned quote itself (fresh salt, `commit` from `@/lib/auction`), tagged `source: "pinned"`, `reason: "invite_timeout"` or `"invite_error"`.

The UI shows `source`, `rationale` and `gate` per supplier. Rationale is shown at reveal, not at commit, because it quotes the price.

## Env vars

| Var | Where | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Vercel | LLM calls (already in `.env.example`) |
| `OPENROUTER_MODELS` | Vercel | comma list of model ids, first is primary (already in `.env.example`) |
| `AGENT_SHARED_SECRET` | Vercel | `x-agent-secret` on `/run` and `/tender-invite` |
| `REFERENCE_PRICE` | Vercel | `R`, default `1` |
| `PERSONA_MODE` | Vercel | `llm` (default) or `pinned` |
| `SUPPLIER_INVITE_URLS` | Vercel | JSON map supplier id to agent base URL (`<app>/api/agents/<name>`). Set = HTTP path |
| `SUPPLIER_AGENTS` | Vercel | `local` runs the brains in-process. Ignored when `SUPPLIER_INVITE_URLS` is set |

Badge note: the agent returns no money. The bid fee is locked by the Board through `getAdapter()` and carries its own badge.

## Needs Vladimir

1. **D12.** Confirm the formula, `R = 1.00` for auction 1, and that code (not the LLM) applies the gate.
2. **`/tender-invite` on Vercel (done in #38, ADR 0002).** The Board calling its own app over HTTP adds a cold-start risk per supplier. `SUPPLIER_AGENTS=local` avoids the hop. Confirm which one production uses.
3. **Bid fee in REAL mode.** Today the Board locks the bid fee on the supplier's behalf. A REAL fee escrow has the supplier as buyer. Out of scope here, tracked with the Masumi lane.
4. **Free-tier models.** Confirm the `OPENROUTER_MODELS` list and that a rehearsal of four parallel agents stays inside the free-tier rate limits.

## Honest limitations (for README)

- The bid reaches the Board in plaintext with its salt inside one invite response. Commit-reveal is enforced by the Board's step order (commit hash logged and fees locked before reveal), not by the supplier withholding the reveal. The Board is a trusted middleman.
- Delivery is scripted. Agent quality never changes outcomes.
- A live run with free LLM quotes can miss the worked example. Canned mode is the exact replay.

## Acceptance for #12 (replaces the rehearsal line)

- Each persona returns a zod-valid bid inside its clamps, or a skip, from `POST /api/agents/<name>/run`.
- A forced failure per supplier (an unset or bad `OPENROUTER_API_KEY`) returns the pinned quote with `source: "pinned"`.
- `PERSONA_MODE=pinned` over the `/tender-invite` path (or `SUPPLIER_AGENTS=local`) reproduces Consumer net -10.875 and 14 signups.
- One live LLM run is recorded in the closing comment: quotes, `gate` numbers, winners, whether it matched the worked example.
- `cd app && npm run build` and `node --test` pass.
