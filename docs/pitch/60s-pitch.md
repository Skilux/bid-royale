# 60 s pitch: talk track and Q&A cheat sheet

Issue #57. Danila speaks on 9 Oct 2026 (presentations 10:00, awards 11:30). Vladimir reviews the money lines (section 4). Danila approves the talk track.

Numbers are the one recorded run `run_c1f40522` (#45, results comment, 9 Oct 2026): awards 65 + 55 + 60 = 180, bonds 16.25 + 13.75 + 15 = 45, 4 bid fees of 2 tADA, Consumer net -105 tADA for 14 verified signups (7.50 each). The net counts only moved money: 180 locked, 60 refunded, 15 forfeit received. The 1.964286 tADA forfeit from CodePodcast was never sent (#62) and is not counted. The worked example in `app/data/seeds/board-run.worked-example.json` (70 + 60 + 70, net -108.75) is no longer used here.

Open points before speaking:

- The recorded receipt was built before the #62 fix and counts the unsent 1.964286 as returned. If it shows on screen, it reads net -103.04 (7.36 per signup), not -105. Say -105 only with the arithmetic on screen, or recompute the receipt first.
- The 15 tADA DevNewsletter forfeit has a tx hash (`83c3fa9dcb…`) but the node still reported `Pending` at collection time. Not checked: whether it has confirmed on chain.
- Network fees: not measured in #45. Say nothing about them.
- Refund path A2 (supplier never submits) was not exercised in #45.

## 1. Talk track (about 60 s, 145 spoken words)

Pace: 2.5 words per second. Screen: the judge URL Run (canned, under 30 s, badged PRE-RECORDED) or the video, and the money flow dashboard. No slides needed.

**0 to 10 s. Hook and problem (23 words)**

> Advertisers pay for impressions and hope for customers. NeoRack, a GPU cloud, wants technical users, so its agent pays only for verified signups.

On screen: the brief, then the tender card (budget 200 tADA, gate 5 per 1,000, bond 25%).

**10 to 22 s. Mechanism (27 words)**

> It posts a tender: 200 tADA. Four publisher agents from the Masumi registry send sealed bids. GamingForum promises less than the gate and is out. Three win.

On screen: registry lookup, four sealed bids, GamingForum greyed out, awards 65, 55 and 60.

**22 to 42 s. Demo moment and money proof (50 words)**

> Awards, bonds and bid fees lock in Masumi escrow on Cardano preprod. Real transactions. The Tender Board then counts only signed, attributed signups. DevNewsletter promised 10 per thousand and delivered zero. NeoRack's 60 tADA came back in 5.7 minutes, and the 15 bond is forfeited. That refund is this transaction.

On screen: ten escrow rows with explorer links, then the Under gate stamp on DevNewsletter, then the refund tx open in the Cardano explorer (hero moment, hold it): `https://preprod.cardanoscan.io/transaction/b4854bc3d603c1ceec700ea7ac5ccdb674c3c74a962459cdf2caf935f71a84da`. Every REAL payout was on chain 17 min after settlement start. Optional line if there is time, not counted in the words: "All paid out in 17 minutes."

**42 to 52 s. Honest limitation (31 words)**

> What is simulated: the shop and its signups. The suppliers are our own agents. The Board is a trust assumption. We built no wallets, no escrow contracts. Masumi is the rails.

On screen: the tally line and the SIMULATED badges. Say "this is a recording of a real run" if the judge URL replay is on screen.

**52 to 60 s. Close (14 words)**

> Net: 105 tADA for 14 verified signups. Don't pay for impressions. Pay for outcomes.

On screen: net -105 tADA, 7.50 per signup, with the line "180 locked, 75 came back (60 refund, 15 forfeit)".

Total 145 words (23 + 27 + 50 + 31 + 14). Not timed aloud yet: Danila reads it once with a stopwatch and cuts a sentence if it runs past 60 s. First cut: "Real transactions." Second cut: "in 5.7 minutes".

Rules for delivery:

- Say "tADA" as "test ADA" once if a judge looks lost. It has no value.
- Say "simulated" in the same breath as shop and signups. Do not move it to the end.
- If the live Run is on screen instead of the replay, drop "this is a recording".

## 2. Short versions

**One line (19 words)**

> NeoRack's agent runs a sealed-bid auction for its ad budget and pays only for verified signups, held in escrow.

**20 s version (57 words)**

> NeoRack, a GPU cloud, pays only for verified signups. Four publisher agents bid in a sealed auction. Awards and bonds sit in Masumi escrow on Cardano preprod. A deterministic verifier counts signups, the Board signs a verdict, and a publisher that delivers nothing refunds NeoRack. Shop and traffic are simulated. Don't pay for impressions. Pay for outcomes.

## 3. Q&A cheat sheet

Answers are 1 to 3 sentences. Evidence is from the repo docs and the #45 results comment unless marked.

**1. Why not just a DSP or an ad network?**
A DSP sells impressions and the buyer carries the delivery risk. Here suppliers promise signups per 1,000 impressions in a sealed bid, post a 25% bond, and get paid against verified signups. We are not building a generalized DSP: the demo is the allocate, verify, settle loop.

**2. What is real and what is simulated?**
Real: Masumi escrows on Cardano preprod (3 awards, 3 bonds, 4 bid fees per run, all 10 locked REAL in the recorded run), their tx links, the registry identities, live registry discovery, the auction mechanism and the verdict logic. Simulated: the NeoRack shop, its signups and traffic, DevNewsletter's zero signups, and round 2. The judge URL replays one recorded run, badged PRE-RECORDED, with its real tx links.

**3. Why Masumi?**
Masumi is the rails: agent registry, payment service and escrow contract. We did not build wallets, escrow contracts, DIDs or an explorer, and the repo rules forbid it. Our product is the Board, the tender terms, the verifier and the verdicts on top.

**4. Why a Tender Board, and why should we trust its key?**
Someone has to run the auction and sign what counts. The Board is a trust assumption and we say so: escrows cannot split, so it holds bonds and forwards forfeits as plain transfers from its treasury, only for a Board-signed verdict. The verdict is deterministic code with no LLM, signed with an Ed25519 key, and every input and hash is stored in an evidence bundle anyone can recompute. The Board also verifies its own auction, so production needs an independent, paid validator agent.

**5. Why tADA and not a stablecoin?**
Test ADA on preprod has no value, which is right for a demo. Amounts are the spec times 10 because Masumi transfers have a 2 ADA minimum and small escrows risk min-UTxO errors.

**6. Why your own agents?**
We needed all four suppliers to behave on cue: one passes, one falls short, one over-promises and delivers zero, one bids under the gate. The sealed-bid mechanism is what is demonstrated, and third-party settlement would use the Disputed path. In the recorded run the quotes came from LLM brains and the shop delivered scripted signups.

**7. What is the bond for?**
It makes an over-promise cost money. A supplier that falls short loses bond × (promised - delivered) ÷ promised, so CodePodcast (promised 7, delivered 6) loses 1.96 of its 13.75 tADA. In the recorded run that 1.96 transfer was refused because it is under the treasury's 2 tADA minimum (#62, fixed on `main` by rounding up to 2). A supplier under the gate loses the full bond and the award goes back, so a promise it cannot keep costs more than a lost auction.

**8. How do you handle bots?**
The verifier checks signature, attribution and time window. It does not check that a signup is a person. Bot signals (click bursts, datacenter ASNs) are dashboard context only and never change a verdict. Inferred from the verifier rules: a bot that completes a real signup would count, which is why production needs an independent validator.

**9. What if a supplier never submits? What is the refund path A2 status?**
The normal Under-gate refund is cooperative: NeoRack requests it and the supplier authorizes it. It took 5.7 min in the recorded run (5.9 min measured on 8 Oct). If the supplier never answers, the node refunds automatically after the submit-result deadline (path A2), measured at 27.8 min on 8 Oct (`docs/money-flow.md`). The recorded run #45 did not exercise A2, so say "measured once on 8 Oct", not "proven live". Note: `AGENTS.md` still calls A2 open until the D9 dry run, while `docs/money-flow.md` lists the 27.8 min measurement. Vladimir settles which line is current.

**10. What breaks at scale?**
Three things, from the docs. Settlement time: in the recorded run the slowest REAL step was the treasury transfers at 17.0 min after settlement start, after the early release at 13.0 min, set by the node's transition polling. Custody: one Masumi node holds every wallet and one Board key signs every verdict. Attribution: it is first-touch and the shop key must stay safe. Not checked: any load test.

**11. What does one run cost?**
In tADA, which has no value: in the recorded run NeoRack locked 180 in awards, winners locked 45 in bonds, bidders paid 8 in bid fees, and NeoRack's net was -105 (180 locked, 60 refunded, 15 forfeit received). The Board keeps the 8 tADA of bid fees as an anti-spam fee. Network fees: not measured in #45. Model cost for the supplier brains: not measured.

**12. What would you do next?**
An independent, paid validator agent instead of the Board verifying itself. Multi-touch attribution instead of first-touch. A real human check on signups, third-party suppliers settling through the Disputed path, and a measured full run on every change.

## 4. Money lines for Vladimir to check

Every sentence below states a money amount or flow. Please confirm each against the recorded run #45 (`run_c1f40522`) and Masumi behaviour. Mark any line to change in a comment on #57.

Talk track (section 1):

1. "It posts a tender: 200 tADA." Budget 200 is inferred from `docs/money-flow.md`, not stated in the #45 comment. Awards add up to 180.
2. "Awards, bonds and bid fees lock in Masumi escrow on Cardano preprod." #45: 10 locks REAL, 2.1 min.
3. "Real transactions."
4. "DevNewsletter promised 10 per thousand and delivered zero." #45: Under gate, "0 vs 10".
5. "NeoRack's 60 tADA came back in 5.7 minutes, and the 15 bond is forfeited." Refund `b4854bc3d6…` RefundWithdrawn at 5.7 min. Forfeit `83c3fa9dcb…`, node state `Pending`.
6. "That refund is this transaction." `b4854bc3d603c1ceec700ea7ac5ccdb674c3c74a962459cdf2caf935f71a84da`.
7. "We built no wallets, no escrow contracts."
8. "Net: 105 tADA for 14 verified signups." 8 + 6 + 0 = 14.
9. On screen: "budget 200 tADA, gate 5 per 1,000, bond 25%", "net -105 tADA, 7.50 per signup", "180 locked, 75 came back (60 refund, 15 forfeit)", "every REAL payout on chain 17 min after settlement start".

Short versions (section 2):

10. "NeoRack's agent runs a sealed-bid auction for its ad budget and pays only for verified signups, held in escrow."
11. "Awards and bonds sit in Masumi escrow on Cardano preprod."
12. "A deterministic verifier counts signups, the Board signs a verdict, and a publisher that delivers nothing refunds NeoRack."

Q&A (section 3):

13. Q1: "Suppliers promise signups per 1,000 impressions in a sealed bid, post a 25% bond, and get paid against verified signups."
14. Q2: "Real: Masumi escrows on Cardano preprod (3 awards, 3 bonds, 4 bid fees per run, all 10 locked REAL in the recorded run)."
15. Q2: "Live registry discovery." #45: discovery `live`, 4 agents `RegistrationConfirmed`.
16. Q3: "We did not build wallets, escrow contracts, DIDs or an explorer."
17. Q4: "Escrows cannot split, so it holds bonds and forwards forfeits as plain transfers from its treasury, only for a Board-signed verdict."
18. Q5: "Amounts are the spec times 10 because Masumi transfers have a 2 ADA minimum and small escrows risk min-UTxO errors."
19. Q7: "CodePodcast (promised 7, delivered 6) loses 1.96 of its 13.75 tADA", and "that 1.96 transfer was refused because it is under the treasury's 2 tADA minimum (#62, fixed on `main` by rounding up to 2)."
20. Q7: "A supplier under the gate loses the full bond and the award goes back."
21. Q9: "It took 5.7 min in the recorded run (5.9 min measured on 8 Oct)."
22. Q9: "If the supplier never answers, the node refunds automatically after the submit-result deadline (path A2), measured at 27.8 min on 8 Oct." A2 not exercised in #45.
23. Q10: "The slowest REAL step was the treasury transfers at 17.0 min, after the early release at 13.0 min."
24. Q11: "NeoRack locked 180 in awards, winners locked 45 in bonds, bidders paid 8 in bid fees, and NeoRack's net was -105."
25. Q11: "The Board keeps the 8 tADA of bid fees as an anti-spam fee." #45: all 4 collected by the Board (`Withdrawn`), 13.0 to 15.1 min.
26. Q11: "Network fees: not measured in #45."

Consumer net, from the #45 ledger, REAL rows only (arithmetic): awards locked 65 + 55 + 60 = 180. Bonds locked 16.25 + 13.75 + 15 = 45. Bid fees paid by suppliers, not by the Consumer. Back to the Consumer: refund 60 (`b4854bc3d6…`) + DevNewsletter forfeit 15 (`83c3fa9dcb…`, `Pending` at the node) = 75. The CodePodcast forfeit 1.964286 never moved (PENDING, BelowMinimum) and is left out. Consumer net = -180 + 75 = -105. Verified signups 8 + 6 + 0 = 14. Cost per signup 105 ÷ 14 = 7.50. If the 15 forfeit has not confirmed, the net is -120. With the unsent 1.964286 counted, the old receipt reads -103.04, which is wrong.

Two points where Vladimir's call matters:

- The README proof table now holds the REAL hashes from #45 (#55). The 15 forfeit and the 11.785714 CodePodcast bond remainder have a hash but node state `Pending`. Confirm they settled before Danila says "forfeited" without a caveat.
- The early release passes through `Disputed` on-chain before payout. The explorer shows it. If a judge opens the tx, Danila says "that is the contract's buyer-approved release, not a real dispute."
