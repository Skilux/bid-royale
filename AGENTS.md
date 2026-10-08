# AGENTS.md — repo rules for the build night

> ⚠️ **SCAFFOLD — NOTHING HERE IS FINAL.** This repo is a proposal baseline. Every
> stack pick, service, component contract, and rule below can change.
>
> **Mandatory check:** before making any change that depends on the architecture
> (stack, services, hosting, component contracts, data flow) — or when the user asks
> for something that conflicts with what's written here — **stop and verify with
> Danila first.** Do not assume the scaffold is decided. Do not build blindly on it.

This repo is the **Ad Slot Auction** entry for the Agentic Economy track.
The spec is in Notion: "Ad Slot Auction — PRD & build brief" (v3.0), plus
"Ad Slot Auction: Money Flow, Step by Step" and "Ad Auction — Diagrams". Where
they differ from PRD v2.2, the Money Flow and Diagrams pages win. Terms are in
`GLOSSARY.md`. This file is the law for how we build it on Oct 8–9.

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

Single-context: `GLOSSARY.md` (exists) + `docs/adr/` at the repo root (ADRs
created lazily when decisions land). See `docs/agents/domain.md`.

## The one rule above all

**Masumi is the rails. We are the product.** Never build: a Cardano
wallet/payment engine, escrow smart contracts, DID infrastructure, a generic
agent directory, a blockchain explorer. If you're writing chain code, stop —
you're off the rails.

## Build order (PRD §12 — follow it)

1. NeoRack signup feed: simulated shop + signed signup events + attribution
   (the heart — build first)
2. Wrapper UI shell: brief → dashboard → receipt (static first)
3. Verifier module (inside the Tender Board service, not an agent):
   signature + attribution + window checks (deterministic), Board signs the
   verdict
4. Tender Board auction engine: commit-reveal bid evaluation + winner picking;
   round-2 decision logic (shown on the receipt, no chain ops)
5. Masumi: discover Supplier agents via registry; publish tender on our board,
   collect sealed bids + 10 escrow locks (early in the night, in parallel;
   6 critical-path locks REAL, 4 bid fees SIMULATED first, REAL if time
   allows) + settlement wiring
6. Supplier agents (4 bidders): TechBlog Pass, CodePodcast Short of promise,
   DevNewsletter Under gate (the rehearsed failure), GamingForum below the gate
7. Settlement beat (3 verdict branches) + ROI leaderboard + receipt
8. <90 s video cut, with an ElevenLabs voiceover and always-on captions

## Code layout (agents: read before creating any file)

The Vercel project builds with **`app/` as its root directory**. Files outside
`app/` are not in the build and Next.js cannot import them. Past mistake:
`lib/` and `data/` were created at the repo root and had to be moved.

- **All code goes under `app/`.** Modules in `app/lib/<name>/`, seed JSON in
  `app/data/seeds/`, routes in `app/app/`. Never create `lib/`, `src/` or
  `data/` at the repo root.
- **Import with the alias `@/`**, which maps to `app/`:
  `import { verify } from "@/lib/verifier"`. Never `../../../lib/...` and never
  an import that leaves `app/`.
- **Docs say `lib/x` for short.** It always means `app/lib/x`.
- Repo-root files are docs, config and tooling only: `docs/`, `.agents/`,
  `.tools/`, `AGENTS.md`, `README.md`, `GLOSSARY.md`, `.env.example`.
- `npm install`, `npm run dev` and `npm run build` run inside `app/`.
- Adding a new top-level code directory, or changing Vercel's root directory,
  is an architecture change: verify with Danila first.

## Hard rules

- **No secrets in the repo. Ever.** Private keys and API keys live in Vercel
  env vars and `.env.local` (gitignored) only. Never in code, never in the
  browser, never on screen. Testnet tx hashes are public — commit them freely
  as proof (they belong in the README).
- **Label everything money-related:** `REAL` (preprod tx + explorer link),
  `SIMULATED` (labelled ledger), `PRE-RECORDED` (canned replay). A simulated
  payment without a badge is a bug.
- **Chain gets hashes only.** On-chain: task ID, agent identifiers, price + escrow
  ref, hashes of spec/result/verification report, settlement outcome,
  timestamp. Evidence (logs, reports, attribution) stays off-chain in the
  evidence store.
- **The verifier is deterministic.** Signature valid? Signup attributed to
  the supplier? Timestamp within window? → count. Bot signals (click bursts,
  datacenter ASNs) are dashboard context only — never the verdict.
- **Timeouts on every `fetch`.** AbortController everywhere; every agent run
  gets a max-turn cap. On failure: degrade to canned mode, never crash.
- **Canned mode from hour 1.** `DEMO_MODE=canned` replays a recorded
  successful run. This is the 07:00 lifeline (an internal buffer before the 07:14 code freeze) —
  do not build it at 6am.
- **Lock escrows early, in parallel.** Payment-service polling is
  multi-minute per transition. Escrow ops start as soon as bids are in.
- **Vercel-friendly runs.** Functions have ~60s limits: stepwise scenario,
  SSE streaming, job-token + poll for the settlement step.
- **Commits:** conventional commits (`feat(ui): …`, `fix(settlement): …`),
  push to `main` as you go — the repo is private for now (flip to public at
  code freeze) and commit history is evidence.

## Checks before every commit (mandatory)

- Run `npm run check` in `app/` before every commit. It takes about a second:
  tests (`node --test` over `app/lib`), secrets scan, layout rule (no root
  `lib/`, `src/`, `data/`; no import that leaves `app/`), badge guard on
  `app/app/` UI code, and ESLint (`no-undef`, `no-unused-vars`,
  `no-unreachable`).
- Run `npm run check:full` (same plus `next build`) before pushing to `main`.
- Enable the versioned pre-commit hook once per clone with
  `npm run setup:hooks` in `app/`. It runs the staged-files variant, skips
  docs-only commits, and never blocks on a crash or timeout.
- Never use `--no-verify`. Fix the failure. If a check is wrong for your file,
  change the check in `app/scripts/` and say so in the issue.
- A fresh worktree has no `node_modules`: run `npm ci` in `app/` once, or the
  hook skips lint with a warning.
- `npm run setup:hooks` writes `core.hooksPath` to the shared `.git/config`, so
  it enables the hook for every worktree of that clone. Worktrees get
  `.githooks/` once they rebase onto `main`.
- Known limits. The badge guard is grep-level: a money amount under `app/app/`
  needs `REAL`, `SIMULATED`, `PRE-RECORDED` or a `Badge` identifier within 6
  lines, and it can miss amounts built from other variable names. Lint ignores
  unused function arguments, and capitalised unused names under `app/app/`
  (core ESLint does not count JSX usage). `app/lib/agents/**` is not linted.
- Secrets rules: only `.env.example` may be tracked; its `*_KEY`, `*_SECRET`,
  `*_TOKEN` and `*_PASSWORD` lines must be empty or `<placeholder>`.

## Every change has a GitHub issue (mandatory)

No work starts or lands without a GitHub issue. This applies to every agent and
every human.

1. **Before you start, make sure the task is a GitHub issue.** If you were given
   work that has no issue, create one first (`gh issue create`, see
   `docs/agents/issue-tracker.md`) with a goal and a done-when.
2. **Before you commit and push, the issue must exist and be open.** Never push
   work that has no issue.
3. **Mention the issue number when you merge to `main`:** in the commit message
   (`feat(verifier): ... (#2)` or a `Refs #2` / `Closes #2` line) and in the
   closing comment on the issue.
4. **Close the loop:** when done-when passes, comment the result on the issue
   (files, how to test, deviations) and close it.

## Mandatory check before merging (do not skip)

Before pushing/merging any code, capability, or documentation, verify every
item below. If anything is unclear — or the change would break a requirement —
**stop and ask Danila to decide before merging.** A blocked merge is cheap;
a merged violation is expensive.

- [ ] **Track rule respected:** does this keep "an agent completes a transaction
      scenario with a visible outcome" true? Sandbox transactions count; every
      simulated payment is labelled.
- [ ] **In scope:** does this serve the allocate → verify → settle loop
      (PRD v3.0)? A new capability outside that loop is scope creep — ask first.
- [ ] **Honestly labelled:** every money-related element carries the right badge —
      `REAL` (preprod tx + explorer link), `SIMULATED`, or `PRE-RECORDED`.
      No exceptions.
- [ ] **Not rebuilding the rails:** no Cardano wallet/payment engine, no escrow
      contracts, no DID infrastructure, no explorer, no generic marketplace.
- [ ] **Secrets safe:** no API keys, private keys, or credentials in the change.
- [ ] **Architecture-dependent?** If this touches the stack, services, hosting,
      or component contracts — the scaffold rule applies: verify with Danila first.

## Non-goals (PRD)

- Real fraud forensics (bot signals are dashboard context only)
- Creative production
- A generalized DSP
- Multi-round live reallocation on-chain (round 2 is shown on the receipt, no chain ops)
- A Sokosumi-style marketplace
- A generic pay-for-APIs agent
- Any feature that does not serve the allocate → verify → settle loop

## What "done" means per component

- Signup valid: signed by shop key, attributed to the supplier,
  timestamp within window.
- Bid valid: sealed (commit hash before the deadline, reveal after close,
  Board recomputes and rejects mismatches), on time, quote schema valid
  (promised signups per 1,000 + price + impressions). Eligible only if promised
  per 1,000 ≥ 5.
- Bond: 25% of award, locked by each winner in escrow (Board is seller).
- Verdict, one of 3 per supplier (plus Lost bid, rejected before the auction):
  - **Pass**: delivered ≥ promised. Supplier is paid the full award, bond returned.
  - **Short of promise**: gate (5 per 1,000) ≤ delivered < promised. Supplier is
    paid the full award, bond forfeited pro rata:
    bond × (promised − delivered) ÷ promised.
  - **Under gate**: delivered < 5 per 1,000. Award goes back to the Consumer,
    full bond forfeited to the Consumer. Refund path A2 (supplier never submits,
    Consumer reclaims after the submit-result deadline) is open until the D9
    preprod dry run.
- Universal checks, every verdict: deadline met, report schema valid, evidence
  attached. Delivery sanity is advisory, not gating.
- Settlement checks measured signups against the bid quote AND the gate.

## Never cut (in this order, cut top-down everything else)

1. ElevenLabs voiceover (we use it for the video) → captions
2. Bot-signal panel and round-2 on the receipt (dashboard polish)
3. Multi-seller discovery → seeded registry (discovery UI stays)
4. **Never cut:** real escrow + award and bond tx with explorer links
   (including the Under-gate refund), <30s Wrapper UI run, badges, <90 s video,
   README honest-limitations section.
