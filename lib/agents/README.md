# `lib/agents/` — agent runtime

## Purpose

OpenAI Agents SDK agents with distinct roles and typed tools (final SDK call
at kickoff). The "multi-agent" feel comes from roles, not from a handoff
graph. The Tender Board is a service in the app (Tender API, Auction engine,
Settlement engine), not an agent.

## Contract

- **Consumer agent (NeoRack):** takes the brief, publishes the tender (budget
  20 tUSDM, gate 5 signups per 1,000 impressions, bond 25% of award), locks
  each award in escrow.
- **Supplier agents (×4):** TechBlog, CodePodcast, DevNewsletter, GamingForum.
  Each decides whether to bid, locks the 0.2 tUSDM bid fee, submits a sealed
  bid as a commit hash `SHA-256(price, impressions, promised signups, salt)`,
  reveals bid plus salt after close, serves (scripted), locks its bond if it
  wins, submits the result on Pass or Short of promise.
- **Bid decision rule (proposal):** bid only if win chance × margin − 0.2 > 0;
  win chance = clamp(2 − p ÷ R, 0, 1); p = own price per promised signup;
  R = highest winning price per signup in the last auction (operator-set for
  the first). An LLM estimate instead is open.
- **Validator agent:** wraps `lib/verifier/`. Counts verified signups per
  supplier and signs a verdict per supplier (Pass, Short of promise, Under
  gate). No LLM in the verdict.
- **Tools (plan, via OpenAI Agents SDK, zod schemas):** `publishTender`,
  `decideBid`, `commitBid`, `revealBid`, `lockBidFee`, `lockAward`,
  `lockBond`, `submitResult`, `verifyOutcomes`, `signVerdict`.
- **Not agent tools:** winner picking, round-2 reallocation shown on the
  receipt, and settlement belong to the Board service, not to an agent.
- **Rules:** ≤6–8 tool calls per scenario run; short system prompts;
  small/fast model; agent SDK is swappable — fallbacks are Vercel AI SDK v7
  or raw OpenAI function calling if the credit form demands it.

## Done when

A full tender → bids → winners → settle run streams to the UI via SSE
without human intervention.
