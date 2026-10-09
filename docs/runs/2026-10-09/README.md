# Recorded run run_c1f40522 (#45)

Production https://ad-slot-auction.vercel.app, real adapter (Masumi preprod), live registry discovery, LLM supplier quotes (`PERSONA_MODE` unset).
Created 2026-10-08T23:45:43.167Z. Settlement done / timer_fallback. Files in this folder are the raw evidence; no secrets.

## Outcome
- Allocation: devnewsletter 60, codepodcast 55, techblog 65; rejected: gamingforum (below_gate).
- Verdicts: devnewsletter under_gate (delivered 0, promised 10); codepodcast short_of_promise (delivered 6, promised 7); techblog pass (delivered 8, promised 5).
- Receipt: Consumer net -103.035714 tADA for 14 signups; badges ["REAL","PENDING"]. This net was built by the code before #62 and still counts the unsent 1.964286 tADA forfeit as returned; the money that moved gives -105.0 tADA.
- Settlement reached the 40-min timer fallback only because of that one refused row; every other row was REAL after 17 min.
- On-chain checks (read from the Masumi node): each bid-fee escrow's inputHash is its bid's commit (#50); the delivery result hash sits on TechBlog's award, CodePodcast's award and bond, and DevNewsletter's bond (#51).
- Lock transactions are batched by the node: one tx can lock several escrows, so some tx links repeat.

## Timings (minutes after settlement start, from the event log)
| Stage | Minutes |
|---|---|
| Tender to verdicts signed (6 steps) | 0.2 |
| All 10 locks REAL (awards, bonds, bid fees) | 2.1 |
| Under-gate refund (award back to Consumer) | 5.7 |
| Bond return (Pass) | 6.8 |
| Award release, TechBlog | 13.0 |
| Award release, CodePodcast | 13.0 |
| First bid fee collected | 13.0 |
| Last bid fee collected | 15.1 |
| Treasury transfers (last REAL) | 17.0 |

## Transaction proof (ledger, REAL rows link to Cardanoscan preprod)
| Phase | Supplier | Action | tADA | From → to | Badge | State | Tx |
|---|---|---|---|---|---|---|---|
| bid_fee | techblog | bid_fee | 2 | techblog → board | REAL | FundsLocked | [9ec76e214c…](https://preprod.cardanoscan.io/transaction/9ec76e214c4293c04bb5252cf30700906c6dd0fa6cb5338aca37b9fb8b8c0a97) |
| bid_fee | codepodcast | bid_fee | 2 | codepodcast → board | REAL | FundsLocked | [b2ebaefb69…](https://preprod.cardanoscan.io/transaction/b2ebaefb698c233cf0caf454342ebd0f4fe61023e2b942a847296cbb51184f0d) |
| bid_fee | devnewsletter | bid_fee | 2 | devnewsletter → board | REAL | FundsLocked | [14f5ceb13a…](https://preprod.cardanoscan.io/transaction/14f5ceb13a6d55c9d8dc3283fcffe753c09ceed67c3b184002e158dda00e5953) |
| bid_fee | gamingforum | bid_fee | 2 | gamingforum → board | REAL | FundsLocked | [9d5c245b89…](https://preprod.cardanoscan.io/transaction/9d5c245b89a4deacee45fa74e3b9b4ee03f9226b1e85813a335c91c8498df0e9) |
| lock | devnewsletter | award | 60 | consumer → devnewsletter | REAL | FundsLocked | [3bd1ae093a…](https://preprod.cardanoscan.io/transaction/3bd1ae093a8ee9970e31fbcf130588001188842fbe25885dcb4623c74eee8bae) |
| lock | devnewsletter | bond | 15 | devnewsletter → board | REAL | FundsLocked | [14f5ceb13a…](https://preprod.cardanoscan.io/transaction/14f5ceb13a6d55c9d8dc3283fcffe753c09ceed67c3b184002e158dda00e5953) |
| lock | codepodcast | award | 55 | consumer → codepodcast | REAL | FundsLocked | [3bd1ae093a…](https://preprod.cardanoscan.io/transaction/3bd1ae093a8ee9970e31fbcf130588001188842fbe25885dcb4623c74eee8bae) |
| lock | codepodcast | bond | 13.75 | codepodcast → board | REAL | FundsLocked | [b2ebaefb69…](https://preprod.cardanoscan.io/transaction/b2ebaefb698c233cf0caf454342ebd0f4fe61023e2b942a847296cbb51184f0d) |
| lock | techblog | award | 65 | consumer → techblog | REAL | FundsLocked | [3bd1ae093a…](https://preprod.cardanoscan.io/transaction/3bd1ae093a8ee9970e31fbcf130588001188842fbe25885dcb4623c74eee8bae) |
| lock | techblog | bond | 16.25 | techblog → board | REAL | FundsLocked | [9ec76e214c…](https://preprod.cardanoscan.io/transaction/9ec76e214c4293c04bb5252cf30700906c6dd0fa6cb5338aca37b9fb8b8c0a97) |
| settlement | devnewsletter | award_reclaim | 60 | devnewsletter → consumer | REAL | RefundWithdrawn | [b4854bc3d6…](https://preprod.cardanoscan.io/transaction/b4854bc3d603c1ceec700ea7ac5ccdb674c3c74a962459cdf2caf935f71a84da) |
| settlement | devnewsletter | bond_forfeit | 15 | board → consumer | REAL | Pending | [83c3fa9dcb…](https://preprod.cardanoscan.io/transaction/83c3fa9dcbefcf88bddca80eeca15890cf7e7af261758e8fe4e96534c755f370) |
| settlement | codepodcast | award_release | 55 | consumer → codepodcast | REAL | Withdrawn | [64383b40d3…](https://preprod.cardanoscan.io/transaction/64383b40d355a3f40e9d5895400e8cc5395ad8aa31eb3335286c2b0bc8d4b7a4) |
| settlement | codepodcast | bond_return | 11.785714 | board → codepodcast | REAL | Pending | [6862bb4516…](https://preprod.cardanoscan.io/transaction/6862bb451697b72dfa4037481079f32bd17aae451fe7c2e1dd107ce77761c733) |
| settlement | codepodcast | bond_forfeit | 1.964286 | board → consumer | PENDING | BelowMinimum | — |
| settlement | techblog | award_release | 65 | consumer → techblog | REAL | Withdrawn | [6a8c5cab80…](https://preprod.cardanoscan.io/transaction/6a8c5cab80e4d583dbd6e654816b1ea6945fc4b9a4f1db81db6c4cf2dec383b6) |
| settlement | techblog | bond_return | 16.25 | board → techblog | REAL | RefundWithdrawn | [f04d859e67…](https://preprod.cardanoscan.io/transaction/f04d859e67abc497d7f95aa60e463ea61ec9efed744c69fe64a2716aa7043e5f) |
| bid_fee_collect | techblog | bid_fee_collect | 2 | techblog → board | REAL | Withdrawn | [2790c21d53…](https://preprod.cardanoscan.io/transaction/2790c21d53a4a1933767ee1a06fc004c17188cd9f5c8ae2f13392243c11bf384) |
| bid_fee_collect | codepodcast | bid_fee_collect | 2 | codepodcast → board | REAL | Withdrawn | [2790c21d53…](https://preprod.cardanoscan.io/transaction/2790c21d53a4a1933767ee1a06fc004c17188cd9f5c8ae2f13392243c11bf384) |
| bid_fee_collect | devnewsletter | bid_fee_collect | 2 | devnewsletter → board | REAL | Withdrawn | [b527828a66…](https://preprod.cardanoscan.io/transaction/b527828a6615a256e7ed3222791d8ed291324780e9cedf061d3a7c5630000bfb) |
| bid_fee_collect | gamingforum | bid_fee_collect | 2 | gamingforum → board | REAL | Withdrawn | [2790c21d53…](https://preprod.cardanoscan.io/transaction/2790c21d53a4a1933767ee1a06fc004c17188cd9f5c8ae2f13392243c11bf384) |

## Known issues
- CodePodcast's 1.964286 tADA forfeit was refused by the treasury (`BelowMinimum`, under 2 tADA): no transaction, labelled PENDING. Fixed for future runs in #62 (rounded up to 2 tADA, Board pays the difference).
- A second run was started by accident from the dashboard during this run. It is not part of this evidence.
