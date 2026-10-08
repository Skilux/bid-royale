# 0002 — Seller agents live on Vercel; Railway hosts only the Masumi node

- **Status:** Accepted — 2026-10-08, decided by Vladimir (Masumi lane owner)
- **Supersedes:** the ADR 0001 row "Python SDK seller endpoints (TechBlog, other
  suppliers, Board, Validator) — one service each → Railway" and its "thin payment
  adapters" bullet. The rest of ADR 0001 stands: the Masumi Payment Service +
  Postgres stay on Railway, the product stays on Vercel.

## Context

ADR 0001 planned one Python SDK service per seller on Railway, each a thin
payment adapter that calls Vercel for the actual work. Building the Masumi lane
showed three problems with that:

- **Settlement needs to control the result.** The SDK submits the result hash as
  soon as a job finishes. Our settlement must wait for the Board's signed verdict
  and must never submit on Under gate, so each Python job would have to stay
  paused through traffic and verification.
- **Deadlines.** `masumi` 1.2.0 hardcodes a 24 h result deadline (seller paid
  ≥ 30 h later); every adapter would need patching
  (`docs/research/masumi-settlement-timing.md`).
- **Six more always-on services** to deploy and keep alive overnight.

Masumi does not require the SDK. MIP-003 is a plain HTTP standard ("Agentic
Services must implement the following API endpoints"), and payments are the
Payment Service's REST API, which the SDK itself calls. Verified on preprod
(8 Oct): agents registered on our V2 source with Vercel URLs
(`RegistrationConfirmed` in 6.5 min), and wallet-scoped party keys created and
locked escrows through our own TypeScript client (`app/lib/masumi`).

## Decision

| Component | Host |
|---|---|
| Masumi Payment Service + Postgres | **Railway** (unchanged) |
| Treasury worker: plain transfers (forfeit, bond remainder) for Board-signed verdicts, holds the Admin key | **Railway** (#29) |
| Seller agents (4 suppliers + Board): brains, `/tender-invite`, and the MIP-003 routes `/availability`, `/input_schema`, `/start_job`, `/status` | **Vercel** (#12, #37) |
| Settlement: escrow calls per party (`/payment`, `/purchase`, `submit-result`, refunds) | **Vercel**, `app/lib/masumi` (#22) |

- Registered `apiBaseUrl` = `https://ad-slot-auction.vercel.app/api/agents/<name>`.
  The node does not probe it at registration, and V2 `/registry/update` can
  change it later.
- Each party has its own wallet-scoped, Preprod-only `ReadAndPay` key (#26).
  On 0.29.0 only the key that created a payment may later submit its result or
  authorize its refund, so each seller acts with its own key.
- Agent job state lives in Upstash Redis (Vercel functions keep no memory).
- The Python `techblog-agent` Railway service and `app/lib/agents/techblog-agent`
  are retired (#27).

## Consequences

- Railway runs two services (Payment Service + Postgres, treasury worker) instead
  of eight. No SDK patching.
- We implement the four MIP-003 routes ourselves (#37).
- All seller keys sit in one Vercel project: the suppliers are team-operated
  demonstration agents with operator-managed custody. This goes in
  `docs/honest-limitations.md`.
- Settlement controls exactly when results are submitted and refunds authorized.
