# `lib/outcome-feed/` — simulated shop (the heart — build first)

## Purpose

The source of truth for the whole scenario. A simulated shop that serves
impressions and emits **signed** conversion events, with attribution by
click/session ID.

## Contract

- **Inputs:** publisher list, scenario script (who converts, how much).
- **Outputs:** `ConversionEvent { publisherId, sessionId, timestamp, signature }`
  signed with `SHOP_SIGNING_KEY`; impression counts per publisher.
- **Script:** TechBlog → 8 conversions / 1k impressions; CodePodcast → 6;
  DevNewsletter → 0 (bot flood — traffic was never human).
- **Rules:** every event is signed; signatures must verify with the shop's
  public key in `lib/verifier/`. Labelled SIMULATED in the UI.

## Done when

The verifier accepts the feed's signatures and counts exactly 8 / 6 / 0
verified outcomes.
