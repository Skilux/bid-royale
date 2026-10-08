# Masumi setup-video assessment

Researched: 2026-10-08. Scope: check the user-supplied transcript against current first-party documentation. This is research, not an approved change to runtime, hosting, or custody. No credentials were read and no resources or transactions were created.

## The crucial dashboard distinction

The video's dashboard is the **admin UI of a deployed Masumi Payment Service (Node)**, reached at that service's `/admin`. It is not demonstrated to be the hosted `app.masumi.network` account dashboard. Its API is at `/api/v1`, and Swagger is at `/docs`. The current installation guide still documents Docker Compose, manual setup, and Railway templates. Railway creates a Payment Service and PostgreSQL deployment; its prerequisites include a Railway account and Blockfrost API key. It documents generating a public URL and configuring the admin key. Docker Compose is currently marked recommended. These are deployment choices, not steps already completed by creating a hosted-dashboard account. [Official installation guide](https://www.masumi.network/dev/masumi/documentation/get-started/install-masumi-node).

## What remains valid in the SDK walkthrough

The official SDK README confirms `pip install masumi`, `masumi init`, `masumi check`, and `masumi run`. `init` produces an agent scaffold; `run` defaults to `main.py` and runs a FastAPI server. It abstracts MIP-003 routes including `/start_job`, `/status`, `/availability`, and `/input_schema`, with payment creation, monitoring, and result submission. [SDK README](https://github.com/masumi-network/pip-masumi).

For a paid agent the names are `PAYMENT_API_KEY`, `SELLER_VKEY`, `PAYMENT_SERVICE_URL`, `NETWORK`, and eventually `AGENT_IDENTIFIER`. “Seller wiki” in the transcript is a transcription error for **seller vKey**. Set the service URL explicitly rather than relying on defaults. The identifier can be absent during initial startup but is needed after registration. The SDK supports optional HITL via `request_input`; the example approval is not a protocol requirement. Default job storage is in memory; durable job storage must be supplied for reliable restarts. `process_job` should return a string; serialize structured output first. [SDK README](https://github.com/masumi-network/pip-masumi).

## Registration and reachability

The registration guide requires a funded selling wallet and a publicly reachable agent API. A local service must be exposed if the Payment Service is remote. Obtain the selling wallet's `vKey` and a Payment Service API key from that Node's admin interface; register the endpoint, wait for confirmation, then store `AGENT_IDENTIFIER` and restart the agent to load it. A dashboard key in `MASUMI_API_KEY` must not be assumed interchangeable with `PAYMENT_API_KEY`. The guide's API examples have inconsistencies in authentication and metadata shapes; use the deployed Node's Swagger schema rather than copying an old request blindly. [Registration guide](https://www.masumi.network/dev/masumi/documentation/get-started/register-agent).

The warning that free ngrok always changes hostname on restart is outdated. Current ngrok documentation provides a free, stable, automatically assigned Dev Domain. Keep the registered endpoint reachable and its hostname stable; changing the actual hostname still requires updating registration through the supported mechanism. [ngrok domain documentation](https://ngrok.com/docs/gateway/domains).

## Payment and result terminology corrections

Paid work starts when funds are **locked**, not after final seller settlement. The documented sequence is job/payment request → buyer purchase → `FundsLockingRequested` → `FundsLocked` → execution → result hash submission → dispute/unlock period → collection. A completed agent job and a submitted result do not prove the supplier has received funds. Keep separate UI states and confirm transaction evidence. The actual result is retrieved through the agent API; its hash is submitted on-chain. The video's phrase “output on-chain” must be read as a hash commitment, not raw ad content or signup evidence. [Payments and escrow](https://www.masumi.network/dev/masumi/core-concepts/payments).

The tutorial's successful hire does not validate a refund or a bond forfeit. The documented refund route requires buyer request before `unlockTime`, seller authorization, and buyer collection; disagreements escalate. Prove the refund branch separately and measure its timings. [Refunds and disputes](https://www.masumi.network/dev/masumi/core-concepts/refunds-and-disputes).

## Sokosumi and currencies

Current paid-listing documentation specifies USDM on Mainnet and **tUSDM on Preprod**, with six decimals. Token units are full policy ID plus asset name. Do not infer that an ADA-paid agent is a valid paid Sokosumi listing. [Sokosumi listing guide](https://www.masumi.network/dev/masumi/documentation/how-to-guides/list-agent-on-sokosumi).

The registration guide describes automatic preprod visibility under its conditions. Production marketplace listing has a separate form/review; the live form asks for successful preprod testing, a deployed agent, and handling of invalid inputs. Registration alone is not a guarantee of production listing. [Registration guide](https://www.masumi.network/dev/masumi/documentation/get-started/register-agent), [current listing form](https://www.sokosumi.com/list-your-agent).

## Research updates and next gate

Update the financial-rails plan to distinguish the existing hosted-dashboard account from Payment Service access. Add the SDK bootstrap as an available integration path and use separate lock, job completion, result submission, and collected/refunded states. Keep public tx hashes plus explorer links as REAL Preprod proof; label synthetic campaign events SIMULATED and recorded playback PRE-RECORDED.

Before deployment or implementation, Danila must confirm Payment Service hosting/custody, participant isolation, and whether to adopt the Python SDK. This follows the repo's scaffold rule. The transcript establishes a documented route to one paid agent; it does not establish the full tender's fee, bond, partial-forfeit, and refund behavior. First prove one real lock, result/collection, and authorized refund; then test bond transfers with the exact deployed API. No new wallet engine, escrow contract, or agent directory is proposed.
