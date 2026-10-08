import test from "node:test";
import assert from "node:assert/strict";
import { installNextResolution } from "../board/test-alias.js";
installNextResolution();
const { createRealAdapter, lovelace, realAdapter } = await import("@/lib/masumi/real");
const { getAdapter } = await import("@/lib/masumi");
const { simulatedAdapter } = await import("@/lib/masumi/simulated");
const { planSettlement } = await import("@/lib/settlement/plan");

const TX = "a".repeat(64);
function fixture({ state = "FundsLocked", treasury } = {}) {
  const calls = [];
  const env = {
    MASUMI_PAYMENT_BASE_URL: "https://masumi.invalid/api/v1", MASUMI_NETWORK: "Preprod",
    MASUMI_SMART_CONTRACT_ADDRESS: "test-contract",
    ...Object.fromEntries(["CONSUMER", "BOARD", "TECHBLOG", "CODEPODCAST", "DEVNEWSLETTER", "GAMINGFORUM"]
      .flatMap((party) => [[`MASUMI_KEY_${party}`, `test-${party}`], [`MASUMI_AGENT_${party}`, party.toLowerCase().repeat(12)]])),
  };
  const records = new Map();
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const path = url.pathname.replace("/api/v1", "");
    calls.push({ path, body, key: init.headers.token });
    let data;
    if (path === "/payment") {
      data = {
        blockchainIdentifier: `escrow-${records.size}`, SmartContractWallet: { walletVkey: "test-vkey" },
        PaymentSource: { smartContractAddress: "test-contract" }, forceLayer: body.forceLayer,
        ...Object.fromEntries(["payByTime", "submitResultTime", "unlockTime", "externalDisputeUnlockTime"].map((key) => [key, String(Date.parse(body[key]))])),
      };
      records.set(data.blockchainIdentifier, {
        payment: { onChainState: state, NextAction: { requestedAction: "WaitingForExternalAction" }, CurrentTransaction: { txHash: TX } },
        purchase: { onChainState: state, NextAction: { requestedAction: "WaitingForExternalAction" }, CurrentTransaction: { txHash: TX } },
      });
    } else {
      const record = records.get(body.blockchainIdentifier);
      const side = path.startsWith("/purchase") ? "purchase" : "payment";
      data = record[side];
      if (path.endsWith("submit-result")) data = { ...data, NextAction: { requestedAction: "SubmitResultRequested" }, resultHash: body.submitResultHash };
      if (path === "/purchase/request-refund") data = { ...data, NextAction: { requestedAction: "SetRefundRequestedRequested" } };
      if (path.endsWith("authorize-refund")) {
        assert.ok(["RefundRequested", "Disputed"].includes(data.onChainState), "seller authorization before RefundRequested");
        data = { ...data, NextAction: { requestedAction: "AuthorizeRefundRequested" } };
      }
      if (path.endsWith("cancel-refund-request")) data = { ...data, NextAction: { requestedAction: "UnSetRefundRequestedRequested" } };
      record[side] = data;
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ status: "Success", data }) };
  };
  return { adapter: createRealAdapter({ env, fetch, now: () => Date.parse("2026-10-08T22:00:00Z"), treasury }), calls, env, fetch, records };
}

const verdicts = [
  { supplier: "techblog", kind: "pass", promised: 7, delivered: 8, gate: 5, award: 70, bond: 17.5 },
  { supplier: "codepodcast", kind: "short_of_promise", promised: 8, delivered: 6, gate: 5, award: 60, bond: 15 },
  { supplier: "devnewsletter", kind: "under_gate", promised: 12, delivered: 0, gate: 5, award: 70, bond: 17.5 },
];

test("award lock uses supplier payment then Consumer purchase with signed terms", async () => {
  const { adapter, calls } = fixture();
  const locked = await adapter.lockAward({ supplier: "techblog", amount: 70 });
  assert.deepEqual(calls.map(({ path, key }) => [path, key]), [["/payment", "test-TECHBLOG"], ["/purchase", "test-CONSUMER"]]);
  assert.deepEqual(calls[0].body.RequestedFunds, [{ amount: "70000000", unit: "" }]);
  assert.deepEqual(calls[1].body.Amounts, calls[0].body.RequestedFunds);
  assert.match(calls[0].body.identifierFromPurchaser, /^[a-f0-9]{24}$/);
  assert.equal(calls[1].body.identifierFromPurchaser, calls[0].body.identifierFromPurchaser);
  assert.equal(calls[1].body.sellerVkey, "test-vkey");
  assert.equal(calls[0].body.paymentSourceType, "Web3CardanoV2");
  assert.equal(calls[0].body.supportedPaymentSourceIndex, 0);
  for (const key of ["payByTime", "submitResultTime", "unlockTime", "externalDisputeUnlockTime"]) {
    assert.equal(calls[1].body[key], String(Date.parse(calls[0].body[key])));
  }
  assert.equal(locked.badge, "REAL");
  assert.equal(locked.txHash, TX);
  assert.equal(locked.explorerUrl, `https://preprod.cardanoscan.io/transaction/${TX}`);
  assert.equal(await adapter.getEscrowStatus(locked.id), "FundsLocked");
  await adapter.lockAward({ supplier: "techblog", amount: 70 });
  assert.notEqual(calls[0].body.identifierFromPurchaser, calls[3].body.identifierFromPurchaser);
});

test("bond uses Board seller and Supplier buyer", async () => {
  const { adapter, calls } = fixture();
  await adapter.lockBond({ supplier: "codepodcast", amount: 15 });
  assert.deepEqual(calls.map(({ key }) => key), ["test-BOARD", "test-CODEPODCAST"]);
});

const COMMIT = "c".repeat(64);
const jobOf = (id) => JSON.parse(Buffer.from(id.slice(7), "base64url"));

test("bid fee is a REAL Board-seller escrow whose inputHash is the bid's commit", async () => {
  const { adapter, calls } = fixture();
  const fee = await adapter.lockBidFee({ supplier: "gamingforum", amount: 2, commit: COMMIT.toUpperCase() });
  assert.deepEqual(calls.map(({ path, key }) => [path, key]), [["/payment", "test-BOARD"], ["/purchase", "test-GAMINGFORUM"]]);
  assert.equal(calls[0].body.agentIdentifier, "board".repeat(12));
  assert.equal(calls[0].body.inputHash, COMMIT);
  assert.equal(calls[1].body.inputHash, COMMIT);
  assert.deepEqual(calls[0].body.RequestedFunds, [{ amount: "2000000", unit: "" }]);
  assert.deepEqual([fee.badge, fee.action, fee.amount, fee.from, fee.to], ["REAL", "bid_fee", 2, "gamingforum", "board"]);
  assert.equal(fee.inputHash, COMMIT);
  assert.equal(fee.explorerUrl, `https://preprod.cardanoscan.io/transaction/${TX}`);
  assert.equal(await adapter.getEscrowStatus(fee.id), "FundsLocked");
});

test("bid fee without a commit hash is an Error receipt and creates no escrow", async () => {
  const { adapter, calls } = fixture();
  for (const commit of [undefined, "", "abc", "g".repeat(64)]) {
    const fee = await adapter.lockBidFee({ supplier: "techblog", amount: 2, commit });
    assert.equal(fee.state, "Error");
    assert.equal(fee.badge, "PENDING");
    assert.match(fee.error, /commit hash/);
  }
  assert.equal(calls.length, 0);
});

test("a payment that registers a different inputHash is rejected before the supplier pays", async () => {
  const { env, fetch: base } = fixture();
  const calls = [];
  const fetch = async (url, init) => {
    const res = await base(url, init);
    calls.push(url.pathname);
    if (!url.pathname.endsWith("/payment")) return res;
    const body = JSON.parse(await res.text());
    body.data.inputHash = "d".repeat(64);
    return { ...res, text: async () => JSON.stringify(body) };
  };
  const fee = await createRealAdapter({ env, fetch }).lockBidFee({ supplier: "techblog", amount: 2, commit: COMMIT });
  assert.equal(fee.state, "Error");
  assert.match(fee.error, /inputHash/);
  assert.ok(!calls.some((path) => path.endsWith("/purchase")));
});

test("MASUMI_BID_FEES=simulated falls back to a SIMULATED bid fee with no Masumi call", async () => {
  const { env, fetch, calls } = fixture();
  const adapter = createRealAdapter({ env: { ...env, MASUMI_BID_FEES: "simulated" }, fetch });
  const fee = await adapter.lockBidFee({ supplier: "gamingforum", amount: 2, commit: COMMIT });
  assert.equal(fee.badge, "SIMULATED");
  assert.equal(calls.length, 0);
  assert.equal((await adapter.lockBond({ supplier: "gamingforum", amount: 5 })).badge, "REAL", "only bid fees fall back");
});

test("bid-fee lock confirmation, then the Board collects it: submit-result with the result hash, REAL at Withdrawn", async () => {
  const { adapter, calls, records, env, fetch } = fixture({ state: "FundsLocked" });
  const fee = await adapter.lockBidFee({ supplier: "devnewsletter", amount: 2, commit: COMMIT });
  const escrow = jobOf(fee.id).blockchainIdentifier;
  const resumed = createRealAdapter({ env, fetch });
  const confirmed = await resumed.advance(fee.id);
  assert.deepEqual([confirmed.badge, confirmed.action, confirmed.inputHash], ["REAL", "bid_fee", COMMIT]);

  const result = "e".repeat(64);
  calls.length = 0;
  const collect = await resumed.collectBidFee({ supplier: "devnewsletter", bidFeeEscrowId: fee.id, resultHash: result });
  const writes = calls.filter(({ path }) => !path.includes("resolve-blockchain-identifier"));
  assert.deepEqual(writes.map(({ path, key }) => [path, key]), [["/payment/submit-result", "test-BOARD"]]);
  assert.equal(writes[0].body.submitResultHash, result);
  assert.equal(writes[0].body.blockchainIdentifier, escrow);
  assert.deepEqual([collect.action, collect.amount, collect.from, collect.to, collect.badge], ["bid_fee_collect", 2, "devnewsletter", "board", "PENDING"]);
  assert.equal(collect.escrow, escrow);
  assert.equal(collect.inputHash, undefined, "only the lock row carries the commit");

  records.get(escrow).payment = { onChainState: "Withdrawn", NextAction: { requestedAction: "WaitingForExternalAction" }, CurrentTransaction: { txHash: TX } };
  const done = await createRealAdapter({ env, fetch }).advance(collect.id);
  assert.deepEqual([done.id, done.badge, done.state, done.txHash], [collect.id, "REAL", "Withdrawn", TX]);
});

test("collectBidFee refuses another supplier's escrow, a non-fee escrow and a missing result hash", async () => {
  const { adapter, calls } = fixture();
  const fee = await adapter.lockBidFee({ supplier: "techblog", amount: 2, commit: COMMIT });
  const bond = await adapter.lockBond({ supplier: "techblog", amount: 17.5 });
  calls.length = 0;
  const cases = [
    [{ supplier: "codepodcast", bidFeeEscrowId: fee.id, resultHash: "e".repeat(64) }, /escrow missing/],
    [{ supplier: "techblog", bidFeeEscrowId: bond.id, resultHash: "e".repeat(64) }, /escrow missing/],
    [{ supplier: "techblog", bidFeeEscrowId: "sim_x", resultHash: "e".repeat(64) }, /escrow missing/],
    [{ supplier: "techblog", bidFeeEscrowId: fee.id }, /result hash/],
  ];
  for (const [input, error] of cases) {
    const out = await adapter.collectBidFee(input);
    assert.equal(out.state, "Error");
    assert.match(out.error, error);
  }
  assert.equal(calls.length, 0);
});

for (const verdict of verdicts) {
  test(`${verdict.kind}: exact settlement calls and plan amounts`, async () => {
    const { adapter, calls } = fixture();
    const award = await adapter.lockAward({ supplier: verdict.supplier, amount: verdict.award });
    const bond = await adapter.lockBond({ supplier: verdict.supplier, amount: verdict.bond });
    calls.length = 0;
    const receipts = await adapter.settle(verdict);
    const writes = calls.filter(({ path }) => !path.includes("resolve-blockchain-identifier"));
    const expected = verdict.kind === "pass"
      ? [["/payment/submit-result", `test-${verdict.supplier.toUpperCase()}`], ["/purchase/request-refund", "test-TECHBLOG"]]
      : verdict.kind === "short_of_promise"
        ? [["/payment/submit-result", "test-BOARD"], ["/payment/submit-result", "test-CODEPODCAST"]]
        : [["/payment/submit-result", "test-BOARD"], ["/purchase/request-refund", "test-CONSUMER"]];
    assert.deepEqual(writes.map(({ path, key }) => [path, key]).sort(), expected.sort());
    assert.deepEqual(receipts.map(({ action, amount, from, to }) => ({ action, amount, from, to })),
      planSettlement(verdict).map(({ reason, amount, from, to }) => ({ action: reason, amount, from, to })));
    for (const result of receipts.filter(({ state }) => state === "TransferPending")) {
      assert.equal(result.txHash, null);
      assert.equal(result.explorerUrl, null);
      assert.equal(result.badge, "PENDING");
    }
    if (verdict.kind === "under_gate") {
      assert.ok(!writes.some(({ path, body }) => path.endsWith("submit-result") && body.blockchainIdentifier === JSON.parse(Buffer.from(award.id.slice(7), "base64url")).blockchainIdentifier));
    }
    assert.ok(receipts.filter(({ action }) => action.startsWith("award")).every(({ state }) => state !== "Withdrawn"));
    assert.ok(bond.id.startsWith("masumi_"));
  });
}

test("portable ids resume status and settlement in another adapter instance", async () => {
  const { adapter, env, fetch } = fixture();
  const verdict = verdicts[0];
  const award = await adapter.lockAward({ supplier: verdict.supplier, amount: verdict.award });
  const bond = await adapter.lockBond({ supplier: verdict.supplier, amount: verdict.bond });
  const resumed = createRealAdapter({ env, fetch });
  assert.equal(await resumed.getEscrowStatus(award.id), "FundsLocked");
  const receipts = await resumed.settle({ ...verdict, awardEscrowId: award.id, bondEscrowId: bond.id });
  assert.ok(receipts.every(({ state }) => state !== "Error"));
});

test("repeated settlement reconciles queued result instead of resubmitting", async () => {
  const { adapter, calls } = fixture();
  await adapter.lockAward({ supplier: "techblog", amount: 70 });
  await adapter.lockBond({ supplier: "techblog", amount: 17.5 });
  await adapter.settle(verdicts[0]);
  calls.length = 0;
  await adapter.settle(verdicts[0]);
  assert.equal(calls.filter(({ path }) => path.endsWith("submit-result")).length, 0);
});

test("treasury waits for bond Withdrawn and gets the plan transfers", async () => {
  const transfers = [];
  for (const state of ["FundsLocked", "Withdrawn"]) {
    const { adapter } = fixture({ state, treasury: async (move) => {
      transfers.push(move); return { state: "TransferSent", txHash: TX };
    } });
    await adapter.lockAward({ supplier: "codepodcast", amount: 60 });
    await adapter.lockBond({ supplier: "codepodcast", amount: 15 });
    const receipts = await adapter.settle(verdicts[1]);
    assert.equal(receipts[1].state, state === "Withdrawn" ? "TransferSent" : "TransferPending");
  }
  assert.deepEqual(transfers.map(({ amount }) => amount), [11.25, 3.75]);
});

test("missing configuration gives a clear Error receipt without network calls", async () => {
  const adapter = createRealAdapter({ env: {}, fetch: () => assert.fail("network used") });
  const receipt = await adapter.lockAward({ supplier: "techblog", amount: 70 });
  assert.equal(receipt.state, "Error");
  assert.match(receipt.error, /missing MASUMI_PAYMENT_BASE_URL/);
  assert.equal(receipt.txHash, null);
});

test("missing party key is validated before seller payment", async () => {
  const { env } = fixture();
  delete env.MASUMI_KEY_CONSUMER;
  const adapter = createRealAdapter({ env, fetch: () => assert.fail("network used") });
  assert.match((await adapter.lockAward({ supplier: "techblog", amount: 70 })).error, /MASUMI_KEY_CONSUMER/);
});

test("pending purchase has no invented hash or REAL badge", async () => {
  const { env, fetch } = fixture();
  const adapter = createRealAdapter({ env, fetch: async (url, init) => {
    const response = await fetch(url, init);
    if (url.pathname.endsWith("/purchase")) return { ok: true, text: async () => JSON.stringify({ data: { NextAction: { requestedAction: "FundsLockingRequested" } } }) };
    return response;
  } });
  const receipt = await adapter.lockAward({ supplier: "techblog", amount: 70 });
  assert.equal(receipt.state, "FundsLockingRequested");
  assert.equal(receipt.badge, "PENDING");
  assert.equal(receipt.txHash, null);
});

test("advance on a lock id stays PENDING until the buyer side is FundsLocked, then REAL with the lock tx", async () => {
  const { adapter, env, fetch, records } = fixture({ state: "FundsLocked" });
  const locked = await adapter.lockAward({ supplier: "techblog", amount: 70 });
  const record = records.get(locked.escrow);
  record.purchase = { onChainState: null, NextAction: { requestedAction: "FundsLockingInitiated" }, CurrentTransaction: { txHash: TX } };
  const resumed = createRealAdapter({ env, fetch });
  const waiting = await resumed.advance(locked.id);
  assert.equal(waiting.badge, "PENDING");
  assert.equal(waiting.txHash, null);
  assert.equal(waiting.state, "FundsLockingInitiated");

  record.purchase = { onChainState: "FundsLocked", NextAction: { requestedAction: "WaitingForExternalAction" }, CurrentTransaction: { txHash: TX } };
  const confirmed = await resumed.advance(locked.id);
  assert.equal(confirmed.id, locked.id);
  assert.equal(confirmed.badge, "REAL");
  assert.equal(confirmed.txHash, TX);
  assert.deepEqual([confirmed.action, confirmed.amount, confirmed.from, confirmed.to], ["award", 70, "consumer", "techblog"]);
});

test("settlement receipts name their escrow and the treasury gets the verdict without escrow ids", async () => {
  const sent = [];
  const { adapter } = fixture({ state: "Withdrawn", treasury: async (move) => (sent.push(move), { state: "TransferSent", txHash: TX }) });
  const award = await adapter.lockAward({ supplier: "codepodcast", amount: 60 });
  const bond = await adapter.lockBond({ supplier: "codepodcast", amount: 15 });
  const receipts = await adapter.settle({ ...verdicts[1], awardEscrowId: award.id, bondEscrowId: bond.id });
  assert.deepEqual(receipts.map((r) => r.escrow), [award.escrow, bond.escrow, bond.escrow]);
  assert.equal(sent.length, 2);
  assert.ok(sent.every(({ verdict }) => !("awardEscrowId" in verdict) && !("bondEscrowId" in verdict)));
});

test("lovelace rejects fractional lovelace and converts exact ADA amounts", () => {
  assert.equal(lovelace(11.25), "11250000");
  for (const amount of [-1, 0, NaN, Infinity, 0.0000001, 1e20]) assert.throws(() => lovelace(amount), /amount/);
});

test("getAdapter uses explicit false for real, safe simulated default otherwise", () => {
  const previous = process.env.SIMULATE_PAYMENTS;
  try {
    for (const value of [undefined, "", "true", "FALSE", "invalid", "false"]) {
      if (value === undefined) delete process.env.SIMULATE_PAYMENTS;
      else process.env.SIMULATE_PAYMENTS = value;
      assert.equal(getAdapter(), value === "false" ? realAdapter : simulatedAdapter);
    }
  } finally {
    if (previous === undefined) delete process.env.SIMULATE_PAYMENTS;
    else process.env.SIMULATE_PAYMENTS = previous;
  }
});

test("Under-gate retry checks seller authorization independently of buyer refund request", async () => {
  const { adapter, env, fetch } = fixture();
  const verdict = verdicts[2];
  const award = await adapter.lockAward({ supplier: verdict.supplier, amount: verdict.award });
  const bond = await adapter.lockBond({ supplier: verdict.supplier, amount: verdict.bond });
  const awardId = JSON.parse(Buffer.from(award.id.slice(7), "base64url")).blockchainIdentifier;
  const calls = [];
  const resumed = createRealAdapter({ env, fetch: async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(url.pathname);
    if (body.blockchainIdentifier === awardId && url.pathname.endsWith("resolve-blockchain-identifier")) {
      const seller = url.pathname.includes("/payment/");
      return { ok: true, text: async () => JSON.stringify({ data: {
        onChainState: "FundsLocked", NextAction: { requestedAction: seller ? "AuthorizeRefundInitiated" : "SetRefundRequestedRequested" },
      } }) };
    }
    return fetch(url, init);
  } });
  const results = await resumed.settle({ ...verdict, awardEscrowId: award.id, bondEscrowId: bond.id });
  assert.ok(results.every(({ state }) => state !== "Error"));
  assert.equal(calls.filter((path) => path.endsWith("authorize-refund") || path.endsWith("request-refund")).length, 0);
  assert.ok(calls.includes("/api/v1/payment/resolve-blockchain-identifier"));
  assert.ok(calls.includes("/api/v1/purchase/resolve-blockchain-identifier"));
});

test("queued buyer refund uses the OpenAPI action names and is not repeated", async () => {
  const { adapter, env, fetch } = fixture();
  const verdict = verdicts[2];
  const award = await adapter.lockAward({ supplier: verdict.supplier, amount: verdict.award });
  const bond = await adapter.lockBond({ supplier: verdict.supplier, amount: verdict.bond });
  const calls = [];
  const resumed = createRealAdapter({ env, fetch: async (url, init) => {
    calls.push(url.pathname);
    if (url.pathname === "/api/v1/purchase/resolve-blockchain-identifier") {
      return { ok: true, text: async () => JSON.stringify({ data: {
        onChainState: "FundsLocked", NextAction: { requestedAction: "SetRefundRequestedInitiated" },
      } }) };
    }
    return fetch(url, init);
  } });
  await resumed.settle({ ...verdict, awardEscrowId: award.id, bondEscrowId: bond.id });
  assert.equal(calls.filter((path) => path.endsWith("request-refund")).length, 0);
  assert.equal(calls.filter((path) => path.endsWith("authorize-refund")).length, 0);
});

for (const verdict of [verdicts[0], verdicts[2]]) {
  test(`${verdict.kind}: refund advances only after on-chain RefundRequested, with the creator key`, async () => {
    const { adapter, calls, records, env, fetch } = fixture();
    await adapter.lockAward({ supplier: verdict.supplier, amount: verdict.award });
    await adapter.lockBond({ supplier: verdict.supplier, amount: verdict.bond });
    const results = await adapter.settle(verdict);
    const pending = results.find(({ action }) => action === (verdict.kind === "pass" ? "bond_return" : "award_reclaim"));
    assert.equal(pending.state, "RefundRequestedPending");
    assert.equal(calls.filter(({ path }) => path.endsWith("authorize-refund")).length, 0);
    calls.length = 0;
    const resumed = createRealAdapter({ env, fetch });
    const waiting = await resumed.advance(pending.id);
    assert.equal(waiting.state, "RefundRequestedPending");
    assert.equal(calls.filter(({ path }) => path.endsWith("request-refund") || path.endsWith("authorize-refund")).length, 0);
    const job = JSON.parse(Buffer.from(pending.id.slice(7), "base64url"));
    const record = records.get(job.blockchainIdentifier);
    record.payment = { ...record.payment, onChainState: "RefundRequested", NextAction: { requestedAction: "WaitingForExternalAction" } };
    record.purchase = { ...record.purchase, onChainState: "RefundRequested", NextAction: { requestedAction: "WaitingForExternalAction" } };
    calls.length = 0;
    const advanced = await resumed.advance(waiting.id);
    assert.equal(advanced.state, "RefundRequested");
    assert.equal(advanced.badge, "PENDING");
    assert.equal(advanced.txHash, null);
    const writes = calls.filter(({ path }) => path.endsWith("authorize-refund"));
    assert.equal(writes.length, 1);
    assert.equal(writes[0].key, verdict.kind === "pass" ? "test-BOARD" : "test-DEVNEWSLETTER");
    calls.length = 0;
    await resumed.advance(advanced.id);
    assert.equal(calls.filter(({ path }) => path.endsWith("authorize-refund")).length, 0);
    record.payment.onChainState = "RefundWithdrawn";
    record.purchase.onChainState = "RefundWithdrawn";
    assert.equal((await resumed.advance(advanced.id)).state, "RefundWithdrawn");
  });
}

test("award submit waits for a confirmed lock and can advance without a new purchase", async () => {
  const { adapter, calls, records } = fixture({ state: null });
  const verdict = verdicts[0];
  await adapter.lockAward({ supplier: verdict.supplier, amount: verdict.award });
  await adapter.lockBond({ supplier: verdict.supplier, amount: verdict.bond });
  calls.length = 0;
  const results = await adapter.settle(verdict);
  assert.equal(calls.filter(({ path }) => path.endsWith("submit-result")).length, 0);
  const award = results.find(({ action }) => action === "award_release");
  const job = JSON.parse(Buffer.from(award.id.slice(7), "base64url"));
  records.get(job.blockchainIdentifier).payment.onChainState = "FundsLocked";
  const advanced = await adapter.advance(award.id);
  assert.equal(advanced.state, "FundsLocked");
  assert.equal(calls.filter(({ path }) => path.endsWith("submit-result")).length, 1);
  assert.equal(calls.filter(({ path }) => path === "/purchase").length, 0);
});

for (const verdict of [verdicts[1], verdicts[2]]) {
  test(`${verdict.kind}: transfer advances after bond withdrawal and never pays twice`, async () => {
    const paid = new Map();
    let payments = 0;
    let treasuryCalls = 0;
    const treasury = async (move) => {
      treasuryCalls++;
      if (!paid.has(move.id)) {
        payments++;
        paid.set(move.id, { state: "TransferSent", txHash: TX });
      }
      return paid.get(move.id);
    };
    const { adapter, records, env, fetch } = fixture({ treasury });
    await adapter.lockAward({ supplier: verdict.supplier, amount: verdict.award });
    const bond = await adapter.lockBond({ supplier: verdict.supplier, amount: verdict.bond });
    const transfers = (await adapter.settle(verdict)).filter(({ state }) => state === "TransferPending");
    assert.equal(transfers.length, verdict.kind === "short_of_promise" ? 2 : 1);
    const resumed = createRealAdapter({ env, fetch, treasury });
    for (const transfer of transfers) {
      const waiting = await resumed.advance(transfer.id);
      assert.equal(waiting.state, "TransferPending");
      assert.equal(waiting.txHash, null);
    }
    assert.equal(treasuryCalls, 0);
    const bondId = JSON.parse(Buffer.from(bond.id.slice(7), "base64url")).blockchainIdentifier;
    records.get(bondId).payment.onChainState = "Withdrawn";
    for (const transfer of transfers) {
      const advanced = await resumed.advance(transfer.id);
      assert.equal(advanced.id, transfer.id);
      assert.equal(advanced.state, "TransferSent");
      assert.equal(advanced.badge, "REAL");
      assert.equal(advanced.txHash, TX);
      assert.equal(advanced.explorerUrl, `https://preprod.cardanoscan.io/transaction/${TX}`);
      assert.ok(paid.has(transfer.id), "receipt id is the treasury idempotency key");
      const callsBefore = treasuryCalls;
      assert.deepEqual(await resumed.advance(advanced.id), advanced);
      assert.deepEqual(await resumed.advance(transfer.id), advanced);
      assert.equal(treasuryCalls, callsBefore);
    }
    assert.equal(payments, transfers.length);
    const anotherInstance = createRealAdapter({ env, fetch, treasury });
    await anotherInstance.advance(transfers[0].id);
    assert.equal(payments, transfers.length, "persistent treasury deduplication prevents payment after restart");
  });
}

test("transfer advance without treasury stays pending even after bond Withdrawn", async () => {
  const { adapter } = fixture({ state: "Withdrawn" });
  await adapter.lockAward({ supplier: "codepodcast", amount: 60 });
  await adapter.lockBond({ supplier: "codepodcast", amount: 15 });
  const pending = (await adapter.settle(verdicts[1])).find(({ action }) => action === "bond_return");
  const advanced = await adapter.advance(pending.id);
  assert.equal(advanced.state, "TransferPending");
  assert.equal(advanced.txHash, null);
  assert.equal(advanced.explorerUrl, null);
});

const escrowId = (receipt) => JSON.parse(Buffer.from(receipt.id.slice(7), "base64url")).blockchainIdentifier;
function reconcile(record, state, action = "WaitingForExternalAction") {
  for (const side of ["payment", "purchase"]) {
    record[side] = { ...record[side], onChainState: state, NextAction: { requestedAction: action } };
  }
}
const mutations = (calls, id) => calls.filter(({ path, body }) => body.blockchainIdentifier === id && !path.endsWith("resolve-blockchain-identifier"));

for (const verdict of [verdicts[0], verdicts[1]]) {
  test(`${verdict.kind}: award early release submits, requests, cancels once and exposes only terminal proof`, async () => {
    const { adapter, calls, records, env, fetch } = fixture();
    const award = await adapter.lockAward({ supplier: verdict.supplier, amount: verdict.award });
    await adapter.lockBond({ supplier: verdict.supplier, amount: verdict.bond });
    const id = escrowId(award);
    calls.length = 0;
    const pending = (await adapter.settle(verdict)).find(({ action }) => action === "award_release");
    assert.equal(pending.badge, "PENDING");
    assert.equal(pending.txHash, null);
    const record = records.get(id);
    const resumed = createRealAdapter({ env, fetch });
    await resumed.advance(pending.id); // Submitted request is queued: no duplicate.
    reconcile(record, "ResultSubmitted");
    const requested = await resumed.advance(pending.id);
    assert.equal(requested.badge, "PENDING");
    assert.equal(requested.txHash, null);
    await resumed.advance(requested.id); // Refund request queued: no duplicate.
    reconcile(record, "Disputed");
    const cancelled = await resumed.advance(requested.id);
    assert.equal(cancelled.state, "Disputed");
    assert.equal(cancelled.badge, "PENDING");
    await resumed.advance(cancelled.id); // Cancel request queued: no duplicate.
    reconcile(record, "WithdrawAuthorized");
    await resumed.advance(cancelled.id);
    reconcile(record, "Withdrawn");
    const terminal = await resumed.advance(cancelled.id);
    assert.equal(terminal.badge, "REAL");
    assert.equal(terminal.txHash, TX);
    assert.equal(terminal.explorerUrl, `https://preprod.cardanoscan.io/transaction/${TX}`);
    assert.deepEqual(mutations(calls, id).map(({ path, key }) => [path, key]), [
      ["/payment/submit-result", `test-${verdict.supplier.toUpperCase()}`],
      ["/purchase/request-refund", "test-CONSUMER"],
      ["/purchase/cancel-refund-request", "test-CONSUMER"],
    ]);
    await resumed.advance(terminal.id);
    assert.equal(mutations(calls, id).length, 3);
  });
}

test("a rejected cancel is retried only on a later advance after both sides are read", async () => {
  const { adapter, calls, records, env, fetch } = fixture();
  const verdict = verdicts[0];
  const award = await adapter.lockAward({ supplier: "techblog", amount: verdict.award });
  await adapter.lockBond({ supplier: "techblog", amount: verdict.bond });
  const pending = (await adapter.settle(verdict)).find(({ action }) => action === "award_release");
  reconcile(records.get(escrowId(award)), "Disputed");
  let attempts = 0;
  const resumed = createRealAdapter({ env, fetch: async (url, init) => {
    if (url.pathname.endsWith("cancel-refund-request") && ++attempts === 1) {
      calls.push({ path: "/purchase/cancel-refund-request", body: JSON.parse(init.body), key: init.headers.token });
      return new Response(JSON.stringify({ message: "buyer window still open" }), { status: 400 });
    }
    return fetch(url, init);
  } });
  const rejected = await resumed.advance(pending.id);
  assert.equal(attempts, 1);
  assert.equal(rejected.state, "Disputed");
  assert.equal(rejected.badge, "PENDING");
  assert.match(rejected.error, /buyer window still open/);
  calls.length = 0;
  const retried = await resumed.advance(rejected.id);
  assert.equal(attempts, 2);
  assert.ok(!retried.error);
  assert.deepEqual(calls.map(({ path }) => path).sort(), [
    "/payment/resolve-blockchain-identifier", "/purchase/cancel-refund-request", "/purchase/resolve-blockchain-identifier",
  ]);
});

for (const verdict of [verdicts[1], verdicts[2]]) {
  test(`${verdict.kind}: transfer follow-up drives Board early release with supplier approval then pays once`, async () => {
    let payments = 0;
    const { adapter, calls, records } = fixture({ treasury: async () => {
      payments++; return { state: "TransferSent", txHash: TX };
    } });
    await adapter.lockAward({ supplier: verdict.supplier, amount: verdict.award });
    const bond = await adapter.lockBond({ supplier: verdict.supplier, amount: verdict.bond });
    const id = escrowId(bond);
    calls.length = 0;
    const pending = (await adapter.settle(verdict)).find(({ action }) => action === "bond_forfeit");
    reconcile(records.get(id), "ResultSubmitted");
    assert.equal((await adapter.advance(pending.id)).state, "TransferPending");
    reconcile(records.get(id), "Disputed");
    await adapter.advance(pending.id);
    assert.equal(payments, 0);
    reconcile(records.get(id), "WithdrawAuthorized");
    await adapter.advance(pending.id);
    assert.equal(payments, 0);
    reconcile(records.get(id), "Withdrawn");
    const paid = await adapter.advance(pending.id);
    assert.equal(paid.state, "TransferSent");
    assert.equal(paid.badge, "REAL");
    assert.equal(payments, 1);
    await adapter.advance(paid.id);
    assert.equal(payments, 1);
    assert.deepEqual(mutations(calls, id).map(({ path, key }) => [path, key]), [
      ["/payment/submit-result", "test-BOARD"],
      ["/purchase/request-refund", `test-${verdict.supplier.toUpperCase()}`],
      ["/purchase/cancel-refund-request", `test-${verdict.supplier.toUpperCase()}`],
    ]);
  });
}

for (const [side, state, action] of [
  ["payment", "FundsLocked", "SubmitResultRequested"], ["payment", "FundsLocked", "SubmitResultInitiated"],
  ["purchase", "ResultSubmitted", "SetRefundRequestedRequested"], ["purchase", "ResultSubmitted", "SetRefundRequestedInitiated"],
  ["purchase", "Disputed", "UnSetRefundRequestedRequested"], ["purchase", "Disputed", "UnSetRefundRequestedInitiated"],
]) {
  test(`early release waits for queued ${action} without issuing another mutation`, async () => {
    const { adapter, calls, records } = fixture();
    const award = await adapter.lockAward({ supplier: "techblog", amount: 70 });
    await adapter.lockBond({ supplier: "techblog", amount: 17.5 });
    const pending = (await adapter.settle(verdicts[0])).find(({ action }) => action === "award_release");
    const id = escrowId(award);
    reconcile(records.get(id), state);
    records.get(id)[side].NextAction.requestedAction = action;
    calls.length = 0;
    await adapter.advance(pending.id);
    assert.equal(mutations(calls, id).length, 0);
    assert.equal(calls.filter(({ body }) => body.blockchainIdentifier === id).length, 2);
  });
}

test("early release requires WaitingForExternalAction on the acting side", async () => {
  const { adapter, calls, records } = fixture();
  const award = await adapter.lockAward({ supplier: "techblog", amount: 70 });
  await adapter.lockBond({ supplier: "techblog", amount: 17.5 });
  const pending = (await adapter.settle(verdicts[0])).find(({ action }) => action === "award_release");
  const id = escrowId(award);
  for (const state of ["FundsLocked", "ResultSubmitted", "Disputed"]) {
    reconcile(records.get(id), state, "WaitingForManualAction");
    records.get(id).payment.resultHash = null;
    calls.length = 0;
    const waiting = await adapter.advance(pending.id);
    assert.equal(waiting.badge, "PENDING");
    assert.equal(mutations(calls, id).length, 0);
  }
});

test("cooperative refund returns buyer terminal proof even when seller status lags", async () => {
  const { adapter, records } = fixture();
  const award = await adapter.lockAward({ supplier: "devnewsletter", amount: 70 });
  await adapter.lockBond({ supplier: "devnewsletter", amount: 17.5 });
  const pending = (await adapter.settle(verdicts[2])).find(({ action }) => action === "award_reclaim");
  const record = records.get(escrowId(award));
  record.purchase = { onChainState: "RefundWithdrawn", CurrentTransaction: { txHash: TX }, NextAction: { requestedAction: "WaitingForExternalAction" } };
  record.payment = { onChainState: "RefundAuthorized", CurrentTransaction: null, NextAction: { requestedAction: "WaitingForExternalAction" } };
  const refunded = await adapter.advance(pending.id);
  assert.equal(refunded.state, "RefundWithdrawn");
  assert.equal(refunded.badge, "REAL");
  assert.equal(refunded.txHash, TX);
});

test("timer withdrawal is recognized without further cooperative requests", async () => {
  const { adapter, calls, records } = fixture();
  const award = await adapter.lockAward({ supplier: "techblog", amount: 70 });
  await adapter.lockBond({ supplier: "techblog", amount: 17.5 });
  const pending = (await adapter.settle(verdicts[0])).find(({ action }) => action === "award_release");
  reconcile(records.get(escrowId(award)), "Withdrawn");
  calls.length = 0;
  const paid = await adapter.advance(pending.id);
  assert.equal(paid.badge, "REAL");
  assert.equal(paid.state, "Withdrawn");
  assert.equal(mutations(calls, escrowId(award)).length, 0);
});

test("settle starts the first step; only advance drives an already submitted result", async () => {
  const { adapter, calls, records } = fixture();
  const award = await adapter.lockAward({ supplier: "techblog", amount: 70 });
  await adapter.lockBond({ supplier: "techblog", amount: 17.5 });
  reconcile(records.get(escrowId(award)), "ResultSubmitted");
  calls.length = 0;
  const pending = (await adapter.settle(verdicts[0])).find(({ action }) => action === "award_release");
  assert.equal(mutations(calls, escrowId(award)).length, 0);
  await adapter.advance(pending.id);
  assert.equal(mutations(calls, escrowId(award))[0].path, "/purchase/request-refund");
});

for (const [sellerState, buyerState] of [["Disputed", "ResultSubmitted"], ["WithdrawAuthorized", "Disputed"]]) {
  test(`early release does not repeat an effect visible to seller ${sellerState} while buyer lags at ${buyerState}`, async () => {
    const { adapter, calls, records } = fixture();
    const award = await adapter.lockAward({ supplier: "techblog", amount: 70 });
    await adapter.lockBond({ supplier: "techblog", amount: 17.5 });
    const pending = (await adapter.settle(verdicts[0])).find(({ action }) => action === "award_release");
    const id = escrowId(award);
    reconcile(records.get(id), buyerState);
    records.get(id).payment.onChainState = sellerState;
    calls.length = 0;
    await adapter.advance(pending.id);
    assert.equal(mutations(calls, id).length, 0);
  });
}

for (const [sellerState, sellerAction, buyerState] of [
  ["RefundRequested", "WaitingForManualAction", "FundsLocked"],
  ["RefundRequested", "WaitingForExternalAction", "RefundAuthorized"],
]) {
  test(`refund does not repeat a visible effect with seller ${sellerState}/${sellerAction} and buyer ${buyerState}`, async () => {
    const { adapter, calls, records } = fixture();
    const award = await adapter.lockAward({ supplier: "devnewsletter", amount: 70 });
    await adapter.lockBond({ supplier: "devnewsletter", amount: 17.5 });
    const pending = (await adapter.settle(verdicts[2])).find(({ action }) => action === "award_reclaim");
    const id = escrowId(award);
    reconcile(records.get(id), buyerState);
    records.get(id).payment.onChainState = sellerState;
    records.get(id).payment.NextAction.requestedAction = sellerAction;
    calls.length = 0;
    await adapter.advance(pending.id);
    assert.equal(mutations(calls, id).length, 0);
  });
}

const RESULT = "f".repeat(64);
for (const verdict of verdicts) {
  test(`${verdict.kind}: every submit-result carries the delivery result hash; the treasury gets the verdict without it`, async () => {
    const sent = [];
    const treasury = async (move) => (sent.push(move), { state: "TransferSent", txHash: TX });
    const { adapter, calls, records } = fixture({ treasury });
    const award = await adapter.lockAward({ supplier: verdict.supplier, amount: verdict.award });
    const bond = await adapter.lockBond({ supplier: verdict.supplier, amount: verdict.bond });
    const signed = { ...verdict, hash: "9".repeat(64) };
    calls.length = 0;
    await adapter.settle({ ...signed, awardEscrowId: award.id, bondEscrowId: bond.id, resultHash: RESULT });
    const submits = calls.filter(({ path }) => path.endsWith("submit-result"));
    const on = (lock) => submits.filter(({ body }) => body.blockchainIdentifier === lock.escrow);
    // Pass: award only (bond refunded). Short of promise: award and bond. Under gate: bond only (award refunded).
    assert.equal(on(award).length, verdict.kind === "under_gate" ? 0 : 1);
    assert.equal(on(bond).length, verdict.kind === "pass" ? 0 : 1);
    assert.ok(submits.length > 0 && submits.every(({ body }) => body.submitResultHash === RESULT));

    if (verdict.kind !== "pass") {
      records.get(bond.escrow).payment.onChainState = "Withdrawn";
      const pending = (await adapter.settle({ ...signed, awardEscrowId: award.id, bondEscrowId: bond.id, resultHash: RESULT }));
      for (const r of pending.filter(({ state }) => state === "TransferPending")) await adapter.advance(r.id);
      assert.ok(sent.length > 0);
      for (const move of sent) assert.deepEqual(move.verdict, signed, "treasury verdict is the signed one, no result hash");
    }
  });
}

test("without a delivery result hash (or with a malformed one) settlement anchors the verdict hash", async () => {
  for (const resultHash of [undefined, "abc", "F".repeat(64)]) {
    const { adapter, calls } = fixture();
    const award = await adapter.lockAward({ supplier: "techblog", amount: 70 });
    const bond = await adapter.lockBond({ supplier: "techblog", amount: 17.5 });
    calls.length = 0;
    await adapter.settle({ ...verdicts[0], hash: "9".repeat(64), awardEscrowId: award.id, bondEscrowId: bond.id, resultHash });
    const submit = calls.find(({ path }) => path.endsWith("submit-result"));
    assert.equal(submit.body.submitResultHash, "9".repeat(64));
  }
});
