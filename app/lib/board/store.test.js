import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore, createStoreFromEnv, createUpstashStore } from "./store.js";

/** Minimal Upstash REST fake: GET, SET (NX, EX), DEL, RPUSH, EXPIRE, LRANGE, SADD, SREM, SMEMBERS, plus /pipeline. */
function fakeUpstash() {
  const data = new Map();
  const seen = { auth: new Set(), signals: 0 };
  const run = ([cmd, key, ...args]) => {
    if (cmd === "GET") return { result: data.get(key) ?? null };
    if (cmd === "SET") {
      if (args.includes("NX") && data.has(key)) return { result: null };
      data.set(key, args[0]);
      return { result: "OK" };
    }
    if (cmd === "DEL") return { result: Number(data.delete(key)) };
    if (cmd === "RPUSH") {
      const list = data.get(key) ?? [];
      list.push(args[0]);
      data.set(key, list);
      return { result: list.length };
    }
    if (cmd === "EXPIRE") return { result: 1 };
    if (cmd === "SADD" || cmd === "SREM") {
      const set = data.get(key) ?? new Set();
      const had = set.has(args[0]);
      if (cmd === "SADD") set.add(args[0]);
      else set.delete(args[0]);
      data.set(key, set);
      return { result: Number(cmd === "SADD" ? !had : had) };
    }
    if (cmd === "SMEMBERS") return { result: [...(data.get(key) ?? [])] };
    if (cmd === "HSET" || cmd === "HSETNX") {
      const hash = data.get(key) ?? new Map();
      const had = hash.has(args[0]);
      if (cmd === "HSETNX" && had) return { result: 0 };
      hash.set(args[0], args[1]);
      data.set(key, hash);
      return { result: Number(!had) };
    }
    if (cmd === "HGET") return { result: data.get(key)?.get(args[0]) ?? null };
    if (cmd === "HGETALL") return { result: [...(data.get(key) ?? new Map())].flat() };
    if (cmd === "LRANGE") return { result: (data.get(key) ?? []).slice(Number(args[0])) };
    return { error: `unknown command ${cmd}` };
  };
  const fetchImpl = async (url, init) => {
    seen.auth.add(init.headers.Authorization);
    seen.signals += init.signal instanceof AbortSignal ? 1 : 0;
    const body = JSON.parse(init.body);
    const out = url.endsWith("/pipeline") ? body.map(run) : run(body);
    return new Response(JSON.stringify(out), { status: 200 });
  };
  return { fetchImpl, seen };
}

for (const [label, make] of [
  ["memory", () => createMemoryStore()],
  ["upstash", () => createUpstashStore({ url: "https://redis.test/", token: "tok", fetchImpl: fakeUpstash().fetchImpl })],
]) {
  test(`${label} store: run documents round-trip`, async () => {
    const store = make();
    assert.equal(await store.getRun("r1"), null);
    await store.setRun({ id: "r1", status: "in_progress", n: [1, 2] });
    assert.deepEqual(await store.getRun("r1"), { id: "r1", status: "in_progress", n: [1, 2] });
  });

  test(`${label} store: evidence is write-once unless overwrite is set`, async () => {
    const store = make();
    const item = { name: "tender", hash: "aa", size: 2, bytes: "{}" };
    assert.equal(await store.putEvidence("r1", item), "created");
    assert.equal(await store.putEvidence("r1", item), "same");
    assert.equal(await store.putEvidence("r1", { ...item, hash: "bb", bytes: "[]" }), "conflict");
    assert.deepEqual(await store.getEvidence("r1", "tender"), item);
    assert.equal(await store.putEvidence("r1", { name: "ledger", hash: "cc", bytes: "1" }, { overwrite: true }), "created");
    assert.equal(await store.putEvidence("r1", { name: "ledger", hash: "dd", bytes: "2" }, { overwrite: true }), "updated");
    assert.equal((await store.getEvidence("r1", "ledger")).hash, "dd");
    assert.deepEqual((await store.listEvidence("r1")).map((i) => i.name).sort(), ["ledger", "tender"]);
    assert.equal(await store.getEvidence("r1", "missing"), null);
    assert.deepEqual(await store.listEvidence("other"), []);
  });

  test(`${label} store: events get contiguous seq numbers and can be read from a cursor`, async () => {
    const store = make();
    const seqs = [];
    for (const name of ["a", "b", "c"]) seqs.push(await store.appendEvent("r1", { ts: "t", name, data: { name } }));
    assert.deepEqual(seqs, [1, 2, 3]);
    assert.deepEqual((await store.getEvents("r1")).map((e) => [e.seq, e.name]), [[1, "a"], [2, "b"], [3, "c"]]);
    assert.deepEqual((await store.getEvents("r1", 2)).map((e) => e.seq), [3]);
    assert.deepEqual(await store.getEvents("r1", 3), []);
    assert.deepEqual(await store.getEvents("other"), []);
  });

  test(`${label} store: the settling set adds, lists and removes run ids once each`, async () => {
    const store = make();
    assert.deepEqual(await store.listSettling(), []);
    await store.markSettling("r1");
    await store.markSettling("r1");
    await store.markSettling("r2");
    assert.deepEqual((await store.listSettling()).sort(), ["r1", "r2"]);
    await store.unmarkSettling("r1");
    await store.unmarkSettling("missing");
    assert.deepEqual(await store.listSettling(), ["r2"]);
  });

  test(`${label} store: Masumi jobs are keyed by agent and id`, async () => {
    const store = make();
    assert.equal(await store.getJob("techblog", "j1"), null);
    await store.setJob({ agent: "techblog", id: "j1", blockchainIdentifier: "b1" });
    assert.deepEqual(await store.getJob("techblog", "j1"), { agent: "techblog", id: "j1", blockchainIdentifier: "b1" });
    assert.equal(await store.getJob("board", "j1"), null);
  });

  test(`${label} store: claim is exclusive until released`, async () => {
    const store = make();
    assert.equal(await store.claim("k", 60), true);
    assert.equal(await store.claim("k", 60), false);
    await store.release("k");
    assert.equal(await store.claim("k", 60), true);
  });
}

test("upstash store sends the bearer token and an abort signal on every call", async () => {
  const fake = fakeUpstash();
  const store = createUpstashStore({ url: "https://redis.test", token: "secret-token", fetchImpl: fake.fetchImpl });
  await store.setRun({ id: "r1" });
  await store.appendEvent("r1", { ts: "t", name: "a", data: {} });
  assert.deepEqual([...fake.seen.auth], ["Bearer secret-token"]);
  assert.equal(fake.seen.signals, 2);
});

test("upstash store aborts a hung request after the timeout", async () => {
  const fetchImpl = (url, init) =>
    new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const store = createUpstashStore({ url: "https://redis.test", token: "t", fetchImpl, timeoutMs: 20 });
  await assert.rejects(store.getRun("r1"), /aborted/);
});

test("upstash store surfaces HTTP and command errors", async () => {
  const bad = createUpstashStore({
    url: "https://redis.test",
    token: "t",
    fetchImpl: async () => new Response("unauthorized", { status: 401 }),
  });
  await assert.rejects(bad.getRun("r1"), /Upstash 401/);
  const err = createUpstashStore({
    url: "https://redis.test",
    token: "t",
    fetchImpl: async () => new Response(JSON.stringify({ error: "WRONGTYPE" }), { status: 200 }),
  });
  await assert.rejects(err.getRun("r1"), /WRONGTYPE/);
});

test("createStoreFromEnv: Upstash with REST env vars, shared memory store without", () => {
  assert.equal(createStoreFromEnv({ UPSTASH_REDIS_REST_URL: "https://r", UPSTASH_REDIS_REST_TOKEN: "t" }).kind, "upstash");
  assert.equal(createStoreFromEnv({ KV_REST_API_URL: "https://r", KV_REST_API_TOKEN: "t" }).kind, "upstash");
  const a = createStoreFromEnv({});
  assert.equal(a.kind, "memory");
  assert.equal(createStoreFromEnv({ UPSTASH_REDIS_REST_URL: "https://r" }), a);
});
