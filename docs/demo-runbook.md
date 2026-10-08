# Demo runbook

## The scenario (2:00 submission video)

- **0:00–0:15** — the brief: "€20, tech audience, pay for results." Tender
  published, policy card signed.
- **0:15–0:35** — tender live on our board; 3 sealed bids in; winners picked;
  €18 locked (3 escrows, tx links on screen).
- **0:35–1:05** — traffic serves; dashboard: impressions climb, verified
  outcomes tick up per publisher — DevNewsletter's counter stays at 0.
- **1:05–1:30** — settlement: TechBlog ✅ €6 released, CodePodcast ✅ €6
  released, DevNewsletter ❌ bid aggressively, delivered 0 → policy fires →
  **€6 refunded** (the moment).
- **1:30–2:00** — receipt: €12 spent / €6 refunded, ROI leaderboard, round-2
  allocation. Closing line: "Don't pay for impressions. Pay for outcomes."

## Build order (night of Oct 8, 21:00 → 07:14)

1. Outcome feed first (the heart) → 2. UI shell (static) → 3. verifier →
   4. allocation engine → 5. Masumi wiring **in parallel, early** (escrow
   locks as soon as bids exist) → 6. 3 publisher agents (2 clean, 1 bot-flood)
   → 7. settlement beat + leaderboard + receipt → 8. video cut.

## Pre-flight checklist (before Oct 8)

- [ ] Vercel project linked, env vars set, deploy green, URL opens on cellular
- [ ] Masumi API auth verified; buyer + publisher wallets funded (tUSDM + ADA)
- [ ] 3 publisher agents registered in the registry
- [ ] **One real lock → release dry run on preprod, tx hash saved** (go/no-go)
- [ ] OpenAI key works; Groq + Gemini keys tested
- [ ] `SIMULATE_PAYMENTS` and `DEMO_MODE=canned` flags working
- [ ] Full successful run recorded (video backstop) by Oct 7 evening
- [ ] ElevenLabs narration pre-generated (or captions fallback ready)
- [ ] **Oct 7 evening check:** Masumi preprod reliable → primary. If not,
  lean on the labelled simulated ledger + canned replay (no second rail —
  Masumi-only by team decision)

## Cut order (agreed in advance, cut top-down)

1. ElevenLabs voiceover → captions + text narrative
2. Arbiter autonomy → scripted dispute verdict (keep the visible refund)
3. Multi-seller discovery → seeded registry (discovery UI stays)
4. **Never cut:** real escrow + refund tx with explorer links, <30s playground,
   REAL/SIMULATED badges, 2-min video, README honest-limitations section

## At the venue (Oct 8)

- 16:00 check-in — test playground URL from venue wifi AND phone cellular
- 17:30 kickoff — ask the Masumi mentor: integration path for 10h?
  What breaks most often? Rate limits? (full question list in workspace
  `09-checklist-and-questions.md`)
- 18:25–21:00 planning + food — lock scope, assign lanes, agree cut order
