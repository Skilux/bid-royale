# Agent hosting facts

Checked 2026-10-08 against primary sources. Evidence for a proposal only; this note does not approve or change the scaffold architecture.

## Masumi compatibility

MIP-003 defines an HTTP service contract: required `POST /start_job`, `GET /status?job_id=…`, `GET /availability`, and `GET /input_schema`. Job status supports awaiting payment, running, completed and failed; results can be returned through status. The standard does not prescribe a particular cloud host. Its availability endpoint is required for visibility as available in the payment service. [Masumi MIP-003](https://www.masumi.network/dev/masumi/mips/_mip-003).

## Vercel execution

Current Fluid Compute duration limits are 300 seconds on Hobby; Pro and Enterprise have 800 seconds generally available and 1,800 seconds in beta with supported runtimes/configuration. A function exceeding its duration returns a timeout. The repo's approximate 60-second figure is therefore not a universal current platform limit. [Function limits](https://vercel.com/docs/functions/limitations).

`waitUntil` can continue work after the HTTP response, but its promises share the function deadline and are cancelled when that deadline expires. It does not make a multi-minute payment poll durable. [Functions API](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package).

Vercel Workflows provides managed persistence of execution state/event logs, retryable steps, durable waits and external-event resumption across crashes and deployments. Individual step code runs as Vercel Functions. [Workflows](https://vercel.com/docs/workflows). Workflow `sleep` suspends execution without holding compute; external calls belong in steps. [Workflows and steps](https://workflow-sdk.dev/docs/foundations/workflows-and-steps).

Shared application state belongs in an external store rather than instance memory; any instance can handle a connection and instances can be paused or recycled. Clients must handle reconnection and duration limits. [Fluid Compute services](https://vercel.com/kb/guide/vercel-services-fluid-compute).

## OpenAI interface facts

Parent-agent verified sources: the Agents SDK executes inside the developer's application, which owns tools/deployment/state. [Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk). GPT Actions lets a Custom GPT invoke APIs through an OpenAPI schema and configured authentication. [Actions introduction](https://developers.openai.com/api/docs/actions/introduction). Actions has a 45-second round-trip timeout. [Actions production guidance](https://developers.openai.com/api/docs/actions/production).

## Practical implications (inferences, pending architecture approval)

- A portal, supplier HTTP endpoints and durable orchestration can all use Vercel; a permanently running agent process is not inherently required by MIP-003.
- Return a job ID and campaign URL promptly to ChatGPT. Persist campaign progress so execution continues if chat/browser closes.
- Use short payment-status checks separated by durable waits, with a deadline; do not hold one request open through escrow unlocks.
- Keep user-facing campaign records, conversion evidence and assets in persistent storage. Workflow execution persistence is not itself the portal's application data model.
- Make payment/escrow mutations idempotent and reconcile external transaction state before retrying; durable retries do not imply external payments are exactly-once.
- Service hosting does not settle unresolved refund/bond semantics in the agreed tender flow. Those still need a separate decision.
