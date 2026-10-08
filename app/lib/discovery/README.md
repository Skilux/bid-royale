# Supplier discovery (#44)

The Board finds supplier agents in the Masumi registry, then invites them. Masumi is the rails: this is one read call
plus a seeded fallback, no registry infrastructure.

## Endpoint

`GET <MASUMI_REGISTRY_BASE_URL>/registry?network=Preprod&limit=50&filterSmartContractAddress=<MASUMI_SMART_CONTRACT_ADDRESS>`
on the Masumi Payment Service node, header `token: <MASUMI_REGISTRY_API_KEY>` (Read-only). Chosen over the public Registry
service `POST /registry-entry-search/` because the node call is the one confirmed to return all five V2 entries with
`apiBaseUrl` and `RegistrationConfirmed` (`docs/plan/lane-masumi.md`, Discovery). Without a V2 selector the node answers with the
V1 view, so one is always sent: the contract address, else `filterPaymentSourceType=Web3CardanoV2`.
The base URL defaults to `MASUMI_PAYMENT_BASE_URL`. The key never defaults: a party key is never used for registry reads.

The response is read tolerantly (`data.Assets`, a bare array, `state` or `status`). **The exact live response shape is not
verified yet.** If the live shape differs, the result is the seeded registry with reason `partial`, never a crash.

## Result

```js
{ source: "live" | "seeded", label: "Masumi registry" | "seeded registry",
  reason?: "not_configured" | "timeout" | "error" | "partial", detail?, endpoint, expected: 4, found,
  agents: [{ supplier, name, persona, agentIdentifier, apiBaseUrl, state }], skipped?: [{ name, reason }] }
```

Emitted as `registry.discovered` (first event of the `bids` step), kept on `run.discovery`, written to the evidence bundle as
item `discovery`, and shown on the dashboard as the chip "Discovery: Masumi registry · 4 agents · live" (or "seeded registry").

## Rules

- Live entries are kept only if confirmed (`RegistrationConfirmed` or `Online`), one of our four suppliers (the Board agent is
  excluded), with an agent identifier and an https `apiBaseUrl` whose origin is the seeded origin for that supplier. The origin
  rule keeps `AGENT_SHARED_SECRET` from being sent to a host a registry entry names.
- Fewer than 4 usable agents, a timeout (5 s, AbortController), an HTTP or JSON error, or a missing key all give the seed
  `app/data/seeds/suppliers.json`. No retry. The run always completes.
- Invites: `SUPPLIER_AGENTS=http` invites the discovered `apiBaseUrl` through `httpInvite`. `SUPPLIER_INVITE_URLS`, when set, wins
  for the suppliers it names. `SUPPLIER_AGENTS=local` (production default, #38) runs the brains in-process and still shows the discovery.

## Live or seeded

Set `MASUMI_REGISTRY_API_KEY` (and the base URL if the registry node differs) for live. Unset the key for seeded.
`/api/health` reports whether the two env vars are set, names only.
