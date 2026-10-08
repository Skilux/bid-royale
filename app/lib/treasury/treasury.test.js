import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { installNextResolution } from "../board/test-alias.js";
installNextResolution();
const { buildVerdict } = await import("@/lib/verifier");
const { publicKeyHex, publicKeyFromSecret } = await import("@/lib/signing");
const { planSettlement } = await import("@/lib/settlement/plan");
const { createMemoryStore, createUpstashStore } = await import("@/lib/board/store");
const { createClient } = await import("@/lib/masumi/client");
const { executeTransfer, authorizeTransfer, getTransferStatus } = await import("@/lib/treasury");
const { createTreasuryClient } = await import("@/lib/masumi/treasury-client");
const { createHandler, loadConfig } = await import("../../scripts/treasury-server.mjs");
const secret = "offline treasury fixture";
const boardPublicKey = publicKeyHex(publicKeyFromSecret(secret));
const verdict = buildVerdict({ supplier: "codepodcast", verified: 6, impressions: 1000, promised: 8, award: 60, signingSecret: secret });
const moves = planSettlement(verdict).filter((move) => move.via === "plain_transfer");
const hash = "a".repeat(64);
function fixture(fetchImpl) {
  const calls = [];
  const client = createClient({ baseUrl: "https://node.invalid/api/v1", token: "test-credential", timeoutMs: 5,
    fetch: fetchImpl ?? (async (url, options) => {
      calls.push({ url: String(url), ...options });
      return new Response(JSON.stringify({ data: options.method === "POST" ? { transferId: "node-id" } : { transfers: [{ status: "Confirmed", txHash: hash }] } }));
    }) });
  return { id: "receipt", verdict, move: moves[0], boardPublicKey, store: createMemoryStore(), client,
    fromAddress: "board-wallet", addresses: { consumer: "consumer-wallet", codepodcast: "supplier-wallet" }, calls };
}

test("signed forfeiture and remainder use exact addresses and lovelace; repeat polls with REAL proof", async () => {
  for (const move of moves) {
    const f = { ...fixture(), move };
    assert.equal((await executeTransfer(f)).state, "Pending");
    assert.equal(f.calls.length, 1);
    assert.deepEqual(JSON.parse(f.calls[0].body), { fromWalletAddress: "board-wallet", toAddress: f.addresses[move.to], lovelaceAmount: String(Math.round(move.amount * 1e6)) });
    const result = await executeTransfer(f);
    assert.equal(result.badge, "REAL");
    assert.equal(result.explorerUrl, `https://preprod.cardanoscan.io/transaction/${hash}`);
    assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
  }
});
test("tampering, bad signatures, and changed moves cannot submit", async () => {
  for (const change of [
    { verdict: { ...verdict, delivered: 7 } }, { verdict: { ...verdict, signature: "0".repeat(128) } },
    { move: { ...moves[0], amount: 12 } }, { move: { ...moves[0], to: "techblog" } }, { verdict: null },
  ]) {
    const f = { ...fixture(), ...change };
    assert.equal(authorizeTransfer(f).authorized, false);
    assert.notEqual((await executeTransfer(f)).state, "Pending");
    assert.equal(f.calls.length, 0);
  }
});
test("concurrent reservations pay once; reused id for another move is rejected", async () => {
  const f = fixture();
  await Promise.all(Array.from({ length: 10 }, () => executeTransfer(f)));
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
  assert.equal((await executeTransfer({ ...f, move: moves[1] })).state, "IdConflict");
});
test("below minimum is labelled and never calls node", async () => {
  const small = buildVerdict({ supplier: "codepodcast", verified: 6, impressions: 1000, promised: 8, award: 6, signingSecret: secret });
  const f = { ...fixture(), verdict: small, move: planSettlement(small).find((m) => m.via === "plain_transfer") };
  const result = await executeTransfer(f);
  assert.equal(result.state, "BelowMinimum");
  assert.equal(result.badge, "PENDING");
  assert.equal(f.calls.length, 0);
});
test("5xx and timeout stay pending and never retry an ambiguous POST", async () => {
  for (const mode of ["5xx", "timeout"]) {
    let calls = 0;
    const f = fixture(async (url, { signal }) => {
      calls++;
      if (mode === "5xx") return new Response('{}', { status: 503 });
      return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    });
    const first = await executeTransfer(f);
    assert.equal(first.state, "Pending");
    assert.match(first.error, /reconciliation/);
    await executeTransfer(f);
    assert.equal(calls, 1);
  }
});
test("Upstash uses durable exact-key SET NX and same REST client with timeouts", async () => {
  const calls = [];
  const store = createUpstashStore({ url: "https://redis.invalid", token: "fixture", fetchImpl: async (url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    const command = JSON.parse(options.body); calls.push(command);
    return new Response(JSON.stringify({ result: command[0] === "GET" ? JSON.stringify({ transferId: "saved" }) : "OK" }));
  } });
  assert.equal(await store.reserveTransfer("r", { state: "Pending" }), true);
  await store.setTransfer("r", { transferId: "saved" });
  assert.deepEqual(await store.getTransfer("r"), { transferId: "saved" });
  assert.deepEqual(calls[0], ["SET", "treasury:transfer:r", JSON.stringify({ state: "Pending" }), "NX"]);
});
async function http(config, method, url, authorization, body) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  Object.assign(req, { method, url, headers: { authorization } });
  let status, output;
  await createHandler(config)(req, { writeHead(code) { status = code; }, end(text) { output = JSON.parse(text); } });
  return { status, output };
}
test("server auth and health; POST and GET offline", async () => {
  const config = { ...fixture(), token: "fixture-bearer" };
  for (const token of [undefined, "Bearer wrong"]) assert.equal((await http(config, "POST", "/transfers", token)).status, 401);
  assert.deepEqual(await http(config, "GET", "/health"), { status: 200, output: { ok: true } });
  const body = { id: config.id, verdict, move: config.move };
  assert.equal((await http(config, "POST", "/transfers", "Bearer fixture-bearer", body)).output.state, "Pending");
  assert.equal((await http(config, "GET", "/transfers/receipt", "Bearer fixture-bearer")).output.badge, "REAL");
  assert.throws(() => loadConfig({}), /Treasury missing environment/);
});
test("missing hashes stay PENDING; status errors never crash", async () => {
  const f = fixture(async () => new Response(JSON.stringify({ data: { transfers: [{ status: "Pending", txHash: "invalid" }] } })));
  await f.store.reserveTransfer(f.id, { transferId: "saved" });
  assert.deepEqual(await getTransferStatus(f), { state: "Pending", txHash: null, badge: "PENDING", explorerUrl: null });
  const broken = fixture(async () => new Response('{}', { status: 503 }));
  await broken.store.reserveTransfer(broken.id, { transferId: "saved" });
  const result = await getTransferStatus(broken);
  assert.equal(result.state, "Pending");
  assert.equal(result.badge, "PENDING");
  assert.equal(result.txHash, null);
  assert.match(result.error, /unavailable/);
});
test("Vercel client matches flattened adapter hook, contains no Admin env reference, degrades safely", async () => {
  const source = await readFile(new URL("../masumi/treasury-client.js", import.meta.url), "utf8");
  assert.equal(source.includes("MASUMI_ADMIN_KEY"), false);
  let body;
  const env = { TREASURY_URL: "https://treasury.invalid/", TREASURY_TOKEN: "fixture-bearer" };
  const hook = createTreasuryClient({ env, fetch: async (url, options) => {
    assert.equal(url, "https://treasury.invalid/transfers");
    assert.equal(options.headers.Authorization, "Bearer fixture-bearer");
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ state: "Confirmed", txHash: hash }));
  } });
  assert.deepEqual(await hook({ id: "r", verdict, ...moves[0] }), { state: "Confirmed", txHash: hash });
  assert.deepEqual(body, { id: "r", verdict, move: { reason: moves[0].reason, from: moves[0].from, to: moves[0].to, amount: moves[0].amount } });
  for (const fetchImpl of [async () => new Response('{}', { status: 503 }), async (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))))]) {
    const result = await createTreasuryClient({ env, fetch: fetchImpl, timeoutMs: 5 })({ id: "r", verdict, ...moves[0] });
    assert.equal(result.state, "TransferPending"); assert.ok(result.error); assert.equal(result.txHash, null);
  }
});
