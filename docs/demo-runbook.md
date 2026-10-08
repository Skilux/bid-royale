# Demo runbook

## The scenario (90 s submission video)

Decided in the S4 storyboard session (#5), 8 Oct 2026. Hard cap 90 s, target 85 s.
The rule is a video under 90 seconds (Win Plan). The public event page says
two minutes; a cut under 90 s satisfies both. **Confirm the length rule with the
organizers at the venue.** All amounts are tUSDM. Voiceover lines are drafts.
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
- **Production:** a warm run starts at least 50 min before recording. The video
  shows fresh locks, then a labelled time cut and the warm run's settlement txs
  (REAL, with their real timestamps). Any replay is badged PRE-RECORDED.
- **Refund beat:** Pass and Short of promise go fast. The Under-gate refund gets
  the most time and ends on the real tx in the Cardano explorer.
- **Honesty:** a badge on every money element. The receipt beat shows a tally line.
- **Track fit:** small named chips in the beats: discovery, wallet, escrow,
  dispute path.
- **Mock-ups:** one static creative thumbnail per supplier card. Cut it first,
  ahead of the bot panel.
- **Judge URL:** one URL. Run plays the canned run in under 30 s, badged
  PRE-RECORDED, with the REAL tx links from the warm run. A secondary
  "Run live" starts a fresh run: bids and locks are live, settlement attaches
  to the warm run.

### Shot list

| Time | Challenge | Story and voice (draft) | On screen | Badges and chips |
|---|---|---|---|---|
| **0:00–0:10** | Discovery: an agent has budget but no way to find sellers | **NeoRack:** "Hi, I'm NeoRack's agent. I have 20 tUSDM and I want to buy ads from other agents. Can anyone help me?" **Board:** "I'm the Tender Board. Tell me what you need." | Empty brief. NeoRack agent card on the left, Board card on the right | none |
| **0:10–0:20** | Terms: agree what "done" means before money moves | **NeoRack:** "I only pay for verified signups. At least 5 per 1,000 impressions, and winners put up a 25% bond." **Board:** "Published. I'll find sellers in the Masumi registry." | Tender card with gate and bond. Registry lookup returns four agent cards | chip: **Discovery: Masumi registry** |
| **0:20–0:34** | Fair allocation among strangers | Bubbles: TechBlog "7 per 1,000 for 7." CodePodcast "8 for 6." DevNewsletter "12 for 7." GamingForum "4 for 3." **Board:** "Bids are sealed, so nobody can peek or change them. GamingForum promises less than the gate, so it's out. The rest are ranked by price per promised signup." | Commit hashes, reveal, GamingForum greys out ("promises 4 per 1,000, gate is 5"), ranking DevNewsletter 0.39, CodePodcast 0.75, TechBlog 1.00, budget bar fills to 20. One static creative per supplier card | **SIMULATED**: 0.2 bid fee per bidder (REAL if time allows) |
| **0:34–0:46** | Trust between agents that have never met | **NeoRack:** "DevNewsletter promises 12 per thousand. I've never met it. Why believe it?" **Board:** "You don't have to. Your award sits in escrow, and every winner locks a bond." | 6 escrow rows: awards 7 + 6 + 7, bonds 1.75 + 1.5 + 1.75, each with its wallet and an explorer link | **REAL**: 6 preprod escrows with tx links. chips: **Wallet**, **Escrow: Masumi, Cardano preprod** |
| **0:46–0:54** | Proof of outcome with no trusted third party | **Board:** "Now the traffic runs. I count only signups signed by NeoRack's feed and attributed to the right publisher." | Dashboard: impressions climb, verified signups tick up per supplier. DevNewsletter stays at 0. Bot-signal panel beside it | **SIMULATED**: shop and signup events, no funds moved |
| **0:54–1:14** | Accountability: who pays when a promise breaks | **Board:** "TechBlog delivered 8 against a promise of 7. Paid in full, bond returned. CodePodcast delivered 6 against 8. Paid, and it loses part of its bond. DevNewsletter promised 12 and delivered 0. Its award goes back to NeoRack, and its bond is forfeited." | Labelled "N min later" card. Pass card (about 3 s), Short of promise card (about 3 s). Then slow on DevNewsletter: stamp **Under gate**, 7 back to NeoRack, 1.75 bond forfeited. Last 4 s: the real refund tx opens in the Cardano explorer | **REAL**: award and bond settlements from the warm run, refund tx with explorer link. chip: **Dispute path: refund** |
| **1:14–1:25** | Learning: the agent reallocates by results | **NeoRack:** "I paid 10.875 for 14 verified signups. Next round, my budget goes to TechBlog and CodePodcast. Don't pay for impressions. Pay for outcomes." | Receipt: net −10.875 tUSDM, about 0.78 per signup. ROI leaderboard. Round-2 split TechBlog 50 / CodePodcast 50 / DevNewsletter 0. Tally line: "6 escrows REAL on Cardano preprod. Bid fees and traffic SIMULATED. Suppliers are our own agents." | round 2 **shown, not executed** (D2) |

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

- Awards 7 + 6 + 7 = 20. Bonds 1.75 + 1.5 + 1.75 = 5.
- Price per promised signup: DevNewsletter 7 ÷ (1.5 × 12) = 0.39, CodePodcast
  6 ÷ (1 × 8) = 0.75, TechBlog 7 ÷ (1 × 7) = 1.00.
- Delivered per 1,000: TechBlog 8, CodePodcast 6, DevNewsletter 0.
- Forfeit 1.5 × (8 − 6) ÷ 8 = 0.375. Consumer net −20 + 7 + 2.125 = −10.875.

### Dependencies

- The refund beat needs the refund dry run (D9, D10) and the warm run. If the
  dry run fails, the beat falls back to the labelled simulated ledger and the
  tally says so. Never label it REAL.
- The "attach to run" switch (UI shows a warm run's settlement) belongs to the
  Masumi and UI lanes.
- The Diagrams page sequence and system map still show the removed Validator
  agent. Regenerate before they appear in any shot.

## Build order (night of Oct 8, 21:00 → 07:14)

1. NeoRack signup feed first (the heart) → 2. Wrapper UI shell (static) →
   3. verifier module → 4. Tender Board auction engine → 5. Masumi wiring
   **in parallel, early** (10 escrows; award and bond locks REAL as soon as
   winners are picked; bid fees SIMULATED first, REAL if time allows) → 6. 4 Supplier agents
   (TechBlog, CodePodcast, DevNewsletter, GamingForum) → 7. settlement beat +
   leaderboard + receipt → 8. video cut.

## Pre-flight checklist (before Oct 8)

- [ ] Vercel project linked, env vars set, deploy green, URL opens on cellular
- [ ] Masumi API auth verified; Consumer, Supplier and Board
  wallets funded (tUSDM + ADA)
- [ ] tUSDM availability on preprod confirmed (unverified; fallback tADA with
  scaled amounts)
- [ ] 4 Supplier agents registered in the registry
- [ ] D9 decided: preprod contract V1 vs V2 (open)
- [ ] **Lock → release dry run on preprod, tx hash saved** (go/no-go):
  award locked, `submit-result`, withdraw after `unlock_time`
- [ ] **Refund dry run on preprod, tx hash saved** (go/no-go; the demo's
  main event): Under-gate path / WithdrawRefund. Also confirms whether the
  contract lets the Consumer reclaim without a supplier signature (path A2,
  open)
- [ ] OpenRouter key works; each model in `OPENROUTER_MODELS` tested
- [ ] `SIMULATE_PAYMENTS` and `DEMO_MODE=canned` flags working
- [ ] Full successful run recorded (video backstop) by Oct 7 evening
- [ ] **Warm run started at least 50 min before recording**; its settlement txs saved for the verdict beat
- [ ] Video length rule (<90 s) confirmed with the organizers
- [ ] ElevenLabs voiceover pre-generated and timed to the cut (captions always on, fallback if the voice is cut)
- [ ] **Oct 7 evening check:** Masumi preprod reliable → primary. If not,
  lean on the labelled simulated ledger + canned replay (no second rail —
  Masumi-only by team decision)

## Cut order (agreed in advance, cut top-down)

1. ElevenLabs voiceover → captions + text narrative
2. Bot-signal panel and round-2 on the receipt (dashboard polish)
3. Multi-seller discovery → seeded registry (discovery UI stays)
4. **Never cut:** real escrow + award and bond tx with explorer links
   (including the Under-gate refund), <30s Wrapper UI run, REAL/SIMULATED
   badges, 90 s video, README honest-limitations section

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
