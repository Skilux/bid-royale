# Evidence store (#47)

One bundle per run, kept in the Board store (Upstash, key `bidroyale:run:<id>:evidence`, same TTL as the run).
Chain gets hashes only. Evidence stays here.

## Items

| Name | Written after | Content |
|---|---|---|
| `tender`, `brief`, `keys` | run created | terms as published (no deadline), brief, shop and Board public keys |
| `bid.<supplier>` | bids | commit hash, reveal (price, impressions, promised per 1,000, salt), receive time, deadline, commit recheck |
| `allocation` | allocation | ranking, accepted, rejected, budget fill, one decision per bid |
| `signups.<supplier>` | feed | window, impressions, the supplier's signed signup events (bot signals included as context) |
| `verification.<supplier>` | verification | received, verified, rejected by kind, rejected event ids, bot signals as context only |
| `verdict.<supplier>` | verdicts | the Board-signed verdict, Board public key, hash of that supplier's verification report |
| `ledger`, `settlement`, `receipt` | bids, locks, every settlement tick | bid fees, locks, transfers with badge and tx hash. **Mutable**: a receipt goes PENDING then REAL |

All items except the three mutable ones are write-once. The same bytes again are a no-op. Different bytes under the
same name are refused and logged. Mutable items are replaced when their hash changes and carry a `revision`.

## Hashes

- Item hash: SHA-256 of the canonical JSON bytes (`app/lib/signing/canonical.js`, test vector in `canonical.test.js`).
  The stored `bytes` string is exactly what was hashed.
- Bundle hash: SHA-256 of the canonical list of `{name, hash}`.
- Verdict hash (`verdict.hash`): SHA-256 of the JSON array `[supplier, kind, delivered, promised, gate, award, bond]`,
  signed by the Board. Unchanged by this module. `verify.js` recomputes it for `verdict.*` items.

## Which hashes the real adapter sends today (`app/lib/masumi/real.js`)

- Lock (`POST /payment`, `POST /purchase`): `inputHash` = SHA-256 of `JSON.stringify({action, supplier, amount, nonce})`.
  Not canonical JSON, not linked to an evidence item.
- Settlement `submit-result`: `submitResultHash` = the verdict hash.
- Not sent: tender hash, bid commit hashes (#50), verification report hash, bundle hash, delivery report hash (#51).
  Vladimir owns `real.js`. `board.evidenceHash(runId, name)` returns an item hash for wiring.

## Routes and the UI

- `GET /api/run/<id>/evidence`: manifest (name, label, hash, size, mutable, revision), `source` (`live` or `PRE-RECORDED`), bundle hash.
- `GET /api/run/<id>/evidence/<name>`: one item with its bytes. Name matches `^[a-z0-9][a-z0-9._-]{0,63}$`. Items are capped at 256 KiB at write time.
- `app/app/receipt/EvidencePanel.js`: copy, Verify (Web Crypto in the browser, `verify.js`), link to the file, and the on-chain note per verdict (`chain.js`).
  `EvidencePanel supplier="techblog"` shows one supplier's files, so Track A can place it in a verdict card.

## Canned replay

The recording is `{run, events, evidence}`. `board.exportEvidence(runId)` produces `evidence`; the Board restores it on replay.
`app/data/seeds/board-run.worked-example.json` carries one, and the receipt page verifies it offline.
