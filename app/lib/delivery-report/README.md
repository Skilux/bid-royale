# Supplier delivery report (#51, platform side)

A supplier agent tells the Board what it served. The Board stores the claim next to the verdict and gives the chain
side one hash to anchor. The claim is context. The verdict is decided from the shop's signed signups only.

## Format (agreed on #51, one module: `schema.js`)

```json
{ "supplier": "techblog", "runId": "run_ab12cd34",
  "window": { "from": "2026-10-08T22:00:00.000Z", "to": "2026-10-08T23:00:00.000Z" },
  "impressionsServed": 1000, "sessionIds": ["techblog.0001"], "servedAt": "2026-10-08T23:00:00.000Z" }
```

Unknown fields are rejected. At most 2,000 session ids of 64 characters.

## Endpoint

`POST /api/agents/<supplier>/delivery`, header `x-agent-secret` (same as `/tender-invite`). 401 bad secret, 400 bad body,
404 unknown agent or run, 409 not an accepted winner, no allocation yet, or a different report already stored. A repeated
identical report answers 200 `{status: "same"}`.

## Hashes

- `reportHash` = sha256 of the canonical report bytes (`app/lib/signing/canonical.js`). It is the hash of evidence item `delivery.<supplier>`.
- `resultHash` = sha256(UTF-8(canonical report + verdict hash)), plain concatenation, no separator, lowercase hex. Evidence item `result.<supplier>`.
- After the `verdicts` step the run holds `run.delivery[<supplier>] = { reportHash, resultHash, source }`. The chain side reads
  `run.delivery[supplier]?.resultHash` and falls back to `verdict.hash` when it is absent. The Evidence panel says which one applies.

## Demo

Supplier agents run in-process, so nobody posts over HTTP. A winner that has not posted by the `verdicts` step gets a scripted
report built from the simulated feed (`scriptedReport`), stored with `origin: "scripted_demo"`.
