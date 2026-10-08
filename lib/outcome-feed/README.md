# `lib/outcome-feed/` — NeoRack signup feed (the heart — build first)

## Purpose

The source of truth for the whole scenario. A simulated NeoRack shop (a GPU
neocloud) that serves impressions and emits **signed** signup events, with
attribution by click/session ID. An outcome is a verified signup.

## Contract

- **Inputs:** supplier list, scenario script (who signs up, how many).
- **Outputs:** `SignupEvent { supplierId, sessionId, timestamp, signature }`
  signed with `SHOP_SIGNING_KEY`; impression counts per supplier.
- **Script (signups per 1k impressions):** TechBlog → 8; CodePodcast → 6;
  DevNewsletter → 0 (zero-signup traffic, scripted). GamingForum is
  not served (bid rejected below the gate).
- **Rules:** every event is signed; signatures must verify with the shop's
  public key in `lib/verifier/`. Labelled "simulated, no funds moved" in
  the UI.

## Done when

The verifier accepts the feed's signatures and counts exactly 8 / 6 / 0
verified signups.
