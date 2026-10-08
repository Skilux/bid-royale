# Demo runbook

## The scenario (2:00 submission video)

**DRAFT.** The Notion storyboard page is blank; these beats come from the
Money Flow spec and may change. All amounts are tUSDM.

- **0:00–0:15** — the brief: "Budget 20 tUSDM, technical users, pay per
  verified signup." Tender published: gate 5 signups per 1,000, bond 25%.
- **0:15–0:40** — Board invites suppliers via the registry. 4 sealed bids
  (commit hashes) in. Reveal. GamingForum rejected below the gate. Ranking
  shown. 3 winners.
- **0:40–1:00** — lock: awards 7 + 6 + 7 and bonds 1.75 + 1.5 + 1.75 in
  Masumi escrow. REAL preprod tx links on screen.
- **1:00–1:20** — traffic serves; dashboard: impressions and verified signups
  per supplier. DevNewsletter stays at 0.
- **1:20–1:50** — verdicts and settlement: TechBlog **Pass**. CodePodcast
  **Short of promise**, 0.375 forfeited. DevNewsletter **Under gate**: 7 back,
  1.75 forfeited (the moment; real refund tx).
- **1:50–2:00** — receipt: Consumer -10.875 tUSDM for 14 verified signups,
  about 0.78 each. Closing line: "Don't pay for impressions. Pay for outcomes."

## Build order (night of Oct 8, 21:00 → 07:14)

1. NeoRack signup feed first (the heart) → 2. Wrapper UI shell (static) →
   3. verifier module → 4. Tender Board auction engine → 5. Masumi wiring
   **in parallel, early** (11 escrows; bid-fee locks at bid time, award and
   bond locks as soon as winners are picked) → 6. 4 Supplier agents
   (TechBlog, CodePodcast, DevNewsletter, GamingForum) → 7. settlement beat +
   leaderboard + receipt → 8. video cut.

## Pre-flight checklist (before Oct 8)

- [ ] Vercel project linked, env vars set, deploy green, URL opens on cellular
- [ ] Masumi API auth verified; Consumer, Supplier, Board and Validator
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
- [ ] OpenAI key works; Groq + Gemini keys tested
- [ ] `SIMULATE_PAYMENTS` and `DEMO_MODE=canned` flags working
- [ ] Full successful run recorded (video backstop) by Oct 7 evening
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
   badges, 2-min video, README honest-limitations section

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
