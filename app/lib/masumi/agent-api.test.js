import test from "node:test";
import assert from "node:assert/strict";
import { installNextResolution } from "../board/test-alias.js";
installNextResolution();
const { availability, getInputSchema, inputHash, jobStatus, startJob } = await import("@/lib/masumi/agent-api");
const { AGENT_NAMES, priceFor } = await import("@/lib/masumi/agent-schemas");
const { createMemoryStore } = await import("@/lib/board/store");

const NOW = Date.parse("2026-10-08T12:00:00Z");
const env = {
  MASUMI_PAYMENT_BASE_URL: "https://masumi.invalid/api/v1", MASUMI_NETWORK: "Preprod", MASUMI_SMART_CONTRACT_ADDRESS: "test-contract",
  ...Object.fromEntries(AGENT_NAMES.flatMap((n) => [[`MASUMI_KEY_${n.toUpperCase()}`, `key-${n}`], [`MASUMI_AGENT_${n.toUpperCase()}`, `agent-${n}`]])),
};

function fixture({ state = null, fail } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const path = url.pathname.replace("/api/v1", "");
    const body = JSON.parse(init.body);
    calls.push({ path, body, key: init.headers.token, signal: init.signal });
    if (fail) return new Response(JSON.stringify({ message: fail.message }), { status: fail.status });
    const data = path === "/payment"
      ? {
          blockchainIdentifier: "escrow-1", SmartContractWallet: { walletVkey: "vkey-1" },
          ...Object.fromEntries(["payByTime", "submitResultTime", "unlockTime", "externalDisputeUnlockTime"].map((k) => [k, String(Date.parse(body[k]))])),
        }
      : { onChainState: state, resultHash: state === "ResultSubmitted" ? "result-hash" : null };
    return new Response(JSON.stringify({ status: "success", data }), { status: 200 });
  };
  return { calls, fetch, store: createMemoryStore() };
}

const request = (body) => new Request("https://app.invalid/start_job", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const PURCHASER = "abcdef0123456789abcd";

test("every agent answers availability and input_schema, unknown agent is 404", async () => {
  for (const name of AGENT_NAMES) {
    const a = await availability(name, { env });
    assert.equal(a.status, 200);
    assert.deepEqual(await a.json(), { status: "available", type: "masumi-agent", message: "Ready to accept jobs" });
    const s = await getInputSchema(name);
    const { input_data } = await s.json();
    assert.equal(input_data[0].id, name === "board" ? "brief" : "impressions");
  }
  for (const route of [availability("nobody", { env }), getInputSchema("nobody"), startJob("nobody", request({}), { env }), jobStatus("nobody", "x", { env })]) {
    const res = await route;
    assert.equal(res.status, 404);
    assert.equal((await res.json()).status, "error");
  }
});

test("availability reports unavailable when the agent's key is missing", async () => {
  const { MASUMI_KEY_TECHBLOG: _, ...partial } = env;
  assert.equal((await (await availability("techblog", { env: partial })).json()).status, "unavailable");
  assert.equal((await (await availability("board", { env: partial })).json()).status, "available");
});

test("start_job creates payment terms with the agent's own key and stores the job", async () => {
  const f = fixture();
  const res = await startJob("techblog", request({ identifier_from_purchaser: PURCHASER, input_data: { impressions: 2000 } }), { env, fetch: f.fetch, store: f.store, now: () => NOW });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(f.calls.length, 1);
  const [{ path, body, key, signal }] = f.calls;
  assert.equal(path, "/payment");
  assert.equal(key, "key-techblog");
  assert.ok(signal instanceof AbortSignal);
  assert.equal(body.agentIdentifier, "agent-techblog");
  assert.equal(body.paymentSourceType, "Web3CardanoV2");
  assert.equal(body.supportedPaymentSourceIndex, 0);
  assert.deepEqual(body.RequestedFunds, [{ amount: "14000000", unit: "" }]);
  assert.equal(body.inputHash, inputHash(PURCHASER, { impressions: 2000 }));
  assert.ok(Date.parse(body.submitResultTime) >= NOW + 15 * 60_000);
  assert.deepEqual(Object.keys(out).sort(), [
    "agentIdentifier", "blockchainIdentifier", "externalDisputeUnlockTime", "id", "identifierFromPurchaser", "input_hash",
    "payByTime", "sellerVKey", "status", "submitResultTime", "unlockTime",
  ]);
  assert.equal(out.status, "success");
  assert.equal(out.sellerVKey, "vkey-1");
  assert.equal(out.agentIdentifier, "agent-techblog");
  assert.equal(out.input_hash, body.inputHash);
  assert.equal((await f.store.getJob("techblog", out.id)).blockchainIdentifier, "escrow-1");
  assert.equal(await f.store.getJob("codepodcast", out.id), null);
});

test("board job is priced at the bid fee", () => {
  assert.equal(priceFor("board", { brief: "x" }), 0.2);
  assert.equal(priceFor("gamingforum", { impressions: 1500 }), 4.5);
});

test("input hash is stable under key order", () => {
  assert.equal(inputHash(PURCHASER, { a: 1, b: { c: 2, d: 3 } }), inputHash(PURCHASER, { b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(inputHash(PURCHASER, { a: 1 }), inputHash("other-identifier-1", { a: 1 }));
});

test("start_job rejects malformed bodies with 400 and never calls the node", async () => {
  const f = fixture();
  const bad = [
    "not json",
    {},
    { identifier_from_purchaser: "short", input_data: { impressions: 1000 } },
    { identifier_from_purchaser: "not-a-hex-string-ok", input_data: { impressions: 1000 } },
    { identifier_from_purchaser: "abcdef0123456789abc", input_data: { impressions: 1000 } },
    { identifier_from_purchaser: PURCHASER },
    { identifier_from_purchaser: PURCHASER, input_data: [] },
    { identifier_from_purchaser: PURCHASER, input_data: { impressions: "1000" } },
    { identifier_from_purchaser: PURCHASER, input_data: { impressions: 1000.5 } },
    { identifier_from_purchaser: PURCHASER, input_data: { impressions: 50 } },
    { identifier_from_purchaser: PURCHASER, input_data: { impressions: 10001 } },
  ];
  for (const body of bad) {
    const res = await startJob("codepodcast", request(body), { env, fetch: f.fetch, store: f.store });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal((await res.json()).status, "error");
  }
  const empty = await startJob("board", request({ identifier_from_purchaser: PURCHASER, input_data: { brief: "  " } }), { env, fetch: f.fetch, store: f.store });
  assert.equal(empty.status, 400);
  assert.equal(f.calls.length, 0);
});

test("start_job returns an error shape, not a crash, when config or the node fails", async () => {
  const body = { identifier_from_purchaser: PURCHASER, input_data: { impressions: 1000 } };
  const { MASUMI_KEY_TECHBLOG: _, ...partial } = env;
  const missing = await startJob("techblog", request(body), { env: partial, fetch: fixture().fetch, store: createMemoryStore() });
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).message, /MASUMI_KEY_TECHBLOG/);

  const f = fixture({ fail: { status: 401, message: "bad key key-techblog" } });
  const down = await startJob("techblog", request(body), { env, fetch: f.fetch, store: f.store });
  assert.equal(down.status, 502);
  const { status, message } = await down.json();
  assert.equal(status, "error");
  assert.ok(!message.includes("key-techblog"));
});

test("status maps the escrow state to MIP-003 values", async () => {
  const cases = [
    [null, "awaiting_payment"], ["FundsLocked", "running"], ["ResultSubmitted", "completed"],
    ["Withdrawn", "completed"], ["RefundRequested", "failed"], ["RefundWithdrawn", "failed"], ["Disputed", "failed"],
  ];
  for (const [state, expected] of cases) {
    const f = fixture({ state });
    const started = await (await startJob("devnewsletter", request({ identifier_from_purchaser: PURCHASER, input_data: { impressions: 1500 } }), { env, fetch: f.fetch, store: f.store, now: () => NOW })).json();
    const res = await jobStatus("devnewsletter", started.id, { env, fetch: f.fetch, store: f.store, now: () => NOW + 60_000 });
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.equal(out.status, expected, String(state));
    assert.equal(out.id, started.id);
    const call = f.calls.at(-1);
    assert.equal(call.path, "/payment/resolve-blockchain-identifier");
    assert.equal(call.key, "key-devnewsletter");
    assert.equal(call.body.blockchainIdentifier, "escrow-1");
    if (state === "ResultSubmitted") assert.equal(out.result, "result-hash");
  }
});

test("status fails an unpaid job after its payment window and 404s unknown ids", async () => {
  const f = fixture();
  const started = await (await startJob("board", request({ identifier_from_purchaser: PURCHASER, input_data: { brief: "Signups for NeoRack" } }), { env, fetch: f.fetch, store: f.store, now: () => NOW })).json();
  const late = await (await jobStatus("board", started.id, { env, fetch: f.fetch, store: f.store, now: () => Number(started.payByTime) + 1 })).json();
  assert.deepEqual([late.status, late.message], ["failed", "Payment window expired"]);

  const unknown = await jobStatus("board", "nope", { env, fetch: f.fetch, store: f.store });
  assert.equal(unknown.status, 404);
  assert.equal((await jobStatus("board", started.id, { env, fetch: f.fetch, store: createMemoryStore() })).status, 404);
  assert.equal((await jobStatus("board", null, { env, fetch: f.fetch, store: f.store })).status, 400);
});
