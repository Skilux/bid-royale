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
        payment: { onChainState: state, CurrentTransaction: { txHash: TX } },
        purchase: { onChainState: state, CurrentTransaction: { txHash: TX } },
      });
    } else {
      const record = records.get(body.blockchainIdentifier);
      const side = path.startsWith("/purchase") ? "purchase" : "payment";
      data = record[side];
      if (path.endsWith("submit-result")) data = { ...data, NextAction: { requestedAction: "SubmitResultRequested" }, resultHash: body.submitResultHash };
      if (path.endsWith("request-refund")) data = { ...data, NextAction: { requestedAction: "SetRefundRequestedRequested" } };
      if (path.endsWith("authorize-refund")) {
        assert.ok(["RefundRequested", "Disputed"].includes(data.onChainState), "seller authorization before RefundRequested");
        data = { ...data, NextAction: { requestedAction: "AuthorizeRefundRequested" } };
      }
      record[side] = data;
    }
    return { ok: true, status: 200, json: async () => ({ status: "Success", data }) };
  };
  return { adapter: createRealAdapter({ env, fetch, now: () => Date.parse("2026-10-08T22:00:00Z"), treasury }), calls, env, fetch, records };
}

const verdicts = [
  { supplier: "techblog", kind: "pass", promised: 7, delivered: 8, gate: 5, award: 7, bond: 1.75 },
  { supplier: "codepodcast", kind: "short_of_promise", promised: 8, delivered: 6, gate: 5, award: 6, bond: 1.5 },
  { supplier: "devnewsletter", kind: "under_gate", promised: 12, delivered: 0, gate: 5, award: 7, bond: 1.75 },
];

test("award lock uses supplier payment then Consumer purchase with signed terms", async () => {
  const { adapter, calls } = fixture();
  const locked = await adapter.lockAward({ supplier: "techblog", amount: 7 });
  assert.deepEqual(calls.map(({ path, key }) => [path, key]), [["/payment", "test-TECHBLOG"], ["/purchase", "test-CONSUMER"]]);
  assert.deepEqual(calls[0].body.RequestedFunds, [{ amount: "7000000", unit: "" }]);
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
  await adapter.lockAward({ supplier: "techblog", amount: 7 });
  assert.notEqual(calls[0].body.identifierFromPurchaser, calls[3].body.identifierFromPurchaser);
});

test("bond uses Board seller and Supplier buyer; bid fee is entirely simulated", async () => {
  const { adapter, calls } = fixture();
  await adapter.lockBond({ supplier: "codepodcast", amount: 1.5 });
  assert.deepEqual(calls.map(({ key }) => key), ["test-BOARD", "test-CODEPODCAST"]);
  const fee = await adapter.lockBidFee({ supplier: "gamingforum", amount: 0.2 });
  assert.equal(fee.badge, "SIMULATED");
  assert.equal(calls.length, 2);
  assert.equal(await adapter.getEscrowStatus(fee.id), "FundsLocked");
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
  await adapter.lockAward({ supplier: "techblog", amount: 7 });
  await adapter.lockBond({ supplier: "techblog", amount: 1.75 });
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
    await adapter.lockAward({ supplier: "codepodcast", amount: 6 });
    await adapter.lockBond({ supplier: "codepodcast", amount: 1.5 });
    const receipts = await adapter.settle(verdicts[1]);
    assert.equal(receipts[1].state, state === "Withdrawn" ? "TransferSent" : "TransferPending");
  }
  assert.deepEqual(transfers.map(({ amount }) => amount), [1.125, 0.375]);
});

test("missing configuration gives a clear Error receipt without network calls", async () => {
  const adapter = createRealAdapter({ env: {}, fetch: () => assert.fail("network used") });
  const receipt = await adapter.lockAward({ supplier: "techblog", amount: 7 });
  assert.equal(receipt.state, "Error");
  assert.match(receipt.error, /missing MASUMI_PAYMENT_BASE_URL/);
  assert.equal(receipt.txHash, null);
});

test("missing party key is validated before seller payment", async () => {
  const { env } = fixture();
  delete env.MASUMI_KEY_CONSUMER;
  const adapter = createRealAdapter({ env, fetch: () => assert.fail("network used") });
  assert.match((await adapter.lockAward({ supplier: "techblog", amount: 7 })).error, /MASUMI_KEY_CONSUMER/);
});

test("pending purchase has no invented hash or REAL badge", async () => {
  const { env, fetch } = fixture();
  const adapter = createRealAdapter({ env, fetch: async (url, init) => {
    const response = await fetch(url, init);
    if (url.pathname.endsWith("/purchase")) return { ok: true, json: async () => ({ data: { NextAction: { requestedAction: "FundsLockingRequested" } } }) };
    return response;
  } });
  const receipt = await adapter.lockAward({ supplier: "techblog", amount: 7 });
  assert.equal(receipt.state, "FundsLockingRequested");
  assert.equal(receipt.badge, "PENDING");
  assert.equal(receipt.txHash, null);
});

test("lovelace rejects fractional lovelace and converts exact ADA amounts", () => {
  assert.equal(lovelace(1.125), "1125000");
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
      return { ok: true, json: async () => ({ data: {
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
      return { ok: true, json: async () => ({ data: {
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
