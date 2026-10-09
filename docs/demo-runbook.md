# Demo runbook

## The scenario (90 s submission video)

Decided in the S4 storyboard session (#5), 8 Oct 2026. Hard cap 90 s, target 85 s.
The rule is a video under 90 seconds (Win Plan), final, decided by Danila on
9 Oct 2026 (#58). The public event page says two minutes; a cut under 90 s
satisfies both, and `DESIGN.md` §12 still says 2:00 (docs conflict C6). All amounts are tADA, the spec ×10 (#24). Numbers in the shot list are the recorded run `run_c1f40522` (#45), not the worked example. Voiceover lines are drafts.
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
| **0:10–0:20** | Terms: agree what "done" means before money moves | **NeoRack:** "I only pay for verified signups. At least a 0.5% conversion, and winners put up a 25% bond." **Board:** "Published. I'll find sellers in the Masumi registry." | Tender card with gate and bond. Registry lookup returns four agent cards | chip: **Discovery: Masumi registry** |
| **0:20–0:34** | Fair allocation among strangers | Bubbles: TechBlog "0.5% for 65." CodePodcast "0.7% for 55." DevNewsletter "1% for 60." GamingForum "0.4% for 20." **Board:** "Bids are sealed, so nobody can peek or change them. GamingForum promises less than the gate, so it's out. The rest are ranked by price per promised signup." | Commit hashes, reveal, GamingForum greys out ("promises 0.4% conversion, gate is 0.5%"), ranking DevNewsletter 6.00, CodePodcast 7.86, TechBlog 13.00, budget bar fills to 180 of 200. One static creative per supplier card | **REAL**: 2 bid fee per bidder, escrow with the commit hash (#50) |
| **0:34–0:46** | Trust between agents that have never met | **NeoRack:** "DevNewsletter promises a 1% conversion. I've never met it. Why believe it?" **Board:** "You don't have to. Your award sits in escrow, and every winner locks a bond." | 6 escrow rows: awards 65 + 55 + 60, bonds 16.25 + 13.75 + 15, each with its wallet and an explorer link | **REAL**: 6 award and bond escrows with tx links (the 4 bid fees are REAL too, shown in the bids beat). chips: **Wallet**, **Escrow: Masumi, Cardano preprod** |
| **0:46–0:54** | Proof of outcome with no trusted third party | **Board:** "Now the traffic runs. I count only signups signed by NeoRack's feed and attributed to the right publisher." | Dashboard: impressions climb, verified signups tick up per supplier. DevNewsletter stays at 0. Bot-signal panel beside it | **SIMULATED**: shop and signup events, no funds moved |
| **0:54–1:14** | Accountability: who pays when a promise breaks | **Board:** "TechBlog converted 0.8% against a promise of 0.5%. Paid in full, bond returned. CodePodcast converted 0.6% against 0.7%. Paid, and it loses part of its bond. DevNewsletter promised 1% and delivered nothing. Its award goes back to NeoRack, and its bond is forfeited." | Labelled "13 min later" card. Pass card (about 3 s), Short of promise card (about 3 s). Then slow on DevNewsletter: stamp **Under gate**, 60 back to NeoRack, 15 bond forfeited. Last 4 s: the real refund tx opens in the Cardano explorer | **REAL**: award and bond settlements from the #45 run, refund tx with explorer link. chip: **Dispute path: refund** |
| **1:14–1:25** | Learning: the agent reallocates by results | **NeoRack:** "I paid 105 for 14 verified signups. Next round, my budget goes to TechBlog and CodePodcast. Don't pay for impressions. Pay for outcomes." | Receipt: net −105 tADA, 7.50 per signup. The net counts only money that moved: CodePodcast's 1.9643 forfeit was never sent (BelowMinimum, #62), so it shows as one PENDING note and is not in the total. ROI leaderboard. Round-2 split TechBlog 50 / CodePodcast 50 / DevNewsletter 0. Tally line: "6 escrows REAL on Cardano preprod. Bid fees REAL. Traffic and signups SIMULATED. Suppliers are our own agents." | round 2 **shown, not executed** (D2) |

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
- The time cut shows its own label. Use the minutes measured in the recorded run
  `run_c1f40522`, not the computed 41 / 26 (see `docs/research/masumi-settlement-timing.md`).
  The label reads "13 min later": the last award release (TechBlog, CodePodcast) was REAL 13.0 min after
  settlement start. The Under-gate refund was REAL at 5.7 min, so it is earlier than the label.

Measured in `run_c1f40522` (9 Oct 2026, Prague time, minutes after settlement start 01:45:54):

| Step | Start | Duration |
|---|---|---|
| Tender to verdicts signed | 01:45:43 | 10.4 s |
| 10 locks REAL | 01:45:51 | 2.1 min |
| Under-gate refund REAL | 01:45:54 | 5.7 min |
| Pass bond return REAL | 01:45:54 | 6.8 min |
| Both awards released REAL | 01:45:54 | 13.0 min |
| Bid fees collected | 01:45:54 | 13.0 to 15.1 min |
| Treasury transfers REAL | 01:45:54 | 16.1 and 17.0 min |
| Run closed by the 40-min timer (one row refused, #62) | 01:45:54 | 40.1 min |

### Numbers to check

All from `run_c1f40522`, the final recording (id `final`, `app/data/canned/c1f40522-final.json`, the default replay). The worked example (70 / 60 / 70, net −108.75) is the offline fixture only.

- Awards 65 + 55 + 60 = 180 of 200. Bonds 16.25 + 13.75 + 15 = 45. Bid fees 4 × 2 = 8, all REAL.
- Price per promised signup (1,000 impressions each): DevNewsletter 60 ÷ 10 = 6.00, CodePodcast
  55 ÷ 7 = 7.86, TechBlog 65 ÷ 5 = 13.00.
- Delivered conversion: TechBlog 0.8% (promised 0.5%), CodePodcast 0.6% (promised 0.7%), DevNewsletter 0% (promised 1%).
- CodePodcast forfeit 13.75 × (0.7 − 0.6) ÷ 0.7 = 1.964286. It is under the 2 tADA minimum, so the Board topped it up by 0.035714 and the treasury sent 2.00 tADA, REAL (#62, `docs/runs/2026-10-09/README.md`). The ledger row shows 1.964286 with tx `9b5053b741…`. It counts in the net.
- Consumer net −180 + 60 award back + 15 DevNewsletter bond forfeit + 1.964286 CodePodcast forfeit = −103.035714. 103.035714 ÷ 14 = 7.36 per signup. All 21 ledger rows are REAL, none PENDING.
- The recording `before-62-fix` (the snapshot at the 40-min timer, one PENDING row) reads net −105 and 7.50 per signup. The pitch and any shot that quote −105 and 7.50 match that one, not the default replay. Pick one before the voiceover is timed.

### Dependencies

- The refund beat needs the #45 run (D9 and D10 are closed: V2, cooperative
  refund 5.7 min in `run_c1f40522`, A2 fallback 27.8 min measured 8 Oct). If the run fails, the beat falls back
  to the labelled simulated ledger and the tally says so. Never label it REAL.
- GamingForum's card shows a price that depends on the bid source. The Board's
  default quotes and the recorded `app/data/canned/c1f40522-final.json` say 20. The persona
  pin (the fallback when supplier agents run, `SUPPLIER_AGENTS=local` being the
  production default) says 30, a live model quote lands in 10–40, and the shot
  list above uses 20, as recorded. Check the number on the card against
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

## Judge URL: recorded runs and Run live

The judge page `/` and `/dashboard` play recordings from the registry `app/data/canned/index.js`.
The first entry is the default. Every recording plays badged PRE-RECORDED, REAL rows keep their explorer link,
and a replay reaches the receipt in about 25 s.

| Recording id | Title | Summary | Note |
|---|---|---|---|
| `final` (default) | Final run, all rows REAL | net −103.04 tADA, 14 signups, 21 of 21 rows REAL | `run_c1f40522` after the #62 fix, late CodePodcast forfeit last |
| `before-62-fix` | Same run, before the treasury fix | net −105.00 tADA, 14 signups, 20 of 21 rows REAL | snapshot at the settlement timeout, one PENDING row, not counted as moved |

- Picker: radio cards under the brief on `/`, a select next to Run recorded on `/dashboard`. Switching while a replay plays restarts it with that recording.
- Deep link: `/?replay=<id>` and `/dashboard?replay=<id>` open and play that recording. An unknown id is ignored and the default plays. The address bar follows the pick.
- Run live asks first. Nothing is sent before the confirm. On production (`SIMULATE_PAYMENTS=false`) the dialog says: this starts a REAL run on Cardano preprod, 10 escrows in test ADA with no real value, full settlement about 15–20 minutes, with the measured steps (locks about 2 min, refund about 6 min, releases about 13 min, every row about 17 min). Buttons: Start real run, Watch the recording instead (plays the default). Esc cancels. With `SIMULATE_PAYMENTS=true` it says the run is SIMULATED and finishes in under 30 s. `/dashboard?mode=live` opens the same dialog.
- One real run at a time: with real payments, `POST /api/run` answers 409 `live_run_in_progress` with `activeRunId` while a run is settling or within 90 s of the last start. `GET /api/run` returns `{ guarded, active }`. The dialog uses it to offer Attach to that run, and a 409 attaches to the run in flight instead of replaying. A settling marker older than 60 min is ignored.

**Add or swap a recording (one place):**

1. `cd app && BOARD_URL=https://<deployment> npm run record:canned -- <runId>` writes `app/data/canned/<runId>.json` (GET only, with the evidence bundle). Use `--out data/canned/<name>.json` for another name. A run whose `run.completed` sits mid-stream (a late finish) is closed correctly by the script.
2. Add an entry to `RECORDINGS` in `app/data/canned/index.js`: `id`, `file`, `title`, `runId`, `recordedAt`, `summary` (net, signups, REAL rows, total rows), `badgeNote` (what the money was), and the `load` import line. Put the default first.
3. `cd app && npm run check`. `catalog.test.js` fails on a stale summary, an unregistered file in `data/canned`, or a recording without `run.created` first, `run.completed` last and status `completed`.
4. Only add completed runs. Check the currency: `run_243e78ea` and `run_74d46808` (8 Oct, simulated) use tUSDM and a 1/10 budget, so they were left out.

## Canned replay (`DEMO_MODE=canned`)

The server replay of `POST /api/run` serves one registry recording, badged PRE-RECORDED, REAL tx
links kept with their recorded timestamps. Code: `app/lib/replay/`. Recordings: `app/data/canned/`.

| Env var | Values | Effect |
|---|---|---|
| `DEMO_MODE` | `canned` or `live` (default) | `canned`: `POST /api/run` loads the recording and the SSE stream replays it. `live`: a real run. A failing live step degrades to the replay and emits `mode.degraded`. |
| `REPLAY_SPEED` | `fast` (default), `normal`, `instant` | `fast`: whole stream in 25 s or less, 0.35 s pause before each step. `normal`: recorded timing, 1x. `instant`: no delay, for tests. |
| `REPLAY_RECORDING` | recording id or file path, optional | Replays that registry recording (`before-62-fix`) or file instead of the default. Relative paths start in `app/`. |

Check after a deploy: `/api/health` shows `flags.demoMode`, and `replay.ok: true` with `replay.recordedRunId`,
`replay.events`, `replay.realTransfers`, `replay.default` and the `replay.recordings` list.

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
