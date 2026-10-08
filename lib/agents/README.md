# `lib/agents/` — agent runtime

## Purpose

Vercel AI SDK v7 `ToolLoopAgent` instances with distinct roles and typed
tools. The "multi-agent" feel comes from roles, not from a handoff graph.

## Contract

- **Advertiser agent:** publishes the tender (budget, audience, outcome
  definition, gate), signs the policy card.
- **Publisher agents (×3):** submit sealed bids; serve (scripted); submit
  outcome reports; the failing publisher authorizes its own refund per the
  signed policy.
- **Allocator:** evaluates bids → picks 3 winners; computes round-2
  reallocation from measured ROI.
- **Tools (via OpenAI Agents SDK, zod schemas):** `publishTender`,
  `submitBid`, `pickWinners`, `lockEscrows`, `submitOutcomeReport`,
  `verifyOutcomes`, `settle`, `authorizeRefund`.
- **Rules:** ≤6–8 tool calls per scenario run; short system prompts;
  small/fast model; agent SDK is swappable — fallbacks are Vercel AI SDK v7
  or raw OpenAI function calling if the credit form demands it.

## Done when

A full tender → bids → winners → settle run streams to the UI via SSE
without human intervention.
