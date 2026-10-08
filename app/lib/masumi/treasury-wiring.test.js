import test from "node:test";
import assert from "node:assert/strict";
import { installNextResolution } from "../board/test-alias.js";
installNextResolution();
const { planSettlement } = await import("@/lib/settlement/plan");

const verdict = { supplier: "codepodcast", kind: "short_of_promise", delivered: 6, promised: 8,
  gate: 5, award: 60, bond: 15, hash: "a".repeat(64), signature: "test-board-signature" };
const TX = "b".repeat(64);
const idFrom = (receipt) => JSON.parse(Buffer.from(receipt.id.slice(7), "base64url")).blockchainIdentifier;

test("selected real adapter wires the treasury worker, preserves its boundary, and stays pending without treasury config", async () => {
  const originalEnv = process.env;
  const originalFetch = globalThis.fetch;
  const records = new Map();
  const workerCalls = [];
  let workerResult = { state: "TransferPending", txHash: null };
  const env = { SIMULATE_PAYMENTS: "false", MASUMI_PAYMENT_BASE_URL: "https://masumi.invalid/api/v1",
    MASUMI_NETWORK: "Preprod", MASUMI_SMART_CONTRACT_ADDRESS: "test-contract",
    MASUMI_KEY_CONSUMER: "test-consumer", MASUMI_KEY_BOARD: "test-board", MASUMI_KEY_CODEPODCAST: "test-codepodcast",
    MASUMI_AGENT_BOARD: "board".repeat(12), MASUMI_AGENT_CODEPODCAST: "codepodcast".repeat(6) };
  try {
    // Fail immediately if the Vercel path ever reads the worker's Admin credential.
    process.env = new Proxy(env, { get(target, key) {
      assert.notEqual(key, "MASUMI_ADMIN_KEY");
      return Reflect.get(target, key);
    } });
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      if (String(url).startsWith("https://treasury.invalid")) {
        workerCalls.push({ url: String(url), body, headers: init.headers, signal: init.signal });
        return new Response(JSON.stringify(workerResult));
      }
      const path = new URL(url).pathname;
      if (path === "/api/v1/payment") {
        const blockchainIdentifier = `escrow-${records.size}`;
        records.set(blockchainIdentifier, { onChainState: "FundsLocked", NextAction: { requestedAction: "WaitingForExternalAction" } });
        return new Response(JSON.stringify({ data: { blockchainIdentifier,
          SmartContractWallet: { walletVkey: "seller-vkey" }, PaymentSource: { smartContractAddress: "test-contract" },
          ...Object.fromEntries(["payByTime", "submitResultTime", "unlockTime", "externalDisputeUnlockTime"]
            .map((key) => [key, String(Date.parse(body[key]))])),
        } }));
      }
      return new Response(JSON.stringify({ data: records.get(body.blockchainIdentifier) }));
    };
    async function settleAndWithdraw(adapter) {
      const [award, bond] = await Promise.all([
        adapter.lockAward({ supplier: verdict.supplier, amount: verdict.award }),
        adapter.lockBond({ supplier: verdict.supplier, amount: verdict.bond }),
      ]);
      const transfers = (await adapter.settle({ ...verdict, awardEscrowId: award.id, bondEscrowId: bond.id }))
        .filter(({ action }) => action === "bond_return" || action === "bond_forfeit");
      assert.equal(transfers.length, 2);
      assert.ok(transfers.every(({ state, txHash }) => state === "TransferPending" && txHash === null));
      records.get(idFrom(bond)).onChainState = "Withdrawn";
      return transfers;
    }

    const { getAdapter } = await import("@/lib/masumi");
    const unconfigured = getAdapter();
    const pending = await settleAndWithdraw(unconfigured);
    for (const receipt of pending) assert.equal((await unconfigured.advance(receipt.id)).state, "TransferPending");
    assert.equal(workerCalls.length, 0);
    env.TREASURY_URL = "https://treasury.invalid/";
    assert.equal(getAdapter(), unconfigured, "URL alone does not wire the worker");
    env.TREASURY_TOKEN = "test-worker-token";
    const configured = getAdapter();
    assert.notEqual(configured, unconfigured);
    assert.equal(getAdapter(), configured, "selection reuses the configured adapter");
    const transfers = await settleAndWithdraw(configured);
    for (const receipt of transfers) {
      const awaitingHash = await configured.advance(receipt.id);
      assert.equal(awaitingHash.state, "TransferPending");
      assert.equal(awaitingHash.badge, "PENDING");
      assert.equal(awaitingHash.txHash, null);
    }
    workerResult = { state: "TransferSent", txHash: "invalid-worker-hash" };
    const invalid = await configured.advance(transfers[0].id);
    assert.equal(invalid.badge, "PENDING");
    assert.equal(invalid.txHash, null);
    assert.equal(invalid.explorerUrl, null);
    workerResult = { state: "TransferSent", txHash: TX };
    for (const receipt of transfers) {
      const paid = await configured.advance(receipt.id);
      assert.equal(paid.state, "TransferSent");
      assert.equal(paid.badge, "REAL");
      assert.equal(paid.txHash, TX);
      assert.equal(paid.explorerUrl, `https://preprod.cardanoscan.io/transaction/${TX}`);
      assert.equal(paid.id, receipt.id);
    }
    const expectedMoves = planSettlement(verdict).filter(({ via }) => via === "plain_transfer")
      .map(({ reason, from, to, amount }) => ({ reason, from, to, amount }));
    assert.deepEqual(workerCalls.slice(-2).map(({ body }) => body.move), expectedMoves);
    for (const call of workerCalls) {
      assert.equal(call.url, "https://treasury.invalid/transfers");
      assert.equal(call.headers.Authorization, "Bearer test-worker-token");
      assert.ok(call.signal instanceof AbortSignal);
      assert.ok(transfers.some(({ id }) => id === call.body.id));
      assert.equal(call.body.verdict.signature, verdict.signature);
      assert.equal(call.body.verdict.hash, verdict.hash);
    }
    const before = workerCalls.length;
    await configured.advance(transfers[0].id);
    assert.equal(workerCalls.length, before, "paid worker results remain cached");
    delete env.TREASURY_URL;
    assert.equal(getAdapter(), unconfigured);
    delete env.TREASURY_TOKEN;
    env.TREASURY_URL = "https://treasury.invalid/";
    assert.equal(getAdapter(), unconfigured);
    env.SIMULATE_PAYMENTS = "true";
    assert.equal(getAdapter().badge, "SIMULATED");
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }
});
