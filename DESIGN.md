# DESIGN.md: visual system for Ad Slot Auction

> **9 Oct 2026: Danila picked the money flow dashboard concept (`docs/design/dashboard/money-flow.html`), dark, for `/dashboard` and `/`. Direction E is superseded for these pages (#9, #43). The dark tokens are scoped to `.flow` in `app/app/globals.css`; `/receipt` keeps the light tokens below.**

> **Status: direction picked, 8 Oct 2026.** Danila picked Direction E, Money
> flow, as a guided walkthrough. Reference build:
> `docs/design/concepts/e-money-flow.html`. Issue #15. Feeds #6, #7, #8, #9.

One visual system for three surfaces: the Wrapper UI judges click, the 2:00
video, and the 10:00 presentation. Build it once, in the app. The video is a
screen recording of the app. The slides reuse the app's tokens and diagram.

## 1. The idea

The product is the system diagram, alive. Every party is a node, every
payment is a token travelling an edge, and every token carries its badge. The
run is a narrative in 12 steps. Each step moves only its own money, then holds
still with a card that says what happened, why it matters, and which
transactions ran. The last step is the receipt, with a ledger for every agent.

## 2. What judges must see

1. A brief becomes a tender.
2. Four sealed bids arrive, then reveal. GamingForum loses below the gate.
3. Money locks in Masumi escrow, with REAL tx links.
4. Only verified signups count. DevNewsletter stays at 0.
5. Three verdicts. The Under-gate refund is the hero moment, the only red path.
6. Receipt: −105 tADA for 14 verified signups, 7.50 each (recorded run
   `run_c1f40522`), plus a ledger per agent.

## 3. Pacing: two modes

| Mode | How | Who it is for |
|---|---|---|
| Walkthrough (default) | Manual. Next, Back, ← →, step bar. Speed Slow / Normal / Fast. Optional Autoplay advances 5 s after the last token lands. | Judges clicking through, the live pitch |
| 30 s run | One button: 2.2× speed, autoplay, 0.35 s pause per step. Reaches the receipt in about 24 s. | The never-cut "<30 s Wrapper UI run" rule, the video |

## 4. Stack

| Layer | Pick | Why |
|---|---|---|
| Framework | Next.js 16 App Router, plain JS | Already scaffolded in `app/`, deployed on Vercel |
| Styling | Tailwind CSS v4, tokens in `app/app/globals.css` `@theme` | Tokens defined once, used as classes everywhere |
| Motion | `motion` (motion.dev), `motion/react` | `AnimatePresence` swaps step cards, `animate()` tweens balances |
| Diagram | Hand-written SVG paths + absolutely positioned HTML nodes | Tokens follow `getPointAtLength`, no graph library needed |
| Fonts | `next/font/google`, self-hosted at build | No runtime Google request on venue wifi |
| Component library | none | About 15 components, faster to hand-build than to theme |

Rule: no other UI dependency without asking in the issue.

## 5. Tokens

Defined once in `globals.css` under `@theme`. Never hardcode a hex in a component.

| Token | Value | Role |
|---|---|---|
| `--color-paper` | `#f5f3ee` | Background, with a 22 px dot grid |
| `--color-card` | `#ffffff` | Nodes, panels |
| `--color-ink` | `#14130f` | Text, receipt hero card |
| `--color-ink-2` | `#4a4740` | Secondary text, message tokens |
| `--color-ink-3` | `#8a867c` | Labels, Lost bid |
| `--color-line` | `#e2ded4` | Edges at rest, hairlines |
| `--color-cobalt` | `#2b4dff` | Brand, money in motion, current step |
| `--color-pass` | `#14935a` | Verified signups, Pass, REAL, money in |
| `--color-short` | `#c98300` | Short of promise, SIMULATED |
| `--color-under` | `#e0321c` | Under gate, refund path, money out |
| `--font-display` | Space Grotesk 700, tight tracking | Titles, names, big numbers |
| `--font-body` | Inter 400/500 | Card text |
| `--font-mono` | IBM Plex Mono, tabular numerals | Amounts, hashes, tx links, labels |
| `--ease-ui` | `cubic-bezier(.22,1,.36,1)` | Cards, panels, node rings |
| token travel | cubic in-out, 1.8 s per edge at Normal | Money and message tokens |

Semantic color is fixed: green means verified, REAL or money in. Amber
means Short of promise or SIMULATED. Red means Under gate or money going back.
Never use red for decoration.

## 6. Badges (hard rule, AGENTS.md)

| Badge | Look | Use |
|---|---|---|
| `REAL` | Green tint, outline, plus `tx 8f3a…c21e ↗` to `preprod.cardanoscan.io` | Award, bond, settlement, refund txs |
| `SIMULATED` | Amber dashed outline | Bid fees until real, signup feed, round 2 |
| `PRE-RECORDED` | Solid ink | Top bar when `DEMO_MODE=canned` |
| `Message` | Grey outline | Tokens that carry no money: brief, tender, invite, commit, reveal |

A money element without a badge is a bug. Badges sit in the layout, never in
a tooltip.

## 7. Verdicts

Four states, nothing else: **Pass** (green), **Short of promise** (amber),
**Under gate** (solid red), **Lost bid** (grey, struck through). Exact words
from `GLOSSARY.md`.

## 8. Screen layout (1280×800 judge screen, 16:9 video)

```text
┌ top bar: logo · tender meta · speed · Autoplay · 30 s run · run-mode badge ┐
├──────────────────────────────── 780 px ─┬──────────── side panel ──────────┤
│ feed ─┐                    TechBlog     │ step bar (12)                    │
│ User  │   Tender Board ──  CodePodcast  │ step card: title, what, why,     │
│   │   │        │           DevNewsletter│   panel (ranking / counts /      │
│ Consumer ── Masumi escrow  GamingForum  │   formula), transactions list    │
│                                         │ who holds what (sticky, 4 × 2)   │
│ hint: click any agent for its ledger    │ Back · Replay step · Next →      │
└─────────────────────────────────────────┴──────────────────────────────────┘
```

Step 12 replaces the side panel with the receipt: agent tabs, a dark hero
card with the net, a ledger table (step, what, counterparty, tx, amount,
running balance), round 2 for the Consumer, the tagline. Clicking any node
at any step opens the same ledger, up to that step. Below 1100 px the
diagram scales down and the panel stacks under it.

## 9. The 12 steps

| # | Step | Moves |
|---|---|---|
| 1 | Brief | User → Consumer, message |
| 2 | Tender | Consumer → Board, message |
| 3 | Invite | Board → 4 suppliers, messages |
| 4 | Sealed bids | 4 commits + 4 × 2 tADA bid fees, REAL |
| 5 | Reveal | 4 reveals, ranking table, GamingForum Lost bid |
| 6 | Awards | Consumer → escrow 65 + 55 + 60, REAL |
| 7 | Bonds | Winners → escrow 16.25 + 13.75 + 15, REAL |
| 8 | Delivery | 14 signed signups feed → Board, counters, DevNewsletter 0 |
| 9 | Pass | Escrow → TechBlog 65 + 16.25 bond back |
| 10 | Short of promise | Escrow → CodePodcast 55, bond 13.75 → Board → 11.79 back, forfeit 1.96 (13.75 × (7 − 6) ÷ 7), formula shown. The forfeit is under the 2 tADA minimum, so it is PENDING and not counted (#62) |
| 11 | Under gate | Escrow → Consumer 60 refund (red, 2.8 s), bond 15 → Board → Consumer |
| 12 | Receipt | Ledger per agent |

## 10. Components

| Component | States | Issue |
|---|---|---|
| `Badge`, `TxLink` | REAL, SIMULATED, PRE-RECORDED, Message | #8 |
| `VerdictChip` | Pass, Short of promise, Under gate, Lost bid, Escrowed | #9 |
| `FlowCanvas` (SVG edges + token layer + pins) | edge rest, used, live, hero | #8 |
| `AgentNode` | idle, focus, landed, selected, off | #8 |
| `EscrowNode` | 10 slots, REAL / SIMULATED fill | #8 |
| `StepBar`, `StepControls` | done, current, autoplay progress on Next | #8 |
| `StepCard` | what, why, panel, transaction rows (wait, moving, done) | #8 |
| `HoldingsStrip` | balances tween, row flash on change | #8 |
| `AgentLedger` / `ReceiptPanel` | per agent, up to step N or final | #9 |

## 11. Data contract for the UI

The UI renders `state = reduce(flows arrived by step N and local time t)`.
Each flow is `{ step, from, to, label, kind, at, amount, badge, tx }`.
Live SSE from the Board (#11) and canned replay feed the same renderer, so
`DEMO_MODE=canned` costs nothing extra. Balances are always computed from
flows, never stored, and the "Sum of all" cell must read 0.000.

## 12. Video (2:00) and presentation

- **Video:** record the 30 s run at 1920×1080, 60 fps, then cut in the
  Walkthrough cards for steps 4, 8 and 11 as holds. Captions burned in.
  Storyboard: issue #5.
- **Presentation:** title slide on paper with the logo, then the live
  walkthrough itself is the mechanism explanation, then the receipt, then the
  honest-limitations slide in the same tokens.
- **Pitch-slide rule:** the mechanism slide is the money-flow diagram, a
  1920×1080 still from the app, never redrawn in a slide tool. Use the step 11
  frame, with the red Under-gate refund edge and the Consumer glow. If the app
  diagram changes, re-export the still.

## 13. Concepts explored

All five directions use the same storyline and numbers. Open any file in a
browser. Brief: `docs/design/concepts/BRIEF.md`. Screenshots:
`docs/design/concepts/shots/`.

| File | Direction | Status |
|---|---|---|
| `e-money-flow.html` | Light live system diagram, 12-step walkthrough | **Picked** |
| `a-dusk-till-dawn.html` | Event-native: blood moon to sunrise, one board with 4 lanes | Explored |
| `b-order-book.html` | Exchange terminal, decrypting hashes, trading-halt banner | Explored |
| `c-auction-house.html` | Light editorial auction catalogue, wax seals, ink stamps | Explored |
| `d-bid-royale.html` | Esports broadcast, fighter cards, shields and K.O. | Explored |
