# `app/lib/auction/` — sealed-bid auction engine

Pure functions, no I/O. Auction engine of the Tender Board.

## API

- `commit({ price, impressions, promisedPer1000, salt })` returns SHA-256 hex of
  `price|impressions|promisedPer1000|salt`. Suppliers post it before the deadline.
- `evaluateBids({ tender, bids })` returns `{ ranking, accepted, rejected }`.
  `tender` defaults to `TENDER` from `app/lib/config.js` and may add `deadline` (epoch ms).
  - Check order per bid: `invalid_schema`, `late`, `hash_mismatch`, `below_gate`.
  - `ranking`: eligible bids, cheapest price per promised signup first, each with
    `accepted`. Price per promised signup = price ÷ (impressions ÷ 1,000 × promisedPer1000).
  - `accepted`: budget fill (D11). Walk the ranking, accept a bid if the running total
    stays within the budget, otherwise skip it and continue. Each carries `award` and `bond`.
- `roundTwo(results)` returns `[{ supplier, share }]`. Shown on the receipt, no chain ops.
  Rule: winners that ended Under gate get 0, the other winners split equally.

## Bid object

```js
{ supplier, price, impressions, promisedPer1000, salt, commit, committedAt }
```

See the `Bid` typedef in `index.js`. `commit` must equal `commit({ price, impressions, promisedPer1000, salt })`.

## Tests

`node --test app/lib/auction`
