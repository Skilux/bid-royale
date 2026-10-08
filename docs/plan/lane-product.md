# Lane: Product (Danila)

## Goal

A judge opens one public URL and watches brief → tender → 4 bids → verified
signups per supplier → three verdicts → receipt in under 30 s. Every money
element carries a REAL, SIMULATED or PRE-RECORDED badge. `DEMO_MODE=canned`
replays a recorded successful run.

Build order follows `AGENTS.md` and PRD §12. This lane covers steps 1 to 4, 6
and 7. Step 5 (Masumi) is the Masumi lane.

## Checkpoints

Hours are drafts. Danila confirms them with Vladimir before the night starts.

| # | By | Checkpoint | Done when |
|---|---|---|---|
| 1 | 22:00 | Flags and stub adapter | `SIMULATE_PAYMENTS` and `DEMO_MODE` read from env. Stub settlement adapter returns SIMULATED receipts. `/api/health` route exists. |
| 2 | 23:00 | NeoRack signup feed | `app/lib/outcome-feed` emits signed signup events per supplier, with impression counts. DevNewsletter emits 0 verified signups. The shop key signs, `SHOP_SIGNING_KEY` generated locally. |
| 3 | 00:00 | Verifier | `app/lib/verifier` runs 3 deterministic checks: signature, attribution, time window. Output is verified counts per supplier. Bot signals never gate. |
| 4 | 00:30 | Wrapper UI shell | Static brief, dashboard and receipt screens in `app/`, with badges. Wired to the stub adapter at ~00:00 merge point. |
| 5 | 02:00 | Auction engine | Commit-reveal check, eligibility (promised per 1,000 ≥ 5), ranking by price per promised signup, budget fill with D11 (skip a bid that does not fit, continue). GamingForum rejected below the gate. |
| 6 | 03:00 | Supplier agents | 4 suppliers with `POST /tender-invite` and sealed bids. Each agent gets a persona template (TechBlog conservative, CodePodcast moderate, DevNewsletter aggressive over-promiser, GamingForum passive low-baller) plus context on when to bid. The LLM decides, with structured output validated by zod and quote bounds clamped per persona. Delivery stays scripted in the feed: TechBlog passes, CodePodcast falls short, DevNewsletter promises 12 and delivers 0, GamingForum bids 4. Rehearsal check: if a run misses the expected winners, pinned quotes take over. Win-chance formula (D12) is Vladimir's call. |
| 7 | 04:30 | Settlement beat and receipt | Board signs a verdict per supplier. The UI shows the three branches, ROI leaderboard and receipt (Consumer net -10.875 for 14 signups). Round 2 is shown, not executed. |
| 8 | 05:00 | Canned replay and backstop | One full successful run recorded. `DEMO_MODE=canned` replays it. |

## Cut order

From `docs/demo-runbook.md`, cut top-down: voiceover, then bot-signal panel and
round 2, then multi-seller discovery. Never cut real escrow txs with explorer
links, the under-30 s run, badges, the 2-minute video, honest limitations.
