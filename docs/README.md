# Documentation map and conflict register

One page that says **which file wins**. Read this before trusting any other doc.
Tracking issue: #33.

## Authority precedence

When two files disagree, the higher one wins. No exceptions, no "most recently
edited".

```
1. Code            app/lib/**, package.json          — behaviour is whatever runs
2. ADR             docs/adr/NNNN-*.md                 — decisions, once accepted
3. docs/*.md       architecture, hosting, services    — current intent
4. GLOSSARY.md                                       — terms only, never facts
5. docs/plan/*.md   lanes                             — live status, per owner
6. docs/research/  reference material                — dated, never authoritative
7. Chat / Notion    working notes                     — may be stale, verify upward
```

Money constants (`budget 200`, `gate 5`, `bondRate 0.25`, `bidFee 2`, `tADA`)
are defined once in `app/lib/config.js`. Docs cite them; they never restate them
as their own source.

## Where a fact lives

| Fact | Owner | Everyone else |
|---|---|---|
| System shape, module boundaries | `docs/architecture.md` | link only |
| Hosting, deploy, env vars | `docs/hosting.md` | link only |
| Masumi primitives | `docs/masumi.md` | link only |
| Money flow per run: calls, keys, amounts, escrow states, measured times | `docs/money-flow.md` | link only |
| Third-party services, access levels | `docs/services.md` | link only |
| Honest limits of the demo | `docs/honest-limitations.md` | README links here |
| Customer API and guide (Board routes, receipt) | `docs/api/customer.md` | link only |
| Supplier API and guide (invite, sealed bid, delivery report, offer algorithm) | `docs/api/supplier.md` | link only |
| Demo script, merge points, timings | `docs/demo-runbook.md` | AGENTS.md links here |
| What to build, in order | `AGENTS.md` | — |
| Build order per lane, live status | `docs/plan/lane-*.md` | — |
| Why we chose X | `docs/adr/` | — |
| Ticket/triage conventions | `docs/agents/` | — |

## Conflict register

Open contradictions. **Any agent that finds a new one adds a row here** rather
than silently picking a side. `RESOLVED` rows stay for the night as an audit
trail.

| # | Contradiction | Authority | Owner | Status |
|---|---|---|---|---|
| C1 | `docs/masumi.md` says the payment service is organizer-**hosted** and still asks organizers for a hosted base URL + keys; `docs/services.md` + ADR 0001 + reality say **we self-host on Railway** (`...5263.up.railway.app`, image `0.29.0`) | ADR 0001 | Danila | RESOLVED 9 Oct 2026 (#48): `docs/masumi.md`, `docs/architecture.md` now say self-hosted on Railway, organizer keys marked not provided |
| C2 | `docs/services.md` Status row is all unchecked (`☐ credentials ☐ auth ☐ wallets funded`); `docs/plan/lane-masumi.md` reports the key working, `masumi check` passing, both seeded wallets at 10,000 tADA on-chain | lane doc | Vladimir | OPEN: needs Vladimir to attest the lane doc balances, then update the `docs/services.md` Status row or leave it marked stale |
| C3 | `docs/hosting.md` timeline says "venue wifi 17:30 Oct 8, before building starts" and "full run + video (Oct 7 evening / ~05:00)"; the real window is **Oct 8 21:00 → Oct 9 07:14** | `AGENTS.md` §Build order | Danila | RESOLVED 9 Oct 2026 (#48): `docs/hosting.md` and `docs/architecture.md` use the real window and drop the Oct 7 video |
| C4 | 8 files / 545 lines in `docs/research/` carry no status marker, so a reader cannot tell whether they still hold | this file — `research/` is reference by default | — | PROPOSED |
| C5 | The shared worktree `/root/bid-royale` sits at `334835b`, **5 commits behind `origin/main`**. Reading files from it yields no `app/lib/board/`, no `/api/run` routes, no `app/scripts/check.mjs`, and the *old* lane doc (0.22.0, wallets unfunded) | `origin/main` | Danila | OPEN: a worktree state, not fixable in docs |
| C6 | `DESIGN.md` §12 and its header say the video is **2:00** (storyboard #5); `AGENTS.md`, `docs/demo-runbook.md` and the README say **under 90 s** (Win Plan) | `AGENTS.md` (<90 s) | Danila | Decided 9 Oct 2026 by Danila (#58): under 90 s. RESOLVED in `README.md`, `docs/demo-runbook.md`, `docs/plan/README.md`. `DESIGN.md` §12 still says 2:00: not edited in #58, owned by the design track |
| C7 | `app/README.md` says Tailwind and zod are "not there yet" and plans the OpenAI Agents SDK, and lists only `layout.js` and `page.js`; `package.json` has Tailwind and zod, no `@openai/agents`, models run through OpenRouter, and routes `/receipt` and `/api/*` exist | code | Danila | OPEN (found in #48) |
| C8 | The word "Validator" in older docs, research files and issue titles (#49 "Validator service") implies a separate agent, wallet or fee (0.8 tUSDM) | `GLOSSARY.md`, PRD D7 | Danila | RESOLVED 9 Oct 2026 (#58): Validator = the Board verifier plus the #49 reconciler, both inside the Tender Board. No separate agent. Docs fixed, research files carry a banner |
| C9 | GamingForum price: `app/lib/supplier-agents/personas.js` pins 30, `app/lib/board/scenario.js` default quote and `app/data/canned/c1f40522-final.json` use 20 | code | Danila | OPEN (found in #58): docs state both, see `docs/api/supplier.md` persona seeds. The verdict is the same (Lost bid below the gate), only the number on the card differs. Code not changed in #58 |

### C5 in practice, until it is fixed

- Before reading code or docs, `git fetch origin main`, then read via
  `git show origin/main:<path>` or your own worktree.
- Treat the shared worktree as **write-only scratch space**. Do not trust a file
  read from it for a decision.
- This is why the monitor's CI and secrets tasks build in a throwaway worktree.

## Maintenance protocol

Rules that keep this page true without anyone policing it.

1. **Deposit once.** A fact is written down in its owning doc and *linked*
   everywhere else. Do not restate it. Restatement is how C1–C3 happened.
2. **Update the owner in the same commit that changes the fact.** A commit that
   changes behaviour and leaves its owning doc stale has not finished.
3. **Cite the issue.** Every commit cites `(#N)`. Docs changes are not exempt.
4. **Date volatile claims.** Anything about an external system (Masumi preprod,
   Railway, Vercel, a pinned image version) carries a `Status as of <date>` line.
   A stale dated line is an honest signal; an undated one is a trap.
5. **New research file ⇒ add it to the register** below with a date and whether it
   has been folded into `docs/`.
6. **New ADR ⇒ link it from the owning doc** in the same commit, so precedence
   step 2 is reachable.
7. **Contradiction found ⇒ add a register row**, do not resolve it by editing
   around it. Resolution needs the authority above, and for services/hosting
   that means Danila.

### Research files (reference, not authority)

`docs/research/` is evidence gathered at a point in time. Cite it as "as of
<date>", and verify anything load-bearing against `docs/` or the live system
before relying on it.

| File | Lines | Folded into `docs/`? |
|---|---|---|
| `masumi-settlement-timing.md` | 188 | no — cited live by the Masumi lane |
| `masumi-payment-setup.md` | 55 | partly — see C1 |
| `masumi-financial-rails-plan.md` | 113 | yes |
| `masumi-video-setup-assessment.md` | 37 | no |
| `masumi-party-isolation.md` | 37 | no |
| `masumi-financial-setup-facts.md` | 30 | yes |
| `masumi-setup-video-transcript.md` (sources/) | 55 | n/a — raw source |
| `agent-hosting-facts.md` | 30 | yes — ADR 0001 |
