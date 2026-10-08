# `data/seeds/` — seeded data

## Purpose

Zero-network instant demo: discovery works before any API is wired.

## Contents (plan)

- `publishers.json` — 3 publisher service cards (TechBlog, CodePodcast,
  DevNewsletter): DID, capability, input/output schema, price, delivery window.
- `tender-schema.json` — campaign tender shape: budget, audience, outcome
  definition, performance gate, deadline.
- `policy-card.json` — signed policy card shape: "€6 escrowed per publisher.
  Release iff ≥5 verified outcomes per 1k impressions within the window;
  otherwise the publisher authorizes a full refund."
- `canned-run.json` — recorded successful SSE transcript for
  `DEMO_MODE=canned` (recorded by Oct 7 evening).

## Done when

The playground renders tender → bids → dashboard from seeds alone, with
SIMULATED badges where appropriate.
