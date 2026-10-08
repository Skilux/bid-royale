# Concept brief: visual directions for the Wrapper UI

Shared brief for every direction concept in this folder (issue #15). Each
concept is one self-contained HTML file that plays the whole demo storyline,
so directions can be compared on the same content.

## Context

- Event: From Dusk Till Dawn #01, Agents 0.0.7 hackathon, Prague, 8–9 Oct 2026.
  Code freeze Fri 9 Oct 07:14. Slogan of the event: "The sun is the deadline."
- Hackathon HQ look (hq.agents007.ai): near-black `#0b0908`, cream `#eee6d8`,
  blood red `#cf352e` / hot red `#ed4b43`, amber `#e7a84b`, green `#72c99a`,
  Barlow Condensed for display, monospace for data, Georgia italic accents,
  blood-moon-over-Prague hero art. Easing `cubic-bezier(.22,1,.36,1)`.
  Reuse concepts, do not copy.
- Product: Ad Slot Auction. Agents run a sealed-bid auction for an ad
  budget, and the advertiser pays only for verified signups.
  Tagline: "Don't pay for impressions. Pay for outcomes."
- Rails: Masumi escrow on Cardano preprod. Currency tUSDM (test USDM).
- Judging: end-to-end 35%, track relevance 25%, technical 20%,
  originality 10%, honest limitations 10%. Track rule: "An agent completes a
  transaction scenario with a visible outcome. A simulated payment must be
  labelled."
- Build target: Next.js 16, Tailwind v4, Motion (motion.dev). Write the
  concept with CSS custom properties as tokens and plain CSS/JS animation
  that ports to Motion easily.

## Hard rules for every concept

1. One self-contained `.html` file. No JS libraries. Google Fonts via
   `<link>` is allowed, but the page must still look right with the fallback
   font stack.
2. Designed for a 1280×800 judge screen and a 16:9 video frame. Degrades
   cleanly to 390 px wide.
3. Auto-plays the full storyline in about 30 s, then stops on the receipt.
   Controls: play/pause, replay, a clickable step rail for the 7 scenes, a
   progress bar. Respect `prefers-reduced-motion` (jump to end states).
4. Every money element carries a badge: `REAL` (preprod tx + explorer link),
   `SIMULATED` ("simulated, no funds moved") or `PRE-RECORDED`. Use fake tx
   hashes, shown shortened like `8f3a…c21e`, linking to
   `https://preprod.cardanoscan.io/transaction/<64-hex>`.
5. Below the demo, a "design tokens" strip: palette swatches with hex and
   role, type specimens, motion specs (durations, easing), the 3 badges,
   the 4 verdict chips.
6. Use the exact numbers below. Use the exact verdict names.

## Storyline and data (all amounts tUSDM)

1. **Brief.** User NeoRack (a GPU neocloud) gives the brief: "Budget 20
   tUSDM, technical users, pay per verified signup." The NeoRack Consumer
   agent publishes the tender to the Tender Board. Terms: gate 5 verified
   signups per 1,000 impressions, bond 25% of award, bid fee 0.2.
2. **Sealed bids.** The Board invites 4 Supplier agents found in the Masumi
   registry: TechBlog, CodePodcast, DevNewsletter, GamingForum. Each sends a
   sealed bid: a commit hash `SHA-256(price, impressions, promised, salt)`,
   shown as 64-hex strings. Each pays a 0.2 bid fee (SIMULATED).
3. **Reveal and rank.** After close, suppliers reveal; the Board recomputes
   each hash and it matches.

   | Supplier | Impressions | Price | Promised per 1,000 | Price per promised signup | Result |
   |---|---|---|---|---|---|
   | DevNewsletter | 1,500 | 7 | 12 | 0.39 | Win, running total 7 |
   | CodePodcast | 1,000 | 6 | 8 | 0.75 | Win, running total 13 |
   | TechBlog | 1,000 | 7 | 7 | 1.00 | Win, running total 20, budget full |
   | GamingForum | 1,000 | 3 | 4 | 0.75 | **Lost bid**: below the gate of 5 |

4. **Lock.** Consumer locks 3 awards: TechBlog 7, CodePodcast 6,
   DevNewsletter 7 (total 20). Winners lock 3 bonds: 1.75, 1.5, 1.75
   (total 5). These 6 escrows are REAL with tx links. The 4 bid fees are
   SIMULATED. 10 escrows in total.
5. **Delivery.** Impressions count up to 1,000 / 1,000 / 1,500. The NeoRack
   signup feed (SIMULATED) streams signed signup events. The verifier runs
   3 deterministic checks per event: signature, attribution, time window.
   Verified signups count up: TechBlog 0→8, CodePodcast 0→6, DevNewsletter
   stays at 0 (build tension here).
6. **Verdicts.** The Board signs one verdict per supplier.
   - TechBlog **Pass** (delivered 8 vs promised 7): 7 paid, bond 1.75 returned.
   - CodePodcast **Short of promise** (6 vs 8, gate met): 6 paid, forfeit
     1.5 × (8 − 6) ÷ 8 = 0.375, bond remainder 1.125 returned.
   - DevNewsletter **Under gate** (0 vs 12): award 7 refunded to the
     Consumer, full bond 1.75 forfeited to the Consumer. **This is the hero
     moment of the demo: dramatise the money flowing back.**
   - Each settlement has a REAL tx link.
7. **Receipt.** Consumer net **−10.875 tUSDM for 14 verified signups,
   about 0.78 per signup**. Breakdown: −20 escrowed, +7 refund, +2.125
   forfeits (1.75 + 0.375). Supplier nets: TechBlog +6.8, CodePodcast
   +5.425, DevNewsletter −1.95, GamingForum −0.2. Board +0.8 in bid fees.
   ROI leaderboard. Round 2 allocation (illustrative, shown, not executed):
   TechBlog 50%, CodePodcast 50%, DevNewsletter 0%. Closing line:
   "Don't pay for impressions. Pay for outcomes."

## Verdict vocabulary

- Pass, Short of promise, Under gate, Lost bid. Nothing else.
- Badges: REAL, SIMULATED, PRE-RECORDED. Nothing else.
