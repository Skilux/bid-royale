# Demo runbook

## The scenario (90 s submission video)

Decided in the S4 storyboard session (#5), 8 Oct 2026. Hard cap 90 s, target 85 s.
The Win Plan says "≤90 s demo video"; the public event page says "two-minute".
A 90 s cut satisfies both. **Confirm the length rule with the organizers at the
venue.** All amounts are tUSDM. Voiceover lines are drafts. Visual style is
owned by #15; this section fixes beats, order, timings and what is on screen.

### Decisions

- **Opening:** title line, then the NeoRack buying agent says the problem in
  first person, then the answer. Product is on screen from second 0.
- **Narration:** agent voice (ElevenLabs) with always-on captions. Cutting the
  voice loses nothing.
- **Production:** a warm run starts at least 50 min before recording. The video
  shows fresh locks, then a labelled time cut and the warm run's settlement txs
  (REAL, with their real timestamps). Any replay is badged PRE-RECORDED.
- **Refund beat:** Pass and Short of promise go fast. The Under-gate refund gets
  the most time and ends on the real tx in the Cardano explorer.
- **Honesty:** a badge on every money element. The receipt beat says the tally.
- **Track fit:** small named chips in the beats: discovery, wallet, escrow,
  dispute path.
- **Mock-ups:** one static creative thumbnail per supplier card. Cut it first,
  ahead of the bot panel.
- **Judge URL:** one URL. Run plays the canned run in under 30 s, badged
  PRE-RECORDED, with the REAL tx links from the warm run. A secondary
  "Run live" starts a fresh run: bids and locks are live, settlement attaches
  to the warm run.

### Shot list

| Time | Screen | Voice and caption (draft) | Badges and chips |
|---|---|---|---|
| **0:00–0:05** Title | Wrapper UI, brief form behind a title line | "Bid Royale: AI agents bid for ad budget and get paid only for verified signups." | none |
| **0:05–0:13** Problem | Brief filled in: 20 tUSDM, technical users, pay per verified signup. Four supplier cards appear with "?" and their promises, DevNewsletter's "12 per 1,000" highlighted | "I'm NeoRack's buying agent. I have 20 tUSDM. Four publisher agents I've never met promise signups. One says 12 per 1,000. Why believe it?" | no money moves yet |
| **0:13–0:20** Answer | Tender card: gate 5 signups per 1,000, bond 25% of award. Click Publish tender | "I don't. The money is locked in escrow, winners post a bond, and a signed verdict decides who gets paid." | none |
| **0:20–0:38** Bids | Board finds the suppliers, four sealed bids land as commit hashes, reveal. GamingForum greys out: "promises 4 per 1,000, gate is 5". Ranking: DevNewsletter 0.39, CodePodcast 0.75, TechBlog 1.00. Budget bar fills to 20. Three winners. One static creative per supplier card | "Four sealed bids. After the reveal the Board drops the bid that promises too little and ranks the rest by price per promised signup." | chip: **Discovery: Masumi registry**. **SIMULATED**: 0.2 bid fee per bidder (REAL if time allows) |
| **0:38–0:49** Lock | Escrow rows fill in: awards 7 + 6 + 7, bonds 1.75 + 1.5 + 1.75. Each row shows its wallet and an explorer link | "Awards and bonds go into escrow. Nobody is paid for being called." | **REAL**: 6 preprod escrows with tx links. chips: **Wallet**, **Escrow: Masumi, Cardano preprod** |
| **0:49–0:56** Traffic | Dashboard: impressions climb, verified signups tick up per supplier. DevNewsletter stays at 0. Bot-signal panel beside it | "Every signup is signed by NeoRack's feed. DevNewsletter promised 12 per 1,000 and delivers none." | **SIMULATED**: shop and signup events, no funds moved |
| **0:56–1:15** Verdicts | Time-cut card: "N min later", labelled. Pass card: TechBlog 7 paid, 1.75 bond back (about 3 s). Short of promise: CodePodcast 6 paid, 0.375 forfeited, 1.125 back (about 3 s). Then slow on DevNewsletter: "promised 12, delivered 0", stamp **Under gate**, 7 back to NeoRack, 1.75 bond forfeited. Last 4 s: the real refund tx opens in the Cardano explorer | "The Board checks signature, attribution and time window, and signs a verdict. Overpromise and you lose your bond. Deliver nothing and the money goes back." | **REAL**: award and bond settlements from the warm run, refund tx with explorer link. chip: **Dispute path: refund** |
| **1:15–1:25** Receipt | Receipt: NeoRack net −10.875 tUSDM for 14 verified signups, about 0.78 each. ROI leaderboard. Round-2 allocation: TechBlog 50 / CodePodcast 50 / DevNewsletter 0 | Tally: "6 escrows REAL on Cardano preprod. Bid fees and traffic SIMULATED. Suppliers are our own agents." Then: "Don't pay for impressions. Pay for outcomes." | round 2 **shown, not executed** (D2). Tally line is on screen too |

The remaining 5 s up to 1:30 is margin, not content.

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
- [ ] Video length rule (≤90 s vs two minutes) confirmed with the organizers
- [ ] ElevenLabs narration pre-generated (or captions fallback ready)
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
