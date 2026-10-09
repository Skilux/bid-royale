# `app/data/seeds/` — seeded data

## Purpose

Zero-network instant demo: discovery works before any API is wired.

## Contents

- `suppliers.json` — exists (#44). The seeded registry: the 4 supplier agents with `agentIdentifier`,
  `apiBaseUrl` and persona. Used when the live registry lookup fails or finds fewer than 4.
- `board-run.worked-example.json` — exists. One full simulated Board run of the worked
  example: `{ run, events }`, the `GET /api/run/:id` body plus the SSE frames. UI agents
  render from it without a server. See `lib/board/README.md`.

## Contents (plan, nothing else exists yet)

- `suppliers.json` (richer version) — 4 supplier agents (TechBlog, CodePodcast, DevNewsletter,
  GamingForum): registry entry, `api_base_url`, bid price, impressions,
  promised conversion, and serving cost per 1,000 as operator config.
- `tender.json` — the NeoRack tender: budget 200 tADA, gate 0.5%
  conversion, bond 25% of award, audience technical users.
- `canned-run.json` — recorded successful SSE transcript for
  `DEMO_MODE=canned`, holding the worked example (all tADA): TechBlog 70 /
  Pass, CodePodcast 60 / Short of promise (3.75 forfeited), DevNewsletter 70 /
  Under gate (70 back, 17.5 forfeited), GamingForum Lost bid. Recording date
  (open).

## Done when

The Wrapper UI renders tender → bids → dashboard from seeds alone, with
SIMULATED badges where appropriate.
