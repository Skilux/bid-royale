# AGENTS.md — repo rules for the build night

> ⚠️ **SCAFFOLD — NOTHING HERE IS FINAL.** This repo is a proposal baseline. Every
> stack pick, service, component contract, and rule below can change.
>
> **Mandatory check:** before making any change that depends on the architecture
> (stack, services, hosting, component contracts, data flow) — or when the user asks
> for something that conflicts with what's written here — **stop and verify with
> Danila first.** Do not assume the scaffold is decided. Do not build blindly on it.

This repo is the **Ad Slot Auction** entry for the Agentic Economy track.
The PRD (v2.2, in Notion: "Ad Slot Auction — PRD & build brief") is the spec.
This file is the law for how we build it on Oct 8–9.

## Agent skills

**If relevant, load the needed skill.** This repo ships agent skills under
`.agents/skills/`. When your task matches one of them, load it (read its
`SKILL.md`) before starting — don't improvise the workflow.

- `grill-me` / `grill-with-docs` — sharpen a plan or design through an interview
  (the latter also writes ADRs + glossary entries as you go)
- `research` — investigate a question against primary sources; save findings as
  Markdown in the repo
- `to-spec` — turn the conversation into a spec, published to GitHub issues
- `to-tickets` — break a spec/plan into blocking-ordered tracer-bullet tickets
  on GitHub issues
- `to-questionnaire` — turn a decision you can't answer into a questionnaire
  for someone else
- `wayfinder` — plan work too big for one session as a map of decision tickets
  on GitHub issues
- `implement` / `implement-spec` — implement from a spec or set of tickets
- `code-review` — two-axis review (standards + spec) of the diff since a fixed point
- `triage` — move GitHub issues and MRs through triage states
  (`needs-triage` → `ready-for-agent` / `ready-for-human` / `wontfix`)
- `improve-codebase-architecture` — scan for deepening opportunities;
  HTML report, then grill the pick
- `handoff` — compact the session into a handoff doc for the next agent
- `wait-what` — re-pitch the last message: it didn't land

### Issue tracker

Issues, specs, and MR triage live in this repo's GitHub Issues.
See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root (created lazily
when terms or decisions land). See `docs/agents/domain.md`.

## The one rule above all

**Masumi is the rails. We are the product.** Never build: a Cardano
wallet/payment engine, escrow smart contracts, DID infrastructure, a generic
agent directory, a blockchain explorer. If you're writing chain code, stop —
you're off the rails.

## Build order (PRD §12 — follow it)

1. Outcome feed: simulated shop + signed conversion events + attribution
   (the heart — build first)
2. Wrapper UI shell: brief → dashboard → receipt (static first)
3. Verifier: signature + attribution + window checks (deterministic)
4. Allocation engine: bid evaluation + winner picking; round-2 decision logic
5. Masumi: discover publisher agents via registry; publish tender on our board,
   collect sealed bids + 3 escrow locks (early in the night, in parallel)
   + settlement wiring
6. Publisher agents (3 bidders): two clean, one bot-flood (the rehearsed failure)
7. Settlement beat + ROI leaderboard + receipt
8. 2-min video cut

## Hard rules

- **No secrets in the repo. Ever.** Private keys and API keys live in Vercel
  env vars and `.env.local` (gitignored) only. Never in code, never in the
  browser, never on screen. Testnet tx hashes are public — commit them freely
  as proof (they belong in the README).
- **Label everything money-related:** `REAL` (preprod tx + explorer link),
  `SIMULATED` (labelled ledger), `PRE-RECORDED` (canned replay). A simulated
  payment without a badge is a bug.
- **Chain gets hashes only.** On-chain: task ID, agent DIDs, price + escrow
  ref, hashes of spec/result/verification report, settlement outcome,
  timestamp. Evidence (logs, reports, attribution) stays off-chain in the
  evidence store.
- **The verifier is deterministic.** Signature valid? Session attributed to
  the publisher? Timestamp within window? → count. Bot signals (click bursts,
  datacenter ASNs) are dashboard context only — never the verdict.
- **Timeouts on every `fetch`.** AbortController everywhere; every agent run
  gets a max-turn cap. On failure: degrade to canned mode, never crash.
- **Canned mode from hour 1.** `DEMO_MODE=canned` replays a recorded
  successful run. This is the 07:00 lifeline — do not build it at 6am.
- **Lock escrows early, in parallel.** Payment-service polling is
  multi-minute per transition. Escrow ops start as soon as bids are in.
- **Vercel-friendly runs.** Functions have ~60s limits: stepwise scenario,
  SSE streaming, job-token + poll for the settlement step.
- **Commits:** conventional commits (`feat(ui): …`, `fix(settlement): …`),
  push to `main` as you go — the repo is private for now (flip to public at
  code freeze) and commit history is evidence.

## Mandatory check before merging (do not skip)

Before pushing/merging any code, capability, or documentation, verify every
item below. If anything is unclear — or the change would break a requirement —
**stop and ask Danila to decide before merging.** A blocked merge is cheap;
a merged violation is expensive.

- [ ] **Track rule respected:** does this keep "an agent completes a transaction
      scenario with a visible outcome" true? Sandbox transactions count; every
      simulated payment is labelled.
- [ ] **In scope:** does this serve the allocate → verify → settle loop
      (PRD v2.2)? A new capability outside that loop is scope creep — ask first.
- [ ] **Honestly labelled:** every money-related element carries the right badge —
      `REAL` (preprod tx + explorer link), `SIMULATED`, or `PRE-RECORDED`.
      No exceptions.
- [ ] **Not rebuilding the rails:** no Cardano wallet/payment engine, no escrow
      contracts, no DID infrastructure, no explorer, no generic marketplace.
- [ ] **Secrets safe:** no API keys, private keys, or credentials in the change.
- [ ] **Architecture-dependent?** If this touches the stack, services, hosting,
      or component contracts — the scaffold rule applies: verify with Danila first.

## What "done" means per component

- Outcome valid: signed by shop key, session attributed to publisher,
  timestamp within window.
- Bid valid: sealed, on time, quote schema valid (promised outcome rate + price).
- Performance gate: ≥5 verified outcomes / 1k impressions → release; else refund.
- Settlement checks measured outcomes against the bid quote AND the gate.

## Never cut (in this order, cut top-down everything else)

1. ElevenLabs voiceover → captions
2. Arbiter autonomy → scripted verdict (keep the visible refund)
3. Multi-seller discovery → seeded registry (discovery UI stays)
4. **Never cut:** real escrow + refund tx with explorer links, <30s playground,
   badges, 2-min video, README honest-limitations section.
