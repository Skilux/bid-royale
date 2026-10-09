# `app/lib/outcome-feed/` — NeoRack signup feed (the heart — build first)

## Purpose

The source of truth for the whole scenario. A simulated NeoRack shop (a GPU
neocloud) that serves impressions and emits **signed** signup events, with
attribution by click/session ID. An outcome is a verified signup.

## Contract

- `generateFeed({ seed, suppliers, window, includeInvalid, signingSecret })` returns
  `{ events, impressions, invalid }`. Defaults: `WORKED_EXAMPLE`, `DEFAULT_WINDOW`, key from
  `SHOP_SIGNING_KEY`. Same seed gives an identical feed.
- `SignupEvent { eventId, sessionId, supplier, ts, signature }`. `sessionId` is
  `<supplier>.<n>`, the session the shop attributed to that supplier. `signature` is Ed25519
  (hex) over `eventId|sessionId|supplier|ts`. The key is derived from the secret in
  `app/lib/signing/`.
- Each event also carries unsigned `signals { asn, clickBurst }`. Dashboard context only, the
  verifier never reads them.
- **Script (conversion):** TechBlog 0.8% (8 signups on 1,000 impressions), CodePodcast 0.6%
  (6 on 1,000), DevNewsletter 0% (0 on 1,500). GamingForum is not served.
- **Invalid events for tests:** each served supplier gets one `bad_signature`,
  `wrong_attribution` and `outside_window` event. `invalid` lists them with the expected
  reason. Pass `includeInvalid: false` to drop them.
- Labelled "simulated, no funds moved" in the UI.

## Test

`node --test app/lib/outcome-feed app/lib/verifier`
