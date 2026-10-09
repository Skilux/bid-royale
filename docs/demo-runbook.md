# Demo runbook

## The scenario (90 s submission video)

Decided in the S4 storyboard session (#5), 8 Oct 2026. Hard cap 90 s, target 85 s.
The rule is a video under 90 seconds (Win Plan), final, decided by Danila on
9 Oct 2026 (#58). The public event page says two minutes; a cut under 90 s
satisfies both, and `DESIGN.md` §12 still says 2:00 (docs conflict C6). All amounts are tADA, the spec ×10 (#24). Voiceover lines are drafts.
Visual style is owned by #15; this section fixes beats, order, timings and what
is on screen.

### Decisions

- **Storyline:** a conversation. The NeoRack agent asks for help buying ads
  from other agents, and the Tender Board answers. Each beat is one agentic
  economy challenge and shows how the system solves it: discovery, terms,
  fair allocation, trust, proof of outcome, accountability, learning.
- **Narration:** ElevenLabs, two voices (NeoRack agent, Tender Board), always-on
  captions. The four suppliers speak only in on-screen bubbles, with no voice.
  Cutting the voice loses nothing.
- **Production:** one real run, recorded (#45), no separate warm run (#30,
  decided 9 Oct). The video shows the run's locks, then a labelled time cut and
  the same run's settlement txs (REAL, with their real timestamps). Any replay
  is badged PRE-RECORDED.
- **Refund beat:** Pass and Short of promise go fast. The Under-gate refund gets
  the most time and ends on the real tx in the Cardano explorer.
- **Honesty:** a badge on every money element. The receipt beat shows a tally line.
- **Track fit:** small named chips in the beats: discovery, wallet, escrow,
  dispute path.
- **Mock-ups:** one static creative thumbnail per supplier card. Cut it first,
  ahead of the bot panel.
- **Judge URL:** one URL. Run plays the recorded run in under 30 s, badged
  PRE-RECORDED, with the REAL tx links from the #45 run. There is no "attach to
  a warm run" switch. A live run with real escrows is rehearsal-only and
  needs the mode procedure below.

### Shot list

| Time | Challenge | Story and voice (draft) | On screen | Badges and chips |
|---|---|---|---|---|
| **0:00–0:10** | Discovery: an agent has budget but no way to find sellers | **NeoRack:** "Hi, I'm NeoRack's agent. I have 200 tADA and I want to buy ads from other agents. Can anyone help me?" **Board:** "I'm the Tender Board. Tell me what you need." | Empty brief. NeoRack agent card on the left, Board card on the right | none |
| **0:10–0:20** | Terms: agree what "done" means before money moves | **NeoRack:** "I only pay for verified signups. At least 5 per 1,000 impressions, and winners put up a 25% bond." **Board:** "Published. I'll find sellers in the Masumi registry." | Tender card with gate and bond. Registry lookup returns four agent cards | chip: **Discovery: Masumi registry** |
| **0:20–0:34** | Fair allocation among strangers | Bubbles: TechBlog "7 per 1,000 for 70." CodePodcast "8 for 60." DevNewsletter "12 for 70." GamingForum "4 for 30." **Board:** "Bids are sealed, so nobody can peek or change them. GamingForum promises less than the gate, so it's out. The rest are ranked by price per promised signup." | Commit hashes, reveal, GamingForum greys out ("promises 4 per 1,000, gate is 5"), ranking DevNewsletter 3.89, CodePodcast 7.50, TechBlog 10.00, budget bar fills to 200. One static creative per supplier card | **REAL**: 2 bid fee per bidder, escrow with the commit hash (#50) |
| **0:34–0:46** | Trust between agents that have never met | **NeoRack:** "DevNewsletter promises 12 per thousand. I've never met it. Why believe it?" **Board:** "You don't have to. Your award sits in escrow, and every winner locks a bond." | 6 escrow rows: awards 70 + 60 + 70, bonds 17.5 + 15 + 17.5, each with its wallet and an explorer link | **REAL**: 6 award and bond escrows with tx links (the 4 bid fees are REAL too, shown in the bids beat). chips: **Wallet**, **Escrow: Masumi, Cardano preprod** |
| **0:46–0:54** | Proof of outcome with no trusted third party | **Board:** "Now the traffic runs. I count only signups signed by NeoRack's feed and attributed to the right publisher." | Dashboard: impressions climb, verified signups tick up per supplier. DevNewsletter stays at 0. Bot-signal panel beside it | **SIMULATED**: shop and signup events, no funds moved |
| **0:54–1:14** | Accountability: who pays when a promise breaks | **Board:** "TechBlog delivered 8 against a promise of 7. Paid in full, bond returned. CodePodcast delivered 6 against 8. Paid, and it loses part of its bond. DevNewsletter promised 12 and delivered 0. Its award goes back to NeoRack, and its bond is forfeited." | Labelled "N min later" card. Pass card (about 3 s), Short of promise card (about 3 s). Then slow on DevNewsletter: stamp **Under gate**, 70 back to NeoRack, 17.5 bond forfeited. Last 4 s: the real refund tx opens in the Cardano explorer | **REAL**: award and bond settlements from the #45 run, refund tx with explorer link. chip: **Dispute path: refund** |
| **1:14–1:25** | Learning: the agent reallocates by results | **NeoRack:** "I paid 108.75 for 14 verified signups. Next round, my budget goes to TechBlog and CodePodcast. Don't pay for impressions. Pay for outcomes." | Receipt: net −108.75 tADA, about 7.77 per signup. ROI leaderboard. Round-2 split TechBlog 50 / CodePodcast 50 / DevNewsletter 0. Tally line: "10 escrows REAL on Cardano preprod. Bid fees REAL. Traffic and signups SIMULATED. Suppliers are our own agents." | round 2 **shown, not executed** (D2) |

The remaining 5 s up to 1:30 is margin, not content. About 210 spoken words, so
it is tight. If it overruns, fold the 0:10–0:20 terms beat into the first one.

Challenge to mechanism (for the README and the pitch):

- Discovery: Masumi registry plus our Tender Board, which sends the invites.
- Terms: a tender with a gate and a bond.
- Allocation: sealed bids, ranked by price per promised signup.
- Trust and payment: Masumi escrow for the award and the bond.
- Verification: signed signups, checked deterministically.
- Accountability: a signed verdict with a pro-rata bond forfeit and an award
  refund.

### Rules for every shot

- A badge on every money element: REAL (preprod tx + explorer link), SIMULATED
  (labelled ledger) or PRE-RECORDED (canned replay). A money element without a
  badge is a bug.
- No chain jargon on screen. Verdict names are Pass, Short of promise and
  Under gate.
- The time cut shows its own label. Use the measured minutes from Masumi
  checkpoint 2, not the computed 41 / 26 (see `docs/research/masumi-settlement-timing.md`).

### Numbers to check

- Awards 70 + 60 + 70 = 200. Bonds 17.5 + 15 + 17.5 = 50.
- Price per promised signup: DevNewsletter 70 ÷ (1.5 × 12) = 3.89, CodePodcast
  60 ÷ (1 × 8) = 7.50, TechBlog 70 ÷ (1 × 7) = 10.00.
- Delivered per 1,000: TechBlog 8, CodePodcast 6, DevNewsletter 0.
- Forfeit 15 × (8 − 6) ÷ 8 = 3.75. Consumer net −200 + 70 + 3.75 + 17.5 = −108.75.

### Dependencies

- The refund beat needs the #45 run (D9 and D10 are closed: V2, cooperative
  refund 5.9 min, A2 fallback 27.8 min). If the run fails, the beat falls back
  to the labelled simulated ledger and the tally says so. Never label it REAL.
- GamingForum's card shows a price that depends on the bid source. The Board's
  default quotes and the stand-in `app/data/canned/run.json` say 20. The persona
  pin (the fallback when supplier agents run, `SUPPLIER_AGENTS=local` being the
  production default) says 30, a live model quote lands in 10–40, and the shot
  list above uses 30. Check the number on the card against
  the recording before the voiceover is timed. Either way GamingForum is a Lost
  bid below the gate (docs conflict C9).
- The Diagrams page sequence and system map in Notion still show the removed
  Validator agent. Regenerate before they appear in any shot. In this repo the
  Board verifier is a module inside the Board (`GLOSSARY.md`).

## Build order (night of Oct 8, 21:00 → 07:14)

1. NeoRack signup feed first (the heart) → 2. Wrapper UI shell (static) →
   3. verifier module → 4. Tender Board auction engine → 5. Masumi wiring
   **in parallel, early** (10 escrows, all REAL: award and bond locks as soon as
   winners are picked, bid fees as bids come in, #50) → 6. 4 Supplier agents
   (TechBlog, CodePodcast, DevNewsletter, GamingForum) → 7. settlement beat +
   leaderboard + receipt → 8. video cut.

## Pre-flight checklist (before Oct 8)

- [ ] Vercel project linked, env vars set, deploy green, URL opens on cellular
- [ ] Masumi API auth verified; Consumer, Supplier and Board
  wallets funded (tADA)
- [x] Asset decided: tADA, spec ×10 (#24)
- [ ] 4 Supplier agents registered in the registry
- [x] D9 decided: preprod contract V2 (#21)
- [ ] **Lock → release dry run on preprod, tx hash saved** (go/no-go):
  award locked, `submit-result`, withdraw after `unlock_time`
- [ ] **Refund dry run on preprod, tx hash saved** (go/no-go; the demo's
  main event): Under-gate path / WithdrawRefund. Also confirms whether the
  contract lets the Consumer reclaim without a supplier signature (path A2,
  open)
- [ ] OpenRouter key works; each model in `OPENROUTER_MODELS` tested
- [ ] `SIMULATE_PAYMENTS` and `DEMO_MODE=canned` flags working
- [ ] The one real run recorded (#45), settlement txs saved for the verdict beat. No separate warm run (#30)
- [x] Video length rule: under 90 s (Danila, 9 Oct, #58)
- [ ] ElevenLabs voiceover pre-generated and timed to the cut (captions always on, fallback if the voice is cut)
- [ ] **Masumi preprod reliable** → primary. If not,
  lean on the labelled simulated ledger + canned replay (no second rail —
  Masumi-only by team decision)

## Modes and env changes

Two flags decide what a run does. `SIMULATE_PAYMENTS` picks the payment rail, `DEMO_MODE` picks live or replay.

| Situation | `SIMULATE_PAYMENTS` | `DEMO_MODE` | Result |
|---|---|---|---|
| Rehearsals, tests, any run that is not the recorded one | `true` | `live` | Live run, labelled SIMULATED ledger, no tADA spent |
| Recorded real run (#45), the only run that uses real escrows | `false` | `live` | Live run, REAL preprod escrows and txs |
| Judge URL after #13 | any | `canned` | Run button replays the recording, badged PRE-RECORDED, REAL tx links kept |

Rules:

1. Rehearse with `SIMULATE_PAYMENTS=true` and `DEMO_MODE=live`. Never rehearse with `false`.
2. Set `SIMULATE_PAYMENTS=false` only for the recorded run #45. Set it back to `true` right after.
3. After #13 and the #45 recording are in, the judge URL runs with `DEMO_MODE=canned`.
4. Every env change needs a redeploy. A new value reaches the site only after the next deploy, and only Danila deploys.
5. After each deploy, open `/api/health` and check `flags.simulatePayments`, `flags.demoMode`, `paymentAdapter` and the `env` block. `env` shows true or false per variable, never values. Do not start a run until the flags match the row above. `treasury` probes the worker with the real token: `authOk: true` means `TREASURY_URL` and `TREASURY_TOKEN` work, `false` means the worker rejected the token, `reachable: false` means the URL is wrong or the worker is down. Vercel hides both values, so this is the only check.

## Canned replay (`DEMO_MODE=canned`)

The judge URL replays one recorded run, badged PRE-RECORDED. The REAL preprod tx
links from the recording stay REAL links with their recorded timestamps. Code:
`app/lib/replay/`. Recording: `app/data/canned/run.json`.

| Env var | Values | Effect |
|---|---|---|
| `DEMO_MODE` | `canned` or `live` (default) | `canned`: `POST /api/run` loads the recording and the SSE stream replays it. `live`: a real run. A failing live step degrades to the replay and emits `mode.degraded`. |
| `REPLAY_SPEED` | `fast` (default), `normal`, `instant` | `fast`: whole stream in 25 s or less, 0.35 s pause before each step. `normal`: recorded timing, 1x. `instant`: no delay, for tests. |
| `REPLAY_RECORDING` | file path, optional | Replays that file instead of `app/data/canned/run.json`. Relative paths start in `app/`. |

Check after a deploy: `/api/health` shows `flags.demoMode: "canned"` and `replay.ok: true`
with `replay.recordedRunId`, `replay.events` and `replay.realTransfers`.

**Swap in the real #45 recording (no code change):**

1. Take the run from the deployed app: `cd app && BOARD_URL=https://<deployment> npm run record:canned -- <runId>`.
   It writes `app/data/canned/run.json`. Or copy the file Vladimir saved in
   `docs/runs/2026-10-09/` to `app/data/canned/run.json` (shape: `{ run, events }`).
2. Open the file and check there are no secrets. Tx hashes are public.
3. Run `cd app && npm run check`. Then start `DEMO_MODE=canned npm run dev` and open
   `localhost:3000/api/health`. Expect `replay.ok: true` and `replay.realTransfers` above 0.
4. Commit, push to `main`, tell Danila to deploy.

The loader rejects a recording that has no `run.created` first, no `run.completed` last,
an unknown event name or a run status other than `completed`. A `REAL` badge without a
real tx hash is shown as PRE-RECORDED. A `PENDING` row stays PENDING.

## Cut order (agreed in advance, cut top-down)

1. ElevenLabs voiceover → captions + text narrative
2. Bot-signal panel and round-2 on the receipt (dashboard polish)
3. Multi-seller discovery → seeded registry (discovery UI stays)
4. **Never cut:** real escrow + award and bond tx with explorer links
   (including the Under-gate refund), <30s Wrapper UI run, REAL/SIMULATED
   badges, <90 s video, README honest-limitations section

## At the venue (Oct 8)

- 16:00 check-in — test Wrapper UI URL from venue wifi AND phone cellular
- 17:30 kickoff — ask the mentors (full list on the Notion Mentor page):
  - Masumi (Albina):
    - refund path
    - Disputed and `external_dispute_unlock_time`
    - polling latency per transition
    - integration path
    - what they wish for winners
    - preprod vs mainnet
  - Organizers:
    - OpenAI credit distribution
    - jury composition
    - whether judges click through
- 18:25–21:00 planning + food — lock scope, assign lanes, agree cut order
