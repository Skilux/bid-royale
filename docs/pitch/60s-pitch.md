# 60 s pitch: talk track and Q&A cheat sheet

Issue #57. Danila speaks on 9 Oct 2026 (presentations 10:00, awards 11:30). Vladimir reviews the money lines (section 4). Danila approves the talk track.

Numbers are the worked example in `app/data/seeds/board-run.worked-example.json` and the receipt: awards 70 + 60 + 70, bonds 17.5 + 15 + 17.5, Consumer net -108.75 tADA for 14 verified signups (7.77 each). If the recorded run #45 differs, swap in its numbers everywhere they appear.

Placeholders to fill from run #45 (never invent them):

- `[TX LINK FROM #45]`: the Under-gate refund tx on `preprod.cardanoscan.io`.
- `[SETTLEMENT TIME FROM #45]`: measured time of the full settlement in the recorded run.
- `[NETWORK FEES FROM #45]`: Cardano and Masumi fees paid in the recorded run.
- `[NET FROM #45]` and `[SIGNUPS FROM #45]`: only if #45 differs from -108.75 and 14.

## 1. Talk track (about 60 s, 144 spoken words)

Pace: 2.5 words per second. Placeholders in square brackets are not spoken. Screen: the judge URL Run (canned, under 30 s, badged PRE-RECORDED) or the video, and the money flow dashboard. No slides needed.

**0 to 10 s. Hook and problem (23 words)**

> Advertisers pay for impressions and hope for customers. NeoRack, a GPU cloud, wants technical users, so its agent pays only for verified signups.

On screen: the brief, then the tender card (budget 200 tADA, gate 5 per 1,000, bond 25%).

**10 to 22 s. Mechanism (27 words)**

> It posts a tender: 200 tADA. Four publisher agents from the Masumi registry send sealed bids. GamingForum promises less than the gate and is out. Three win.

On screen: registry lookup, four sealed bids, GamingForum greyed out, budget bar fills to 200.

**22 to 42 s. Demo moment and money proof (49 words)**

> Every award and bond locks in Masumi escrow on Cardano preprod. Real transactions. The Tender Board then counts only signed, attributed signups. DevNewsletter promised 12 per thousand and delivered zero. NeoRack's 70 tADA comes back, and the 17.5 bond is forfeited. That refund is this transaction. [TX LINK FROM #45] Settled in [SETTLEMENT TIME FROM #45].

On screen: six escrow rows with explorer links, then the Under gate stamp on DevNewsletter, then the refund tx open in the Cardano explorer (hero moment, hold it).

**42 to 52 s. Honest limitation (31 words)**

> What is simulated: the shop and its signups. The suppliers are our own agents. The Board is a trust assumption. We built no wallets, no escrow contracts. Masumi is the rails.

On screen: the tally line and the SIMULATED badges. Say "this is a recording of a real run" if the judge URL replay is on screen.

**52 to 60 s. Close (14 words)**

> Net: 108.75 tADA for 14 verified signups. Don't pay for impressions. Pay for outcomes.

On screen: receipt, net -108.75 tADA, about 7.77 per signup.

Total 144 words. Not timed aloud yet: Danila reads it once with a stopwatch and cuts a sentence if it runs past 60 s. First cut: "Real transactions." Second cut: "Settled in [SETTLEMENT TIME FROM #45]."

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

Answers are 1 to 3 sentences. Evidence is from the repo docs unless marked.

**1. Why not just a DSP or an ad network?**
A DSP sells impressions and the buyer carries the delivery risk. Here suppliers promise signups per 1,000 impressions in a sealed bid, post a 25% bond, and get paid against verified signups. We are not building a generalized DSP: the demo is the allocate, verify, settle loop.

**2. What is real and what is simulated?**
Real: Masumi escrows on Cardano preprod (3 awards, 3 bonds, 4 bid fees per run), their tx links, the registry identities, the auction mechanism and the verdict logic. Simulated: the NeoRack shop, its signups and traffic, DevNewsletter's zero signups, and round 2. Fallback: bid fees can be flagged SIMULATED if their escrows stall, and the badge says so. The judge URL replays one recorded run, badged PRE-RECORDED, with its real tx links.

**3. Why Masumi?**
Masumi is the rails: agent registry, payment service and escrow contract. We did not build wallets, escrow contracts, DIDs or an explorer, and the repo rules forbid it. Our product is the Board, the tender terms, the verifier and the verdicts on top.

**4. Why a Tender Board, and why should we trust its key?**
Someone has to run the auction and sign what counts. The Board is a trust assumption and we say so: escrows cannot split, so it holds bonds and forwards forfeits as plain transfers from its treasury, only for a Board-signed verdict. The verdict is deterministic code with no LLM, signed with an Ed25519 key, and every input and hash is stored in an evidence bundle anyone can recompute. The Board also verifies its own auction, so production needs an independent, paid validator agent.

**5. Why tADA and not a stablecoin?**
Test ADA on preprod has no value, which is right for a demo. Amounts are the spec times 10 because Masumi transfers have a 2 ADA minimum and small escrows risk min-UTxO errors.

**6. Why your own agents?**
We needed all four suppliers to behave on cue: one passes, one falls short, one over-promises and delivers zero, one bids under the gate. Quotes are scripted. The sealed-bid mechanism is what is demonstrated, and third-party settlement would use the Disputed path.

**7. What is the bond for?**
It makes an over-promise cost money. A supplier that falls short loses bond × (promised - delivered) ÷ promised, so CodePodcast loses 3.75 of 15 tADA. A supplier under the gate loses the full bond and the award goes back, so a promise it cannot keep costs more than a lost auction.

**8. How do you handle bots?**
The verifier checks signature, attribution and time window. It does not check that a signup is a person. Bot signals (click bursts, datacenter ASNs) are dashboard context only and never change a verdict. Inferred from the verifier rules: a bot that completes a real signup would count, which is why production needs an independent validator.

**9. What if a supplier never submits? What is the refund path A2 status?**
The normal Under-gate refund is cooperative: NeoRack requests it and the supplier authorizes it, measured at 5.9 min on preprod on 8 Oct. If the supplier never answers, the node refunds automatically after the submit-result deadline (path A2), measured at 27.8 min in the same test (`docs/money-flow.md`). The recorded run #45 uses the cooperative path. [CONFIRM A2 IN #45 OR D9 DRY RUN BEFORE CLAIMING IT LIVE.] Note: `AGENTS.md` still calls A2 open until the D9 dry run, while `docs/money-flow.md` lists the 27.8 min measurement. Vladimir settles which line is current.

**10. What breaks at scale?**
Three things, from the docs. Settlement time: the slowest path is the early release at about 13 min per run on preprod, set by the node's transition polling. Custody: one Masumi node holds every wallet and one Board key signs every verdict. Attribution: it is first-touch and the shop key must stay safe. Not checked: any load test.

**11. What does one run cost?**
In tADA, which has no value: NeoRack locks 200 in awards, winners lock 50 in bonds, bidders pay 8 in bid fees, and the worked example nets NeoRack -108.75. The Board keeps the 8 tADA of bid fees as an anti-spam fee. Network fees: [NETWORK FEES FROM #45]. Model cost for the supplier brains: not measured.

**12. What would you do next?**
An independent, paid validator agent instead of the Board verifying itself. Multi-touch attribution instead of first-touch. A real human check on signups, third-party suppliers settling through the Disputed path, and a measured full run on every change.

## 4. Money lines for Vladimir to check

Every sentence below states a money amount or flow. Please confirm each against the recorded run #45 and Masumi behaviour. Mark any line to change in a comment on #57.

Talk track (section 1):

1. "It posts a tender: 200 tADA."
2. "Every award and bond locks in Masumi escrow on Cardano preprod."
3. "Real transactions."
4. "DevNewsletter promised 12 per thousand and delivered zero."
5. "NeoRack's 70 tADA comes back, and the 17.5 bond is forfeited."
6. "That refund is this transaction. [TX LINK FROM #45] Settled in [SETTLEMENT TIME FROM #45]."
7. "We built no wallets, no escrow contracts."
8. "Net: 108.75 tADA for 14 verified signups."
9. On screen: "budget 200 tADA, gate 5 per 1,000, bond 25%", "net -108.75 tADA, about 7.77 per signup".

Short versions (section 2):

10. "NeoRack's agent runs a sealed-bid auction for its ad budget and pays only for verified signups, held in escrow."
11. "Awards and bonds sit in Masumi escrow on Cardano preprod."
12. "A deterministic verifier counts signups, the Board signs a verdict, and a publisher that delivers nothing refunds NeoRack."

Q&A (section 3):

13. Q1: "Suppliers promise signups per 1,000 impressions in a sealed bid, post a 25% bond, and get paid against verified signups."
14. Q2: "Real: Masumi escrows on Cardano preprod (3 awards, 3 bonds, 4 bid fees per run), their tx links, the registry identities, the auction mechanism and the verdict logic."
15. Q2: "Bid fees can be flagged SIMULATED if their escrows stall, and the badge says so."
16. Q3: "We did not build wallets, escrow contracts, DIDs or an explorer."
17. Q4: "Escrows cannot split, so it holds bonds and forwards forfeits as plain transfers from its treasury, only for a Board-signed verdict."
18. Q5: "Amounts are the spec times 10 because Masumi transfers have a 2 ADA minimum and small escrows risk min-UTxO errors."
19. Q7: "A supplier that falls short loses bond × (promised - delivered) ÷ promised, so CodePodcast loses 3.75 of 15 tADA."
20. Q7: "A supplier under the gate loses the full bond and the award goes back."
21. Q9: "The normal Under-gate refund is cooperative: NeoRack requests it and the supplier authorizes it, measured at 5.9 min on preprod on 8 Oct."
22. Q9: "If the supplier never answers, the node refunds automatically after the submit-result deadline (path A2), measured at 27.8 min in the same test."
23. Q10: "The slowest path is the early release at about 13 min per run on preprod."
24. Q11: "NeoRack locks 200 in awards, winners lock 50 in bonds, bidders pay 8 in bid fees, and the worked example nets NeoRack -108.75."
25. Q11: "The Board keeps the 8 tADA of bid fees as an anti-spam fee."
26. Q11: "Network fees: [NETWORK FEES FROM #45]."

Worked-example arithmetic, from `docs/money-flow.md` and the seed file (confirmed): awards 70 + 60 + 70 = 200. Bonds 17.5 + 15 + 17.5 = 50. CodePodcast forfeit 15 × (8 - 6) ÷ 8 = 3.75. Consumer net -200 + 70 + 3.75 + 17.5 = -108.75. Cost per signup 108.75 ÷ 14 = 7.77.

Two points where Vladimir's call matters:

- "Every award and bond locks in Masumi escrow" is true only once the tx hashes exist. The README proof table is still TBD. Do not say "real" in the pitch until #45 fills it.
- The early release passes through `Disputed` on-chain before payout. The explorer shows it. If a judge opens the tx, Danila says "that is the contract's buyer-approved release, not a real dispute."
