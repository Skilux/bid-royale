# `app/data/seeds/` — seeded data

## Purpose

Zero-network instant demo: discovery works before any API is wired.

## Contents

- `board-run.worked-example.json` — exists. One full simulated Board run of the worked
  example: `{ run, events }`, the `GET /api/run/:id` body plus the SSE frames. UI agents
  render from it without a server. See `lib/board/README.md`.

## Contents (plan, nothing else exists yet)

- `suppliers.json` — 4 supplier agents (TechBlog, CodePodcast, DevNewsletter,
  GamingForum): registry entry, `api_base_url`, bid price, impressions,
  promised signups per 1,000, and serving cost per 1,000 as operator config.
- `tender.json` — the NeoRack tender: budget 20 tUSDM, gate 5 signups per
  1,000 impressions, bond 25% of award, audience technical users.
- `canned-run.json` — recorded successful SSE transcript for
  `DEMO_MODE=canned`, holding the worked example (all tUSDM): TechBlog 7 /
  Pass, CodePodcast 6 / Short of promise (0.375 forfeited), DevNewsletter 7 /
  Under gate (7 back, 1.75 forfeited), GamingForum Lost bid. Recording date
  (open).

## Done when

The Wrapper UI renders tender → bids → dashboard from seeds alone, with
SIMULATED badges where appropriate.
