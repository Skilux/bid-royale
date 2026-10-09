# Demo video script: "The Agentic Economy"

Draft, 9 Oct 2026. Three pillars, in this order: **Competitive, Guaranteed & fair, Traceable**.
Numbers are the default recording `final` (`run_c1f40522`, `app/data/canned/c1f40522-final.json`),
checked against `README.md`, `docs/demo-runbook.md` and `app/data/canned/index.js`.
Amounts are tADA (test ADA, no value), the spec ×10 (#24).

**Length:** about 85 s, under the 90 s cap. About 210 spoken words at 2.5 words per second.
**Screen:** the judge page replaying the recording, with the **PRE-RECORDED** badge visible the whole time.

## Script

### 0:00–0:11 · Hook

**Voiceover:** "We built an agentic economy that is competitive, guaranteed, fair, and traceable. Say NeoRack, a GPU cloud, wants to buy ads, and pay only for results: verified signups."

**On screen:** the three pillars as titles, one per beat of the line. Then the brief and the tender card: budget 200 tADA, gate 0.5% conversion, bond 25%.

### 0:11–0:34 · 1. Competitive

**Voiceover:** "One: competitive. NeoRack posts a request for proposals on our Tender Board, and publisher agents are found through the Masumi registry. Each agent decides its own offer: its price, and the conversion rate it promises. So what stops bots from flooding the board? Every bid costs a fee. GamingForum promises too little and is out. The best value per signup wins."

**On screen:**

- "Suppliers · found in the Masumi registry" with four cards.
- Each card shows its offer as the agent made it, with the agent's one-line reasoning if the UI shows it: TechBlog 0.5% for 65, CodePodcast 0.7% for 55, DevNewsletter 1% for 60, GamingForum 0.4% for 20. Commit hashes appear first, then the reveals.
- The 2 tADA bid fee on each card, **REAL**.
- GamingForum greys out (gate is 0.5%).
- The ranking: DevNewsletter 6.00, CodePodcast 7.86, TechBlog 13.00. The budget bar fills to 180 of 200.

### 0:34–0:52 · 2. Guaranteed & fair

**Voiceover:** "Two: guaranteed and fair. Any agent can promise a 100% conversion and deliver nothing. So how do we make lying expensive? Every winner locks a bond, a quarter of its award, in escrow. It gets the bond back only as far as it delivers."

**On screen:**

- DevNewsletter's card: "promises 1%". Hold for a beat.
- Escrow rows: awards 65 / 55 / 60 from NeoRack, bonds 16.25 / 13.75 / 15 from the winners, each with a **REAL** badge and a tx link.

### 0:52–1:16 · 3. Traceable

**Voiceover:** "Three: traceable. Every payment is a transaction on Cardano. When the campaign ends, the Board checks each signup automatically against NeoRack's signed records. Beat your promise: you're paid in full, bond back. Fall short: you're paid, but forfeit part of the bond, in proportion to the miss. Deliver nothing: NeoRack gets its money back, plus your bond. Here's that refund."

**On screen:**

- Signups tick up with a **SIMULATED** badge: TechBlog 8, CodePodcast 6, DevNewsletter 0.
- A label reads "13 min later".
- Verdict chips:
  - Pass, TechBlog: 0.8% vs 0.5% promised (about 3 s).
  - Short of promise, CodePodcast: 0.6% vs 0.7%, "1.96 of 13.75 bond forfeited" (about 4 s).
  - Hold on **Under gate**, DevNewsletter: 0% vs 1%.
- The refund slip: "60 back in my wallet".
- End on the refund tx in Cardanoscan: [`b4854bc3d6…`](https://preprod.cardanoscan.io/transaction/b4854bc3d603c1ceec700ea7ac5ccdb674c3c74a962459cdf2caf935f71a84da).

### 1:16–1:26 · Close

**Voiceover:** "NeoRack paid 103 test ADA for 14 verified signups. The shop and its signups are simulated, and every payment is real. Pay for outcomes, not impressions."

**On screen:** the final receipt: net −103.04 tADA, 7.36 per signup, 21 of 21 ledger rows **REAL**.
